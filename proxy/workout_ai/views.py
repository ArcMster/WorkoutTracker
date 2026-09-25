"""AI plan proxy for Infinity Fitness Tracker.

The web app posts the Advanced form (body stats, goal text, days, strength, optional photo) with the
user's Firebase ID token. This view:
  1. checks the token and that the account is approved (same rule as firestore.rules isActive()),
  2. enforces a daily limit per user,
  3. asks Claude for insights and a 7-day plan as JSON,
  4. tidies the plan into the shape the app stores and returns it.

Nothing the user sends (photo included) is stored. The Anthropic API key never leaves this server.
Settings are read from Django settings first, then environment variables (see PROXY_SETUP.md).
"""
import json
import logging
import os
import re
from datetime import timedelta

import anthropic
import requests
from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .models import PlanRequest

log = logging.getLogger(__name__)


def conf(name, default=None):
    return getattr(settings, name, None) or os.environ.get(name) or default


FIREBASE_PROJECT_ID = conf("FIREBASE_PROJECT_ID", "")
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in conf("AI_ALLOWED_ORIGINS", "").split(",") if o.strip()]
DAILY_LIMIT = int(conf("AI_DAILY_LIMIT", "5"))
MODEL = conf("AI_MODEL", "claude-opus-5")
EFFORT = conf("AI_EFFORT", "medium")
REQUIRE_ACTIVE = str(conf("AI_REQUIRE_ACTIVE", "1")) != "0"
MAX_PHOTO_CHARS = 2_000_000  # base64 characters; the app sends about 300 KB

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_TYPES = ["push", "pull", "legs", "upper", "lower", "full", "legscore", "core", "cardio", "other", "rest"]
UNITS = ["", "sec", "min", "per leg", "per side"]
PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

_http = requests.Session()
_google_request = google_requests.Request(session=_http)
_client = None


def client():
    global _client
    if _client is None:
        # Photos plus thinking can take a minute or two; stay under PythonAnywhere's request limit.
        _client = anthropic.Anthropic(api_key=conf("ANTHROPIC_API_KEY"), timeout=170.0, max_retries=1)
    return _client


# ---------- HTTP helpers ----------

def cors(response, request):
    origin = (request.headers.get("Origin") or "").rstrip("/")
    if origin and (origin in ALLOWED_ORIGINS or "*" in ALLOWED_ORIGINS):
        response["Access-Control-Allow-Origin"] = origin
        response["Vary"] = "Origin"
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        response["Access-Control-Max-Age"] = "86400"
    return response


def fail(request, status, message):
    return cors(JsonResponse({"error": message}, status=status), request)


def health(request):
    return cors(JsonResponse({"ok": True, "model": MODEL, "configured": bool(conf("ANTHROPIC_API_KEY") and FIREBASE_PROJECT_ID)}), request)


# ---------- who is asking ----------

def verify_user(request):
    """Returns (uid, id_token) or raises PermissionError with a message for the user."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise PermissionError("Sign in to use AI planning.")
    token = auth[7:].strip()
    try:
        claims = id_token.verify_firebase_token(token, _google_request, audience=FIREBASE_PROJECT_ID)
    except Exception as e:  # expired, wrong project, bad signature
        log.info("token rejected: %s", e)
        raise PermissionError("Your sign-in has expired. Reload the app and try again.")
    if not claims or not claims.get("sub"):
        raise PermissionError("Sign in to use AI planning.")
    return claims["sub"], token


def firestore_get(path, token):
    url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents/{path}"
    return _http.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)


def is_active(uid, token):
    """Same rule as isActive() in firestore.rules, read with the user's own token (no service account needed)."""
    r = firestore_get(f"accounts/{uid}", token)
    if r.status_code == 200:
        f = r.json().get("fields", {})
        status = f.get("status", {}).get("stringValue")
        if status is None:
            status = "disabled" if f.get("disabled", {}).get("booleanValue") else "active"
        return status == "active"
    if r.status_code == 404:  # joined before approval existed: active if they have a profile
        return firestore_get(f"profiles/{uid}", token).status_code == 200
    raise RuntimeError(f"Firestore returned {r.status_code}")


# ---------- the prompt ----------

SYSTEM = """You are an experienced strength and conditioning coach inside a workout tracking app. \
You write a one-week training plan that repeats weekly, plus short, honest insights about the person.

How to write:
- Plain, friendly English. Short sentences. Speak to the person as "you".
- Insights must be specific to what they told you and, if given, what the photo shows. No generic filler.
- Training advice only: no calorie targets, diets, supplements or nutrition plans. You may say that \
nutrition and sleep matter, without numbers.
- Not medical advice. If they mention an injury, pain or a health condition, adapt the plan conservatively \
and tell them to check with a professional.

The photo (if any):
- Comment only on training-relevant things you can actually see: overall build, visible muscle balance \
between areas (for example upper vs lower body, front vs back), posture cues such as rounded shoulders \
or anterior pelvic tilt. Say what you see, then how the plan addresses it.
- Be respectful and encouraging. Never shame, never guess body-fat percentages or weight, never comment \
on attractiveness, never try to identify the person.
- If the photo is unclear, doesn't show a person, or shows too little to judge, say so in one sentence \
and base the plan on the other answers.
- If there is no photo, set insights.photo to an empty string.

The plan:
- Exactly 7 days, Monday to Sunday, each weekday once. Training days must match the number of days \
per week they asked for; the rest are type "rest" with no exercises. Spread rest days sensibly.
- Day type is one of: push, pull, legs, upper, lower, full, legscore (legs + core), core, cardio, other, rest.
- 4 to 8 exercises per training day. For each: sets (1-6), a rep range low-high, and a unit: "" for reps, \
"sec" or "min" for timed work, "per leg" or "per side" for unilateral work.
- Prefer exercise names from the app's list when one fits, spelled exactly the same, so the person's \
history carries over. Use a new name only when nothing on the list fits.
- Match rep ranges and exercise choice to their goal, level and equipment hints in the goal text.
- If they gave best lifts, put suggested starting weights in the day's note (conservative: about 70-80% \
of their estimated max for the rep range, rounded down to 2.5 kg or 5 lb). Beginners: tell them to start \
light and add weight once they hit the top of the range on every set.
- Each training day gets a short focus line and a practical note (warm-up, progression, form cue).
- Plan name: short, under 40 characters, describing the plan (for example "Upper/Lower strength, 4 days")."""

SCHEMA = {
    "type": "object",
    "properties": {
        "insights": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "2-4 sentences: where they are now and what the plan does about it."},
                "photo": {"type": "string", "description": "What the photo shows that matters for training, or empty if no photo."},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "priorities": {"type": "array", "items": {"type": "string"}},
                "cautions": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "photo", "strengths", "priorities", "cautions"],
            "additionalProperties": False,
        },
        "plan": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "overview": {"type": "string", "description": "One or two sentences on how the week is laid out and how to progress."},
                "days": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "weekday": {"type": "string", "enum": WEEKDAYS},
                            "type": {"type": "string", "enum": DAY_TYPES},
                            "title": {"type": "string"},
                            "focus": {"type": "string"},
                            "note": {"type": "string"},
                            "exercises": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "sets": {"type": "integer"},
                                        "low": {"type": "integer"},
                                        "high": {"type": "integer"},
                                        "unit": {"type": "string", "enum": UNITS},
                                    },
                                    "required": ["name", "sets", "low", "high", "unit"],
                                    "additionalProperties": False,
                                },
                            },
                        },
                        "required": ["weekday", "type", "title", "focus", "note", "exercises"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["name", "overview", "days"],
            "additionalProperties": False,
        },
    },
    "required": ["insights", "plan"],
    "additionalProperties": False,
}


def text_field(v, n):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def describe(data):
    """The form answers as plain text for Claude. Everything is cleaned and length-limited here."""
    unit = "lb" if data.get("unit") == "lb" else "kg"
    days = data.get("days")
    days = days if isinstance(days, int) and 1 <= days <= 7 else 4
    lines = [
        f"Body weight: {text_field(data.get('weight'), 20)} {unit}",
        f"Height: {text_field(data.get('height'), 30)}",
        f"Training days per week: {days}",
        f"Goal, in their words: {text_field(data.get('goal'), 1500)}",
    ]
    lifts = data.get("lifts") if isinstance(data.get("lifts"), list) else []
    lift_lines = [f"- {text_field(l.get('name'), 40)}: {text_field(l.get('weight'), 10)} {unit} x {text_field(l.get('reps'), 5) or 1}"
                  for l in lifts[:8] if isinstance(l, dict) and l.get("weight")]
    if lift_lines:
        lines.append("Best recent sets:\n" + "\n".join(lift_lines))
    else:
        lines.append("Strength: beginner, no best lifts given.")
    lines.append(f"Weights in the plan notes should be in {unit}.")
    known = data.get("exercises") if isinstance(data.get("exercises"), list) else []
    known = [text_field(x, 60) for x in known[:250] if isinstance(x, str) and x.strip()]
    if known:
        lines.append("Exercise names the app already uses:\n" + "; ".join(known))
    return "\n".join(lines)


def clean_list(v, n=6, size=300):
    return [text_field(x, size) for x in (v if isinstance(v, list) else []) if text_field(x, size)][:n]


def clamp(v, lo, hi, default):
    try:
        v = int(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def normalize(result):
    """Claude's JSON into the app's plan shape: 7 days, Monday first, values in range."""
    ins = result.get("insights") or {}
    plan = result.get("plan") or {}
    by_day = {}
    for d in plan.get("days") or []:
        wd = d.get("weekday")
        if wd in WEEKDAYS and wd not in by_day:
            by_day[wd] = d
    days = []
    for wd in WEEKDAYS:
        d = by_day.get(wd)
        t = d.get("type") if d else "rest"
        ex = []
        if d and t != "rest":
            for x in (d.get("exercises") or [])[:12]:
                name = text_field(x.get("name"), 80)
                if not name:
                    continue
                unit = x.get("unit") if x.get("unit") in UNITS else ""
                top = 600 if unit in ("sec", "min") else 100
                lo = clamp(x.get("low"), 1, top, 8)
                hi = clamp(x.get("high"), lo, top, lo)
                ex.append({"n": name, "s": clamp(x.get("sets"), 1, 10, 3), "lo": lo, "hi": hi, "u": unit})
        if t == "rest" or not ex:
            days.append({"t": "rest", "title": "Rest", "focus": text_field(d.get("focus") if d else "", 160) or "Recovery day", "note": "", "ex": []})
        else:
            days.append({"t": t if t in DAY_TYPES else "other", "title": text_field(d.get("title"), 40) or t.title(),
                         "focus": text_field(d.get("focus"), 160), "note": text_field(d.get("note"), 600), "ex": ex})
    return {
        "insights": {
            "summary": text_field(ins.get("summary"), 1200),
            "photo": text_field(ins.get("photo"), 1200),
            "strengths": clean_list(ins.get("strengths")),
            "priorities": clean_list(ins.get("priorities")),
            "cautions": clean_list(ins.get("cautions")),
        },
        "plan": {"name": text_field(plan.get("name"), 60) or "AI plan", "overview": text_field(plan.get("overview"), 600), "days": days},
    }


# ---------- the endpoint ----------

@csrf_exempt
def plan(request):
    if request.method == "OPTIONS":
        return cors(JsonResponse({}), request)
    if request.method != "POST":
        return fail(request, 405, "Use POST.")
    if not conf("ANTHROPIC_API_KEY") or not FIREBASE_PROJECT_ID:
        return fail(request, 503, "AI planning isn't set up on the server yet.")

    try:
        uid, token = verify_user(request)
        if REQUIRE_ACTIVE and not is_active(uid, token):
            return fail(request, 403, "Your account needs to be approved before you can use AI planning.")
    except PermissionError as e:
        return fail(request, 401, str(e))
    except Exception:
        log.exception("account check failed")
        return fail(request, 502, "Couldn't check your account. Try again in a minute.")

    since = timezone.now() - timedelta(days=1)
    used = PlanRequest.objects.filter(uid=uid, created__gte=since, ok=True).count()
    if used >= DAILY_LIMIT:
        return fail(request, 429, f"You've made {DAILY_LIMIT} AI plans in the last 24 hours. Try again tomorrow.")

    try:
        data = json.loads(request.body or b"{}")
    except RequestDataTooBig:
        return fail(request, 413, "That photo is too large. Try a smaller one.")
    except (ValueError, UnicodeDecodeError):
        return fail(request, 400, "Couldn't read the request.")
    if not text_field(data.get("goal"), 1500):
        return fail(request, 400, "Describe your goal.")

    answers = describe(data)
    content = []
    photo = data.get("photo")
    if isinstance(photo, dict) and photo.get("data"):
        media = photo.get("type") if photo.get("type") in PHOTO_TYPES else "image/jpeg"
        b64 = str(photo["data"])
        if len(b64) > MAX_PHOTO_CHARS:
            return fail(request, 413, "That photo is too large. Try a smaller one.")
        content.append({"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}})
        content.append({"type": "text", "text": "The image above is the person's photo, for training insights.\n\n" + answers})
    else:
        content.append({"type": "text", "text": "No photo was given.\n\n" + answers})

    record = PlanRequest.objects.create(uid=uid)
    try:
        response = client().beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": content}],
            thinking={"type": "adaptive"},
            output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.BadRequestError as e:
        log.warning("bad request: %s", e.message)
        return fail(request, 400, "Claude couldn't read that request. If you added a photo, try a different one.")
    except anthropic.AuthenticationError:
        log.error("Anthropic API key rejected")
        return fail(request, 503, "AI planning isn't set up correctly on the server.")
    except anthropic.RateLimitError:
        return fail(request, 503, "AI planning is busy right now. Try again in a minute.")
    except anthropic.APIStatusError as e:
        log.warning("Anthropic API error %s: %s", e.status_code, e.message)
        return fail(request, 502, "Claude is having trouble right now. Try again in a minute.")
    except anthropic.APIConnectionError:
        log.exception("couldn't reach Anthropic")
        return fail(request, 504, "Couldn't reach Claude. Try again in a minute.")

    if response.stop_reason == "refusal":
        return fail(request, 422, "Claude couldn't help with that request. Try rewording your goal or using a different photo.")
    if response.stop_reason == "max_tokens":
        return fail(request, 502, "The plan came back incomplete. Try again.")
    text = next((b.text for b in reversed(response.content) if b.type == "text"), "")
    try:
        result = normalize(json.loads(text))
    except (ValueError, AttributeError, TypeError):
        log.warning("unparseable reply: %.500s", text)
        return fail(request, 502, "The plan came back in a form the app couldn't read. Try again.")

    record.ok = True
    record.save(update_fields=["ok"])
    result["remaining"] = max(0, DAILY_LIMIT - used - 1)
    result["model"] = response.model
    log.info("plan for %s: %s in, %s out", uid, response.usage.input_tokens, response.usage.output_tokens)
    return cors(JsonResponse(result), request)

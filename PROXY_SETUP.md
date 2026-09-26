# AI planning proxy on PythonAnywhere

The **Advanced** tab sends the form (body weight, height, goal, days per week, best lifts and an optional photo) to an AI model. By default that's **Google Gemini**. The browser can't call Gemini directly, because that would expose your API key to everyone. So the app sends the request to a small proxy in your Django project on PythonAnywhere. The proxy holds the key, calls Gemini and sends the plan back.

```
App (GitHub Pages) ──POST + Firebase sign-in token──▶ Django on PythonAnywhere ──▶ Gemini API
                   ◀────────── insights + 7-day plan ───────────┘
```

What the proxy does on every request:

1. **Checks who is asking.** It verifies the Firebase ID token the app sends (Google's public keys, no service account needed).
2. **Checks the account is approved.** It applies the same rule as `isActive()` in `firestore.rules`, reading `accounts/{uid}` (or `profiles/{uid}` for older members) from Firestore with the user's own token. Pending and disabled accounts get a 403.
3. **Applies a daily limit** per user (default 5 successful plans per 24 hours). This keeps you inside Gemini's free-tier quota and stops one person using it all.
4. **Calls Gemini** (`gemini-3.8-flash`) with a JSON schema, so the reply is always JSON in the expected shape.
5. **Tidies the reply** into the app's plan format: exactly 7 days from Monday, known day types and units, and sets and reps in range.

The proxy stores nothing the user sends, photo included. It keeps only a row per request (user id, time, success) for the daily limit.

It can use Claude instead of Gemini with one setting (`AI_PROVIDER`, below), if you get an Anthropic key later.

## Files

Everything is in `proxy/` in this repo:

| File | What it is |
| --- | --- |
| `proxy/requirements.txt` | Python packages: `google-auth`, `requests` |
| `proxy/workout_ai/` | A Django app to drop into your project: `views.py` (the endpoint), `urls.py`, `models.py`, `migrations/` |

## What you need

- **A Gemini API key.** Get one at https://aistudio.google.com/apikey > **Create API key**. It starts with `AIza`.
  - **Not the Firebase key.** The `apiKey` in `firebase-config.js` also starts with `AIza`, but it's public (it's in your website) and isn't set up for Gemini. Create a separate key in AI Studio and keep it secret.
  - If you already have a Google Cloud API key you want to use, enable the **Generative Language API** for its project in the Google Cloud console. An AI Studio key is simpler.
- Your **Firebase project id**. It's `projectId` in `firebase-config.js` (for this app, `fitness-tracker-472ec`).
- Your GitHub Pages address, for example `https://arcmster.github.io` (just the origin: no path, no trailing slash).
- Your Django web app on PythonAnywhere, Python 3.8 or newer. The proxy calls Gemini's REST API with `requests`, so it doesn't need Google's `google-genai` package (that one needs Python 3.10+). Only `AI_PROVIDER=claude` needs Python 3.10+, for the `anthropic` package.

## Settings

| Name | Required | Example | What it does |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | yes | `AIza...` | Your Gemini key from AI Studio. Keep it secret. (`GOOGLE_API_KEY` is accepted too.) |
| `FIREBASE_PROJECT_ID` | yes | `fitness-tracker-472ec` | Sign-in tokens must come from this Firebase project. |
| `AI_ALLOWED_ORIGINS` | yes | `https://arcmster.github.io` | Sites allowed to call the proxy (CORS). Comma-separated for more than one, for example add `http://localhost:8000` for testing. |
| `AI_DAILY_LIMIT` | no | `5` | Successful AI plans per user per 24 hours. |
| `AI_MODEL` | no | `gemini-3.8-flash` | The model. `gemini-3.5-flash-lite` is cheaper and faster, and less thorough. |
| `AI_REQUIRE_ACTIVE` | no | `1` | Set `0` to skip the approved-account check. Not recommended. |
| `AI_PROVIDER` | no | `gemini` | `gemini` (default) or `claude`. For `claude`, also install `anthropic` and set `ANTHROPIC_API_KEY`. `AI_MODEL` then defaults to `claude-opus-5`, and `AI_EFFORT` (`low`, `medium`, `high`) applies. |

The proxy reads each one from Django `settings` first, then from environment variables.

## Setup, step by step

All of this is on https://www.pythonanywhere.com, logged in to your account. Below, `yourname` is your PythonAnywhere username and `mysite` is the folder of your Django project, the one with `manage.py` in it.

### 1. Copy the app into your Django project

From **Files**, upload the `proxy/workout_ai` folder with all its files, including `migrations/`, into your project folder, next to `manage.py`:

```
/home/yourname/mysite/
    manage.py
    mysite/settings.py
    workout_ai/
        __init__.py  apps.py  models.py  urls.py  views.py
        migrations/__init__.py  migrations/0001_initial.py
```

Or, from a **Bash console**, if this repo is on GitHub:

```bash
cd ~
git clone https://github.com/<you>/<repo>.git workouttracker
cp -r ~/workouttracker/proxy/workout_ai ~/mysite/
```

### 2. Install the packages

Open a **Bash console**. If your web app uses a virtualenv (the **Web** tab shows it under *Virtualenv*):

```bash
workon <your-virtualenv-name>
pip install google-auth requests
```

With no virtualenv, install for your web app's Python version, for example 3.10:

```bash
pip3.10 install --user google-auth requests
```

### 3. Register the app and its URL

In `mysite/settings.py`, add the app:

```python
INSTALLED_APPS = [
    # ... what's already there ...
    "workout_ai",
]
```

Make sure your PythonAnywhere domain is allowed (it usually is already):

```python
ALLOWED_HOSTS = ["yourname.pythonanywhere.com"]
```

In `mysite/urls.py`, add one line:

```python
from django.urls import include, path

urlpatterns = [
    # ... what's already there ...
    path("ai/", include("workout_ai.urls")),
]
```

That gives you two addresses:

- `https://yourname.pythonanywhere.com/ai/plan/`: the endpoint the app calls
- `https://yourname.pythonanywhere.com/ai/health/`: a quick check that it's set up

### 4. Put in the secrets

Keep the API key out of `settings.py` if that file is in git. The simplest safe place on PythonAnywhere is the **WSGI file**, which isn't in your repo. On the **Web** tab, click the WSGI configuration file link (`/var/www/yourname_pythonanywhere_com_wsgi.py`) and add these lines **near the top, before** the lines that load Django (`get_wsgi_application()`):

```python
import os
os.environ["GEMINI_API_KEY"] = "AIza..."          # from aistudio.google.com, not the Firebase key
os.environ["FIREBASE_PROJECT_ID"] = "fitness-tracker-472ec"
os.environ["AI_ALLOWED_ORIGINS"] = "https://arcmster.github.io"
os.environ["AI_DAILY_LIMIT"] = "5"
```

### 5. Create the table for the daily limit

In the Bash console (with `workon` first, if you use a virtualenv):

```bash
cd ~/mysite
python manage.py migrate workout_ai
```

### 6. Reload and check

On the **Web** tab, click **Reload**. Then open `https://yourname.pythonanywhere.com/ai/health/` in a browser. You should see:

```json
{"ok": true, "provider": "gemini", "model": "gemini-3.8-flash", "configured": true}
```

`"configured": false` means `GEMINI_API_KEY` or `FIREBASE_PROJECT_ID` isn't being read. Check step 4, then reload again.

### 7. Point the app at the proxy

In `firebase-config.js` in this repo, set:

```js
export const AI_PROXY_URL = "https://yourname.pythonanywhere.com/ai/plan/";
```

Commit and push. (Bump `CACHE` in `sw.js` when you change files, so installed apps update.) The **Advanced** tab now makes AI plans for signed-in, approved users. With `AI_PROXY_URL` empty, the tab says AI planning isn't set up.

## Free-account notes

- **Outbound internet is limited to a whitelist** on free PythonAnywhere accounts. The proxy needs `generativelanguage.googleapis.com` (Gemini), plus `www.googleapis.com` and `firestore.googleapis.com` (sign-in keys and account check). Check them at https://www.pythonanywhere.com/whitelist/. If one is missing, the app shows "Couldn't reach the AI service" or "Couldn't check your account", and the **error log** (Web tab) shows a proxy or connection error. You can ask PythonAnywhere support to add a site. Paid accounts have no whitelist.
- **Time limit.** A plan usually takes 15 seconds to a minute (longer with a photo). The proxy stops waiting after 170 seconds.
- **Keep the web app alive.** Free web apps expire unless you click **Run until 3 months from today** on the Web tab now and then.

## Gemini free tier: limits and privacy

- **Quota.** The free tier has per-minute and per-day request limits per model (shown in AI Studio under your key's usage). When the quota runs out, users see "AI planning has reached its limit for now". Lower `AI_DAILY_LIMIT`, switch `AI_MODEL` to `gemini-3.5-flash-lite`, or turn on billing in AI Studio for higher limits.
- **Privacy.** On the free tier, **Google may use what's sent (answers and photos) to improve its products**, and people may review it. On the paid tier, it doesn't. The Advanced tab says this next to the photo. If that's not acceptable for your users, turn on billing for the key.
- **Cost on the paid tier.** A plan is a few thousand tokens in and out, so a fraction of a US cent to a couple of cents with Flash models. Check AI Studio for current prices.

## Testing from a console

With a real Firebase ID token (in the app's browser console, while signed in, the Firebase `auth.currentUser.getIdToken()` value):

```bash
curl -s https://yourname.pythonanywhere.com/ai/plan/ \
  -H "Authorization: Bearer <ID token>" -H "Content-Type: application/json" \
  -d '{"weight":"80","height":"180 cm","unit":"kg","days":3,"goal":"Get fitter, home dumbbells only","lifts":[]}'
```

Error replies are JSON with an `error` message, and the app shows that text to the user:

| Status | Meaning |
| --- | --- |
| 401 | No token, or it expired or belongs to another Firebase project |
| 403 | The account is pending or disabled |
| 429 | The user reached the daily limit (`AI_DAILY_LIMIT`) |
| 413 | The photo is too large |
| 400 | The AI couldn't read the request or photo |
| 422 | The AI declined the request (safety filter) |
| 502 / 504 | The AI or Firestore couldn't be reached, or the reply was unusable |
| 500 | Something unexpected failed on the server (the error log has the details) |
| 503 | The server is missing settings, the key was rejected, the model name is wrong, or the Gemini quota ran out (the error log says which) |

## Changing what the AI does

The instructions are `SYSTEM` in `proxy/workout_ai/views.py`. The same text is used for Gemini and Claude. Two choices made there that you can change:

- **Training advice only.** No calorie targets, diets or supplements, same as before. Edit the "Training advice only" line to allow nutrition advice.
- **Photo comments** are limited to training-relevant things (build, muscle balance, posture), without body-fat guesses or appearance judgments.

After editing, reload the web app. The app doesn't need an update unless you change the reply format.

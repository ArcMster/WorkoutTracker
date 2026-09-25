# AI planning proxy on PythonAnywhere

The **Advanced** tab sends the form (body weight, height, goal, days per week, best lifts and an optional photo) to Claude. The browser can't call Claude directly, because that would expose your Anthropic API key to everyone. So the app sends the request to a small proxy in your Django project on PythonAnywhere. The proxy holds the key, calls Claude and sends the plan back.

```
App (GitHub Pages) ──POST + Firebase sign-in token──▶ Django on PythonAnywhere ──▶ Claude API
                   ◀────────── insights + 7-day plan ───────────┘
```

What the proxy does on every request:

1. **Checks who is asking.** It verifies the Firebase ID token the app sends (Google's public keys, no service account needed).
2. **Checks the account is approved.** It applies the same rule as `isActive()` in `firestore.rules`, reading `accounts/{uid}` (or `profiles/{uid}` for older members) from Firestore with the user's own token. Pending and disabled accounts get a 403.
3. **Applies a daily limit** per user (default 5 successful plans per 24 hours), so nobody can run up your bill.
4. **Calls Claude** (`claude-opus-5`, adaptive thinking, medium effort) with a JSON schema, so the reply is always valid JSON. Server-side fallback is on (`fallbacks: "default"`): if Claude Opus 5's safety classifier declines a request, Anthropic re-runs it on its recommended fallback model instead of failing.
5. **Tidies the reply** into the app's plan format: exactly 7 days from Monday, known day types and units, and sets and reps in range.

The proxy stores nothing the user sends, photo included. It keeps only a row per request (user id, time, success) for the daily limit.

## Files

Everything is in `proxy/` in this repo:

| File | What it is |
| --- | --- |
| `proxy/requirements.txt` | Python packages: `anthropic`, `google-auth`, `requests` |
| `proxy/workout_ai/` | A Django app to drop into your project: `views.py` (the endpoint), `urls.py`, `models.py`, `migrations/` |

## What you need

- An **Anthropic API key** with credit: https://console.anthropic.com > **API keys** > Create key. Add credit under **Billing**.
- Your **Firebase project id**. It's `projectId` in `firebase-config.js` (for this app, `fitness-tracker-472ec`).
- Your GitHub Pages address, for example `https://arcmster.github.io` (just the origin: no path, no trailing slash).
- Your Django web app on PythonAnywhere running **Python 3.10 or newer** (see the **Web** tab). The current `anthropic` package needs 3.10+.

## Settings

| Name | Required | Example | What it does |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | `sk-ant-...` | Your Anthropic key. Keep it secret. |
| `FIREBASE_PROJECT_ID` | yes | `fitness-tracker-472ec` | Sign-in tokens must come from this Firebase project. |
| `AI_ALLOWED_ORIGINS` | yes | `https://arcmster.github.io` | Sites allowed to call the proxy (CORS). Comma-separated for more than one, for example add `http://localhost:8000` for testing. |
| `AI_DAILY_LIMIT` | no | `5` | Successful AI plans per user per 24 hours. |
| `AI_MODEL` | no | `claude-opus-5` | Claude model. |
| `AI_EFFORT` | no | `medium` | `low`, `medium` or `high`. Lower is faster and cheaper, higher is more thorough. |
| `AI_REQUIRE_ACTIVE` | no | `1` | Set `0` to skip the approved-account check. Not recommended. |

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
pip install anthropic google-auth requests
```

With no virtualenv, install for your web app's Python version, for example 3.10:

```bash
pip3.10 install --user anthropic google-auth requests
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
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-..."
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
{"ok": true, "model": "claude-opus-5", "configured": true}
```

`"configured": false` means `ANTHROPIC_API_KEY` or `FIREBASE_PROJECT_ID` isn't being read. Check step 4, then reload again.

### 7. Point the app at the proxy

In `firebase-config.js` in this repo, set:

```js
export const AI_PROXY_URL = "https://yourname.pythonanywhere.com/ai/plan/";
```

Commit and push. (Bump `CACHE` in `sw.js` when you change files, so installed apps update.) The **Advanced** tab now makes AI plans for signed-in, approved users. With `AI_PROXY_URL` empty, the tab says AI planning isn't set up.

## Free-account notes

- **Outbound internet is limited to a whitelist** on free PythonAnywhere accounts. The proxy needs `api.anthropic.com` (Claude) and `www.googleapis.com` / `firestore.googleapis.com` (sign-in keys and account check). Check them at https://www.pythonanywhere.com/whitelist/. If one is missing, the app shows "Couldn't reach Claude" or "Couldn't check your account", and the **error log** (Web tab) shows a proxy or connection error. You can ask PythonAnywhere support to add a site. Paid accounts have no whitelist.
- **Time limit.** A plan usually takes 30 seconds to 2 minutes (longer with a photo). The proxy stops waiting for Claude after 170 seconds. If you see timeouts, set `AI_EFFORT` to `low`.
- **Keep the web app alive.** Free web apps expire unless you click **Run until 3 months from today** on the Web tab now and then.

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
| 429 | The user reached the daily limit |
| 413 | The photo is too large |
| 422 | Claude declined the request |
| 502 / 504 | Claude or Firestore couldn't be reached, or the reply was unusable |
| 503 | The server is missing its settings, or the Anthropic key was rejected |

## Cost

The Anthropic console bills each plan: the text, the photo (if any, at about 1024 px) and Claude's thinking and reply. With `claude-opus-5` at medium effort, expect roughly US$0.10 to $0.30 per plan. **Usage** in the Anthropic console shows actual spend. You can also set a monthly spend limit there. `AI_DAILY_LIMIT` caps each user.

## Changing what Claude does

The instructions are `SYSTEM` in `proxy/workout_ai/views.py`. Two choices made there that you can change:

- **Training advice only.** No calorie targets, diets or supplements, same as before. Edit the "Training advice only" line to allow nutrition advice.
- **Photo comments** are limited to training-relevant things (build, muscle balance, posture), without body-fat guesses or appearance judgments.

After editing, reload the web app. The app doesn't need an update unless you change the reply format.

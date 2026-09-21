# Infinity Fitness Tracker

A workout tracker with ready-made and custom weekly plans. Sign in with Google, build your own plans, log every set, add gym buddies and compare progress on a shared dashboard. Installable as an app on phones and desktops.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app |
| `sw.js` | Service worker (install + offline) |
| `manifest.webmanifest` | App name, icons, colors for install |
| `icons/` | App icons |
| `firestore.rules` | Firestore security rules |

## Firebase setup

1. Create a project at https://console.firebase.google.com
2. **Authentication** > Get started > enable the **Google** provider.
3. **Firestore Database** > Create database (production mode).
4. Firestore > **Rules**: paste `firestore.rules` and publish.
5. **Project settings** > Your apps > add a **Web app**. Copy the `firebaseConfig` object into the top of the script in `index.html`.
6. Authentication > Settings > **Authorized domains**: add `<your-username>.github.io`.

## Deploy to GitHub Pages

1. Push this folder to a repo.
2. Settings > Pages > Deploy from branch > `main`, root folder.
3. Open `https://<your-username>.github.io/<repo>/`.

When you change `index.html`, bump `CACHE` in `sw.js` (for example `infinity-v6`) so installed apps pick up the update.

## Workout plans

- Three ready-made plans: Push / Pull / Legs (6 days), Upper / Lower (4 days), Full body (3 days).
- **Plans** tab > **Create a new plan**: name it, set each weekday to a workout type or Rest, then add exercises with sets, a rep range and how they're counted (reps, seconds, minutes, per leg, per side).
- Ready-made plans can't be edited directly. Tap **Duplicate** to make your own copy.
- Exercises with the same name share their history across plans, so "last time" numbers and progress charts carry over when you switch.
- Deleting a plan keeps the workouts you logged with it.

## How sharing works

- Your full workout log (`users/{uid}/log`) is private to you. Nobody else can read it.
- When **Share my progress** is on, the app publishes a summary to `shared/{uid}`: weekly workouts, streak, total workouts, top set per lift and recent workout days.
- Only your accepted buddies can read that summary. Turning sharing off replaces it with `{ sharing: false }`.
- Buddies are added by Google email or invite link. The other person has to accept.

## Data layout

```
users/{uid}/log/settings           units, cycle start, sharing on/off, current plan
users/{uid}/log/plan_{id}          a custom workout plan
users/{uid}/log/{date}_d{day}...   one workout session
profiles/{uid}                     name, photo
emails/{email}                     uid, for add-by-email
requests/{fromUid}_{toUid}         buddy request: pending or accepted
shared/{uid}                       progress summary buddies can see
```

# Infinity Fitness Tracker

A workout tracker with ready-made and custom weekly plans. Sign in with Google, build your own plans, log every set, add gym buddies and compare progress on a shared dashboard. Installable as an app on phones and desktops.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app |
| `firebase-config.js` | Your Firebase settings (you create this once, see below) |
| `firebase-config.example.js` | Template for the file above |
| `sw.js` | Service worker (install + offline) |
| `manifest.webmanifest` | App name, icons, colors for install |
| `icons/` | App icons |
| `lib/` | Bundled readers for Excel and PDF import |
| `check.html` | Opens in a browser and checks that the app can be installed |
| `firestore.rules` | Firestore security rules |

## Firebase setup

1. Create a project at https://console.firebase.google.com
2. **Authentication** > Get started > enable the **Google** provider.
3. **Firestore Database** > Create database (production mode).
4. Firestore > **Rules**: paste `firestore.rules` and publish.
5. **Project settings** > Your apps > add a **Web app** and copy its config values.
   Copy `firebase-config.example.js` to a new file named `firebase-config.js`, paste your values in, and commit it. You only do this once: app updates never include `firebase-config.js`, so replacing the other files keeps your settings.
6. Authentication > Settings > **Authorized domains**: add `<your-username>.github.io`.

## Deploy to GitHub Pages

1. Push this folder to a repo.
2. Settings > Pages > Deploy from branch > `main`, root folder.
3. Open `https://<your-username>.github.io/<repo>/`.

When you change `index.html`, bump `CACHE` in `sw.js` (for example `infinity-v13`) so installed apps pick up the update.

## Workout plans

- Three ready-made plans: Push / Pull / Legs (6 days), Upper / Lower (4 days), Full body (3 days).
- **Plans** tab > **Create a new plan**: name it, set each weekday to a workout type or Rest, then add exercises with sets, a rep range and how they're counted (reps, seconds, minutes, per leg, per side).
- Ready-made plans can't be edited directly. Tap **Duplicate** to make your own copy.
- Exercises with the same name share their history across plans, so "last time" numbers and progress charts carry over when you switch.
- Deleting a plan keeps the workouts you logged with it.
- **Missed workouts move forward.** If a training day passes with nothing logged, that workout moves to the next training day and the rest of the plan shifts along. Rest days never move. Logging a missed day later puts the schedule back. **Reset to plan days** on the Workout tab snaps back to the original weekdays, and switching plans starts aligned to the plan's weekdays.

## Trainers

- On the **Buddies** tab, tap **Make trainer** on any buddy to let them coach you.
- A trainer can open you from their Buddies tab, create and edit plans for you, assign which plan you follow, and see your logged workouts.
- A trainer can never change sets you've already logged. The Firestore rules only let them write documents named `plan_*` and `coach`.
- Tap **Remove trainer** to revoke access immediately.
- When a trainer assigns you a plan, your app switches to it and shows a note on Home the next time you open it.

## Finding buddies

- **Buddies > Find New Buddies** lists members, most recently active first, 50 at a time. Search filters by name, tap **Add** to send a request, or tap a person to see their profile first.
- Each member has a small public card in `directory/{uid}`: name, nickname, a small photo, the start of their bio and the date they were last active. Full profiles still can't be browsed.
- Everyone is listed by default. Turning off **Show me in Find Buddies** on the Buddies tab deletes your card.
- Existing users appear once they open the updated app.

## Leaderboard

- **Leaderboard** on Home or the Buddies tab ranks you and your buddies by workouts, volume or week streak, this week or this month.
- Only buddies with **Share my progress** on are ranked. The rest are counted in one line below the table.
- Trainers also see their trainees there, worked out from the log they can already read. Only the trainer sees those rows.
- It uses the existing `shared/{uid}` summary, which now also carries `monthStart`, `monthWorkouts` and `volumeMonth`. No new collections or rules.

## Advanced Planning

**Plans > Advanced Planning** asks for body weight, height, goal, days per week and either Beginner or your best lifts, then builds a starting plan from the ready-made ones. It runs entirely on the device, with no AI and no network needed.

- Review it, **Download PDF** (the browser's Save as PDF), or **Save to my plans**. Nothing is saved until you tap Save.
- With best lifts entered, each day suggests starting weights (Epley estimate, rounded down, never above your lift).
- It gives training suggestions only: no calorie targets, diets or nutrition advice. It's a general plan, not medical advice.
- Inside an installed iPhone app, **Save as image** is offered as well, in case printing to PDF doesn't work there.

## Importing a plan

**Plans > Import from PDF or Excel** reads `.pdf`, `.xlsx`, `.xls` and `.csv` files, then opens the result in the plan editor for you to check before saving.

What reads best:
- Day headings such as `Monday: Push`, `Day 1 - Upper` or just `Legs`.
- One exercise per line, like `Bench Press 4 x 6-8`, `Plank 3 x 45-60 sec` or `Walking Lunges 3 x 10-12 per leg`.
- Spreadsheets with `Day`, `Exercise`, `Sets` and `Reps` columns.

The readers (SheetJS and PDF.js) are bundled in `lib/`, so import works offline and needs no third-party CDN.

## How sharing works

- Your full workout log (`users/{uid}/log`) is private to you. Nobody else can read it.
- When **Share my progress** is on, the app publishes a summary to `shared/{uid}`: weekly and monthly workouts and volume, streak, total workouts, top set per lift and recent workout days.
- Only your accepted buddies can read that summary. Turning sharing off replaces it with `{ sharing: false }`.
- Buddies are added by Google email or invite link. The other person has to accept.

## Data layout

```
users/{uid}/log/settings           units, cycle start, sharing on/off, current plan
users/{uid}/log/plan_{id}          a custom workout plan
users/{uid}/log/{date}_d{day}...   one workout session
profiles/{uid}                     name, nickname, photo, Instagram, bio
directory/{uid}                    public card for Find New Buddies
emails/{email}                     uid, for add-by-email
requests/{fromUid}_{toUid}         buddy request: pending or accepted
shared/{uid}                       progress summary buddies can see
```

# Infinity Fitness Tracker: project details

State as of 24 Sept 2026, after the leaderboard, Advanced Planning, admin and exercise tutorials (cache `infinity-v26`). For setup and deploy steps, see [README.md](README.md). This file describes what the app does and how the code is put together.

## Overview

A workout tracker you can install as an app (a PWA). You sign in with Google, follow a weekly plan (ready-made or your own), log every set, and train alongside buddies and trainers. It has no build step and no backend code: static files on GitHub Pages, with Firebase Auth and Firestore for sign-in and data.

| | |
| --- | --- |
| Hosting | GitHub Pages, `main` branch, root folder |
| Backend | Firebase Authentication (Google) and Cloud Firestore |
| Firebase SDK | v10.12.2, loaded as ES modules from `www.gstatic.com` while the app runs |
| Fonts | Barlow, Barlow Condensed, Instrument Serif (Google Fonts) |
| Bundled libraries | SheetJS (`lib/xlsx.min.js`), PDF.js (`lib/pdf.min.js`, `lib/pdf.worker.min.js`) for plan import |
| Offline | Service worker in `sw.js`, current cache `infinity-v26` |

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: markup, CSS and JavaScript (about 2,400 lines) |
| `firebase-config.js` | Firebase web config. If it's missing, the app runs in guest mode |
| `firestore.rules` | Security rules. Paste into the Firebase console after every change |
| `sw.js` | Service worker. Loads app files from the network first and falls back to the cache; serves the Firebase SDK and fonts from the cache first |
| `manifest.webmanifest` | Install metadata: name, icons, colours, portrait, standalone |
| `check.html` | Browser page that checks whether the app can be installed |
| `icons/` | App icons (192, 512, maskable 512, Apple touch) |
| `lib/` | Bundled Excel and PDF readers |

**Release rule:** whenever `index.html` changes, bump `CACHE` in `sw.js` so installed apps update.

## Features

### Exercise tutorials
- Admins attach a YouTube video to any exercise in **Admin > Exercise tutorials**: every exercise in the ready-made plans, the admin's own plans and log, anything that already has a video, plus an "Another exercise" row for custom names. Watch links, youtu.be links, Shorts, embed links and bare ids are accepted; only the 11-character id is stored, and it's validated before saving.
- On the Workout screen (and a trainer's view of a trainee's workout) an exercise with a video shows a **Watch** button in its header. Tapping opens an inline 16:9 `youtube-nocookie.com` player; tapping again closes it. One video at a time, never autoplayed, and no player is created until asked.
- Plan entries that offer options get one video per option: `vidParts()` splits on " or " and " / ", and a leading equipment or angle word borrows the shared ending ("Barbell or Dumbbell Curl" gives Barbell Curl and Dumbbell Curl; "Deadlift or Rack Pull" gives Deadlift and Rack Pull). The plan entry and its logged history keep the combined name. On the Workout screen such an entry shows a row of labelled buttons, one per option that has a video.
- Videos are keyed by `slug(exercise name)`, the same helper used for file names, so "Pull-ups / Lat Pulldown" always maps to `pull-ups-lat-pulldown` and a video follows the exercise across plans, like history does.
- Loaded once per sign-in into the `VIDS` map. Guests (no Firebase) see no Watch buttons.

### Joining (approval)
- Accounts have a status in `accounts/{uid}.status`: **pending** (Requested to Join), **active** or **disabled**. Older documents with only `disabled: true/false` still read correctly.
- Anyone who signs in for the first time creates a pending request (name, email, Google photo) and sees a "Request sent" screen with **Check again** and **Sign out**. Nothing else loads and the rules refuse all their writes.
- People who used the app before approval existed have a profile but no account document; the app and the rules treat them as active, so nobody already using it is locked out. Anyone without a profile who signs in (someone who never opened a version with profiles) will show up as a request.
- Admins see **Requested to join** at the top of the Admin tab (and a count on the tab) with **Approve** (to active) and **Decline** (to disabled). Disabled accounts can be enabled again later.

### Admin
- **Admin** tab in the top menu, shown only when `admins/{myUid}` exists.
- Counts of users, admins and disabled accounts; user list from `profiles`, 50 per page, with name search over loaded pages; admin, disabled and "You" badges.
- Per user, behind a confirmation: **Disable** / **Enable** and **Make admin** / **Remove admin**. Your own row has no actions. Each action stores `by` and `at` and adds an `audit` entry; the last 10 show under Recent actions.
- Disabling is an app flag enforced by the rules, not a Firebase Auth disable. On sign-in the app reads `accounts/{myUid}` first; if disabled it shows one calm screen and loads nothing else, with no listeners and no writes.
- Admins get no access to workout logs.
- The first admin is created by hand in the Firebase console (steps in README).

### Workouts and plans
- Three ready-made plans: Push / Pull / Legs (6 days), Upper / Lower (4 days), Full body (3 days).
- Custom plans: each weekday is a workout type or Rest. Each exercise has sets, a rep range and a unit (reps, seconds, minutes, per leg, per side).
- Ready-made plans are read-only; **Duplicate** makes an editable copy.
- Plans can be imported from `.pdf`, `.xlsx`, `.xls` or `.csv` files, then checked in the editor before saving.
- **Missed workouts move forward:** an unlogged training day moves to the next training day. Rest days never move. **Reset to plan days** puts the schedule back.
- Six-week cycles with a suggested deload in week 6 (about 40% fewer sets).
- The logging screen shows last time's numbers, hints for beating them, and a rest timer.
- Exercises with the same name share history across plans.

### Advanced Planning
- **Plans > Advanced Planning > Generate a plan** builds a starting plan from body weight, height (cm, or ft and in), goal (Build muscle, Get stronger, Lose fat, General fitness), days per week (3 to 6) and strength (Beginner, or best sets of bench press, squat, leg press and overhead press).
- Templates come from the ready-made plans: 3 days full body, 4 upper/lower, 5 upper/lower then push/pull/legs, 6 push/pull/legs twice.
- Goal sets the rep ranges: strength 3 to 6 on the main lifts, muscle 6 to 12, fat loss and general fitness 10 to 15 with an extra accessory (fat loss also gets a 10 to 15 minute cardio finisher).
- With best lifts, each day's note suggests a starting weight: the Epley one-rep max, the weight for the top of the rep range, less 10%, rounded down to 2.5 kg or 5 lb, never above the lift entered. Beginner plans say to start light and add weight weekly.
- Body weight and height only choose between easier and harder bodyweight moves (lat pulldown or pull-ups, pushdowns or dips, lying or hanging leg raises) and fill in a summary line. No calorie targets, diets or nutrition advice, by design.
- Read-only preview, **Download PDF** through the printable-report path (overview page, then one page per training day), and **Save to my plans**. Nothing is written until Save is pressed. Preview and PDF both carry a one-line "not medical advice" note.
- In an installed iOS app a **Save as image** button is also shown, drawing the plan with the share-as-image code, because printing there is still unverified.

### Progress
- Home: today's workout, this week, week streak, all-time total, best lifts (Bench, Squat, Deadlift, OHP).
- Progress tab: a chart per exercise, the session list, and report downloads.
- **Share as image:** "Share my progress" (Home) and "Share workout" (Workout tab) draw a 1080px card (the workout card lists each exercise with its sets as pills, the best set filled in the day colour; stat numbers shrink to fit rather than being cut off) that opens the phone's share menu (Instagram, WhatsApp and so on), with **Save image** as a fallback.
- **Reports:** Excel (CSV) with one row per set, or a printable report that saves as a PDF. Ranges are the last 4 weeks, last 12 weeks or all time. Rows go oldest to newest, with exercises in the plan's scheduled order.

### Profile
- Nickname (40 characters), custom photo (resized to 256px JPEG), Instagram handle, bio (160 characters).
- The profile is also saved on the device, so the nickname and photo show from the first frame instead of the Google name.

### Buddies
- Add a buddy by Google email, invite link (`?add=<uid>`) or **Find New Buddies**. The other person has to accept.
- **Find New Buddies** lists members, most recently active first, 50 per page, with name search and a status per person: Add, Accept, Requested or Buddies.
- **Show me in Find Buddies** is on by default. Turning it off deletes your list entry.
- Buddy profile page: photo, nickname, real name, Instagram, bio, how you're connected, and quick stats if they share.
- **Share my progress** publishes a summary that only accepted buddies can read.
- Buddies list: one main action per row. The trainer toggle and **Remove buddy** sit behind a **⋯** button.

### Leaderboard
- Opened from **Leaderboard** on Home (next to "Buddies this week") and on the Buddies tab. It isn't a top-level tab.
- Ranks you plus every buddy who shares progress. Metrics: **Workouts**, **Volume** (weight x reps, in your unit) and **Streak** (weeks). Workouts and Volume can be **This week** or **This month**.
- Your row is highlighted. Ties go to the higher volume for the period, then to the name.
- Buddies who don't share appear as one muted line ("2 buddies aren't sharing"), not as rows.
- A trainer also sees their trainees, even ones who don't share: their counts are worked out from the log the trainer can already read, loaded once per session. Only the trainer sees those rows.
- Tapping a row opens that person's profile. With no buddies, the screen links to Find New Buddies.
- Buddies on older app versions publish no month numbers. For This month they show "-", rank last and are named in a note asking them to open the latest version; their summary republishes with month numbers when they do.

### Trainers
- **Make trainer** on a buddy gives them coach access. You can have up to 10 trainers.
- A trainer can create and edit plans for you, assign your active plan, and read your whole log. Your app switches plans and shows a note on Home.
- A trainer can open each of your workouts in detail (every set, planned against actual, older and newer navigation) and download CSV or PDF reports.
- A trainer can never change sets you logged. The rules only let them write `plan_*` and `coach` documents.

## Data model (Firestore)

```
users/{uid}/log/settings            unit, start (cycle start), sharing, activePlan, sched, coachSeen, findable
users/{uid}/log/plan_{id}           custom plan: { name, days: [{ t, title, focus, note, ex: [{ n, s, lo, hi, u }] } x7] }
users/{uid}/log/coach               last plan a trainer assigned: { activePlan, by, at }
users/{uid}/log/{date}_d{day}[_{planId}]
                                    session: { date, day, src, planId, t, title, unit, deload, entries: { exercise: [{ w, r, done }] }, updated }
profiles/{uid}                      name, nick, photo, ig, bio, custom, updated
directory/{uid}                     Find Buddies card: name, nick, bio (80), photo (96px), seen (YYYY-MM-DD)
emails/{email}                      { uid }, for add by email
requests/{fromUid}_{toUid}          { from, to, status: pending | accepted, created }
coaching/{uid}                      { trainers: [uid, ...] }, max 10
admins/{uid}                        { by, at }: presence means admin
accounts/{uid}                      { status: pending | active | disabled, disabled, name, email, photo, requested, by, at }
audit/{id}                          { action, target, name, by, at }: admin actions, create only
exercises/{slug}                    { name, youtube, updatedBy, updatedAt }: tutorial video id per exercise
shared/{uid}                        progress summary for buddies, or { sharing: false }:
                                    { sharing, name, photo, ig, planName, weekStart, weekDays, weekTypes, volumeWeek,
                                      monthStart, monthWorkouts, volumeMonth, streak, total, lastDate, lifts, recent, updated }
```

Weights are stored in the unit they were logged in (`session.unit`) and converted for display.

## Security rules summary

| Path | Read | Write |
| --- | --- | --- |
| `users/{uid}/log/*` | Owner; trainers listed in `coaching/{uid}` | Owner; trainers only for `plan_*` and `coach` |
| `profiles/{uid}` | Any signed-in user, one document at a time; only admins can list | Owner, with a fixed set of fields |
| `directory/{uid}` | Any signed-in user; lists capped at 50 | Owner, with fixed fields and size limits |
| `emails/{email}` | Any signed-in user, exact match only | Owner, only for the email on their Google sign-in |
| `requests/{id}` | The two people involved | Sender creates as pending; receiver accepts; either side deletes |
| `coaching/{uid}` | Owner and listed trainers | Owner |
| `shared/{uid}` | Owner and accepted buddies | Owner |
| `admins/{uid}` | Any signed-in user | Admins; nobody can delete their own |
| `accounts/{uid}` | Owner and admins | Owner creates only a pending request; admins set active or disabled, never for themselves |
| `audit/{id}` | Admins | Admins create; no changes or deletes |
| `exercises/{slug}` | Any signed-in user | Admins, with a valid 11-character video id |

Every write of a user's own data (log, profile, directory, email, requests, coaching, shared) also needs `active()`: the writer's account status is active, or they have no account document but do have a profile (members from before join approval). `isAdmin()` checks that `admins/{auth.uid}` exists.

## Code structure (`index.html`)

The whole script is one ES module inside `<script type="module">`.

- **State objects**
  - `S`: app state (current view, date, sessions, plans, settings, mode `db` or `local`)
  - `SOC`: buddies, requests, profiles, shared summaries, trainers, trainees
  - `ME`: your own nickname, photo, Instagram and bio
  - `TR`: the trainee a trainer has open
  - `FIND`: the Find Buddies list and paging
  - `GEN`: Advanced Planning answers and the generated plan (not saved until the user saves it)
  - `ADM`: admin status, user list and paging, admin and disabled sets, counts, recent actions
  - `BOARD`: leaderboard metric and period, where it was opened from, and trainee counts loaded from their logs
- **Views** are string-template renderers chosen by `S.view`, and `render()` redraws `#app`:
  - main tabs: `dash` (Home), `log` (Workout), `plans`, `buddies`, `history` (Progress)
  - plan screens: `planView`, `planEdit`, `gen` (Advanced Planning)
  - your profile: `profile`
  - people: `buddy` (a buddy's progress), `person` (a profile), `find`, `board` (leaderboard)
  - trainer screens: `trainee`, `tday` (a trainee's single workout)
  - `admin` (admins only) and `disabled` (the only screen a disabled account sees)
- **Events:** single document-level `click`, `input`, `change` and `keydown` handlers dispatch on element ids and `data-*` attributes.
- **Sync:** `writeDoc` / `scheduleSave` write to Firestore with offline persistence. Guest mode stores everything in `localStorage` (`ppl-log-v1`).
- **Live data:** `onSnapshot` listeners for requests, coaching and each buddy's `shared` document.
- **Summaries:** `tally()` works out week, month, streak and total counts from a list of sessions; `computeSummary()` adds lifts and recent workouts for `shared/{uid}`. `live()` zeroes a summary's week or month once it's out of date. Volumes are stored in kg.

## Local development and testing

- Serve the folder with any static server, for example `python3 -m http.server`, and open `index.html`. Without Firebase sign-in, **Continue as guest** runs everything locally.
- Buddies, trainers and Find Buddies need real Firebase accounts, and the rules published.
- Changes so far have been checked with a syntax check of the module script and headless Chromium (Playwright) runs in guest mode. There is no automated test suite.

## Known limits and open items

- Find Buddies only lists people once they've opened a version with the feature, because that's when their card is created.
- Find Buddies search filters the pages already loaded; Firestore has no text search.
- The printable report uses the browser's print dialog. Support inside installed iOS apps hasn't been checked.
- `icons/test.txt` looks like a leftover file.
- Pushing from this machine needs GitHub credentials. HTTPS pushes currently fail without them.

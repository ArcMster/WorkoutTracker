# Infinity Fitness Tracker: project details

State as of 26 Sept 2026, after the buddy and global leaderboards, admin, exercise tutorials and AI planning on the Advanced tab (cache `infinity-v37`). For setup and deploy steps, see [README.md](README.md). This file describes what the app does and how the code is put together.

## Overview

A workout tracker you can install as an app (a PWA). You sign in with Google, follow a weekly plan (ready-made or your own), log every set, and train alongside buddies and trainers. It has no build step and no backend code: static files on GitHub Pages, with Firebase Auth and Firestore for sign-in and data.

| | |
| --- | --- |
| Hosting | GitHub Pages, `main` branch, root folder |
| Backend | Firebase Authentication (Google) and Cloud Firestore |
| Firebase SDK | v10.12.2, loaded as ES modules from `www.gstatic.com` while the app runs |
| Fonts | Barlow, Barlow Condensed, Instrument Serif (Google Fonts) |
| Bundled libraries | SheetJS (`lib/xlsx.min.js`), PDF.js (`lib/pdf.min.js`, `lib/pdf.worker.min.js`) for plan import |
| Offline | Service worker in `sw.js`, current cache `infinity-v37` |

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

### Exercise catalogue (renames and new exercises)
- **Admin > Exercises** lists every exercise with a "name shown" field, a YouTube field and Save. Renaming (Squat to Weighted Squat) changes what everyone sees, everywhere: Workout screen, plan views, plan editor and its suggestions, Progress chart picker, reports (CSV and PDF), share images, buddy lifts, trainer views and the Advanced tab.
- The data never changes: plans and logged sets keep the original name, so history, charts and "last time" stay connected across the rename. `dn(name)` gives the display name; `canon(name)` maps a display name typed in the plan editor back to the original on save. A combined entry ("Barbell or Dumbbell Curl") is rebuilt from its options when one is renamed ("EZ-Bar Curl or Dumbbell Curl").
- **Add an exercise** puts a new name (optionally with a video) in the catalogue; it's suggested to everyone in the plan editor. Admin-added exercises can be removed; plans that use them keep them.
- Stored in `exercises/{slug}` as `display` and `added` beside `youtube`. Loaded once per sign-in with the videos.

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
- Counts of users, admins and disabled accounts; user list from `profiles`, 50 per page, with name search over loaded pages and filter chips (Active by default, All, Disabled, Admins, Trainers); admin, trainer, disabled and "You" badges. Trainers come from the `coaching` lists, which admins can only read once the rules allow it.
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
- The logging screen shows last time's numbers, hints for beating them, and a rest timer that beeps three times and vibrates when rest is over (Web Audio, switched on by the tap that starts the timer, since browsers block sound until a tap).
- Exercises with the same name share history across plans.

### Advanced (AI planning)
- Its own top tab, **Advanced** (view `gen`), between Plans and Buddies. It replaced the on-device rule-based generator that used to be under Plans.
- Inputs: body weight, height (cm, or ft and in), a free-text goal (up to 1500 characters), days per week (2 to 6), an optional diet plan (**Add a diet plan**, then Kerala, South Indian or North Indian; `GEN.diet` is null, then "" until one is chosen, then `kerala`, `south` or `north`), Beginner or best sets (bench, squat, deadlift, overhead press) and an optional photo, scaled to 1024 px on the long edge as JPEG.
- `genPlan()` POSTs these to `AI_PROXY_URL` (a named export of `firebase-config.js`) with the Firebase ID token, plus `knownNames()` so the AI reuses existing exercise names.
- The proxy (`proxy/workout_ai`, Django, runs on PythonAnywhere) verifies the token, checks the account is active the same way as `isActive()` in the rules (reading Firestore with the user's own token), enforces `AI_DAILY_LIMIT` per 24 hours (`AI_ADMIN_DAILY_LIMIT`, default 50, for admins, checked by reading `admins/{uid}` like `isAdmin()`), calls the AI with a JSON schema: Google Gemini (`gemini-3.8-flash`, REST API through `requests`, so it runs on PythonAnywhere's Python 3.8) by default, or Claude (`claude-opus-5`, adaptive thinking, server-side refusal fallback) with `AI_PROVIDER=claude`, and normalizes the reply to 7 days in the app's plan shape. When `diet` is sent, `SYSTEM_DIET` is added to the prompt and `DIET_SCHEMA` to the schema, and the reply's `diet` (daily calorie, protein, carb and fat targets, a summary, 4 to 6 meals each with a time and 2 or 3 options with estimated calories, protein, carbs and fat, tips) is cleaned by `normalize_diet()`; otherwise `diet` is null. It stores no inputs or photos. Setup and settings: `PROXY_SETUP.md`.
- The result screen shows insights (summary, photo, how the week works, strengths, focus, cautions), then the diet plan if one was asked for, then the read-only plan. **Save to my plans** (workouts only; the diet isn't stored), **Download PDF** (insights, then an overview page, then a diet page if any, then a page per training day), and **Save as image** in installed iOS apps. Nothing is written until Save is pressed.
- The system prompt keeps it to training advice (no calorie targets or diets) unless a diet plan was asked for, and keeps photo comments to training-relevant, respectful observations.
- Signed out, guest mode, or `AI_PROXY_URL` empty: the tab says so instead of showing the form.

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
- Home has a **Leaderboard** dashboard with a **Buddies | Global** switch (remembered on the device). It shows three tiles, **Workouts** this week, **Volume** this week and **Streak**, each with the leader and your rank. Below them, **Top lifts** shows the leader for Bench, Squat, Deadlift and OHP, either this week's heaviest top set or **Records** (best ever). In Buddies it also keeps the "This week" list with each buddy's week dots.
- Tapping a tile opens the full leaderboard on that metric. **See all** opens it too, as does **Leaderboard** on the Buddies tab. It isn't a top-level tab.
- The full leaderboard has the same Buddies | Global switch. Metrics: **Workouts** (this week, this month, all time), **Volume** (weight x reps, in your unit; this week or this month), **Streak** (weeks) and **Lifts** (pick a lift; this week or best ever).
- **Global** ranks the top 50 members from `board/{uid}` cards. A card is published only while **Share my progress** and **Show me on the global leaderboard** (Buddies tab, on by default) are both on. Turning either off deletes the card.
- Buddies ranks you plus every buddy who shares progress.
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
exercises/{slug}                    { name, display?, youtube?, added?, updatedBy, updatedAt }: exercise catalogue: rename, tutorial video, admin-added
board/{uid}                         global leaderboard card: { name, photo (small thumbnail), total, lp_<lift>,
                                      ww_<week>, vw_<week>, lw_<week>_<lift>, mw_<month>, vm_<month>, st_<last week trained> }
                                      week = Monday as YYYYMMDD, month = YYYYMM, lift = bench | squat | dead | ohp.
                                      The period is in the field name, so each ranking is one single-field orderBy (no composite
                                      indexes) and old weeks simply aren't found. Volumes and weights in kg.
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
| `board/{uid}` | Any signed-in user; lists capped at 50 | Owner while active, at most 24 fields, name and photo size limits; owner can always delete |
| `admins/{uid}` | Any signed-in user | Admins; nobody can delete their own |
| `accounts/{uid}` | Owner and admins | Owner creates only a pending request; admins set active or disabled, never for themselves |
| `audit/{id}` | Admins | Admins create; no changes or deletes |
| `exercises/{slug}` | Any signed-in user | Admins; display name up to 80 characters, video id must be 11 valid characters |

Every write of a user's own data (log, profile, directory, email, requests, coaching, shared) also needs `active()`: the writer's account status is active, or they have no account document but do have a profile (members from before join approval). `isAdmin()` checks that `admins/{auth.uid}` exists.

## Code structure (`index.html`)

The whole script is one ES module inside `<script type="module">`.

- **State objects**
  - `S`: app state (current view, date, sessions, plans, settings, mode `db` or `local`)
  - `SOC`: buddies, requests, profiles, shared summaries, trainers, trainees
  - `ME`: your own nickname, photo, Instagram and bio
  - `TR`: the trainee a trainer has open
  - `FIND`: the Find Buddies list and paging
  - `GEN`: Advanced tab answers, photo, loading state, and the AI plan and insights (not saved until the user saves it)
  - `ADM`: admin status, user list and paging, current filter, admin, disabled and trainer sets, counts, recent actions
  - `BOARD`: leaderboard metric, period, lift and scope (buddies or global), the Home lift period, where it was opened from, and trainee counts loaded from their logs
  - `GLOB`: global leaderboard query results per field, cached for 3 minutes
- **Views** are string-template renderers chosen by `S.view`, and `render()` redraws `#app`:
  - main tabs: `dash` (Home), `log` (Workout), `plans`, `gen` (Advanced, AI planning), `buddies`, `history` (Progress)
  - plan screens: `planView`, `planEdit`
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

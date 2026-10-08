# Infinity Fitness Tracker: project details

State as of 8 Oct 2026, after the buddy and global leaderboards, admin, exercise tutorials, AI planning and Body check on the Advanced tab, changing or swapping a day's workout, trainers as a profile attribute, trainers logging today's workout for a trainee, and a greeting message on shared images, and the calendar with a workout time log and a live Training now list (cache `infinity-v42`). For setup and deploy steps, see [README.md](README.md). This file describes what the app does and how the code is put together.

## Overview

A workout tracker you can install as an app (a PWA). You sign in with Google, follow a weekly plan (ready-made or your own), log every set, and train alongside buddies and trainers. The app itself has no build step and no backend code: static files on GitHub Pages, with Firebase Auth and Firestore for sign-in and data. The one server-side piece is the small Django proxy in `proxy/`, used only by the Advanced tab so the AI key stays off the device.

| | |
| --- | --- |
| Hosting | GitHub Pages, `main` branch, root folder |
| Backend | Firebase Authentication (Google) and Cloud Firestore |
| Firebase SDK | v10.12.2, loaded as ES modules from `www.gstatic.com` while the app runs |
| Fonts | Barlow, Barlow Condensed, Instrument Serif (Google Fonts) |
| Bundled libraries | SheetJS (`lib/xlsx.min.js`), PDF.js (`lib/pdf.min.js`, `lib/pdf.worker.min.js`) for plan import |
| AI proxy | Django app in `proxy/`, on PythonAnywhere, calling Google Gemini (or Claude). Address in `AI_PROXY_URL` in `firebase-config.js` |
| Offline | Service worker in `sw.js`, current cache `infinity-v42` |

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: markup, CSS and JavaScript (about 4,100 lines) |
| `firebase-config.js` | Firebase web config. If it's missing, the app runs in guest mode |
| `firestore.rules` | Security rules. Paste into the Firebase console after every change |
| `sw.js` | Service worker. Loads app files from the network first and falls back to the cache; serves the Firebase SDK and fonts from the cache first |
| `manifest.webmanifest` | Install metadata: name, icons, colours, portrait, standalone |
| `check.html` | Browser page that checks whether the app can be installed |
| `icons/` | App icons (192, 512, maskable 512, Apple touch) |
| `lib/` | Bundled Excel and PDF readers |
| `proxy/` | Django app (`workout_ai`) for the AI proxy: `plan/`, `ask/` and `health/` endpoints, plus a model that counts requests for the daily limits. Runs on PythonAnywhere, not on GitHub Pages. Setup in `PROXY_SETUP.md` |
| `PROJECT.md`, `README.md`, `PROXY_SETUP.md` | This file, setup and deploy steps, and proxy setup |

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
- Anyone who signs in for the first time sees a sign-up screen (view `join`) asking **I'm training for myself** or **I'm a trainer**. **Request to join** creates a pending request (name, email, Google photo, `trainer`) and shows a "Request sent" screen with **Check again** and **Sign out**. Nothing else loads and the rules refuse all their writes.
- People who used the app before approval existed have a profile but no account document; the app and the rules treat them as active, so nobody already using it is locked out. Anyone without a profile who signs in (someone who never opened a version with profiles) will show up as a request.
- Admins see **Requested to join** at the top of the Admin tab (with a Trainer tag for people who signed up as trainers) (and a count on the tab) with **Approve** (to active) and **Decline** (to disabled). Disabled accounts can be enabled again later.

### Admin
- **Admin** tab in the top menu, shown only when `admins/{myUid}` exists.
- Counts of users, admins and disabled accounts; user list from `profiles`, 50 per page, with name search over loaded pages and filter chips (Active by default, All, Disabled, Admins, Trainers); admin, trainer, disabled and "You" badges. Trainers come from the `coaching` lists, which admins can only read once the rules allow it.
- Per user, behind a confirmation: **Disable** / **Enable** and **Make admin** / **Remove admin**. Your own row has no actions. Each action stores `by` and `at` and adds an `audit` entry; the last 10 show under Recent actions, each with the admin who did it ("by you", or their name linking to their profile).
- Disabling is an app flag enforced by the rules, not a Firebase Auth disable. On sign-in the app reads `accounts/{myUid}` first; if disabled it shows one calm screen and loads nothing else, with no listeners and no writes.
- Admins get no access to workout logs.
- The first admin is created by hand in the Firebase console (steps in README).

### Workouts and plans
- Three ready-made plans: Push / Pull / Legs (6 days), Upper / Lower (4 days), Full body (3 days).
- Custom plans: each weekday is a workout type or Rest. Each exercise has sets, a rep range and a unit (reps, seconds, minutes, per leg, per side).
- Ready-made plans are read-only; **Duplicate** makes an editable copy.
- Plans can be imported from `.pdf`, `.xlsx`, `.xls` or `.csv` files, then checked in the editor before saving.
- **Missed workouts move forward:** an unlogged training day moves to the next training day. Rest days never move. **Reset to plan days** puts the schedule back (and clears day swaps).
- **Change workout** (Workout tab, view `dayEdit`) edits one date's workout with the plan editor's day block (`dayEditHtml`, checked by `cleanDay`, the same helpers the plan editor uses): swap, add, remove or reorder exercises, change sets and reps, start from any plan's day or blank. It's saved on that date's session as `custom` and shown instead of the plan day (`day()`, `dayAt()`); the plan isn't touched. Works on rest days too. **Back to the plan workout** removes it; logged sets stay.
- **Swap day** swaps two training days of the current week in the active plan (`swapDays`). Only days from today on that aren't logged or changed can swap. Stored as `settings.swap = { planId, pins: { date: template day }, with: { date: partner date } }`; pins are dated, so they only affect that week. If a swapped day passes unlogged and its partner was done, the swapped-in workout rolls forward to the next training day (`carry` in `schedule()`); if neither was done, `swapPins()` drops both halves. So no workout is done twice or lost. **Undo swaps** clears swaps from today on.
- A session's `slot` is the plan workout it stands in for (set by `ensure()` from `schedule()`). The rolling schedule advances from `slot`, not from the day shown, so a swapped or changed workout counts as the one that was due and the plan moves on as usual.
- Six-week cycles with a suggested deload in week 6 (about 40% fewer sets).
- The logging screen shows last time's numbers, hints for beating them, and a rest timer that beeps three times and vibrates when rest is over (Web Audio, switched on by the tap that starts the timer, since browsers block sound until a tap).
- Exercises with the same name share history across plans.

### Advanced (AI planning)
- Its own top tab, **Advanced** (view `gen`; two sub-tabs, Plan and Body check, below), between Plans and Buddies. It replaced the on-device rule-based generator that used to be under Plans.
- Inputs: body weight, height (cm, or ft and in), a free-text goal (up to 1500 characters), days per week (2 to 6), an optional diet plan (**Add a diet plan**, then Kerala, South Indian or North Indian; `GEN.diet` is null, then "" until one is chosen, then `kerala`, `south` or `north`), Beginner or best sets (bench, squat, deadlift, overhead press) and an optional photo, scaled to 1024 px on the long edge as JPEG.
- `genPlan()` POSTs these to `AI_PROXY_URL` (a named export of `firebase-config.js`) with the Firebase ID token, plus `knownNames()` so the AI reuses existing exercise names.
- The proxy (`proxy/workout_ai`, Django, runs on PythonAnywhere) verifies the token, checks the account is active the same way as `isActive()` in the rules (reading Firestore with the user's own token), enforces `AI_DAILY_LIMIT` per 24 hours (`AI_ADMIN_DAILY_LIMIT`, default 50, for admins, checked by reading `admins/{uid}` like `isAdmin()`), calls the AI with a JSON schema: Google Gemini (`gemini-3.8-flash`, REST API through `requests`, so it runs on PythonAnywhere's Python 3.8) by default, or Claude (`claude-opus-5`, adaptive thinking, server-side refusal fallback) with `AI_PROVIDER=claude`, and normalizes the reply to 7 days in the app's plan shape. When `diet` is sent, `SYSTEM_DIET` is added to the prompt and `DIET_SCHEMA` to the schema, and the reply's `diet` (daily calorie, protein, carb and fat targets, a summary, 4 to 6 meals each with a time and 2 or 3 options with estimated calories, protein, carbs and fat, tips) is cleaned by `normalize_diet()`; otherwise `diet` is null. It stores no inputs or photos. Setup and settings: `PROXY_SETUP.md`.
- The result screen shows insights (summary, photo, how the week works, strengths, focus, cautions), then the diet plan if one was asked for, then the read-only plan. **Save to my plans** (workouts only; the diet isn't stored), **Download PDF** (insights, then an overview page, then a diet page if any, then a page per training day), and **Save as image** in installed iOS apps. Nothing is written until Save is pressed.
- The system prompt keeps it to training advice (no calorie targets or diets) unless a diet plan was asked for, and keeps photo comments to training-relevant, respectful observations.
- Signed out, guest mode, or `AI_PROXY_URL` empty: the tab says so instead of showing the form.
- **Body check** (`GEN.tab === "check"`, state in `CHK`): the tab has a **Plan | Body check** switch (`data-gtab`; hidden while a request runs or an answer shows). The person adds a required photo (same `readGenPhoto()` scaling as the plan photo) and a question of 3 to 1000 characters, for example whether one bicep looking shorter than the other is normal. `chkAsk()` POSTs `{ question, photo }` with the ID token to `askUrl()`, which is `AI_PROXY_URL` with its trailing `plan/` swapped for `ask/`. The reply `{ answer, verdict, remaining, model }` is shown as plain paragraphs and `- ` lists (always escaped, never HTML) under a tag from `CHK_VERDICTS`: `normal` (Looks normal), `can_improve` (Can be improved), `unclear` (Hard to tell from this photo), `see_doctor` (Worth a check-up). **Ask another question** (`chkAgain`) clears the answer. It shows how many questions are left today and a not-medical-advice note. Nothing is saved: not the photo, question or answer, on the device or the server.
- Proxy side (`ask` view): same token, active-account and admin checks as `plan`, then `AI_ASK_DAILY_LIMIT` (default 10; admins use `AI_ADMIN_DAILY_LIMIT`) counted on `PlanRequest` rows with `kind="ask"`, separate from `kind="plan"`. A photo and a question are required. `SYSTEM_ASK` has the AI say what it can see, then choose between normal asymmetry, a fixable imbalance (with exercises, sets and reps, weaker side first) or an unclear photo; it must not claim training changes muscle shape or length, guess body fat, comment on looks or identify the person, and sends possible medical signs to a doctor. Replies are limited to 4000 tokens and the answer is cut at 4000 characters. `ask_gemini` and `ask_claude` take a `max_tokens` argument for this. `read_photo()` is shared by both views. Migration `0002_planrequest_kind` adds the `kind` column, so run `migrate workout_ai` after updating the proxy.

### Progress
- Home: today's workout, this week, week streak, all-time total, best lifts (Bench, Squat, Deadlift, OHP).
- Progress tab: a chart per exercise, the session list, and report downloads.
- **Share as image:** "Share my progress" (Home) and "Share workout" (Workout tab) draw a 1080px card (the workout card lists each exercise with its sets as pills, the best set filled in the day colour; stat numbers shrink to fit rather than being cut off) that opens the phone's share menu (Instagram, WhatsApp and so on), with **Save image** as a fallback. The share menu also gets a message (`shareGreeting(kind)`): "Hi! <name> shared their workout / workout plan / progress with you from Infinity Fitness Tracker. Install the app to track your own progress too: <app link>" ("A friend shared a ..." if there is no name). Save image saves the picture only.
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

### Calendar
- **Calendar** top tab (view `cal`, with a count of requests waiting for you): a week strip (Mon to Sun, dots for what's scheduled), the selected day's agenda with the plan's workout for that date, and **Schedule a workout**. Guests can schedule for themselves only; entries are kept on the device (`infinity-cal-v1`).
- The schedule form offers **Just me**, **My trainer** (if you have trainers), **A buddy** (accepted buddies) and **A trainee** (if you train anyone), with date, length (30 to 90 minutes), start time and an optional note. Times are wall-clock in the viewer's time zone. Past times and clashes with your own confirmed or requested entries are refused.
- **Training requests:** with **My trainer**, the start time is picked from chips built from the trainer's working hours and busy blocks (`calChips`, `trainerFree`); busy and outside-hours times can't be chosen. Sending creates a pending entry on both calendars' lists; the trainer sees it under **Waiting for your reply** and **Approve** (confirmed, a busy block is written) or **Decline**. A clash with the trainer's own entries asks for confirmation. Either side can cancel a confirmed session, which removes it from both calendars and clears the busy block.
- **Trainers schedule for trainees:** with **A trainee**, the entry is confirmed straight away on both calendars (the rules need the trainee to have chosen you as trainer).
- **Working hours:** trainers (profile flag, or anyone who trains someone) get **My working hours** on the Calendar tab: up to four ranges a day, for example `06:00-10:00, 17:00-20:00`. Trainees see only the hours and anonymous **busy** blocks, never who the trainer is booked with. With no hours set, any free time works.
- **Buddy workouts:** pick an accepted buddy, date and time. The buddy gets **Accept** or **Decline** (no counter-proposal); acceptance puts it on both calendars. The requester sees "Waiting for <name>" or "Declined" (then **Dismiss**).
- Home shows **Coming up** (the next three entries and any requests waiting for you).

### Workout time log
- The clock starts when the first set of a workout is logged (`session.t0`); each set carries its time (`at`). The Workout screen shows the running time, minutes left of 90 (`WK_MIN`) and **Finish workout** (`session.t1`). Logging more sets inside the 90 minutes after finishing early reopens the workout.
- At 90 minutes the workout ends by itself: its length is 90 minutes if sets were still coming in, otherwise the time of the last set ("ended on its own"). Sets logged after the limit still save and are counted as **after the limit** (shown in the clock panel and a trainer's workout detail). `wkClock(s)` works all of this out from `t0`, `t1` and the set times; sessions logged before this have no clock.
- A trainer logging for a trainee starts and ends the trainee's clock in the same way.

### Training now
- **Everyone sees who is training:** Home shows **Training now** (or **Also training now** under the buddy list) and the Calendar tab always shows the list, with each person's workout, the exercise, sets done out of planned, when they started and minutes left. It comes from `live/{uid}`, a small card published while the clock is running (`publishLive`, after each save) and deleted when the workout ends; its `until` (start + 90 minutes) hides a card nobody deleted. Tapping a name opens the profile. **Show when I'm training** (Buddies tab, on by default) stops publishing and deletes the card.
- The buddy-only list below is unchanged.
- Buddies who are working out right now show under **Training now** on Home, above This week. Each row shows the workout (Pull), which plan day it is ("Tuesday's workout in Push / Pull / Legs", or "Changed workout"), the exercise they're on, sets done out of planned, and how long ago the last set was. "Finished" once every planned set is in. Tapping a row opens their progress, which starts with the same live card. The Buddies list shows "Training now: Pull" under their name.
- It comes from `shared/{uid}.now`, published with the rest of the summary after every set (`nowTraining()`): today's session with the latest set. `session.lastEx` records the exercise last edited. Someone counts as training until `LIVE_MIN` (45) minutes after their last set (`liveNow()`); screens refresh once a minute to keep this current.
- Only buddies see it, and only while **Share my progress** is on. Buddies on older app versions publish no `now` and simply don't appear.

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
- Being a trainer is an attribute: `profiles/{uid}.trainer` (and `directory/{uid}.trainer` for Find Buddies). It's chosen at sign-up (stored on the join request in `accounts/{uid}.trainer` and copied to the profile on first sign-in after approval) and switched in **Profile > I'm a trainer**. Members with no flag who already train someone are set to trainer automatically (`settleTrainer()`). Trainers get a Trainer badge on their profile, in Find Buddies and in Admin.
- A trainer can **Offer to train** any member, from the person's profile or by Google email on the Buddies tab. The offer is `coachOffers/{trainer}_{member}`; the member sees it under **Trainer offers** on the Buddies tab (and in the tab count) and **Accept** adds the trainer to their `coaching` list and deletes the offer. Either side can cancel or decline.
- Members can add a trainer themselves: **Make my trainer** on a trainer's profile, or **Make trainer** on a buddy marked as a trainer. Buddies who aren't trainers no longer get that option. You can have up to 10 trainers.
- A trainer can **Stop training** someone from the trainer page, which removes only themselves from that member's `coaching` list.
- A trainer can create and edit plans for you, assign your active plan, and read your whole log. Your app switches plans and shows a note on Home.
- A trainer can open each of your workouts in detail (every set, planned against actual, older and newer navigation) and download CSV or PDF reports.
- **Log today's workout** (trainee page) lets a trainer log sets or change the workout for a trainee, today only (`openAct`). The trainee's log (plans, settings, sessions, plan assignment) is read with `readLog()` and swapped into `S`, with the trainer's own state kept in `ACT.own`, so the normal Workout screen and day editor work unchanged in the trainee's plan, schedule and unit. A banner shows who it's for, with **Done**. Other dates, the plan picker, the date picker, Swap day, schedule resets and Share workout are hidden, because they'd write the trainee's settings. Going to any other screen swaps back (`leaveAct()`, also checked at the top of `render()`).
- While acting, `writeDoc` only writes today's session to the trainee's log and skips everything else (settings, plans). `scheduleSave` fixes the target log when it's called, so a save still waiting when the mode switches goes to the right log, and it stamps `session.coach = { uid, name, at }`. `publishNow` waits until the trainer is back (`ACT.pub`), so the trainer's own summary never picks up the trainee's data.
- The Workout screen shows **Updated by** (name and time) when a session has `coach`, and so does the trainer's workout detail.
- **Today stays live on both sides:** `watchToday()` (kept current from `render()`) listens to today's sessions of the log on screen (`where date == today`) and takes the server copy when its `updated` is newer, unless a local save of that session is waiting. So a trainee's open app doesn't overwrite the trainer's sets, or the reverse. On the trainee's side, a change also republishes their summary.
- Otherwise a trainer can't change your log: the rules let them write `plan_*`, `coach` and today's session only.

## Data model (Firestore)

```
users/{uid}/log/settings            unit, start (cycle start), sharing, activePlan, sched, swap { planId, pins, with }, coachSeen, findable
users/{uid}/log/plan_{id}           custom plan: { name, days: [{ t, title, focus, note, ex: [{ n, s, lo, hi, u }] } x7] }
users/{uid}/log/coach               last plan a trainer assigned: { activePlan, by, at }
users/{uid}/log/{date}_d{day}[_{planId}]
                                    session: { date, day, src, slot, planId, t, title, unit, deload, custom?, coach?, lastEx, t0?, t1?, entries: { exercise: [{ w, r, done, at? }] }, updated }
                                    t0: ms when the first set was logged; t1: ms when Finish was tapped; at: ms a set was last edited
                                    custom: a changed workout for that date only, same shape as a plan day
                                    coach: { uid, name, at }: the trainer who last logged or changed it for the trainee
profiles/{uid}                      name, nick, photo, ig, bio, custom, trainer, updated
directory/{uid}                     Find Buddies card: name, nick, bio (80), photo (96px), seen (YYYY-MM-DD), trainer
emails/{email}                      { uid }, for add by email
requests/{fromUid}_{toUid}          { from, to, status: pending | accepted, created }
events/{id}                         calendar entry: { kind: solo | train | buddy, members: [uid, ...], from, to?, trainer?, date, start (HH:MM), dur (min),
                                      title, status: pending | confirmed | declined, created }
slots/{eventId}                     a confirmed training session as a bare time block: { trainer, members, date, start, dur }
avail/{trainerUid}                  { hours: { "1": ["06:00-10:00", ...], ... "7": [] }, updated }: working hours, Mon = 1
live/{uid}                          who is training now: { name, title, t, t0, until (t0 + 90 min), at, ex, done, of, plan }
coaching/{uid}                      { trainers: [uid, ...] }, max 10
coachOffers/{trainerUid}_{memberUid} { from, to, created }: a trainer's offer to train someone
admins/{uid}                        { by, at }: presence means admin
accounts/{uid}                      { status: pending | active | disabled, disabled, name, email, photo, trainer, requested, by, at }
audit/{id}                          { action, target, name, by, at }: admin actions, create only
exercises/{slug}                    { name, display?, youtube?, added?, updatedBy, updatedAt }: exercise catalogue: rename, tutorial video, admin-added
board/{uid}                         global leaderboard card: { name, photo (small thumbnail), total, lp_<lift>,
                                      ww_<week>, vw_<week>, lw_<week>_<lift>, mw_<month>, vm_<month>, st_<last week trained> }
                                      week = Monday as YYYYMMDD, month = YYYYMM, lift = bench | squat | dead | ohp.
                                      The period is in the field name, so each ranking is one single-field orderBy (no composite
                                      indexes) and old weeks simply aren't found. Volumes and weights in kg.
shared/{uid}                        progress summary for buddies, or { sharing: false }:
                                    { sharing, name, photo, ig, planName, weekStart, weekDays, weekTypes, volumeWeek,
                                      monthStart, monthWorkouts, volumeMonth, streak, total, lastDate, lifts, recent, updated,
                                      now: { d, at, t, title, src, plan, custom, ex, done, of } or null }: the workout in progress
```

Weights are stored in the unit they were logged in (`session.unit`) and converted for display.

## Security rules summary

| Path | Read | Write |
| --- | --- | --- |
| `users/{uid}/log/*` | Owner; trainers listed in `coaching/{uid}` | Owner; trainers only for `plan_*`, `coach`, and create or update of today's session (`trainerToday()`: date matches the id, `coach.uid` is the trainer, and that date is today somewhere, 14 hours before to 36 hours after it starts in UTC) |
| `profiles/{uid}` | Any signed-in user, one document at a time; only admins can list | Owner, with a fixed set of fields (`trainer` must be true or false) |
| `directory/{uid}` | Any signed-in user; lists capped at 50 | Owner, with fixed fields and size limits |
| `emails/{email}` | Any signed-in user, exact match only | Owner, only for the email on their Google sign-in |
| `requests/{id}` | The two people involved | Sender creates as pending; receiver accepts; either side deletes |
| `coaching/{uid}` | Owner and listed trainers | Owner; a listed trainer can only remove themselves |
| `coachOffers/{id}` | The trainer and the member | Trainer creates (their profile must have `trainer: true`); either side deletes |
| `events/{id}` | Everyone in `members` | Create as yourself: solo (confirmed), buddy (pending, to an accepted buddy), train (pending to a trainer you chose, or confirmed by a trainer for their trainee); only the receiver of a pending entry can set confirmed or declined; any member deletes |
| `slots/{id}` | The trainer and the trainers' trainees (anyone whose `coaching` list has the trainer) | The trainer creates; the trainer or the trainee deletes |
| `avail/{uid}` | The trainer and their trainees | The trainer, hours map only |
| `live/{uid}` | Any signed-in user; lists capped at 50 | Owner while active, fixed fields and size limits; owner can always delete |
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
  - `SOC`: buddies, requests, profiles, shared summaries, trainers, trainees, training offers in and out
  - `ACCT`: the account document read at sign-in (for the sign-up trainer choice)
  - `ME`: your own nickname, photo, Instagram, bio and trainer flag
  - `TR`: the trainee a trainer has open
  - `ACT`: whose log `S` holds while a trainer logs today's workout for a trainee, their name, the trainer's own state to restore, and a pending publish
  - `FIND`: the Find Buddies list and paging
  - `GEN`: Advanced tab answers, which sub-tab is open (`tab`), photo, loading state, and the AI plan and insights (not saved until the user saves it)
  - `CHK`: Body check question, photo, loading state, the AI's answer and verdict, and questions left today (never saved)
  - `CAL`: calendar entries, trainers' busy blocks and working hours, the live Training now cards, the selected day and week, the open form and the hours draft
  - `ADM`: admin status, user list and paging, current filter, admin, disabled and trainer sets, counts, recent actions
  - `BOARD`: leaderboard metric, period, lift and scope (buddies or global), the Home lift period, where it was opened from, and trainee counts loaded from their logs
  - `GLOB`: global leaderboard query results per field, cached for 3 minutes
- **Views** are string-template renderers chosen by `S.view`, and `render()` redraws `#app`:
  - main tabs: `dash` (Home), `log` (Workout), `plans`, `gen` (Advanced, AI planning), `cal` (Calendar), `buddies`, `history` (Progress)
  - plan screens: `planView`, `planEdit`, and `dayEdit` (change one date's workout)
  - your profile: `profile`
  - people: `buddy` (a buddy's progress), `person` (a profile), `find`, `board` (leaderboard)
  - trainer screens: `trainee`, `tday` (a trainee's single workout)
  - `admin` (admins only), `join` (sign-up choice), `pending` and `disabled` (the only screens a new or disabled account sees)
- **Events:** single document-level `click`, `input`, `change` and `keydown` handlers dispatch on element ids and `data-*` attributes.
- **Sync:** `writeDoc` / `scheduleSave` write to Firestore with offline persistence. Guest mode stores everything in `localStorage` (`ppl-log-v1`).
- **Live data:** `onSnapshot` listeners (started by `startCal()`) for my `events` (`members array-contains`), my own `avail`, the `live` list (`until > now`, 50 at most), and for each of my trainers their `slots` (by trainer; no composite index) and `avail` (`calSync()`); plus requests, coaching, each buddy's `shared` document, and today's sessions of the log on screen (`watchToday()`).
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

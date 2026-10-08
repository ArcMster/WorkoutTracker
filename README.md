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
| `proxy/` | Django app for the AI planning proxy (see `PROXY_SETUP.md`) |
| `PROXY_SETUP.md` | How to run the AI planning proxy on PythonAnywhere |

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
- **Change workout** (Workout tab) changes one date's workout without touching the plan: swap an exercise for another, add or remove exercises, change sets and reps, start from any other plan's workout, or start blank. It counts as the workout that was planned, so the plan moves on as usual. **Back to the plan workout** undoes it; logged sets stay saved.
- **Swap day** (Workout tab) swaps a training day with another one later this week, for example Pull on Tuesday with Legs on Wednesday. Only days from today on that aren't logged yet can swap. Swaps last for this week only. If a swapped day passes without a workout, its workout moves to the next training day like any missed workout. **Undo swaps** or **Reset to plan days** clears them.

## Trainers

- Being a trainer is part of your profile. New members choose **I'm training for myself** or **I'm a trainer** when they sign up, and anyone can switch **I'm a trainer** on or off in their profile later. Trainers get a **Trainer** badge on their profile and in Find Buddies.
- A trainer can **Offer to train** any member, from that person's profile or by Google email on the Buddies tab. It takes effect when the member taps **Accept**; offers show on the member's Buddies tab and in the tab count.
- Members can also add a trainer themselves: **Make my trainer** on a trainer's profile, or **Make trainer** on a buddy who is a trainer. You can have up to 10 trainers.
- People who already had trainees before this change are marked as trainers automatically, and existing trainer links keep working.
- The trainer badge, offers and **Stop training** need the updated `firestore.rules` published in the Firebase console (new `coachOffers` collection, `trainer` field on profiles, directory cards and join requests).
- A trainer can open you from their Buddies tab, create and edit plans for you, assign which plan you follow, and see your logged workouts.
- A trainer can **Log today's workout** for you from your trainer page: they log sets, tick them done, or use **Change workout**, on the same Workout screen you use, with your plan and unit. Your workout shows **Updated by** and their name. It only works for today: the Firestore rules let a trainer write `plan_*`, `coach` and today's session (which must name them), nothing else, and never delete. Publish the updated `firestore.rules` for this.
- If you both have today's workout open, each app picks up the other's sets as they're saved.
- Tap **Remove trainer** to revoke access immediately. A trainer can also **Stop training** someone from that person's trainer page.
- When a trainer assigns you a plan, your app switches to it and shows a note on Home the next time you open it.

## Training now

- Home shows **Training now** when a buddy is working out: which workout (for example Pull), which plan day it is, the exercise they're on, sets done out of planned and when their last set was. The Buddies list marks them too.
- Someone counts as training until 45 minutes after their last set. It's part of **Share my progress**, so only buddies see it and turning sharing off hides it.

## Finding buddies

- **Buddies > Find New Buddies** lists members, most recently active first, 50 at a time. Search filters by name, tap **Add** to send a request, or tap a person to see their profile first.
- Each member has a small public card in `directory/{uid}`: name, nickname, a small photo, the start of their bio and the date they were last active. Full profiles still can't be browsed.
- Everyone is listed by default. Turning off **Show me in Find Buddies** on the Buddies tab deletes your card.
- Existing users appear once they open the updated app.

## Leaderboard

- **Leaderboard** on Home or the Buddies tab ranks you and your buddies by workouts, volume or week streak, this week or this month.
- Only buddies with **Share my progress** on are ranked. The rest are counted in one line below the table.
- Trainers also see their trainees there, worked out from the log they can already read. Only the trainer sees those rows.
- It uses the existing `shared/{uid}` summary, which now also carries `monthStart`, `monthWorkouts` and `volumeMonth`.
- Home shows it as a dashboard with a **Buddies | Global** switch: tiles for workouts, volume and streak this week, and the top Bench, Squat, Deadlift and OHP set this week or ever. Tap a tile for the full ranking.
- **Global** ranks the top 50 members who share progress and leave **Show me on the global leaderboard** on (Buddies tab). It reads the new `board/{uid}` collection, so **publish the updated `firestore.rules`** in the Firebase console. No indexes are needed.
- Members appear on the global board once they open the updated app.

## Advanced (AI planning)

The **Advanced** tab in the top menu makes a plan with AI: Google Gemini by default, or Claude. (It replaces Plans > Advanced Planning, which built plans on the device from fixed rules.)

- Asks for body weight, height, **your goal in your own words** (what you want, your equipment, anything to work around), days per week (2 to 6), Beginner or your best lifts, an optional **photo** and an optional **diet plan** in Kerala, South Indian or North Indian food.
- The AI returns **insights** (a summary, what the photo shows that matters for training, strengths, what to focus on, what to be careful with) and a **7-day plan**, plus, if you added one, a **diet plan** (daily calorie, protein, carb and fat targets, meals with a few options each and estimated calories and macros for every option, and tips). Where it can, it uses exercise names you already have, so your history carries over.
- Review it, **Save to my plans**, **Download PDF** (with the insights and the diet plan), or, in an installed iPhone app, **Save as image**. Nothing is saved until you tap Save.
- It needs you signed in and approved. It goes through your own proxy server, which keeps the Gemini API key, checks the account and limits plans per person per day. The photo is scaled down to 1024 px and sent for that plan only. Neither the app nor the proxy stores it, but on Gemini's free tier Google may use what's sent to improve its products (the tab says so).
- Without a diet plan it gives training suggestions only. It's a general plan, not medical or dietitian advice.

**Body check.** The Advanced tab has two sub-tabs, **Plan** and **Body check**. In Body check you add a photo of a body part or your physique and type a question (for example "my left bicep looks shorter than my right, is this normal?"). The AI replies in plain text with a tag: **Looks normal**, **Can be improved** (with corrective steps), **Hard to tell from this photo** or **Worth a check-up**. **Ask another question** starts again. A photo is required. It goes to the proxy's `ask/` address (derived from `AI_PROXY_URL`), needs a signed-in, approved account, and has its own daily limit (default 10 per person, `AI_ASK_DAILY_LIMIT`; admins use `AI_ADMIN_DAILY_LIMIT`), separate from the plan limit. The photo is handled like the plan photo: not stored, and the same Gemini free-tier note applies. It's general guidance, not medical advice.

**Setup:** the proxy is a small Django app in `proxy/`. [PROXY_SETUP.md](PROXY_SETUP.md) walks through installing it on PythonAnywhere, its settings, and setting `AI_PROXY_URL` in `firebase-config.js`. After updating the proxy, run `python manage.py migrate workout_ai` (a new `kind` field separates plan and body-check usage) and reload the web app.

## Admin

Admins get an **Admin** tab in the top menu. It's hidden completely for everyone else. The admin screen shows counts (users, admins, disabled) and a list of users, 50 at a time, with name search over the loaded pages. For each user an admin can **Disable** / **Enable** the account and **Make admin** / **Remove admin**, each after a confirmation. Every action records who did it and when, in the changed document and in `audit/{id}`.

Admins can't read anyone's workout log. Only trainers someone chose can do that.

**Joining needs approval.** Anyone can open the app link and sign in with Google, but a new person only gets a "Request sent" screen until an admin approves them. Requests appear at the top of the Admin tab (with a count on the tab): **Approve** makes the account active, **Decline** marks it disabled. People who were already using the app before this change stay active.

**What "disabled" means.** A browser app can't disable a Firebase Authentication account (that needs the Admin SDK on a server). So disabling is an app-level flag, `accounts/{uid}.disabled`, enforced by the security rules. The person can still sign in with Google, but the app shows only a "This account has been disabled" screen, loads nothing, and the rules refuse every write of their data. It doesn't delete anything, and **Enable** restores the account as it was. The rules don't block reads, so a disabled person with their own tools could still read what they could read before.

**Renaming and adding exercises.** In **Admin > Exercises**, change the name shown for any exercise (for example Squat to Weighted Squat) and tap Save. The new name appears everywhere, for everyone, in every plan, report and share image. Nobody's data is rewritten: plans and logged sets keep the original name underneath, so history and charts stay connected. **Add an exercise** adds a new one, which everyone then gets as a suggestion when building or editing a plan.

**Exercise tutorials.** The same list has a field for a YouTube link on each exercise. Paste a watch link, youtu.be link or video id and tap Save; everyone then sees a **Watch** button on that exercise while logging, which plays the video inline. Clear the field and save to remove it. Plan entries with options are split, so "Barbell or Dumbbell Curl" appears as Barbell Curl and Dumbbell Curl, each with its own video, and people logging that entry see a Watch button for each option. For an exercise that isn't listed (from someone's custom plan), use **Another exercise** and type its name.

**Making the first admin** (the app can't do this for itself):

1. Publish the latest `firestore.rules` first (Firestore > Rules > paste > Publish).
2. Firebase console > **Authentication** > **Users**. Find the account (for this app, psnathsrt@gmail.com) and copy its **User UID**.
3. **Firestore Database** > **Data** > **Start collection** (or open `admins` if it exists). Collection ID: `admins`.
4. Document ID: paste the UID. Add two fields: `by` (string, for example `console`) and `at` (timestamp, now). Save.
5. Reopen the app. The **Admin** tab appears at the end of the top menu.

After that, admins make other admins from the app. Nobody can remove their own admin rights or disable themselves, so there's always at least one admin.

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
- While sharing is on, a smaller card goes to `board/{uid}` for the global leaderboard, which every member can read: name, thumbnail, weekly and monthly workouts and volume, streak, total, and top Bench, Squat, Deadlift and OHP sets. Turn off **Show me on the global leaderboard** to delete it.
- Buddies are added by Google email or invite link. The other person has to accept.
- **Share as image** (workout, plan or progress) on a phone or in the installed app opens the share sheet with the image and a short message: who shared it and a link to install the app. **Save image** saves the picture only.

## Data layout

```
users/{uid}/log/settings           units, cycle start, sharing on/off, current plan
users/{uid}/log/plan_{id}          a custom workout plan
users/{uid}/log/{date}_d{day}...   one workout session
profiles/{uid}                     name, nickname, photo, Instagram, bio
directory/{uid}                    public card for Find New Buddies
emails/{email}                     uid, for add-by-email
admins/{uid}                       { by, at }: presence means admin
accounts/{uid}                     { status, name, email, photo, requested, by, at }: pending, active or disabled
audit/{id}                         { action, target, name, by, at }: admin actions
exercises/{slug}                   { name, display, youtube, added, updatedBy, updatedAt }: renames, tutorial videos, added exercises
requests/{fromUid}_{toUid}         buddy request: pending or accepted
shared/{uid}                       progress summary buddies can see
board/{uid}                        global leaderboard card: name, thumbnail and ranking numbers
```

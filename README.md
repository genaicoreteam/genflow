# GenFlow — GenAI Social Media Team

A white + blue, corporate-style process & workflow management tool for a multi-brand
social-media content operation: language portfolios → channel projects → a Kanban
pipeline (Scripting → Thumbnail → Editing → Posting) where **completing a task keeps
it in its stage and replicates it into the next stage** with a new assignee and its
own deadline — plus the full operations layer around the work:

| Area | Feature |
|---|---|
| Work | Portfolios & Projects, Kanban tasks with auto IDs (CDT1-01…), Automations, Roadmap/Docs/Files/Forms tabs, Discussions with task-ID linking, Goals, Reporting, Calendar, My Work, Inbox |
| Time | Early Leave / Late Coming (cut-off + monthly-limit rules, escalation to Team Lead), Leaves Approval (dual sign-off: Admin + Team Lead), Clockify (reads office in/out from a second Supabase project) |
| Meetings | RecordUs (live audio + live transcript, standup/learning-hour attendance), Mid-day Records (team folders) |
| Accountability | Cumulative Report (daily/weekly/monthly output), Alert Notifications in-app + email to the person and their manager (3 in a month ⇒ Inefficient, escalated to Team Lead + Manager), ad-hoc/emergency escalations, Feedback Box |
| Access | 6 role dashboards (Core Team, Manager, Team Lead, Process Coordinator, Admin, Member) via an email allow-list at signup; email + password signup; email notifications for every request/approval |
| Mobile | Android WebView app + "Download App" button |

## 1 · Set up Supabase (5 minutes)
1. Create a project at supabase.com.
2. SQL Editor → paste **`supabase/schema.sql`** → Run. This creates every table,
   permissive RLS for authenticated users, and seeds the Telugu/Tamil portfolios,
   the nine channel projects, the default automation chain and the org rules.
3. Storage → **New bucket** → name it `recordings` (private) — meeting audio lives here.
4. Authentication → Providers → Email: turn **off** "Confirm email" for instant signup
   (or keep it on if you prefer verified emails).
5. Project Settings → API: copy the URL, anon key and service_role key.

## 2 · Configure environment
```bash
cp .env.example .env.local
```
Fill in:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_ATTENDANCE_SUPABASE_URL` + key → the **other** Supabase project whose
  `office_punches (email, day, in_time, out_time)` table feeds Clockify.
  Leave blank to fall back to the main database's own `office_punches` table.
- `RESEND_API_KEY` → transactional email for every request/approval notification
  (free at resend.com). Until set, emails are skipped silently.
- `CRON_SECRET` → any random string; Vercel sends it with the two daily cron calls.

## 3 · Run locally
```bash
npm install
npm run dev        # http://localhost:3000
```

## 4 · First users & roles
Sign up with full name, work email and a password. Everyone starts
as **Member**. To hand out the five senior dashboards, either
- pre-add emails in **Admin → Role allow-list** (signups then land in the right role), or
- open Supabase → `role_assignments` and insert rows, or change `profiles.role` directly
  for people who already signed up.
Then set each person's **Reports to** in Admin — approvals route along this tree
(Manager ▸ Team Lead ▸ Admin ▸ Member).

## 5 · Deploy on Vercel (from VS Code)
```bash
git init && git add -A && git commit -m "GenFlow"
# push to GitHub, then vercel.com → New Project → import the repo
```
- Add all the environment variables from `.env.local` in Vercel → Settings → Environment Variables
  (plus `NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app`).
- `vercel.json` already schedules the two daily checks:
  - **18:45 IST** — admins who assigned no tasks today get an alert notification.
  - **19:00 IST** — members with overdue, untouched tasks get the task-update warning.

## 6 · Android APK
See **`android/README.md`** — open the folder in Android Studio, paste your Vercel URL
into `MainActivity.kt`, generate a signed APK, drop it in `public/genflow.apk`, redeploy.
The nav bar's **Download App** button serves it.

## Notes
- **Live transcription** uses the browser's Web Speech API (Chrome, Edge, Android WebView).
  Audio always records regardless; transcripts export to CSV/Doc by date range.
- **The automation fix**: dragging a card (or ticking it complete) never removes it from
  its column — it's marked Completed there *and* a fresh task appears in the next stage
  per your Automations rules (new assignee, `+N hours` deadline). Reporting therefore
  counts every stage for the person who actually did it.
- RLS is intentionally "authenticated can read/write" so the app's role logic decides
  visibility; tighten policies table-by-table once your hierarchy is final.


## What changed in v2

1. **New look** — dark icon rail that's always there, a hamburger "All Apps" panel, a top search bar with a notifications bell, and a dashboard built from a greeting card, an app grid and a right-hand widget column. Blue is now an accent, not the whole page.
2. **Nifty parity on the board** — the calendar filters by portfolio, project and stage; each project's stages can be added, renamed, recoloured, reordered or removed; every task card has a ⋯ menu (edit title, duplicate, delete); and completing a task now moves the live card forward to the next stage while a completed copy stays behind in the stage where the work was done.
3. **@mentions** in Discussions with autocomplete — mentioned people get an in-app notification and an email.
4. **Assignment notifications** on manual assignment, reassignment and automated hand-offs.
5. **No more duplicate portfolios** — unique indexes plus a one-time merge of any existing duplicates when you run the schema.
6. **Logic automations** — a second section under Automations: *When [trigger] → Then [actions]*, with triggers for created / completed / moved to stage / overdue / assignee changed / unassigned, and actions to assign, move, shift the due date, set a content type, notify someone, prefix the title, or spawn a follow-up task.
7. **Clockify identity mapping** — Admin → Attendance mapping links each account to its email or name in the attendance database.
8. **Recordings are stored, not auto-downloaded** — each row gets ⇩ Audio and ⇩ Transcript buttons, and a clear message if the `recordings` bucket is missing.
9. **Alert Notifications** replace WhatsApp warnings entirely — in-app + email to the person and their manager; three in a month marks them Inefficient and escalates to the Team Lead and Manager.
10. **Member scoping** — members see only the portfolios and projects they've been granted, and Automations, RecordUs, Mid-day Records and the Cumulative Report are off their dashboard. Goals split into private personal goals and organizational goals.
11. **Advanced Admin** — tabs for People, Role allow-list, Access grants (portfolio *and* project level, for admins and members), Routing (who approves each request type), Permissions (a feature × role matrix), Attendance mapping, and Org rules.
12. **Export and polish pass** — exports show names rather than IDs, with consistent headers and role-appropriate scope; plus confirmations before deletes, empty states, and mobile layouts throughout.
13. **Half-day leaves** — pick Full or Half day and which half; the badge shows on cards, the type appears in exports, and half days count as 0.5.

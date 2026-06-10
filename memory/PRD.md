# Okie Dokie Solutions — Training Program Tracker

## Problem Statement
Build a Training Program Tracker for Okie Dokie Solutions (ERP company) with two portals:
- Admin/HR: manage trainees, promote them through Levels 0→3, view per-trainee video progress
- Trainee: watch Google Drive videos for modules synced from a Google Sheet, auto-tracked watch time, mark as watched

Tech: React + Supabase Auth (frontend) + FastAPI (backend wrapping Supabase with service_role for privileged writes).

## User Personas
- **HR / Training Admin** — sets up trainees, monitors progress, decides promotions.
- **Trainee** — watches assigned ERP training videos, completes assignments, sees their overall progress.

## Core Requirements
1. Admin login (admin / rahul-ranger) → dashboard with total trainees, level breakdown, active/on-hold counts, promotions this month.
2. Trainees CRUD (name, phone, join date, manager, status Active/On Hold/Exited, notes, username, password).
3. Promote trainees Level 0 → 1 → 2 → 3 with history audit.
4. View each trainee's video progress and watch time.
5. Trainee login (username + password set by admin).
6. Modules + lessons synced from Google Sheet (gviz CSV) — currently 13 modules / ~43 lessons.
7. Watch Google Drive embedded videos in modal.
8. Auto-tracked watch time via 5-sec timer while modal is open.
9. Manual "Mark as watched" toggle.
10. Overall progress bar per trainee.
11. Apple-style minimal design, orange #E05A2B accent, white background.

## Architecture
- Frontend: React + react-router-dom + Tailwind + shadcn/ui. Uses Supabase JS client for Auth (email mapping: admin@odk.local, *username*@trainee.local). All privileged writes go through backend.
- Backend: FastAPI at /api/. Uses Supabase service_role to bypass RLS. Validates Supabase JWT on every request. Endpoints: /setup/init, /me, /admin/trainees (CRUD), /admin/trainees/{id}/promote, /admin/trainees/{id}, /trainee/progress (GET, POST upsert).
- DB: Supabase Postgres tables (already provided): trainees, user_roles, lesson_progress.
- Google Sheet: https://docs.google.com/spreadsheets/d/1gWH0Gi6aG0MdMcNA-ieJX4vlOJD6s1HfKSEFo6I92ig fetched as CSV on each trainee/admin page load.

## What's Been Implemented (Feb 2026)
- [2026-02] Full admin portal: login, dashboard with stats + level distribution, trainees list with search/add/edit/delete/promote, trainee detail with progress.
- [2026-02] Full trainee portal: login, hero progress card, module/lesson list synced from Google Sheet, video modal with auto watch-time tracking and mark-as-watched toggle.
- [2026-02] FastAPI backend with Supabase service_role for all admin/trainee privileged operations; JWT validation via /auth/v1/user.
- [2026-02] Admin auto-bootstrap on first load (idempotent /api/setup/init).
- [2026-02] Backend pytest suite (15/15 passing) covering full API contract + RLS gating.

## Prioritized Backlog
### P1
- Track real video playback events (play/pause/ended) — would require a non-Drive video host (Vimeo / Mux / Cloudflare Stream).
- Per-module progress bars and "Up Next" suggestion on trainee home.
- Promotion eligibility rule (e.g. require X% of current-level lessons watched before promoting).

### P2
- Email notifications to manager on promotion and trainee On-Hold transitions.
- Trainee profile photo / avatar upload (Supabase Storage).
- Admin: export trainees + progress as CSV.
- Admin: trainee notes timeline (HR comments).
- In-app announcements / banner from admin to all trainees.

### P3
- Multi-org support (more than one ERP company).
- Gamification (badges per module completion, leaderboard).
- Mobile PWA wrapper.

## Next Tasks
1. Confirm re-login race fix end-to-end via a 2nd testing-agent run (admin → signout → trainee → signout → admin).
2. Add a "Resend password" / password-reset flow on admin Trainees page (uses service_role admin/users PUT).
3. Consider replacing Google Sheet with native admin-managed modules table (simpler RLS, no public-share requirement).

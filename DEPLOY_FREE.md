# Deploy ODTED for free — Vercel + Google Cloud Run + Supabase

Total cost: **$0/month** for normal hobby-project traffic (Cloud Run's free quota is 2 million
requests/month). Cold start of a few seconds on the very first request after the backend has
been idle for a while.

> Previously deployed on Render — moved off after Render's free tier got **suspended** (its 750
> free instance-hours/month is a shared pool across your whole account, easy to exhaust).
> Briefly considered Koyeb, but Koyeb was acquired by Mistral and is pivoting away from general
> app hosting, so it's not a safe long-term home. Landed on Google Cloud Run: backed by Google,
> stable, and its free tier isn't hour-metered the way Render's is — no equivalent
> "used up your quota, suspended" failure mode for an app this size.

---

## 1. Push to GitHub

In Emergent: click **Save to GitHub** → connect `rahuldec` account → repo name `od_lms` → push.
This must include the `backend/Dockerfile` (already added to the repo) — Cloud Run builds
straight from it.

---

## 2. Deploy backend on Google Cloud Run (FastAPI)

1. Go to https://console.cloud.google.com → sign in with your Google account.
2. If you don't have a project yet, create one (top bar → **New Project**). Give it any name,
   e.g. `odted-lms`.
3. You'll be asked to attach a billing account (card required). You will not be charged unless
   usage goes far beyond a hobby project's traffic — this is Google's standard pay-as-you-go
   free quota, not a trial.
4. In the search bar, type **Cloud Run** → open it → click **Create Service**.
5. Choose **Continuously deploy from a repository** → click **Set up with Cloud Build** →
   connect your GitHub account → select repo `rahuldec/od_lms`.
6. Build settings:
   - **Branch**: `^main$`
   - **Build type**: Dockerfile
   - **Source location**: `/backend/Dockerfile`
   - **Build context directory**: `/backend`
7. Service settings:
   - **Service name**: `odted-backend`
   - **Region**: pick the one closest to your users (e.g. `asia-south1` for India)
   - **Authentication**: **Allow unauthenticated invocations** (so your frontend/trainees can
     reach it)
   - **Container port**: `8080`
8. Under **Variables & Secrets → Environment Variables**, add:
   ```
   SUPABASE_URL=https://rlenfsigkfxppxkskqks.supabase.co
   SUPABASE_SERVICE_KEY=<paste the service_role key you had on Render>
   SUPABASE_ANON_KEY=<paste the anon key>
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=rahul-ranger
   CORS_ORIGINS=*
   ```
9. Click **Create**. First build takes ~3–5 min.
10. Copy the live URL — it'll look like `https://odted-backend-<random>-<region>.a.run.app`.

---

## 3. Point the frontend at the new backend URL

Your Vercel frontend is already deployed — you only need to swap one environment variable,
not redo the whole setup:

1. Go to https://vercel.com → your project → **Settings → Environment Variables**.
2. Edit `REACT_APP_BACKEND_URL` → replace the old `https://odted-backend.onrender.com`
   value with your new Cloud Run URL from step 2.10.
3. Save, then go to **Deployments** → redeploy the latest one (Vercel doesn't apply env var
   changes until you redeploy).

*(Setting up Vercel from scratch instead? Framework Preset: Create React App · Root
Directory: `frontend` · Build Command: `yarn build` · Output Directory: `build` · Install
Command: `yarn install`, plus the same env vars as before: `REACT_APP_SUPABASE_URL`,
`REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_SHEET_ID`, `REACT_APP_ADMIN_USERNAME`,
`REACT_APP_ADMIN_DEFAULT_PASSWORD`.)*

---

## 4. (Optional) Lock CORS

Once you've confirmed the Vercel URL, go back to Cloud Run → your service → **Edit & Deploy
New Revision → Variables & Secrets** → set:
```
CORS_ORIGINS=https://odted-new.vercel.app
```
Deploy the new revision. Only your Vercel site can call the backend after this.

---

## Notes / Caveats

- **Cold start**: Cloud Run scales to zero when idle; the next request after idle takes a few
  seconds while it wakes up. No uptime-robot ping needed or recommended — Cloud Run doesn't
  have an hour-cap-suspension failure mode like Render did, so there's nothing to work around.
- **GitHub auto-deploys**: Both Vercel and Cloud Run auto-redeploy on every push to `main`. So
  future code changes you push from Emergent will go live automatically.
- **Don't commit `.env` files** — they're already in `.gitignore`. Set values in each
  platform's dashboard.
- **Always-on option**: if the cold-start delay ever bothers your trainees, Cloud Run lets you
  set a minimum of 1 always-warm instance for a small monthly fee (roughly $5–10/month) — not
  needed to get started.

---

## Live URL hierarchy
- Frontend: `https://odted-new.vercel.app` (the one you share)
- Backend: `https://odted-backend-<random>-<region>.a.run.app/api/`
- DB / Auth: Supabase

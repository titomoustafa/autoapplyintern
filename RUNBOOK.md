# Runbook — how to run and fix Auto Apply (plain English)

> This is a skeleton. Sections fill in as each milestone ships.

## Every morning (2 minutes)
1. Open the dashboard (Vercel URL — TBD).
2. **Needs you** tab: finish each one (link opens the job), then click "Done".
3. Glance at **Today**: how many applied, any errors.

## Turning things on and off
| Want to… | Do this |
|---|---|
| Pause the bot | GitHub repo → Actions → "Nightly" → ⋯ → Disable workflow |
| Run it right now | GitHub repo → Actions → "Nightly" → Run workflow |
| Practice vs. real submits | GitHub repo → Settings → Secrets and variables → Variables → `MODE` = `practice` or `live` |
| Change daily limit | Variable `DAILY_CAP` (start 5–10) |
| Change minimum fit score | Variable `MIN_SCORE` (default 70) |
| Add a company | Dashboard → Companies → paste the careers page URL |
| Update your answers | Edit `profiles/<you>.yaml` and commit |

## When something breaks
1. GitHub → Actions → open the red run → read the last error lines.
2. Open Codex in this repo and paste: *"The nightly run failed with this error: … Read AGENTS.md and fix it."*
3. Run `npm test`, commit, then trigger "Run workflow" to check.

## Setup checklist (one time)
- [ ] Private GitHub repo created and pushed
- [ ] Neon database created → `DATABASE_URL`
- [ ] Gemini API key → `GEMINI_API_KEY`
- [ ] Gmail read-only OAuth set up → `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- [ ] Cloudflare R2 bucket for screenshots/resume → `R2_*`
- [ ] `CRED_ENCRYPTION_KEY` (random 32 bytes) for stored job-site passwords
- [ ] Vercel project for the dashboard + `DASHBOARD_PASSWORD`
- [ ] Profile YAML + resume PDF filled in

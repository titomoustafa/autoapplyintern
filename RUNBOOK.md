# Runbook — how to run and fix Auto Apply (plain English)

**What works today (Milestone 1):** every night the bot checks ~450 company job boards, keeps jobs that
match your field/level/location, has AI score how well each fits your resume (0–100), and shows the best
ones on the dashboard. **It does not apply yet** — that's Milestone 2. For now, apply by hand from the list.

---

## Every morning (2 minutes)
1. Open the dashboard (your Vercel URL). Any username, password = `DASHBOARD_PASSWORD`.
2. Jobs marked **new** were found in the last day and a half. Click a title to open the real posting.
3. If the grey line at the top says **failed**, see "When something breaks".

## Turning things on and off
| Want to… | Do this |
|---|---|
| Pause the bot | GitHub repo → **Actions** → **Nightly** → `⋯` → **Disable workflow** |
| Run it right now | GitHub repo → **Actions** → **Nightly** → **Run workflow** |
| Score more/fewer jobs per night | Repo → Settings → Secrets and variables → Actions → **Variables** → `SCORE_LIMIT` (default 60; the free AI allows ~250/day) |
| Change your filters, preferences, or resume | Edit your profile and update the `PROFILES_YAML` secret (see below) |
| Add a company | Find any job posting of theirs. If the link contains `greenhouse.io`, `lever.co`, `ashbyhq.com` or `myworkdayjobs.com`, ask Codex: *"Add <company> to the CURATED list in scripts/seed-companies.ts using this link: <link>, then run npm run seed:companies"* and commit. |
| Refresh the company list | `npm run seed:companies` then commit `data/companies.json` (pulls new companies from Simplify's public internship list) |

## Your profile (filters + resume)
The repo is **public**, so real profiles never go in git. They live in a GitHub secret.

1. Copy `profiles/example.yaml` to `profiles/<your-id>.yaml` on your computer (this file is ignored by git).
2. Fill it in: words your job titles should contain, locations, a plain-English `preferences`
   note (graduation date, citizenship/visa status, interests), and paste your resume as text.
   Phone/email/address are stripped automatically before the AI sees anything.
3. Test locally: `npm run worker -- --companies 40` (see "Running on your computer").
4. Put it in GitHub: repo → Settings → Secrets and variables → Actions → **Secrets** →
   `PROFILES_YAML` → paste the whole file. For two people, paste both files with a line containing
   only `---` between them.

## When something breaks
1. GitHub → **Actions** → open the red run → read the last error lines.
2. Open Codex in this repo and paste: *"The nightly run failed with this error: … Read AGENTS.md and fix it."*
3. Run `npm test`, commit, push, then **Run workflow** to check.

Common messages:
- `DATABASE_URL is not set` → the secret is missing (setup step 2).
- `PROFILES_YAML document #1 is invalid` → a typo in your profile; the message says which field.
- `AI rate limit reached` → normal on the free tier; the rest get scored the next night.
- A company in "job boards failed" → that company moved job sites. Ignore it, or ask Codex to update it.

## Running on your computer
Needs Node.js 22+.
```bash
npm install
npm run worker -- --companies 40 --score-limit 10   # quick test: first 40 companies
npm run dev                                          # dashboard at http://localhost:3000
npm test
```
Without `DATABASE_URL` it uses a local database in `.data/` (delete that folder to start fresh).
Without `GEMINI_API_KEY` it uses keyword scoring (rough — every match looks like 90+).
To use real keys locally, create a `.env` file (never commit it) and run with `node --env-file=.env`, or export them in your shell.

## One-time setup
1. **GitHub repo** — done: `titomoustafa/autoapplyintern`.
2. **Database (free):** sign up at neon.tech → create a project → copy the connection string
   (starts with `postgresql://`). Add it as GitHub Actions secret `DATABASE_URL`.
3. **AI key (free):** aistudio.google.com → Get API key. Add as secret `GEMINI_API_KEY`.
   Note: Google may use free-tier inputs to improve its products — your resume text (no contact info) is sent.
4. **Profile:** add secret `PROFILES_YAML` (see "Your profile").
5. **First run:** Actions → Nightly → Run workflow. Takes ~10 minutes. After that it runs every night at ~2am Eastern.
6. **Dashboard (free):** vercel.com → Add New Project → import the GitHub repo → before deploying add
   environment variables `DATABASE_URL` (same as above) and `DASHBOARD_PASSWORD` (pick one) → Deploy.

### Coming in later milestones
- Gmail read-only access (for Workday account verification emails)
- Cloudflare R2 bucket (application screenshots)
- `CRED_ENCRYPTION_KEY` (stored job-site passwords)

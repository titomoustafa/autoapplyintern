# HANDOFF — read this first

Written 2026-11-24 for the coding agent (Codex or similar) picking this project up.
Read this file, then [AGENTS.md](AGENTS.md) (hard rules), then [docs/PLAN.md](docs/PLAN.md) (full design).
[RUNBOOK.md](RUNBOOK.md) is the plain-English operating guide for the human.

---

## 1. The project in one paragraph
A personal bot for two friends that runs **unattended every night**: it finds job postings, filters
them, has an AI score how well each fits a person's resume, and (from Milestone 2 on) **auto-applies**
to the best ones. Anything it can't finish safely goes to a morning **"Needs you"** queue on a dashboard.
It is *not* a product for other users.

## 2. Who you're working for
- **The person you're helping now** is a mechanical engineering student looking for a **Summer 2027
  ME internship**. Their search is the priority. They have little coding experience, so explain changes in
  plain English, keep the stack simple, and keep RUNBOOK.md current with anything they need to click.
- **The original author** (a software engineer, already employed) built Milestone 1 and is on vacation.
  Their own SWE profile is planned but **off**.
- Recruiting season is already underway, so speed matters more than polish.

## 3. Decisions already made (don't reopen without asking the human)
| Topic | Decision | Why |
|---|---|---|
| Hosting | GitHub Actions nightly cron + Neon Postgres (free) + Next.js dashboard on Vercel (free) | ~$0/month; "applies while we sleep" needs the cloud |
| Language | TypeScript, Node 22, **npm** | One language for worker + dashboard |
| Job sources | ~450 companies' own boards on **Greenhouse, Lever, Ashby, Workday** via their public JSON APIs | Legal, stable, no scraping LinkedIn/Indeed (ToS bans) |
| AI | **Free Gemini tier** behind one swappable module (`worker/llm/`) | Cost. Accepted trade-off: Google may use free-tier inputs. Contact info is stripped first |
| Scoring | Keyword prefilter → AI score 0–100 → apply at **≥ 70** | Cheap + quality over volume |
| Volume | **5–10 submissions/day** | Human chose this; recruiters notice spam |
| Workday | **Fully automated in v1** (account creation, email verification, multi-page form) | Most big aerospace/auto/defense ME internships use Workday |
| Email | Bot reads the ME student's **main Gmail** with `gmail.readonly`, query limited to job-site senders | Needed to click Workday verification links |
| CAPTCHA | **Never solved or bypassed.** CAPTCHA → `needs_you` | Hard limit, non-negotiable |
| Sensitive answers | Work authorization, sponsorship, citizenship, EEO, salary, dates come **only** from the profile. Unknown required question → `needs_you` | No invented legal answers |
| Rollout | Every job site starts in **practice mode** (fill + screenshot, no submit). Go live after the human approves ~20 fills | Mistakes can't be undone |
| Repo | **Public** (`github.com/titomoustafa/autoapplyintern`) | Owner's choice. So real profiles never go in git — they're in the `PROFILES_YAML` secret |

## 4. Current state

### Done — Milestone 1 (commit `172c404`)
- Discovers jobs from 452 boards (`data/companies.json`: 103 Greenhouse, 35 Lever, 81 Ashby, 233 Workday).
- Filters by title/level/location/description from the profile (`worker/filter.ts`).
- Scores with Gemini, or keyword-only fallback when no key (`worker/score.ts`).
- Stores everything in Postgres; reruns are idempotent; closed jobs detected (except Workday, see gotchas).
- Dashboard: ranked matches per person, min-score chips, last-run status, failing boards (`app/page.tsx`).
- Nightly workflow `.github/workflows/nightly.yml` (07:00 UTC + manual with "first N companies" input).
- Test workflow `.github/workflows/test.yml` runs `npm test` + `npm run typecheck` on every push.

### Verified
- 34 tests pass (adapters on real saved API responses, filters, PII stripping, profile loading, full
  pipeline against an in-memory Postgres including rate-limit handling).
- A real local run over all 452 boards: 33,395 open jobs, 0 board errors, 360 passed the example ME
  filters, ~3 minutes before AI scoring.
- Dashboard renders locally with that data; `next build` succeeds.

### NOT verified yet
- **Gemini scoring against the real API** (no key was available). Model is `gemini-flash-latest`
  (override with env `GEMINI_MODEL`). First real run may need a tweak in `worker/llm/gemini.ts`.
- The nightly GitHub Action has **never run** — secrets aren't set yet.
- Vercel deploy of the dashboard.

### Setup status (human must do these — see RUNBOOK "One-time setup")
- [ ] Neon database → GitHub secret `DATABASE_URL` (+ same in Vercel)
- [ ] Gemini key → GitHub secret `GEMINI_API_KEY`
- [ ] ME student's profile → GitHub secret `PROFILES_YAML` (copy of `profiles/example.yaml`, filled in)
- [ ] Vercel project with `DATABASE_URL` + `DASHBOARD_PASSWORD`
- [ ] First manual run of the Nightly workflow

**Suggested first task:** help the human through these five steps, then trigger the workflow and check
the logs and dashboard. Fix anything the first real Gemini/Neon run reveals before starting Milestone 2.

## 5. How it works
```
GitHub Actions (nightly) → npm run worker → worker/run.ts
  1. loadProfiles()        PROFILES_YAML secret + profiles/*.yaml (except example)
  2. syncCompanies()       data/companies.json → companies table (insert-only; never deactivates)
  3. runPipeline()         worker/pipeline.ts
       discover  adapters[ats].listJobs() for every active company (6 in parallel) → upsert jobs
       filter    per profile, every unseen job → matches row: filtered_out | candidate
       score     newest candidates (≤ SCORE_LIMIT, default 60): fetch description if missing,
                 description filter, then AI score → stage "scored"
  4. prints top matches; run stats saved in `runs`
Dashboard (Vercel) reads the same DB: app/lib/data.ts → app/page.tsx; proxy.ts = password gate
```

### Database (`db/schema.ts`, Drizzle ORM)
- `companies(id, name, ats, board, active, source, last_checked_at, last_error)` — unique (ats, board)
- `jobs(id, company_id, external_id, title, location, url, description, posted_at, first_seen_at, last_seen_at, closed)`
- `matches(profile_id, job_id, stage, filter_reason, score, reasons, scorer, scored_at)` — one row per person × job
- `runs(id, started_at, finished_at, stats jsonb, error)`
- Change schema → `npm run db:generate` → commit the new `drizzle/*.sql`. The worker applies migrations on
  startup; the dashboard doesn't (in production).

### Board ids (`companies.board`)
- Greenhouse/Lever/Ashby: the slug in the job URL (`job-boards.greenhouse.io/<slug>/…`).
- Workday: `tenant.wdN/site`, e.g. `ngc.wd1/Northrop_Grumman_External_Site`
  (from `https://ngc.wd1.myworkdayjobs.com/Northrop_Grumman_External_Site`).
- `detectAts(url)` in `worker/ats/index.ts` converts any job URL into `{ats, board}`.

## 6. File map
| Path | What |
|---|---|
| `worker/run.ts` | CLI entry (`--profile`, `--companies N`, `--score-limit N`) |
| `worker/pipeline.ts` | The nightly steps |
| `worker/ats/{greenhouse,lever,ashby,workday}.ts` | One adapter per job site; interface in `types.ts` |
| `worker/ats/__fixtures__/` | Real API responses used by tests |
| `worker/filter.ts` · `score.ts` · `pii.ts` | Prefilter · AI/keyword scoring + prompt · contact-info stripping |
| `worker/llm/` | `getLlm()` picks provider from `LLM_PROVIDER`; only `gemini` implemented |
| `worker/profile.ts` | Profile schema (zod) + loader |
| `worker/companies.ts` · `scripts/seed-companies.ts` | Company list sync · regenerate `data/companies.json` |
| `db/client.ts` | `openDb()` — Neon if `DATABASE_URL`, else PGlite in `.data/`; `memory://` for tests |
| `app/` · `proxy.ts` | Dashboard · password protection |
| `profiles/example.yaml` | Template; real profiles are git-ignored |

## 7. Commands
```bash
npm install
npm test                       # no network needed
npm run typecheck
npm run worker -- --companies 40 --score-limit 10   # real quick run, local DB
npm run dev                    # dashboard http://localhost:3000 (no password locally)
npm run seed:companies         # rebuild data/companies.json (~2 min, hits every board once)
```
Local profile: `cp profiles/example.yaml profiles/<id>.yaml`, edit, set `id:` to match.

## 8. Gotchas
- **PGlite is single-process.** Stop `npm run dev` before running the worker locally (and vice versa), or they fight over `.data/pglite`.
- **Next.js 16**: auth lives in `proxy.ts` (the old `middleware.ts` name is deprecated). `next dev` re-adds a block to AGENTS.md — leave it.
- **Keyword scores are inflated** (most matches 90+). Never auto-apply on `scorer = "heuristic"` (AGENTS.md rule 7).
- **Workday search is fuzzy**: `searchText` returns loosely related jobs; the prefilter does the real filtering. We read ≤60 results per search term per board.
- **Workday jobs are never auto-closed** (we only see search results, so absence ≠ closed). Closed Workday jobs will need a check at apply time.
- **Gemini free tier rate limits**: 6.5 s between calls (`LLM_DELAY_MS`). On 429 the run stops scoring and the rest wait for the next night. ~60 scores ≈ 7 min of Actions time.
- **Greenhouse's application API needs an employer key**, so applying must go through the browser form (Playwright), not the API.
- TypeScript is v7 and Vitest v5 (new majors) — check `node_modules` docs if an API looks unfamiliar.
- `location_any` words match whole words case-insensitively. Short ones like `IN` or `OR` match English words — avoid them.

## 9. Next: Milestone 2 — auto-apply on Greenhouse / Lever / Ashby (practice mode)
Goal: for each top-scoring match, fill the real application form and screenshot it, **without submitting**.

Suggested design (adjust if needed, keep the hard rules):
1. **Profile:** add an `answers:` section to `ProfileSchema` — legal name, email, phone, address, links
   (LinkedIn/portfolio), school, degree, grad date, GPA, work authorization, sponsorship, citizenship,
   start/end availability, relocation, salary, EEO choices (each can be "decline to answer"), and a
   resume file location. Update `profiles/example.yaml`. These fill forms directly and **never** go to the AI.
2. **Resume PDF:** the repo is public, so not in git. Simplest: base64 in a secret (`RESUME_<ID>_B64`)
   written to a temp file in the workflow, or a private Cloudflare R2 bucket.
3. **Schema:** new `applications` table: `(profile_id, job_id, status: queued|practice_filled|submitted|needs_you|failed, reason, screenshot_url, answers jsonb, attempted_at)`;
   `answer_bank` table caching AI-written answers to open questions per profile + question text.
4. **Adapter interface:** add `apply(job, profile, mode, ctx): Promise<ApplyResult>` to `worker/ats/types.ts`.
   Use Playwright (Chromium, headless). Map known fields by label; open-ended text questions →
   `llm.answerQuestion` with PII-stripped context; anything required and unknown → `needs_you`.
5. **Safety:** `MODE` env (`practice` default). In practice mode the code path must never reach the
   final submit click — add a test that proves it (AGENTS.md rule 5). Respect `DAILY_CAP` and `MIN_SCORE`.
   Detect CAPTCHAs (reCAPTCHA/hCaptcha/Turnstile iframes) → `needs_you`.
6. **Screenshots:** full-page PNG per attempt. Start with GitHub Actions artifacts; R2 later if the dashboard needs to show them.
7. **Dashboard:** "Needs you" list (job link + reason + mark done) and "Applications" list with status/screenshot.
8. **Verify:** practice run against one real posting on each of Greenhouse, Lever, Ashby; human reviews screenshots.

Then **Milestone 3 — Workday** (accounts per tenant with generated passwords stored AES-GCM encrypted
using `CRED_ENCRYPTION_KEY`; Gmail read-only verification links; multi-page wizard; practice mode first;
watch the CAPTCHA rate from GitHub's data-center IPs). Then **Milestone 4 — go live** at 5–10/day.
Later: the author's SWE profile, per-job resume tailoring, tracking replies/rejections from Gmail.

## 10. Open questions for the human (ask, don't assume)
- Exact locations, graduation date, citizenship/ITAR eligibility and interests for the ME profile (goes in `preferences` / `answers`).
- Where the resume PDF should live (secret vs. R2).
- How they want EEO questions answered (specific answers or "decline to self-identify").
- Whether to switch the repo to private later. If they do, real profiles could move into git, but the secret approach still works.

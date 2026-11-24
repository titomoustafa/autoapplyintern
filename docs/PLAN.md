# Auto Apply — starting plan

## Context
Tools like Jobright/Simplify are browser extensions you still click. We want a system that, **unattended every night**, finds jobs, scores fit, and submits applications — plus a short morning "needs you" queue for anything it can't safely finish. It's a personal tool for two people; **the friend's Mechanical Engineering internship search (Summer 2027) is the priority** and recruiting is already underway, so a useful slice must ship in days, not months. The friend (little coding, uses **Codex**) will maintain it while the author is on vacation.

## Decisions (from grilling)
| Topic | Decision |
|---|---|
| Audience | Just us two; multi-profile schema, only friend's ME profile active at launch (author's SWE profile off) |
| Autonomy | Auto-submit above threshold; anything blocked → "Needs you" queue |
| ATS coverage v1 | Greenhouse, Lever, Ashby **and Workday** fully automated |
| Hard limit | Any CAPTCHA / bot challenge → job goes to Needs-you. No solvers, no evasion. |
| Hosting | GitHub Actions nightly cron (private repo) + Neon Postgres free + Next.js dashboard on Vercel free |
| Language | TypeScript everywhere |
| Job discovery | Curated company list (~500–2,000) checked nightly via each ATS's public job-board API |
| Matching | Keyword/location prefilter → LLM fit score 0–100; apply at **≥70** |
| AI | One swappable `llm` module; default **Gemini Flash free tier**; Claude Haiku via config later. Phone/address/EEO never sent to the LLM |
| Answers | One profile per person with fixed answers (work auth, sponsorship, citizenship, grad date, EEO, salary, links). LLM only writes open-ended answers; unknown required question → Needs-you |
| Resume | One fixed PDF per person; no per-job tailoring yet |
| Email | Bot reads friend's **main Gmail** via `gmail.readonly`, query restricted to Workday/ATS senders, to follow verification links |
| Volume | **5–10 submissions/day** cap |
| Safety rollout | Week 1 = practice mode: fill everything, screenshot, don't submit; friend approves ~20, then flip to live |
| Cost | ~$0/mo (free tiers); GH Actions minutes budgeted under 2,000/mo |
| Maintainer docs | `AGENTS.md` (Codex) + `RUNBOOK.md` in plain English; `CLAUDE.md` just points to `AGENTS.md` |

## Architecture
Nightly pipeline (`worker/run.ts`, GitHub Actions `cron: "0 7 * * *"` ≈ 2am ET + manual `workflow_dispatch`):

1. **Discover** — for each active company, call its ATS adapter's `listJobs()`:
   - Greenhouse `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`
   - Lever `api.lever.co/v0/postings/{slug}?mode=json`
   - Ashby `api.ashbyhq.com/posting-api/job-board/{slug}`
   - Workday `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
   Upsert into `jobs`; only new/changed jobs continue.
2. **Prefilter** (no AI): title/description keywords per profile (e.g. `mechanical|ME` + `intern|co-op`), location allowlist, exclusions (e.g. clearance/citizenship mismatch, PhD-only).
3. **Score** — `llm.scoreFit(job, resumeText)` → `{score, reasons}`; stored in `scores`.
4. **Apply** — top-scoring ≥70 jobs, up to the daily cap, via adapter `apply(job, profile, mode)` using Playwright (Chromium, headless):
   - Form fields mapped from the profile; resume uploaded; open-ended questions → `llm.answerQuestion` (cached in an answer bank for reuse).
   - Workday: create/login per-tenant account (generated password stored AES-GCM encrypted in DB, key in GH secret), verification link fetched from Gmail, multi-page wizard.
   - `mode=practice` stops before Submit; full-page screenshots uploaded (Cloudflare R2 free tier) either way.
   - Any CAPTCHA, unknown required field, unexpected page, or error → status `needs_you` with reason + link.
5. **Report** — run summary row; dashboard shows it. (Email digest optional later via Resend free tier.)

## Repo layout (single package, keep it simple for Codex)
```
auto-apply/
  AGENTS.md  RUNBOOK.md  CLAUDE.md  README.md
  .github/workflows/nightly.yml
  db/schema.ts            # Drizzle ORM: profiles, companies, jobs, scores,
                          # applications(status: queued|practice_filled|submitted|needs_you|failed),
                          # ats_accounts(encrypted creds), answer_bank, runs
  worker/run.ts           # pipeline orchestrator
  worker/ats/{types,greenhouse,lever,ashby,workday}.ts   # one adapter interface: listJobs, apply
  worker/filter.ts  worker/score.ts
  worker/llm/{index,gemini,anthropic}.ts                 # provider chosen by LLM_PROVIDER env
  worker/gmail.ts         # read-only verification-link fetcher
  worker/browser.ts       # Playwright setup, screenshot+upload, captcha detection
  profiles/<name>.yaml    # fixed answers + filters (non-secret); resume PDFs in R2
  scripts/seed-companies.ts  # import list, auto-detect ATS from careers URL
  app/                    # Next.js dashboard: Today, Needs you, Applications (w/ screenshots),
                          # Companies, Profile; protected by password middleware
```

## Milestones
- **M0 – Setup (day 1):** create `~/Documents/Auto Apply`, git init, private GitHub repo, Neon DB, Vercel project, R2 bucket, Gemini key, Gmail OAuth client + refresh token; secrets in GH Actions/Vercel. Write AGENTS.md/RUNBOOK.md skeleton.
- **M1 – Find & rank (days 2–4):** adapters' `listJobs` for all four ATSs, prefilter, Gemini scoring, dashboard list of ranked jobs. Seed ME-focused companies (aerospace, auto/EV, defense, robotics, energy, hardware startups) from public internship lists. *Immediately useful — friend can apply by hand from the ranked list while M2/M3 are built.*
- **M2 – Auto-apply easy ATS, practice mode (days 5–9):** Greenhouse, Lever, Ashby `apply()`; answer bank; screenshots; Needs-you queue.
- **M3 – Workday, practice mode (days 9–16):** account creation/login, Gmail verification, wizard navigation, credential encryption, captcha → Needs-you.
- **M4 – Go live:** friend reviews ~20 practice fills; flip `MODE=live` per ATS, cap 5–10/day.
- **Later:** author's SWE profile on; per-job resume tailoring; reply/rejection tracking from Gmail; move Workday step off GH Actions if datacenter IPs trigger many CAPTCHAs.

## Inputs needed from the friend
Resume PDF; profile YAML answers (work authorization, sponsorship, US citizenship/ITAR eligibility, grad date, GPA, school, locations, relocation, start/end dates, salary, links, EEO choices); target company list seeds; Gmail OAuth consent.

## Verification
- Unit tests (Vitest) per adapter on saved fixture JSON/HTML; filter and PII-stripping tests.
- `npm run worker -- --dry --profile friend --limit 3` locally → check DB rows, scores, screenshots.
- Practice-mode end-to-end against one real Greenhouse, Lever, Ashby and Workday posting each; friend inspects screenshots in dashboard.
- Trigger the GH Action manually; confirm run row, minute usage, and that the cap and ≥70 threshold are respected.
- Go live only after ~20 approved practice fills.

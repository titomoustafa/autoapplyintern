# AGENTS.md — instructions for coding agents (Codex, Claude Code)

## What this project is
A personal bot that, every night, finds job postings, scores how well they fit a person's resume,
and auto-applies to the best ones. Anything it can't finish safely goes to a "Needs you" queue
on the dashboard. Full design: [docs/PLAN.md](docs/PLAN.md). How to operate it: [RUNBOOK.md](RUNBOOK.md).

Current priority: the **Mechanical Engineering internship** profile. The SWE profile exists but is off.

## Stack
- TypeScript, Node 22, **npm** (not pnpm/yarn)
- Worker: `worker/` — runs nightly in GitHub Actions (`.github/workflows/nightly.yml`)
- Browser automation: Playwright (Chromium, headless)
- DB: Postgres on Neon, schema in `db/schema.ts` (Drizzle ORM)
- Dashboard: Next.js in `app/`, deployed on Vercel
- AI: only through `worker/llm/index.ts` (provider chosen by `LLM_PROVIDER` env, default Gemini)

## Hard rules (never break these)
1. **Never solve, bypass, or evade CAPTCHAs or bot detection.** If one appears, mark the
   application `needs_you` with the reason and move on.
2. **Never invent answers** to work authorization, sponsorship, citizenship, EEO, salary, or
   date questions. Those come only from `profiles/<name>.yaml`. Unknown required question → `needs_you`.
3. **Never send phone, address, or EEO data to the LLM.** Strip it before any `llm.*` call.
4. Respect `DAILY_CAP` (default 8) and `MIN_SCORE` (default 70). Don't raise them in code.
5. `MODE=practice` must never click a final Submit button. Keep a test proving this.
6. Never commit secrets, `.env`, resumes, or screenshots.

## Layout
- `worker/ats/<name>.ts` — one adapter per job site, all implementing `worker/ats/types.ts`
  (`listJobs(company)`, `apply(job, profile, mode)`). New site = new adapter, nothing else changes.
- `worker/run.ts` — discover → filter → score → apply → report.
- `profiles/` — one YAML per person (fixed answers, filters).
- `scripts/` — one-off tools (seed companies, etc.).

## Working style
- Small changes, run `npm test` before finishing.
- If a site changes its page layout and an adapter breaks, fix the adapter and add the new HTML
  as a test fixture under `worker/ats/__fixtures__/`.
- Explain changes in plain English in the commit message — the maintainer may not be a programmer.

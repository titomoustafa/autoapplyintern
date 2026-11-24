# AGENTS.md — instructions for coding agents (Codex, Claude Code)

## What this project is
A personal bot that, every night, finds job postings, scores how well they fit a person's resume,
and auto-applies to the best ones. Anything it can't finish safely goes to a "Needs you" queue
on the dashboard. Full design: [docs/PLAN.md](docs/PLAN.md). How to operate it: [RUNBOOK.md](RUNBOOK.md).

**New to this repo? Read [HANDOFF.md](HANDOFF.md) first** — current state, decisions, gotchas, next steps.

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
6. Never commit secrets, `.env`, resumes, screenshots, or real profiles. **The repo is public.**
   Real profiles live in the `PROFILES_YAML` secret; only `profiles/example.yaml` is committed.
7. Never auto-apply based on a `heuristic` (keyword-only) score — only AI scores.

## Status
- Done: Milestone 1 — find & rank (discover → filter → score → dashboard).
- Next: Milestone 2 — `apply()` for Greenhouse/Lever/Ashby in practice mode. See docs/PLAN.md.

## Layout
- `db/schema.ts` — tables: companies, jobs, matches (one row per person × job: filtered_out | candidate | scored), runs.
  After changing it run `npm run db:generate` and commit the new file in `drizzle/`.
- `db/client.ts` — `openDb()`: Neon when `DATABASE_URL` is set, else local PGlite in `.data/`.
- `worker/ats/<name>.ts` — one adapter per job site implementing `worker/ats/types.ts`.
  New site = new adapter + fixture test, nothing else changes. `detectAts()` maps URLs to boards.
- `worker/pipeline.ts` — the nightly steps; `worker/run.ts` — command-line entry point.
- `worker/filter.ts` (no AI), `worker/score.ts` (AI or keyword fallback), `worker/pii.ts`, `worker/llm/`.
- `worker/profile.ts` — profile format (zod) and loading from files / `PROFILES_YAML`.
- `data/companies.json` — boards checked nightly; regenerate with `npm run seed:companies`.
- `app/` — dashboard (Next.js server components); `proxy.ts` — password protection.

## Commands
- `npm test` — unit + pipeline tests (no network). `npm run typecheck`.
- `npm run worker -- --companies 40 --score-limit 10` — quick real run against a local DB.
- `npm run dev` — dashboard on http://localhost:3000.

## Working style
- Small changes, run `npm test` before finishing.
- If a site changes its page layout and an adapter breaks, fix the adapter and add the new HTML
  as a test fixture under `worker/ats/__fixtures__/`.
- Explain changes in plain English in the commit message — the maintainer may not be a programmer.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

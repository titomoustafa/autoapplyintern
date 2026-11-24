import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies, jobs, matches, runs } from "../db/schema";
import type { AtsAdapter, AtsName, CompanyRef, ListedJob } from "./ats/types";
import { filterByDescription, filterByTitleAndLocation } from "./filter";
import { RateLimitError, type Llm } from "./llm";
import type { Profile } from "./profile";
import { scoreFit } from "./score";

export interface PipelineOptions {
  db: Db;
  profiles: Profile[];
  adapters: Record<AtsName, AtsAdapter>;
  llm: Llm | null;
  fetch?: typeof fetch;
  /** Max jobs to score per profile per run (free AI tiers have daily limits). */
  scoreLimit: number;
  /** Only check the first N companies (for quick local tests). */
  companyLimit?: number;
  log?: (msg: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunStats {
  companiesChecked: number;
  companyErrors: { company: string; error: string }[];
  jobsSeen: number;
  newJobs: number;
  newCandidates: Record<string, number>;
  scored: Record<string, number>;
  aboveThreshold: Record<string, number>;
  stoppedEarly?: string;
}

/** Runs tasks with at most `limit` in flight. */
async function pMap<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/**
 * The nightly job: discover → filter → score.
 * (Applying is added in milestone 2.)
 */
export async function runPipeline(opts: PipelineOptions): Promise<RunStats> {
  const { db, profiles, log = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  // Use this machine's clock everywhere so "new since this run" comparisons line up.
  const runStart = new Date();
  const [run] = await db.insert(runs).values({ startedAt: runStart }).returning();
  const stats: RunStats = {
    companiesChecked: 0,
    companyErrors: [],
    jobsSeen: 0,
    newJobs: 0,
    newCandidates: {},
    scored: {},
    aboveThreshold: {},
  };

  try {
    // 1. Discover
    const searchTerms = [...new Set(profiles.flatMap((p) => p.search.workday_terms))];
    let companyRows = await db.select().from(companies).where(eq(companies.active, true)).orderBy(asc(companies.id));
    if (opts.companyLimit) companyRows = companyRows.slice(0, opts.companyLimit);
    log(`Checking ${companyRows.length} companies…`);

    await pMap(companyRows, 6, async (c) => {
      const ref: CompanyRef = { name: c.name, ats: c.ats as AtsName, board: c.board };
      try {
        const listed = await opts.adapters[ref.ats].listJobs(ref, { searchTerms, fetch: opts.fetch });
        await upsertJobs(db, c.id, listed);
        // Workday only returns search results, so a missing job there doesn't mean it closed.
        if (ref.ats !== "workday") {
          await db
            .update(jobs)
            .set({ closed: true })
            .where(and(eq(jobs.companyId, c.id), lt(jobs.lastSeenAt, runStart), eq(jobs.closed, false)));
        }
        await db.update(companies).set({ lastCheckedAt: new Date(), lastError: null }).where(eq(companies.id, c.id));
        stats.companiesChecked++;
        stats.jobsSeen += listed.length;
      } catch (err) {
        const error = String((err as Error).message ?? err).slice(0, 300);
        stats.companyErrors.push({ company: c.name, error });
        await db.update(companies).set({ lastCheckedAt: new Date(), lastError: error }).where(eq(companies.id, c.id));
      }
    });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(gte(jobs.firstSeenAt, runStart));
    stats.newJobs = n;
    log(`Saw ${stats.jobsSeen} open jobs (${stats.newJobs} new), ${stats.companyErrors.length} company errors.`);

    for (const profile of profiles) {
      // 2. Filter every job this person hasn't seen yet
      const unseen = await db
        .select({ id: jobs.id, title: jobs.title, location: jobs.location })
        .from(jobs)
        .leftJoin(matches, and(eq(matches.jobId, jobs.id), eq(matches.profileId, profile.id)))
        .where(and(isNull(matches.jobId), eq(jobs.closed, false)));
      const rows = unseen.map((j) => {
        const f = filterByTitleAndLocation(j, profile);
        return {
          profileId: profile.id,
          jobId: j.id,
          stage: f.pass ? "candidate" : "filtered_out",
          filterReason: f.pass ? null : f.reason,
        };
      });
      for (let i = 0; i < rows.length; i += 1000) {
        await db.insert(matches).values(rows.slice(i, i + 1000)).onConflictDoNothing();
      }
      stats.newCandidates[profile.id] = rows.filter((r) => r.stage === "candidate").length;
      log(`[${profile.id}] ${unseen.length} new jobs → ${stats.newCandidates[profile.id]} pass the filters.`);

      // 3. Score the newest candidates
      const toScore = await db
        .select({ job: jobs, company: companies })
        .from(matches)
        .innerJoin(jobs, eq(jobs.id, matches.jobId))
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .where(and(eq(matches.profileId, profile.id), eq(matches.stage, "candidate"), eq(jobs.closed, false)))
        .orderBy(desc(jobs.firstSeenAt), desc(jobs.id))
        .limit(opts.scoreLimit);

      let scored = 0;
      for (const { job, company } of toScore) {
        const where = and(eq(matches.profileId, profile.id), eq(matches.jobId, job.id));
        let description = job.description;
        try {
          if (description == null) {
            const adapter = opts.adapters[company.ats as AtsName];
            description = adapter.fetchDescription
              ? await adapter.fetchDescription(
                  { name: company.name, ats: company.ats as AtsName, board: company.board },
                  { ...job, description: undefined, postedAt: job.postedAt ?? undefined },
                  { fetch: opts.fetch },
                )
              : "";
            await db.update(jobs).set({ description }).where(eq(jobs.id, job.id));
          }
          const f = filterByDescription(description, profile);
          if (!f.pass) {
            await db.update(matches).set({ stage: "filtered_out", filterReason: f.reason }).where(where);
            continue;
          }
          const s = await scoreFit(opts.llm, { title: job.title, company: company.name, location: job.location, description }, profile);
          await db
            .update(matches)
            .set({ stage: "scored", score: s.score, reasons: s.reasons, scorer: s.scorer, scoredAt: new Date() })
            .where(where);
          scored++;
          if (opts.llm?.delayMs) await sleep(opts.llm.delayMs);
        } catch (err) {
          if (err instanceof RateLimitError) {
            stats.stoppedEarly = `AI rate limit reached after ${scored} scores; the rest wait for the next run.`;
            log(stats.stoppedEarly);
            break;
          }
          log(`[${profile.id}] could not score job ${job.id} (${company.name}: ${job.title}): ${(err as Error).message}`);
        }
      }
      stats.scored[profile.id] = scored;

      const [{ above }] = await db
        .select({ above: sql<number>`count(*)::int` })
        .from(matches)
        .where(
          and(
            eq(matches.profileId, profile.id),
            eq(matches.stage, "scored"),
            gte(matches.score, profile.scoring.min_score),
            gte(matches.scoredAt, runStart),
          ),
        );
      stats.aboveThreshold[profile.id] = above;
      log(`[${profile.id}] scored ${scored}; ${above} new jobs at or above ${profile.scoring.min_score}.`);
      if (stats.stoppedEarly) break;
    }

    await db.update(runs).set({ finishedAt: new Date(), stats }).where(eq(runs.id, run.id));
    return stats;
  } catch (err) {
    await db
      .update(runs)
      .set({ finishedAt: new Date(), stats, error: String((err as Error).stack ?? err) })
      .where(eq(runs.id, run.id));
    throw err;
  }
}

async function upsertJobs(db: Db, companyId: number, listed: ListedJob[]) {
  const now = new Date();
  // Some boards list the same job twice; keep one row per id.
  const unique = [...new Map(listed.map((j) => [j.externalId, j])).values()];
  for (let i = 0; i < unique.length; i += 500) {
    await db
      .insert(jobs)
      .values(
        unique.slice(i, i + 500).map((j) => ({
          companyId,
          externalId: j.externalId,
          title: j.title,
          location: j.location,
          url: j.url,
          description: j.description ?? null,
          postedAt: j.postedAt && !isNaN(j.postedAt.getTime()) ? j.postedAt : null,
          firstSeenAt: now,
          lastSeenAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [jobs.companyId, jobs.externalId],
        set: {
          title: sql`excluded.title`,
          location: sql`excluded.location`,
          url: sql`excluded.url`,
          description: sql`coalesce(excluded.description, ${jobs.description})`,
          lastSeenAt: sql`excluded.last_seen_at`,
          closed: false,
        },
      });
  }
}

import "server-only";
import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { openDb, type Db } from "../../db/client";
import { companies, jobs, matches, runs } from "../../db/schema";

// One connection per server process.
const g = globalThis as unknown as { __db?: Promise<Db> };
function db(): Promise<Db> {
  // Production (Neon): the nightly worker owns migrations. Local: migrate so a fresh checkout works.
  g.__db ??= openDb({ migrate: !process.env.DATABASE_URL }).then((r) => r.db);
  return g.__db;
}

export async function getProfileIds(): Promise<string[]> {
  const rows = await (await db()).selectDistinct({ id: matches.profileId }).from(matches).orderBy(matches.profileId);
  return rows.map((r) => r.id);
}

export interface MatchRow {
  jobId: number;
  score: number | null;
  reasons: string | null;
  scorer: string | null;
  title: string;
  location: string;
  url: string;
  company: string;
  firstSeenAt: Date;
}

export async function getTopMatches(profileId: string, minScore: number, limit = 200): Promise<MatchRow[]> {
  return (await db())
    .select({
      jobId: jobs.id,
      score: matches.score,
      reasons: matches.reasons,
      scorer: matches.scorer,
      title: jobs.title,
      location: jobs.location,
      url: jobs.url,
      company: companies.name,
      firstSeenAt: jobs.firstSeenAt,
    })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(matches.profileId, profileId), eq(matches.stage, "scored"), gte(matches.score, minScore), eq(jobs.closed, false)))
    .orderBy(desc(matches.score), desc(jobs.firstSeenAt))
    .limit(limit);
}

export async function getStageCounts(profileId: string, minScore: number) {
  const d = await db();
  const [row] = await d
    .select({
      candidates: sql<number>`count(*) filter (where ${matches.stage} = 'candidate')::int`,
      scored: sql<number>`count(*) filter (where ${matches.stage} = 'scored')::int`,
      above: sql<number>`count(*) filter (where ${matches.stage} = 'scored' and ${matches.score} >= ${minScore})::int`,
      filteredOut: sql<number>`count(*) filter (where ${matches.stage} = 'filtered_out')::int`,
    })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(and(eq(matches.profileId, profileId), eq(jobs.closed, false)));
  return row;
}

export async function getLastRun() {
  const [run] = await (await db()).select().from(runs).where(isNotNull(runs.finishedAt)).orderBy(desc(runs.startedAt)).limit(1);
  return run ?? null;
}

export async function getCompanyHealth() {
  const d = await db();
  const [{ total }] = await d.select({ total: count() }).from(companies).where(eq(companies.active, true));
  const failing = await d
    .select({ name: companies.name, ats: companies.ats, error: companies.lastError })
    .from(companies)
    .where(and(eq(companies.active, true), isNotNull(companies.lastError)))
    .orderBy(companies.name);
  return { total, failing };
}

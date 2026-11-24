/**
 * Nightly entry point.
 *
 *   npm run worker                      # everything
 *   npm run worker -- --companies 10    # only the first 10 companies (quick test)
 *   npm run worker -- --score-limit 5   # score at most 5 jobs per person
 *   npm run worker -- --profile friend  # only this person
 */
import { parseArgs } from "node:util";
import { desc, eq, and, gte } from "drizzle-orm";
import { openDb } from "../db/client";
import { companies, jobs, matches } from "../db/schema";
import { adapters } from "./ats";
import { readCompaniesFile, syncCompanies } from "./companies";
import { getLlm } from "./llm";
import { runPipeline } from "./pipeline";
import { loadProfiles } from "./profile";

async function main() {
  const { values } = parseArgs({
    options: {
      profile: { type: "string" },
      companies: { type: "string" },
      "score-limit": { type: "string" },
    },
  });

  let profiles = loadProfiles().filter((p) => p.active);
  if (values.profile) profiles = profiles.filter((p) => p.id === values.profile);
  if (!profiles.length) {
    throw new Error("No active profiles. Copy profiles/example.yaml to profiles/<you>.yaml (see RUNBOOK.md).");
  }

  const llm = getLlm();
  console.log(`Profiles: ${profiles.map((p) => p.id).join(", ")}. Scorer: ${llm?.name ?? "keywords only (no GEMINI_API_KEY)"}.`);

  const { db, close } = await openDb();
  try {
    await syncCompanies(db, readCompaniesFile());
    const stats = await runPipeline({
      db,
      profiles,
      adapters,
      llm,
      scoreLimit: Number(values["score-limit"] ?? process.env.SCORE_LIMIT ?? 60),
      companyLimit: values.companies ? Number(values.companies) : undefined,
    });

    for (const p of profiles) {
      const top = await db
        .select({ score: matches.score, title: jobs.title, company: companies.name, url: jobs.url })
        .from(matches)
        .innerJoin(jobs, eq(jobs.id, matches.jobId))
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .where(and(eq(matches.profileId, p.id), eq(matches.stage, "scored"), gte(matches.score, p.scoring.min_score), eq(jobs.closed, false)))
        .orderBy(desc(matches.score))
        .limit(10);
      console.log(`\nTop matches for ${p.name}:`);
      for (const t of top) console.log(`  ${t.score}  ${t.company} — ${t.title}\n       ${t.url}`);
      if (!top.length) console.log("  (none yet)");
    }
    if (stats.companyErrors.length) {
      console.log(`\n${stats.companyErrors.length} companies failed (see dashboard). First few:`);
      for (const e of stats.companyErrors.slice(0, 5)) console.log(`  ${e.company}: ${e.error}`);
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

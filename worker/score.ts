import { findPhrase } from "./filter";
import type { Llm } from "./llm";
import { stripPii } from "./pii";
import type { Profile } from "./profile";

export interface ScoreInput {
  title: string;
  company: string;
  location: string;
  description: string;
}

export interface FitScore {
  score: number;
  reasons: string;
  scorer: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    reasons: { type: "string", description: "2-3 short sentences: strongest match, biggest gap." },
  },
  required: ["score", "reasons"],
};

const MAX_DESCRIPTION_CHARS = 8000;

export function buildPrompt(job: ScoreInput, profile: Profile): string {
  return `You are screening job postings for one candidate. Rate how good a fit this posting is, 0-100.

Scoring guide:
- 85-100: right field and level, candidate meets the stated requirements, no deal-breakers.
- 70-84: good fit with minor gaps (e.g. one missing preferred skill).
- 40-69: related but a stretch (adjacent field, requirements partly unmet).
- 0-39: wrong field or level, or a hard requirement the candidate clearly fails (degree, graduation year, citizenship/clearance, location).
Be strict about hard requirements. Don't reward keyword overlap alone.

CANDIDATE PREFERENCES AND ELIGIBILITY:
${profile.scoring.preferences || "(none given)"}

CANDIDATE RESUME:
${stripPii(profile.resume_text)}

JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "(not listed)"}
Description:
${job.description.slice(0, MAX_DESCRIPTION_CHARS)}`;
}

export async function scoreFit(llm: Llm | null, job: ScoreInput, profile: Profile): Promise<FitScore> {
  if (!llm) return heuristicScore(job, profile);
  const out = await llm.json<{ score: number; reasons: string }>(buildPrompt(job, profile), SCHEMA);
  const score = Math.max(0, Math.min(100, Math.round(Number(out.score))));
  if (!Number.isFinite(score)) throw new Error(`AI returned a bad score: ${JSON.stringify(out)}`);
  return { score, reasons: String(out.reasons ?? "").slice(0, 1000), scorer: llm.name };
}

/**
 * Fallback when no AI key is configured: rough score from how many of the
 * profile's field words appear in the posting. Good enough to rank, not to auto-apply.
 */
export function heuristicScore(job: ScoreInput, profile: Profile): FitScore {
  const text = `${job.title}\n${job.description}`;
  const s = profile.search;
  const fieldHits = s.title_any.filter((p) => findPhrase(text, [p]));
  const levelHit = s.level_any.length === 0 || !!findPhrase(job.title, s.level_any);
  const score = Math.min(100, (findPhrase(job.title, s.title_any) ? 40 : 0) + (levelHit ? 20 : 0) + fieldHits.length * 8);
  return {
    score,
    reasons: `Keyword match (no AI key set): ${fieldHits.join(", ") || "none"}.`,
    scorer: "heuristic",
  };
}

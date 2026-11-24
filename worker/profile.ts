import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse, parseAllDocuments } from "yaml";
import { z } from "zod";

const words = z.array(z.string().min(1)).default([]);

export const ProfileSchema = z.object({
  /** Short id used in the database, e.g. "friend". */
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase letters, numbers, dashes"),
  name: z.string(),
  /** Only active profiles are searched and scored. */
  active: z.boolean().default(true),
  search: z.object({
    /** Typed into the search box of big Workday boards (they're too big to read in full). */
    workday_terms: z.array(z.string().min(1)).min(1),
    /** Job title must contain at least one of these words/phrases. */
    title_any: z.array(z.string().min(1)).min(1),
    /** …and at least one of these (e.g. intern, co-op). Empty = any level. */
    level_any: words,
    /** Job title must contain none of these. */
    title_exclude: words,
    /** Location must contain one of these. Empty = anywhere. Jobs with no clear location are kept. */
    location_any: words,
    location_exclude: words,
    /** Description must contain none of these (e.g. "PhD required"). */
    description_exclude: words,
  }),
  scoring: z
    .object({
      min_score: z.number().int().min(0).max(100).default(70),
      /** Plain-English notes for the AI: what you want, eligibility, deal-breakers. No phone/address. */
      preferences: z.string().default(""),
    })
    .prefault({}),
  /** Resume as plain text. Contact details are stripped automatically before any AI call. */
  resume_text: z.string().min(50, "paste your resume text into resume_text"),
});

export type Profile = z.infer<typeof ProfileSchema>;

const PROFILES_DIR = path.join(process.cwd(), "profiles");

function validate(raw: unknown, where: string): Profile {
  const result = ProfileSchema.safeParse(raw);
  if (!result.success) throw new Error(`${where} is invalid:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/**
 * Loads profiles from:
 *  - the PROFILES_YAML env var (GitHub Actions secret; several profiles separated by a line with ---), plus
 *  - every profiles/*.yaml file except the example (local development).
 */
export function loadProfiles(dir = PROFILES_DIR, env: Record<string, string | undefined> = process.env): Profile[] {
  const fromEnv = env.PROFILES_YAML
    ? parseAllDocuments(env.PROFILES_YAML)
        .map((doc, i) => ({ raw: doc.toJS(), where: `PROFILES_YAML document #${i + 1}` }))
        .filter((d) => d.raw != null)
    : [];
  const fromFiles = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f) && !f.startsWith("example"))
    .map((f) => ({ raw: parse(readFileSync(path.join(dir, f), "utf8")), where: `profiles/${f}` }));
  const profiles = [...fromEnv, ...fromFiles].map((d) => validate(d.raw, d.where));
  const dupe = profiles.find((p, i) => profiles.findIndex((q) => q.id === p.id) !== i);
  if (dupe) throw new Error(`Two profiles use the id "${dupe.id}"`);
  return profiles;
}

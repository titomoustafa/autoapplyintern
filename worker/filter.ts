import type { Profile } from "./profile";

export type FilterResult = { pass: true } | { pass: false; reason: string };

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive match against any of the phrases. Returns the phrase that matched. */
export function findPhrase(text: string, phrases: string[]): string | undefined {
  return phrases.find((p) => new RegExp(`(^|[^a-z0-9])${escapeRegex(p)}($|[^a-z0-9])`, "i").test(text));
}

/** Locations like "3 Locations" or "" don't tell us anything, so we keep those jobs. */
function isVagueLocation(loc: string) {
  return !loc.trim() || /^\d+\s+locations?$/i.test(loc.trim());
}

/** Cheap checks on title and location — no AI, no description needed. */
export function filterByTitleAndLocation(job: { title: string; location: string }, profile: Profile): FilterResult {
  const s = profile.search;
  if (!findPhrase(job.title, s.title_any)) return { pass: false, reason: "title: not in field" };
  if (s.level_any.length && !findPhrase(job.title, s.level_any)) return { pass: false, reason: "title: not an internship/level match" };
  const excluded = findPhrase(job.title, s.title_exclude);
  if (excluded) return { pass: false, reason: `title: contains "${excluded}"` };
  if (!isVagueLocation(job.location)) {
    const badLoc = findPhrase(job.location, s.location_exclude);
    if (badLoc) return { pass: false, reason: `location: ${badLoc}` };
    if (s.location_any.length && !findPhrase(job.location, s.location_any)) {
      return { pass: false, reason: `location: ${job.location}` };
    }
  }
  return { pass: true };
}

/** Second check, once the description has been fetched. */
export function filterByDescription(description: string, profile: Profile): FilterResult {
  const hit = findPhrase(description, profile.search.description_exclude);
  return hit ? { pass: false, reason: `description: contains "${hit}"` } : { pass: true };
}

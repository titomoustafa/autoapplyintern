/**
 * Builds data/companies.json — the list of company job boards the bot checks nightly.
 *
 * Sources:
 *  1. Simplify's public Summer 2027 internship list (github.com/SimplifyJobs/Summer2027-Internships):
 *     every hardware / mechanical-ish internship there links to a company's job board,
 *     which tells us the board type and id.
 *  2. A hand-picked list below (CURATED).
 *
 * Each board is then checked once; boards that don't respond are dropped.
 *
 * Usage: npm run seed:companies [-- --no-verify]
 */
import { writeFileSync } from "node:fs";
import { adapters, detectAts } from "../worker/ats";
import type { AtsName } from "../worker/ats/types";
import { COMPANIES_FILE, type CompanyEntry } from "../worker/companies";

const SIMPLIFY_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";

/** Titles that suggest a mechanical-engineering-adjacent role. */
const ME_TITLE = /mechanic|aerospace|manufactur|propulsion|structur|thermal|hardware|mechatronic|robotic|product design|test engineer|materials/i;

/** Hand-picked mechanical/aerospace/hardware companies found by checking their boards. */
const CURATED: Omit<CompanyEntry, "source">[] = [
  { name: "Rocket Lab", ats: "greenhouse", board: "rocketlab" },
  { name: "Relativity Space", ats: "greenhouse", board: "relativity" },
  { name: "Astranis", ats: "greenhouse", board: "astranis" },
  { name: "Formlabs", ats: "greenhouse", board: "formlabs" },
  { name: "Figure AI", ats: "greenhouse", board: "figureai" },
  { name: "Apptronik", ats: "greenhouse", board: "apptronik" },
  { name: "Agility Robotics", ats: "greenhouse", board: "agilityrobotics" },
  { name: "Zipline", ats: "greenhouse", board: "flyzipline" },
  { name: "Redwood Materials", ats: "greenhouse", board: "redwoodmaterials" },
  { name: "Lucid Motors", ats: "greenhouse", board: "lucidmotors" },
  { name: "Xometry", ats: "greenhouse", board: "xometry" },
  { name: "Nuro", ats: "greenhouse", board: "nuro" },
  { name: "Waymo", ats: "greenhouse", board: "waymo" },
  { name: "Zoox", ats: "lever", board: "zoox" },
  { name: "Saronic", ats: "ashby", board: "saronic" },
  { name: "Radiant", ats: "ashby", board: "radiant" },
  { name: "RTX", ats: "workday", board: "globalhr.wd5/REC_RTX_Ext_Gateway" },
  { name: "General Motors", ats: "workday", board: "generalmotors.wd5/Careers_GM" },
  { name: "GE Aerospace", ats: "workday", board: "geaerospace.wd5/ge_externalsite" },
  { name: "GE Vernova", ats: "workday", board: "gevernova.wd5/vernova_externalsite" },
  { name: "Northrop Grumman", ats: "workday", board: "ngc.wd1/Northrop_Grumman_External_Site" },
  { name: "Boeing", ats: "workday", board: "boeing.wd1/EXTERNAL_CAREERS" },
  { name: "Blue Origin", ats: "workday", board: "blueorigin.wd5/BlueOrigin" },
  { name: "Medtronic", ats: "workday", board: "medtronic.wd1/MedtronicCareers" },
  { name: "Stryker", ats: "workday", board: "stryker.wd1/StrykerCareers" },
];

/** Board names that are private/internal postings, not real career sites. */
const SKIP_BOARD = /private|confidential|internal|staff$/i;

interface SimplifyListing {
  company_name: string;
  title: string;
  category?: string;
  url: string;
}

async function fromSimplify(): Promise<CompanyEntry[]> {
  const res = await fetch(SIMPLIFY_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Simplify list: HTTP ${res.status}`);
  const listings = (await res.json()) as SimplifyListing[];
  const out: CompanyEntry[] = [];
  for (const l of listings) {
    if (l.category !== "Hardware" && !ME_TITLE.test(l.title)) continue;
    const ats = detectAts(l.url);
    if (!ats || SKIP_BOARD.test(ats.board)) continue;
    out.push({ name: l.company_name.trim(), ...ats, source: "simplify" });
  }
  return out;
}

async function isAlive(c: CompanyEntry): Promise<boolean> {
  try {
    await adapters[c.ats as AtsName].listJobs(c, { searchTerms: ["intern"] });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const verify = !process.argv.includes("--no-verify");
  const all = [...CURATED.map((c) => ({ ...c, source: "curated" })), ...(await fromSimplify())];
  const byKey = new Map<string, CompanyEntry>();
  for (const c of all) {
    const key = `${c.ats}:${c.board.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  let list = [...byKey.values()];
  console.log(`Found ${list.length} unique boards.`);

  if (verify) {
    const alive: CompanyEntry[] = [];
    let i = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (i < list.length) {
          const c = list[i++];
          if (await isAlive(c)) alive.push(c);
          else console.log(`  dropping ${c.name} (${c.ats}:${c.board}) — board did not respond`);
        }
      }),
    );
    list = alive;
  }

  list.sort((a, b) => a.name.localeCompare(b.name) || a.board.localeCompare(b.board));
  writeFileSync(COMPANIES_FILE, JSON.stringify(list, null, 1) + "\n");
  const counts = list.reduce<Record<string, number>>((m, c) => ((m[c.ats] = (m[c.ats] ?? 0) + 1), m), {});
  console.log(`Wrote ${list.length} companies to data/companies.json`, counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

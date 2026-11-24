import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies } from "../db/schema";
import type { AtsName } from "./ats/types";

export interface CompanyEntry {
  name: string;
  ats: AtsName;
  board: string;
  source: string;
}

export const COMPANIES_FILE = path.join(process.cwd(), "data", "companies.json");

export function readCompaniesFile(file = COMPANIES_FILE): CompanyEntry[] {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Makes sure every company in data/companies.json exists in the database.
 * Never deactivates or deletes: companies turned off in the DB stay off.
 */
export async function syncCompanies(db: Db, entries: CompanyEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i += 500) {
    await db
      .insert(companies)
      .values(entries.slice(i, i + 500))
      .onConflictDoUpdate({ target: [companies.ats, companies.board], set: { name: sql`excluded.name` } });
  }
}

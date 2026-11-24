import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * Opens the database and applies any pending migrations.
 *
 * - DATABASE_URL set → real Postgres (Neon in production).
 * - Otherwise → a local Postgres stored in ./.data/pglite (for development).
 * - dataDir "memory://" → throwaway in-memory database (for tests).
 * - migrate: false → skip migrations (the dashboard; the nightly worker applies them).
 */
export async function openDb(opts: { dataDir?: string; migrate?: boolean } = {}): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (url && !opts.dataDir) {
    const sql = postgres(url, { max: 5, onnotice: () => {} });
    const db = drizzlePostgres(sql, { schema });
    if (opts.migrate !== false) await migratePostgres(db, { migrationsFolder: MIGRATIONS });
    return { db, close: () => sql.end() };
  }
  if (process.env.CI && !opts.dataDir) {
    throw new Error("DATABASE_URL is not set. Add it as a GitHub Actions secret (see RUNBOOK.md).");
  }
  const dataDir = opts.dataDir ?? path.join(process.cwd(), ".data", "pglite");
  if (!dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  if (opts.migrate !== false) await migratePglite(db, { migrationsFolder: MIGRATIONS });
  // Both drivers expose the same query builder; the cast keeps one Db type across the app.
  return { db: db as unknown as Db, close: () => client.close() };
}

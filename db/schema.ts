import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** A company whose job board we check every night. */
export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** greenhouse | lever | ashby | workday */
    ats: text("ats").notNull(),
    /** Board identifier. Greenhouse/Lever/Ashby: the slug. Workday: "tenant.wdN/site". */
    board: text("board").notNull(),
    active: boolean("active").notNull().default(true),
    /** Where we learned about this company (e.g. "simplify", "curated"). */
    source: text("source").notNull().default("curated"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_ats_board").on(t.ats, t.board)],
);

/** A single job posting found on a company's board. */
export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    location: text("location").notNull().default(""),
    url: text("url").notNull(),
    description: text("description"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** True once the job disappears from the company's board. */
    closed: boolean("closed").notNull().default(false),
  },
  (t) => [uniqueIndex("jobs_company_external").on(t.companyId, t.externalId)],
);

/** How one job looks for one person: filtered out, waiting for a score, or scored. */
export const matches = pgTable(
  "matches",
  {
    profileId: text("profile_id").notNull(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    /** filtered_out | candidate | scored */
    stage: text("stage").notNull(),
    filterReason: text("filter_reason"),
    score: integer("score"),
    reasons: text("reasons"),
    /** Which scorer produced the score, e.g. "gemini:gemini-flash-latest" or "heuristic". */
    scorer: text("scorer"),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.jobId] })],
);

/** One nightly run and what it did. */
export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  stats: jsonb("stats"),
  error: text("error"),
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { parse } from "yaml";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { jobs, matches, runs } from "../db/schema";
import type { AtsAdapter, AtsName, ListedJob } from "./ats/types";
import { syncCompanies } from "./companies";
import { RateLimitError, type Llm } from "./llm";
import { runPipeline } from "./pipeline";
import { ProfileSchema } from "./profile";

const profile = ProfileSchema.parse(
  parse(readFileSync(path.join(__dirname, "..", "profiles", "example.yaml"), "utf8")),
);

function fakeAdapters(boards: Record<string, ListedJob[]>, descriptions: Record<string, string> = {}) {
  const make = (name: AtsName): AtsAdapter => ({
    name,
    listJobs: async (c) => {
      if (!(c.board in boards)) throw new Error("HTTP 404");
      return boards[c.board];
    },
    fetchDescription: async (_c, j) => descriptions[j.externalId] ?? "",
  });
  return { greenhouse: make("greenhouse"), lever: make("lever"), ashby: make("ashby"), workday: make("workday") };
}

const job = (id: string, title: string, location = "Austin, TX", description?: string): ListedJob => ({
  externalId: id,
  title,
  location,
  url: `https://example.com/${id}`,
  description,
});

describe("runPipeline", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await openDb({ dataDir: "memory://" }));
    await syncCompanies(db, [
      { name: "Acme", ats: "greenhouse", board: "acme", source: "test" },
      { name: "Bigco", ats: "workday", board: "bigco.wd1/Careers", source: "test" },
      { name: "Gone", ats: "lever", board: "gone", source: "test" },
    ]);
  });

  const base = { profiles: [profile], llm: null, scoreLimit: 50, log: () => {}, sleep: async () => {} };

  it("discovers, filters, and scores; reruns don't duplicate", async () => {
    const adapters = fakeAdapters(
      {
        acme: [
          job("1", "Mechanical Engineering Intern", "Austin, TX", "SolidWorks and FEA"),
          job("2", "Software Engineer"),
          job("3", "Propulsion Intern", "Hawthorne, CA", "PhD required"),
        ],
        "bigco.wd1/Careers": [job("/job/9", "Manufacturing Engineering Co-op", "US-MI-Warren")],
      },
      { "/job/9": "Lean manufacturing, CAD" },
    );

    const stats = await runPipeline({ db, adapters, ...base });
    expect(stats.companiesChecked).toBe(2);
    expect(stats.companyErrors).toEqual([{ company: "Gone", error: "HTTP 404" }]);
    expect(stats.newJobs).toBe(4);
    expect(stats.newCandidates.example).toBe(3);
    expect(stats.scored.example).toBe(2); // job 3 dropped by description

    const m = await db.select().from(matches);
    const byJob = Object.fromEntries(
      await Promise.all(
        m.map(async (r) => [(await db.select().from(jobs).where(eq(jobs.id, r.jobId)))[0].externalId, r]),
      ),
    );
    expect(byJob["2"].stage).toBe("filtered_out");
    expect(byJob["3"]).toMatchObject({ stage: "filtered_out", filterReason: 'description: contains "PhD required"' });
    expect(byJob["/job/9"].stage).toBe("scored");
    // Workday description was fetched and saved
    const [wd] = await db.select().from(jobs).where(eq(jobs.externalId, "/job/9"));
    expect(wd.description).toBe("Lean manufacturing, CAD");

    const again = await runPipeline({ db, adapters, ...base });
    expect(again.newJobs).toBe(0);
    expect(again.scored.example).toBe(0);
    expect(await db.select().from(matches)).toHaveLength(4);
    expect((await db.select().from(runs)).every((r) => r.finishedAt && !r.error)).toBe(true);
  });

  it("closes jobs that disappear (except on Workday)", async () => {
    await runPipeline({ db, adapters: fakeAdapters({ acme: [job("1", "Mechanical Intern")], "bigco.wd1/Careers": [job("/a", "Mechanical Intern")] }), ...base });
    await runPipeline({ db, adapters: fakeAdapters({ acme: [], "bigco.wd1/Careers": [] }), ...base });
    const all = await db.select().from(jobs);
    expect(all.find((j) => j.externalId === "1")!.closed).toBe(true);
    expect(all.find((j) => j.externalId === "/a")!.closed).toBe(false);
  });

  it("stops scoring politely when the AI rate limit is hit", async () => {
    let calls = 0;
    const llm: Llm = {
      name: "fake",
      delayMs: 0,
      json: async () => {
        if (++calls > 1) throw new RateLimitError("429");
        return { score: 80, reasons: "ok" } as never;
      },
    };
    const adapters = fakeAdapters({
      acme: [job("1", "Mechanical Intern", "TX", "x"), job("2", "Mechanical Intern", "TX", "y"), job("3", "Mechanical Intern", "TX", "z")],
    });
    const stats = await runPipeline({ db, adapters, ...base, llm });
    expect(stats.scored.example).toBe(1);
    expect(stats.stoppedEarly).toMatch(/rate limit/);
    const stages = (await db.select().from(matches)).map((m) => m.stage).sort();
    expect(stages).toEqual(["candidate", "candidate", "scored"]);
  });
});

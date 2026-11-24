import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adapters, detectAts } from "./index";
import { parseWorkdayBoard } from "./workday";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

/** A fake fetch that answers from fixtures and records what was requested. */
function fakeFetch(routes: Record<string, string>) {
  const calls: { url: string; body?: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(routes[key], { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("greenhouse", () => {
  it("lists jobs with plain-text descriptions", async () => {
    const { f, calls } = fakeFetch({ "boards-api.greenhouse.io": fixture("greenhouse.json") });
    const jobs = await adapters.greenhouse.listJobs({ name: "Astranis", ats: "greenhouse", board: "astranis" }, { searchTerms: [], fetch: f });
    expect(calls[0].url).toContain("/boards/astranis/jobs?content=true");
    expect(jobs).toHaveLength(2);
    expect(jobs[0].title).toBeTruthy();
    expect(jobs[0].url).toMatch(/^https:\/\//);
    expect(jobs[0].description).toBeTruthy();
    expect(jobs[0].description).not.toMatch(/<[a-z]+[ >]|&lt;/);
  });
});

describe("lever", () => {
  it("lists jobs", async () => {
    const { f } = fakeFetch({ "api.lever.co": fixture("lever.json") });
    const jobs = await adapters.lever.listJobs({ name: "Zoox", ats: "lever", board: "zoox" }, { searchTerms: [], fetch: f });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].url).toContain("jobs.lever.co/zoox/");
    expect(jobs[0].description!.length).toBeGreaterThan(100);
  });
});

describe("ashby", () => {
  it("lists jobs", async () => {
    const { f } = fakeFetch({ "api.ashbyhq.com": fixture("ashby.json") });
    const jobs = await adapters.ashby.listJobs({ name: "Saronic", ats: "ashby", board: "saronic" }, { searchTerms: [], fetch: f });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].url).toContain("jobs.ashbyhq.com/saronic/");
    expect(jobs[0].location).toBeTruthy();
  });
});

describe("workday", () => {
  const company = { name: "RTX", ats: "workday" as const, board: "globalhr.wd5/REC_RTX_Ext_Gateway" };

  it("searches each term and builds public job URLs", async () => {
    const { f, calls } = fakeFetch({ "/wday/cxs/globalhr/REC_RTX_Ext_Gateway/jobs": fixture("workday-list.json") });
    const jobs = await adapters.workday.listJobs(company, { searchTerms: ["mechanical intern", "aerospace intern"], fetch: f });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0].body!).searchText).toBe("mechanical intern");
    expect(jobs).toHaveLength(2); // same postings for both terms are de-duplicated
    expect(jobs[0].url).toMatch(/^https:\/\/globalhr\.wd5\.myworkdayjobs\.com\/REC_RTX_Ext_Gateway\/job\//);
  });

  it("fetches a description", async () => {
    const { f } = fakeFetch({ "/wday/cxs/": fixture("workday-detail.json") });
    const desc = await adapters.workday.fetchDescription!(company, { externalId: "/job/x", title: "", location: "", url: "" }, { fetch: f });
    expect(desc.length).toBeGreaterThan(100);
    expect(desc).not.toMatch(/<p|&amp;/);
  });

  it("parses board ids", () => {
    expect(parseWorkdayBoard("ngc.wd1/Northrop_Grumman_External_Site")).toEqual({
      tenant: "ngc",
      site: "Northrop_Grumman_External_Site",
      host: "https://ngc.wd1.myworkdayjobs.com",
    });
    expect(() => parseWorkdayBoard("nonsense")).toThrow();
  });
});

describe("detectAts", () => {
  it.each([
    ["https://job-boards.greenhouse.io/astranis/jobs/4430423006", { ats: "greenhouse", board: "astranis" }],
    ["https://boards.greenhouse.io/embed/job_app?for=RocketLab&token=1", { ats: "greenhouse", board: "rocketlab" }],
    ["https://jobs.lever.co/zoox/8befaec7", { ats: "lever", board: "zoox" }],
    ["https://jobs.ashbyhq.com/saronic/0877a61d?utm=x", { ats: "ashby", board: "saronic" }],
    ["https://intel.wd1.myworkdayjobs.com/en-US/External/job/abc", { ats: "workday", board: "intel.wd1/External" }],
    ["https://GM.wd5.myworkdayjobs.com/Careers_GM/job/x", { ats: "workday", board: "gm.wd5/Careers_GM" }],
  ])("%s", (url, expected) => {
    expect(detectAts(url)).toEqual(expected);
  });

  it("returns null for unsupported sites", () => {
    expect(detectAts("https://www.tesla.com/careers/search/job/123")).toBeNull();
  });
});

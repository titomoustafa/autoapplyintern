import path from "node:path";
import { describe, expect, it } from "vitest";
import { filterByDescription, filterByTitleAndLocation } from "./filter";
import type { Llm } from "./llm";
import { stripPii } from "./pii";
import { loadProfiles, ProfileSchema } from "./profile";
import { buildPrompt, heuristicScore, scoreFit } from "./score";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const profile = ProfileSchema.parse(
  parse(readFileSync(path.join(__dirname, "..", "profiles", "example.yaml"), "utf8")),
);

describe("filterByTitleAndLocation", () => {
  it.each([
    ["Mechanical Engineering Intern", "Hawthorne, CA", true],
    ["Operations Engineering Intern (Summer 2027)", "US-TX-MCKINNEY-513WZ", false], // not in field
    ["Propulsion Intern - Summer 2027", "2 Locations", true], // vague location kept
    ["Senior Mechanical Engineer", "Seattle, WA", false],
    ["Mechanical Engineer", "Seattle, WA", false], // not an internship
    ["Mechanical Design Co-op", "Toronto, Canada", false],
    ["Mechanical Engineering Intern", "Bangalore, India", false],
    ["Manufacturing Engineering Internship", "Remote", true],
  ])("%s @ %s → %s", (title, location, pass) => {
    expect(filterByTitleAndLocation({ title, location }, profile).pass).toBe(pass);
  });

  it("explains why a job was dropped", () => {
    expect(filterByTitleAndLocation({ title: "Sr Mechanical Intern", location: "" }, profile)).toEqual({
      pass: false,
      reason: 'title: contains "sr"',
    });
  });

  it("drops by description", () => {
    expect(filterByDescription("Requirements: PhD required in fluid mechanics", profile).pass).toBe(false);
    expect(filterByDescription("BS in Mechanical Engineering", profile).pass).toBe(true);
  });
});

describe("stripPii", () => {
  it("removes contact details", () => {
    const out = stripPii(
      "Jane Doe | jane.doe@gmail.com | (555) 123-4567 | 4500 N. Oak Avenue Apt 2, Austin, TX 78701 | linkedin.com/in/jane",
    );
    expect(out).not.toMatch(/jane\.doe|555|4500|78701/);
    expect(out).toContain("Jane Doe");
    expect(out).toContain("linkedin.com/in/jane");
  });

  it("keeps ordinary numbers", () => {
    expect(stripPii("GPA 3.6, led 40 students, 2027")).toBe("GPA 3.6, led 40 students, 2027");
  });
});

describe("scoring", () => {
  const job = {
    title: "Mechanical Engineering Intern",
    company: "Acme Aero",
    location: "Hawthorne, CA",
    description: "Design brackets in SolidWorks. FEA with ANSYS. Contact recruiter@acme.com",
  };

  it("never sends contact details to the AI", () => {
    const p = { ...profile, resume_text: profile.resume_text + "\nphone: 555-123-4567 email me@x.com" };
    const prompt = buildPrompt(job, p);
    expect(prompt).not.toMatch(/555-123-4567|me@x\.com/);
    expect(prompt).toContain("Acme Aero");
  });

  it("uses the AI when configured and clamps the score", async () => {
    const llm: Llm = { name: "fake", delayMs: 0, json: async () => ({ score: 140, reasons: "great" }) as never };
    expect(await scoreFit(llm, job, profile)).toEqual({ score: 100, reasons: "great", scorer: "fake" });
  });

  it("falls back to keywords with no AI", async () => {
    const s = await scoreFit(null, job, profile);
    expect(s.scorer).toBe("heuristic");
    expect(s.score).toBeGreaterThanOrEqual(60);
    expect(heuristicScore({ ...job, title: "Accountant" }, profile).score).toBeLessThan(40);
  });
});

describe("loadProfiles", () => {
  const dir = path.join(__dirname, "..", "profiles");
  const example = readFileSync(path.join(dir, "example.yaml"), "utf8");

  it("skips the example file", () => {
    expect(loadProfiles(dir, {}).map((p) => p.id)).not.toContain("example");
  });

  it("reads several profiles from the PROFILES_YAML secret", () => {
    const two = `${example.replace("id: example", "id: a")}\n---\n${example.replace("id: example", "id: b")}`;
    const ids = loadProfiles(dir, { PROFILES_YAML: two }).map((p) => p.id);
    expect(ids.slice(0, 2)).toEqual(["a", "b"]);
  });

  it("explains what's wrong with a bad profile", () => {
    expect(() => loadProfiles(dir, { PROFILES_YAML: "id: Bad Id\nname: x" })).toThrow(/PROFILES_YAML document #1 is invalid/);
  });
});

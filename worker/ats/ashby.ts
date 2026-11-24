import { fetchJson } from "./http";
import type { AtsAdapter } from "./types";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  jobUrl: string;
  descriptionPlain?: string;
  publishedAt?: string;
  isListed?: boolean;
}

export const ashby: AtsAdapter = {
  name: "ashby",
  async listJobs(company, opts) {
    const data = await fetchJson<{ jobs: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.board)}`,
      { fetch: opts.fetch },
    );
    return data.jobs
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        externalId: j.id,
        title: j.title.trim(),
        location: [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location), j.isRemote ? "Remote" : ""]
          .filter(Boolean)
          .join(" / "),
        url: j.jobUrl,
        description: j.descriptionPlain,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
      }));
  },
};

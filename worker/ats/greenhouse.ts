import { htmlToText } from "../text";
import { fetchJson } from "./http";
import type { AtsAdapter } from "./types";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  first_published?: string;
  updated_at?: string;
}

export const greenhouse: AtsAdapter = {
  name: "greenhouse",
  async listJobs(company, opts) {
    const data = await fetchJson<{ jobs: GreenhouseJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.board)}/jobs?content=true`,
      { fetch: opts.fetch },
    );
    return data.jobs.map((j) => ({
      externalId: String(j.id),
      title: j.title.trim(),
      location: j.location?.name ?? "",
      url: j.absolute_url,
      description: j.content ? htmlToText(j.content) : undefined,
      postedAt: j.first_published ? new Date(j.first_published) : undefined,
    }));
  },
};

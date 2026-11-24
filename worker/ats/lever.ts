import { fetchJson } from "./http";
import type { AtsAdapter } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
}

export const lever: AtsAdapter = {
  name: "lever",
  async listJobs(company, opts) {
    const data = await fetchJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(company.board)}?mode=json`,
      { fetch: opts.fetch },
    );
    return data.map((p) => ({
      externalId: p.id,
      title: p.text.trim(),
      location: p.categories?.allLocations?.join(" / ") || p.categories?.location || "",
      url: p.hostedUrl,
      description: [
        p.descriptionPlain,
        ...(p.lists ?? []).map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, " ")}`),
        p.additionalPlain,
      ]
        .filter(Boolean)
        .join("\n\n"),
      postedAt: p.createdAt ? new Date(p.createdAt) : undefined,
    }));
  },
};

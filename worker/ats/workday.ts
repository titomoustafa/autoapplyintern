import { htmlToText } from "../text";
import { fetchJson } from "./http";
import type { AtsAdapter, CompanyRef, ListedJob } from "./types";

/** Parses a Workday board id "tenant.wdN/site" into its URL parts. */
export function parseWorkdayBoard(board: string): { tenant: string; host: string; site: string } {
  const m = board.match(/^([^./]+)\.(wd\d+)\/([^/]+)$/);
  if (!m) throw new Error(`Bad Workday board "${board}" — expected "tenant.wdN/site"`);
  const [, tenant, wd, site] = m;
  return { tenant, site, host: `https://${tenant}.${wd}.myworkdayjobs.com` };
}

interface WorkdayListResponse {
  total: number;
  jobPostings: { title: string; externalPath: string; locationsText?: string; bulletFields?: string[] }[];
}

const PAGE_SIZE = 20;
/** Workday boards can have thousands of jobs; we only read the top results per search term. */
const MAX_PER_TERM = 60;

export const workday: AtsAdapter = {
  name: "workday",
  async listJobs(company, opts) {
    const { tenant, site, host } = parseWorkdayBoard(company.board);
    const api = `${host}/wday/cxs/${tenant}/${site}/jobs`;
    const terms = opts.searchTerms.length ? opts.searchTerms : ["intern"];
    const seen = new Map<string, ListedJob>();
    for (const searchText of terms) {
      for (let offset = 0; offset < MAX_PER_TERM; offset += PAGE_SIZE) {
        const data = await fetchJson<WorkdayListResponse>(api, {
          fetch: opts.fetch,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText }),
        });
        for (const p of data.jobPostings ?? []) {
          if (seen.has(p.externalPath)) continue;
          seen.set(p.externalPath, {
            externalId: p.externalPath,
            title: p.title.trim(),
            location: p.locationsText ?? "",
            url: `${host}/${site}${p.externalPath}`,
          });
        }
        if (!data.jobPostings?.length || offset + PAGE_SIZE >= (data.total ?? 0)) break;
      }
    }
    return [...seen.values()];
  },

  async fetchDescription(company: CompanyRef, job: ListedJob, opts) {
    const { tenant, site, host } = parseWorkdayBoard(company.board);
    const data = await fetchJson<{ jobPostingInfo: { jobDescription?: string; location?: string } }>(
      `${host}/wday/cxs/${tenant}/${site}${job.externalId}`,
      { fetch: opts.fetch },
    );
    return htmlToText(data.jobPostingInfo.jobDescription ?? "");
  },
};

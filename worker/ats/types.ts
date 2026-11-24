export type AtsName = "greenhouse" | "lever" | "ashby" | "workday";

export interface CompanyRef {
  name: string;
  ats: AtsName;
  /** Greenhouse/Lever/Ashby: board slug. Workday: "tenant.wdN/site". */
  board: string;
}

/** A job as read from a job board, before it is stored. */
export interface ListedJob {
  externalId: string;
  title: string;
  location: string;
  url: string;
  /** Plain-text description. Missing when the board's list endpoint doesn't include it. */
  description?: string;
  postedAt?: Date;
}

export interface ListOptions {
  /**
   * Search phrases from active profiles. Only used by boards too large to list in full
   * (Workday); others return every open job and the prefilter narrows them down.
   */
  searchTerms: string[];
  fetch?: typeof fetch;
}

/** One job site. M2/M3 add `apply()` to this interface. */
export interface AtsAdapter {
  name: AtsName;
  listJobs(company: CompanyRef, opts: ListOptions): Promise<ListedJob[]>;
  /** Fills in `description` for boards whose list endpoint omits it. */
  fetchDescription?(company: CompanyRef, job: ListedJob, opts: { fetch?: typeof fetch }): Promise<string>;
}

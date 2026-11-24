import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import type { AtsAdapter, AtsName } from "./types";
import { workday } from "./workday";

export const adapters: Record<AtsName, AtsAdapter> = { greenhouse, lever, ashby, workday };

/**
 * Works out which job board a careers/job URL belongs to.
 * Returns null for sites we don't support yet.
 */
export function detectAts(url: string): { ats: AtsName; board: string } | null {
  let m = url.match(/^https?:\/\/(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_(?:app|board)\?for=)?([A-Za-z0-9_-]+)/);
  if (m) return { ats: "greenhouse", board: m[1].toLowerCase() };
  m = url.match(/^https?:\/\/jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/);
  if (m) return { ats: "lever", board: m[1] };
  m = url.match(/^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (m) return { ats: "ashby", board: decodeURIComponent(m[1]) };
  m = url.match(/^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Za-z]{2}\/)?([^/?#]+)/i);
  if (m) return { ats: "workday", board: `${m[1].toLowerCase()}.${m[2].toLowerCase()}/${m[3]}` };
  return null;
}

const USER_AGENT = "auto-apply-job-finder/0.1";

/** GET/POST JSON with a timeout and a clear error message. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<T> {
  const { fetch: f = fetch, timeoutMs = 30_000, ...rest } = init;
  const res = await f(url, {
    ...rest,
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...(rest.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as T;
}

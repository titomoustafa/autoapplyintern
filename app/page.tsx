import Link from "next/link";
import { getCompanyHealth, getLastRun, getProfileIds, getStageCounts, getTopMatches } from "./lib/data";

export const dynamic = "force-dynamic";

const NEW_WINDOW_MS = 36 * 60 * 60 * 1000;

function ago(d: Date) {
  const h = Math.round((Date.now() - d.getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function scoreClass(s: number) {
  return s >= 85 ? "score high" : s >= 70 ? "score mid" : "score low";
}

export default async function Home({ searchParams }: { searchParams: Promise<{ p?: string; min?: string }> }) {
  const sp = await searchParams;
  const profiles = await getProfileIds();
  const profileId = sp.p && profiles.includes(sp.p) ? sp.p : profiles[0];
  const minScore = Math.max(0, Math.min(100, Number(sp.min ?? 70) || 0));

  const [lastRun, health] = await Promise.all([getLastRun(), getCompanyHealth()]);
  if (!profileId) {
    return (
      <main>
        <h1>Auto Apply</h1>
        <p className="muted">No results yet. Run the nightly job once (see RUNBOOK.md), then refresh.</p>
      </main>
    );
  }
  const [top, counts] = await Promise.all([getTopMatches(profileId, minScore), getStageCounts(profileId, minScore)]);
  const stats = (lastRun?.stats ?? null) as null | { stoppedEarly?: string; newJobs?: number };
  const heuristic = top.some((m) => m.scorer === "heuristic");

  return (
    <main>
      <header className="top">
        <h1>Auto Apply</h1>
        <nav className="tabs" aria-label="Person">
          {profiles.map((id) => (
            <Link key={id} href={`/?p=${id}&min=${minScore}`} className={id === profileId ? "tab active" : "tab"}>
              {id}
            </Link>
          ))}
        </nav>
      </header>

      <section className="stats" aria-label="Summary">
        <div className="stat">
          <span className="num">{counts.above}</span>
          <span className="label">matches ≥ {minScore}</span>
        </div>
        <div className="stat">
          <span className="num">{counts.candidates}</span>
          <span className="label">waiting for a score</span>
        </div>
        <div className="stat">
          <span className="num">{counts.scored}</span>
          <span className="label">scored</span>
        </div>
        <div className="stat">
          <span className="num">{health.total}</span>
          <span className="label">companies watched</span>
        </div>
      </section>

      <p className="muted small">
        {lastRun ? (
          <>
            Last run {ago(lastRun.startedAt)}
            {stats?.newJobs != null && <> · {stats.newJobs} new jobs found</>}
            {lastRun.error && <span className="warn"> · failed — check GitHub Actions</span>}
            {stats?.stoppedEarly && <span className="warn"> · {stats.stoppedEarly}</span>}
          </>
        ) : (
          "No runs yet."
        )}
        {" · "}
        <span>
          Min score:{" "}
          {[60, 70, 80].map((m) => (
            <Link key={m} href={`/?p=${profileId}&min=${m}`} className={m === minScore ? "chip active" : "chip"}>
              {m}
            </Link>
          ))}
        </span>
      </p>

      {heuristic && (
        <p className="notice">
          Some scores are keyword-only because no AI key was set. Add <code>GEMINI_API_KEY</code> for real fit scores.
        </p>
      )}

      {top.length === 0 ? (
        <p className="muted">No open jobs at or above {minScore} yet.</p>
      ) : (
        <ol className="jobs">
          {top.map((m) => {
            const isNew = Date.now() - m.firstSeenAt.getTime() < NEW_WINDOW_MS;
            return (
              <li key={m.jobId} className="job">
                <span className={scoreClass(m.score ?? 0)} title={m.scorer ?? ""}>
                  {m.score}
                </span>
                <div className="body">
                  <a href={m.url} target="_blank" rel="noreferrer" className="title">
                    {m.title}
                  </a>
                  <div className="meta">
                    <strong>{m.company}</strong>
                    {m.location && <> · {m.location}</>} · found {ago(m.firstSeenAt)}
                    {isNew && <span className="badge">new</span>}
                  </div>
                  {m.reasons && <p className="reasons">{m.reasons}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {health.failing.length > 0 && (
        <details className="failing">
          <summary>{health.failing.length} company job boards failed on the last check</summary>
          <ul>
            {health.failing.map((c) => (
              <li key={`${c.name}-${c.ats}`}>
                <strong>{c.name}</strong> ({c.ats}): {c.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}

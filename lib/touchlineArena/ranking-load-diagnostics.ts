const LABELS = ["activeRanking", "topXI", "catalog", "coach", "count", "fixtures", "auth"] as const;
type Label = typeof LABELS[number];
type Environment = Readonly<Record<string, string | undefined>>;
type Timing = { label: Label; durationMs: number; status: "fulfilled" | "rejected" };

function enabled(env: Environment) {
  if (env.TOUCHLINE_QA_RANKING_TIMINGS !== "true" || env.VERCEL_ENV !== "preview"
    || env.VERCEL_GIT_COMMIT_REF !== "qa") return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "https:" && url.hostname === "xgxbwqxjssxxuihuwmgy.supabase.co"
      && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

/** Server caller only. No global storage, payload capture, or additional awaited work. */
export function createRankingLoadDiagnostics(
  environment: Environment = process.env,
  clock: () => number = () => performance.now(),
  emit: (summary: { event: string; timings: Timing[] }) => void = (summary) => console.info(JSON.stringify(summary)),
) {
  const active = enabled(environment);
  const pending = new Set<Label>();
  const results = new Map<Label, Timing>();
  let sealed = false;
  let emitted = false;
  function publish() {
    if (!sealed || emitted || pending.size || results.size !== LABELS.length) return;
    emitted = true;
    try { emit({ event: "TL_QA_RANKING_TIMINGS", timings: LABELS.map(label => results.get(label)!) }); } catch { /* Diagnostics never alter the request. */ }
  }
  return {
    measure<T>(label: Label, start: () => Promise<T>): Promise<T> {
      if (!active || !LABELS.includes(label) || pending.has(label) || results.has(label)) return start();
      const began = clock();
      pending.add(label);
      const settle = (status: Timing["status"]) => {
        const elapsed = clock() - began;
        results.set(label, { label, durationMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0, status });
        pending.delete(label);
        publish();
      };
      let promise: Promise<T>;
      try { promise = start(); } catch (error) { settle("rejected"); throw error; }
      void promise.then(() => settle("fulfilled"), () => settle("rejected"));
      return promise;
    },
    seal() { if (active) { sealed = true; publish(); } },
  };
}

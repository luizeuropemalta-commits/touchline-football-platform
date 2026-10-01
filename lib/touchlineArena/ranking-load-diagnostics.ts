const LABELS = ["activeRanking", "topXI", "catalog", "coach", "count", "fixtures", "auth"] as const;
const CATALOGUE_LABELS = ["identityAndClubs", "memberships", "settlements", "seasonPoints", "publication"] as const;
type Environment = Readonly<Record<string, string | undefined>>;
type Timing<L extends string> = { label: L; durationMs: number; status: "fulfilled" | "rejected" };

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
  emit: (summary: { event: string; timings: Timing<typeof LABELS[number]>[] }) => void = (summary) => console.info(JSON.stringify(summary)),
) {
  return createDiagnostics(LABELS, "TL_QA_RANKING_TIMINGS", environment, clock, emit);
}

/** Branch-local elapsed time: excludes active-ranking wait; includes dependencies inside each branch. */
export function createCatalogueLoadDiagnostics(
  environment: Environment = process.env,
  clock: () => number = () => performance.now(),
  emit: (summary: { event: string; timings: Timing<typeof CATALOGUE_LABELS[number]>[] }) => void = (summary) => console.info(JSON.stringify(summary)),
) {
  return createDiagnostics(CATALOGUE_LABELS, "TL_QA_CATALOGUE_TIMINGS", environment, clock, emit);
}

function createDiagnostics<L extends string>(labels: readonly L[], event: string, environment: Environment,
  clock: () => number, emit: (summary: { event: string; timings: Timing<L>[] }) => void) {
  const active = enabled(environment);
  const pending = new Set<L>();
  const results = new Map<L, Timing<L>>();
  let sealed = false;
  let emitted = false;
  function publish() {
    if (!sealed || emitted || pending.size || results.size !== labels.length) return;
    emitted = true;
    try { emit({ event, timings: labels.map(label => results.get(label)!) }); } catch { /* Diagnostics never alter the request. */ }
  }
  return {
    measure<T>(label: L, start: () => Promise<T>): Promise<T> {
      if (!active || !labels.includes(label) || pending.has(label) || results.has(label)) return start();
      const began = clock();
      pending.add(label);
      const settle = (status: Timing<L>["status"]) => {
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

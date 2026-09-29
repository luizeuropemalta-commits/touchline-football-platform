import "server-only";
import { randomUUID } from "node:crypto";
import { inspectTouchlineIsolatedPreviewEnvironment } from "../touchlinePreview/isolation";

const phases = ["auth-and-geometry", "sync", "config", "gameweeks", "lifecycle", "entitlement", "prepare", "catalogue-and-squad", "alerts", "selections", "projection"] as const;
type Phase = typeof phases[number];
type Record = { requestId: string; phase: Phase; durationMs: number };

/** Request-local diagnostics: no payload, identity, error or query enters logs. */
export function createArenaPhaseTiming(environment = process.env, dependencies?: {
  now?: () => number; emit?: (record: Record) => void;
}) {
  let enabled = false;
  let requestId = "";
  try {
    enabled = environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF === "xgxbwqxjssxxuihuwmgy"
      && inspectTouchlineIsolatedPreviewEnvironment(environment).status === "qa";
    if (enabled) requestId = randomUUID();
  } catch { enabled = false; }
  const now = dependencies?.now ?? (() => performance.now());
  const emit = dependencies?.emit ?? ((record: Record) => console.info("touchline-arena-phase", record));
  let current: { phase: Phase; start: number } | undefined;
  function finish() {
    const previous = current;
    current = undefined;
    if (!enabled || !previous) return;
    try {
      const duration = now() - previous.start;
      if (Number.isFinite(duration) && duration >= 0) emit({ requestId, phase: previous.phase, durationMs: Math.round(duration * 100) / 100 });
    } catch { /* Diagnostics must never alter application behavior. */ }
  }
  function mark(phase: Phase) {
    finish();
    if (!enabled || !phases.includes(phase)) return;
    try { current = { phase, start: now() }; } catch { /* Fail closed. */ }
  }
  async function run<T>(phase: Phase, action: () => Promise<T>): Promise<T> {
    mark(phase);
    try { return await action(); } finally { finish(); }
  }
  return { mark, finish, run };
}
export type ArenaPhaseTiming = ReturnType<typeof createArenaPhaseTiming>;

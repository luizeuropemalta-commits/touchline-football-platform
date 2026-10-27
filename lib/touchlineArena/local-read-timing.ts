import { randomUUID } from "node:crypto";

const stages = ["auth", "avatar", "snapshot", "liveRail", "collection", "total"] as const;
type Stage = typeof stages[number];
type TimingRecord = { requestId: string; stage: Stage; durationMs: number | null; status: "fulfilled" | "rejected" };

/** Local-only, request-scoped observations. Never captures arguments or results. */
export function createLocalReadTiming(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: { now?: () => number; emit?: (record: TimingRecord) => void } = {},
) {
  let requestId: string | undefined;
  if (environment.NODE_ENV === "development" && environment.TOUCHLINE_LOCAL_READ_TIMING === "1") {
    try { requestId = randomUUID(); } catch { /* Diagnostics remain off. */ }
  }
  const clock = dependencies.now ?? (() => performance.now());
  const emit = dependencies.emit ?? (record => console.info(`[ClubOwner] Read timing ${JSON.stringify(record)}`));
  const now = () => {
    try { const value = clock(); return Number.isFinite(value) ? value : null; } catch { return null; }
  };
  return {
    measure<T>(stage: Stage, start: () => Promise<T>): Promise<T> {
      if (!requestId || !stages.includes(stage)) return start();
      const observedRequestId = requestId;
      const began = now();
      const settle = (status: TimingRecord["status"]) => {
        const ended = now();
        const duration = began !== null && ended !== null ? ended - began : null;
        const durationMs = duration !== null && Number.isFinite(duration) && duration >= 0
          ? Math.round(duration * 100) / 100 : null;
        try { emit({ requestId: observedRequestId, stage, durationMs, status }); } catch { /* Never change the observed operation. */ }
      };
      let operation: Promise<T>;
      try { operation = start(); } catch (error) { settle("rejected"); throw error; }
      // Observe, but return the original promise: no serialization or extra work.
      void operation.then(() => settle("fulfilled"), () => settle("rejected"));
      return operation;
    },
  };
}
export type LocalReadTiming = ReturnType<typeof createLocalReadTiming>;

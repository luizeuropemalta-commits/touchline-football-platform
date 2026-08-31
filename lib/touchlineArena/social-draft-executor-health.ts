export type TouchlineSocialExecutorComponent = "SCHEDULER" | "RUNNER";

export type TouchlineSocialExecutorCycleRow = Readonly<{
  component: TouchlineSocialExecutorComponent;
  lease_token: string | null;
  lease_expires_at: string | null;
  next_eligible_at: string;
  consecutive_failures: number;
  run_count: number;
  completed_count: number;
  timeout_recovery_count: number;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_outcome: "SUCCESS" | "FAILURE" | null;
  last_error_code: string | null;
  last_items_processed: number;
}>;

export type TouchlineSocialExecutorComponentHealth =
  | "healthy"
  | "running"
  | "backoff"
  | "stalled"
  | "stale"
  | "never-run";

export type TouchlineSocialExecutorHealth = Readonly<{
  scheduler: TouchlineSocialExecutorComponentHealth;
  runner: TouchlineSocialExecutorComponentHealth;
  operational: boolean;
}>;

export const TOUCHLINE_SOCIAL_EXECUTOR_HEALTH_MAX_AGE_MS = 180_000;

export function touchlineSocialExecutorComponentHealth(
  cycle: TouchlineSocialExecutorCycleRow | null,
  now = Date.now(),
): TouchlineSocialExecutorComponentHealth {
  if (!cycle?.last_started_at) return "never-run";
  const leaseExpiresAt = cycle.lease_expires_at ? Date.parse(cycle.lease_expires_at) : NaN;
  const lastStartedAt = Date.parse(cycle.last_started_at);
  const lastCompletedAt = cycle.last_completed_at ? Date.parse(cycle.last_completed_at) : NaN;
  const nextEligibleAt = Date.parse(cycle.next_eligible_at);
  if (cycle.lease_token && Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now) return "running";
  if (cycle.lease_token && Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= now
    && (!Number.isFinite(lastCompletedAt) || lastStartedAt > lastCompletedAt)) return "stalled";
  if (cycle.consecutive_failures > 0 && Number.isFinite(nextEligibleAt) && nextEligibleAt > now) {
    return "backoff";
  }
  if (cycle.last_outcome !== "SUCCESS" || !Number.isFinite(lastCompletedAt)) return "stale";
  return now - lastCompletedAt <= TOUCHLINE_SOCIAL_EXECUTOR_HEALTH_MAX_AGE_MS ? "healthy" : "stale";
}

export function touchlineSocialExecutorHealth(
  cycles: readonly TouchlineSocialExecutorCycleRow[],
  now = Date.now(),
): TouchlineSocialExecutorHealth {
  const scheduler = touchlineSocialExecutorComponentHealth(
    cycles.find((cycle) => cycle.component === "SCHEDULER") ?? null,
    now,
  );
  const runner = touchlineSocialExecutorComponentHealth(
    cycles.find((cycle) => cycle.component === "RUNNER") ?? null,
    now,
  );
  return {
    scheduler,
    runner,
    operational: scheduler === "healthy" && runner === "healthy",
  };
}

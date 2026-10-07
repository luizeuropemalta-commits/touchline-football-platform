import type { TouchlineFixturePeriod } from "../football-data/types";

export type MatchPushLiveEventWindowResult = Readonly<{
  status: "eligible" | "suppressed" | "unavailable" | "rebaseline";
  reason: string;
}>;

type Checkpoint = Readonly<TouchlineFixturePeriod>;
type Input = Readonly<{
  fixtureId: string;
  live: boolean;
  confirmed: boolean;
  periods: readonly Checkpoint[];
  baseline: Checkpoint;
  current: Checkpoint;
  event: Readonly<{ periodId?: string; minute?: number; extraMinute?: number }>;
  maximumEventLagSeconds: number;
}>;

const integer = (value: unknown, min = 0): value is number => (
  typeof value === "number" && Number.isSafeInteger(value) && value >= min
);
const id = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d*$/.test(value);
const result = (status: MatchPushLiveEventWindowResult["status"], reason: string): MatchPushLiveEventWindowResult => ({ status, reason });

// Cumulative football minutes, not elapsed wall time. Only these documented
// playing periods have an unambiguous normal-time endpoint for extra_minute.
const clocks: Readonly<Record<string, readonly [number, number]>> = {
  "1": [0, 45], "2": [45, 90], "3": [90, 120], "5314": [90, 105], "39": [105, 120],
};

function validPeriod(period: Checkpoint, fixtureId: string): boolean {
  const clock = clocks[period.typeId];
  return id(period.providerId) && period.fixtureId === fixtureId && !!clock
    && period.countsFrom === clock[0] && integer(period.started, 1)
    && integer(period.sortOrder, 1) && integer(period.minutes) && period.minutes >= clock[0]
    && integer(period.seconds) && period.seconds <= 59
    && Number.isSafeInteger(period.minutes * 60 + period.seconds)
    && typeof period.ticking === "boolean" && typeof period.hasTimer === "boolean"
    && (period.ended === undefined || (integer(period.ended, 1) && period.ended >= period.started!));
}

function identity(a: Checkpoint, b: Checkpoint): boolean {
  return a.providerId === b.providerId && a.fixtureId === b.fixtureId && a.typeId === b.typeId
    && a.started === b.started && a.sortOrder === b.sortOrder && a.countsFrom === b.countsFrom;
}

/** Temporal filter ONLY. Caller must separately prove current-source freshness,
 * canonical identity, confirmation, enrollment exclusions, consent and revision.
 * Event minute m denotes the conservative interval [m:00,(m+1):00). An extra
 * minute is accepted only as normal-period-end + extraMinute, never guessed
 * from already-expanded minutes. Both interval ends must satisfy the window.
 */
export function matchPushLiveEventWindow(input: Input): MatchPushLiveEventWindowResult {
  if (!integer(input.maximumEventLagSeconds, 1)) return result("unavailable", "invalid-window");
  if (!input.live) return result("suppressed", "fixture-not-live");
  if (!input.confirmed) return result("suppressed", "event-not-confirmed");
  const { baseline, current, periods, event } = input;
  if (!id(input.fixtureId) || !Array.isArray(periods) || !periods.length
    || !validPeriod(baseline, input.fixtureId) || !validPeriod(current, input.fixtureId)
    || baseline.hasTimer !== true || current.hasTimer !== true
    || periods.some(period => !period || !validPeriod(period, input.fixtureId))
    || new Set(periods.map(period => period.providerId)).size !== periods.length
    || new Set(periods.map(period => period.sortOrder)).size !== periods.length) {
    return result("unavailable", "invalid-period-evidence");
  }
  const active = periods.filter(period => period.ticking);
  const sourceCurrent = periods.find(period => period.providerId === current.providerId);
  if (active.length !== 1 || active[0].providerId !== current.providerId || !current.ticking
    || current.ended !== undefined || !sourceCurrent || sourceCurrent.ended !== undefined
    || sourceCurrent.hasTimer !== true || !identity(sourceCurrent, current)
    || sourceCurrent.minutes !== current.minutes || sourceCurrent.seconds !== current.seconds) {
    return result("unavailable", "ambiguous-current-clock");
  }
  const sourceBaseline = periods.find(period => period.providerId === baseline.providerId);
  if (!sourceBaseline || !identity(sourceBaseline, baseline)) return result("rebaseline", "baseline-period-changed");
  const now = current.minutes! * 60 + current.seconds!;
  const then = baseline.minutes! * 60 + baseline.seconds!;
  const same = baseline.providerId === current.providerId;
  if (same && now < then) return result("rebaseline", "clock-regressed");
  if (baseline.ended !== undefined && (sourceBaseline.ended !== baseline.ended || sourceBaseline.ticking)) {
    return result("rebaseline", "baseline-period-reopened");
  }
  if (sourceBaseline.minutes! * 60 + sourceBaseline.seconds! < then) {
    return result("rebaseline", "baseline-clock-regressed");
  }
  if (!same) {
    if (current.sortOrder! <= baseline.sortOrder! || current.countsFrom! <= baseline.countsFrom!) {
      return result("rebaseline", "period-regressed");
    }
    const chain = periods.filter(period => period.sortOrder! >= baseline.sortOrder! && period.sortOrder! <= current.sortOrder!)
      .sort((a, b) => a.sortOrder! - b.sortOrder!);
    for (let index = 1; index < chain.length; index++) {
      const previous = chain[index - 1], next = chain[index];
      if (next.sortOrder !== previous.sortOrder! + 1 || previous.ticking || previous.ended === undefined
        || previous.ended > next.started! || next.countsFrom! <= previous.countsFrom!) {
        return result("unavailable", "unproven-period-chronology");
      }
    }
  }
  if (!id(event.periodId) || !periods.some(period => period.providerId === event.periodId)) {
    return result("unavailable", "event-period-unbound");
  }
  if (event.periodId !== current.providerId) return result("suppressed", "event-not-current-period");
  if (!integer(event.minute) || (event.extraMinute !== undefined && !integer(event.extraMinute))) {
    return result("unavailable", "invalid-event-clock");
  }
  const [start, normalEnd] = clocks[current.typeId];
  if ((event.extraMinute ?? 0) > 0 && event.minute !== normalEnd) return result("unavailable", "ambiguous-extra-minute");
  const minute = event.minute + (event.extraMinute ?? 0);
  if (minute < start || !Number.isSafeInteger((minute + 1) * 60)) return result("unavailable", "invalid-event-clock");
  if (same && minute <= baseline.minutes!) return result("suppressed", "at-or-before-baseline-minute");
  const earliest = minute * 60, latest = (minute + 1) * 60;
  if (latest > now) return result("suppressed", "minute-not-fully-observed");
  if (now - earliest > input.maximumEventLagSeconds) return result("suppressed", "event-outside-live-window");
  return result("eligible", "recent-after-baseline");
}

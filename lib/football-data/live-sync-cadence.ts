import type { TouchlineFixture } from "@/lib/football-data/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type LiveSyncCadence = "live" | "matchday" | "idle";

export type LiveSyncDecision = {
  cadence: LiveSyncCadence;
  intervalMs: number;
  due: boolean;
  candidateFixtureIds: string[];
};

export type LiveSyncRunCadenceOutcome = Readonly<{
  status: "success" | "partial" | "error" | "not_configured";
  cadenceExecuted: boolean;
}>;

/**
 * Only a successful run that crossed the cadence gate may anchor the next
 * provider window. A cron wake recorded as a successful no-op must never
 * postpone real work, and failures/non-configured runs must retry normally.
 */
export function isEffectiveLiveSyncCadenceSuccess(outcome: LiveSyncRunCadenceOutcome) {
  return outcome.status === "success" && outcome.cadenceExecuted;
}

function fixtureStartsAt(fixture: TouchlineFixture) {
  const parsed = Date.parse(fixture.startsAt ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function fixtureState(fixture: TouchlineFixture, now: number) {
  const status = fixture.status?.trim() ?? "";
  const startsAt = fixtureStartsAt(fixture);
  if (/(?:full[ -]?time|finished|after extra time|after penalties|cancelled|canceled|abandoned|awarded|walkover|^ft$)/i.test(status)) {
    return "finished" as const;
  }
  if (/(?:live|in[ -]?play|in progress|1st|2nd|half[ -]?time|extra time|penalt)/i.test(status)) {
    return startsAt !== null && startsAt > now ? "upcoming" as const : "live" as const;
  }
  return startsAt === null ? "unknown" as const : "upcoming" as const;
}

/**
 * The database scheduler wakes once per minute, while this gate controls
 * provider traffic. A fixture is checked intensively from 60 minutes before
 * kick-off so the first official team sheet is captured before the fantasy
 * deadline, and until four hours after it starts so delayed state transitions
 * and final whistles are repaired without a browser request.
 */
export function decideLiveSyncCadence(
  fixtures: TouchlineFixture[],
  options: { now?: number; lastSuccessfulSyncAt?: string | null; forceFixtureId?: string | null; postMatchFixtureIds?: string[] } = {},
): LiveSyncDecision {
  const now = options.now ?? Date.now();
  const forced = options.forceFixtureId?.trim();
  const candidateFixtureIds = new Set<string>();
  let matchWithinDay = false;

  for (const fixture of fixtures) {
    const startsAt = fixtureStartsAt(fixture);
    const state = fixtureState(fixture, now);
    if (state === "live") candidateFixtureIds.add(fixture.providerId);
    if (startsAt === null) continue;
    if (startsAt >= now - 4 * HOUR && startsAt <= now + 60 * MINUTE && state !== "finished") {
      candidateFixtureIds.add(fixture.providerId);
    }
    if (Math.abs(startsAt - now) <= 24 * HOUR) matchWithinDay = true;
  }
  if (forced) candidateFixtureIds.add(forced);

  const cadence: LiveSyncCadence = candidateFixtureIds.size || forced
    ? "live"
    : matchWithinDay || options.postMatchFixtureIds?.length
      ? "matchday"
      : "idle";
  const intervalMs = cadence === "live" ? MINUTE : cadence === "matchday" ? 5 * MINUTE : 60 * MINUTE;
  const last = Date.parse(options.lastSuccessfulSyncAt ?? "");
  const due = Boolean(forced) || !Number.isFinite(last) || now - last >= intervalMs;

  for (const id of options.postMatchFixtureIds ?? []) candidateFixtureIds.add(id);
  return { cadence, intervalMs, due, candidateFixtureIds: [...candidateFixtureIds] };
}

/** Completed means playable facts exist, not that the provider cannot revise them.
 * Revisit recent matches hourly and older season history daily, oldest checks first.
 * Two per tick bounds work; no fixture ages out of correction eligibility.
 */
export function selectPostMatchRechecks(
  fixtures: TouchlineFixture[], checkedAt: ReadonlyMap<string, string>, now: number,
  attemptedAt: ReadonlyMap<string, string> = new Map(),
) {
  const attemptTime = (id: string) => { const value = Date.parse(attemptedAt.get(id) ?? ""); return Number.isFinite(value) ? value : 0; };
  return fixtures.filter(f => /^(ft([_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$/i.test(f.status?.trim() ?? "")
    && fixtureStartsAt(f) !== null && fixtureStartsAt(f)! <= now)
    .map(f => ({ id: f.providerId, checked: Date.parse(checkedAt.get(f.providerId) ?? ""),
      interval: now - fixtureStartsAt(f)! <= 72 * HOUR ? HOUR : 24 * HOUR }))
    .filter(f => !Number.isFinite(f.checked) || now - f.checked >= f.interval)
    .filter(f => {
      const attempt = Date.parse(attemptedAt.get(f.id) ?? "");
      return !Number.isFinite(attempt) || now - attempt >= 15 * 60 * 1000;
    })
    .sort((a, b) => attemptTime(a.id) - attemptTime(b.id)
      || (Number.isFinite(a.checked) ? a.checked : 0) - (Number.isFinite(b.checked) ? b.checked : 0)
      || a.id.localeCompare(b.id))
    .slice(0, 2).map(f => f.id);
}

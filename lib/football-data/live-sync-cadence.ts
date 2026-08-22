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
 * provider traffic. A fixture is checked intensively from 30 minutes before
 * kick-off until four hours after it starts so delayed state transitions and
 * final whistles are repaired without a browser request.
 */
export function decideLiveSyncCadence(
  fixtures: TouchlineFixture[],
  options: { now?: number; lastSuccessfulSyncAt?: string | null; forceFixtureId?: string | null } = {},
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
    if (startsAt >= now - 4 * HOUR && startsAt <= now + 30 * MINUTE && state !== "finished") {
      candidateFixtureIds.add(fixture.providerId);
    }
    if (Math.abs(startsAt - now) <= 24 * HOUR) matchWithinDay = true;
  }
  if (forced) candidateFixtureIds.add(forced);

  const cadence: LiveSyncCadence = candidateFixtureIds.size || forced
    ? "live"
    : matchWithinDay
      ? "matchday"
      : "idle";
  const intervalMs = cadence === "live" ? MINUTE : cadence === "matchday" ? 5 * MINUTE : 60 * MINUTE;
  const last = Date.parse(options.lastSuccessfulSyncAt ?? "");
  const due = Boolean(forced) || !Number.isFinite(last) || now - last >= intervalMs;

  return { cadence, intervalMs, due, candidateFixtureIds: [...candidateFixtureIds] };
}

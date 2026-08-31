import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  TouchlineFantasyFixtureFeed,
  TouchlineFantasyLineupMember,
} from "./types.ts";

function numericId(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^[1-9]\d{0,19}$/.test(normalized) ? normalized : null;
}

function formationPosition(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^(?:[1-9]|1[01])$/.test(normalized) ? Number(normalized) : null;
}

function officialMembers(feed: TouchlineFantasyFixtureFeed, teamId: string) {
  return feed.lineups.filter((member) => numericId(member.teamId) === teamId);
}

function uniquePlayerIds(members: readonly TouchlineFantasyLineupMember[]) {
  const ids = members.map((member) => numericId(member.playerId));
  return ids.every(Boolean) && new Set(ids).size === members.length;
}

function exactStartingEleven(members: readonly TouchlineFantasyLineupMember[]) {
  const starters = members.filter((member) => member.isStarter === true);
  const positions = starters.map((member) => formationPosition(member.formationPosition));
  return starters.length === 11
    && uniquePlayerIds(starters)
    && positions.every((position) => position !== null)
    && new Set(positions).size === 11;
}

export type TouchlineTeamSheetReadiness = Readonly<{
  teamId: string;
  starters: number;
  substitutes: number;
  startingElevenReady: boolean;
  benchReady: boolean;
}>;

export type TouchlineFixtureTeamSheetReadiness = Readonly<{
  fixtureId: string;
  home: TouchlineTeamSheetReadiness | null;
  away: TouchlineTeamSheetReadiness | null;
  startingElevensReady: boolean;
  completeTeamSheetsReady: boolean;
}>;

function teamReadiness(feed: TouchlineFantasyFixtureFeed, teamId: string | null) {
  if (!teamId) return null;
  const members = officialMembers(feed, teamId);
  const starters = members.filter((member) => member.isStarter === true);
  const substitutes = members.filter((member) => member.isSubstitute === true && member.isStarter !== true);
  const starterIds = new Set(starters.flatMap((member) => numericId(member.playerId) ?? []));
  const benchReady = substitutes.length === 9
    && uniquePlayerIds(substitutes)
    && substitutes.every((member) => {
      const playerId = numericId(member.playerId);
      return Boolean(playerId && !starterIds.has(playerId));
    });
  return {
    teamId,
    starters: starters.length,
    substitutes: substitutes.length,
    startingElevenReady: exactStartingEleven(members),
    benchReady,
  } satisfies TouchlineTeamSheetReadiness;
}

/** Pure provider-sheet gate shared by live sync, Club Hub and social drafts. */
export function inspectTouchlineOfficialTeamSheet(feed: TouchlineFantasyFixtureFeed) {
  const home = teamReadiness(feed, numericId(feed.fixture.homeTeam?.providerId ?? feed.fixture.homeTeam?.id));
  const away = teamReadiness(feed, numericId(feed.fixture.awayTeam?.providerId ?? feed.fixture.awayTeam?.id));
  return {
    fixtureId: feed.fixture.providerId,
    home,
    away,
    startingElevensReady: Boolean(home?.startingElevenReady && away?.startingElevenReady),
    completeTeamSheetsReady: Boolean(
      home?.startingElevenReady && home.benchReady
      && away?.startingElevenReady && away.benchReady
    ),
  } satisfies TouchlineFixtureTeamSheetReadiness;
}

/** Records the first complete two-team sheet observation without overwriting it. */
export async function recordTouchlineLineupAvailableObservation(
  admin: SupabaseClient,
  feed: TouchlineFantasyFixtureFeed,
  observedAt: string,
) {
  const readiness = inspectTouchlineOfficialTeamSheet(feed);
  if (!readiness.completeTeamSheetsReady || !Number.isFinite(Date.parse(observedAt))) {
    return { recorded: false, readiness } as const;
  }
  const { data: fixture, error: fixtureError } = await admin
    .from("football_fixtures")
    .select("id")
    .eq("provider", "sportmonks")
    .eq("provider_fixture_id", feed.fixture.providerId)
    .maybeSingle();
  const fixtureId = String(fixture?.id ?? "").trim();
  if (fixtureError || !fixtureId) return { recorded: false, readiness, error: "fixture-unavailable" } as const;

  const { data, error } = await admin.from("football_fixture_lifecycle_events").upsert({
    fixture_id: fixtureId,
    event_type: "LINEUP_AVAILABLE",
    first_observed_at: observedAt,
    source_synced_at: observedAt,
    evidence_payload: {
      provider: "sportmonks",
      providerFixtureId: feed.fixture.providerId,
      home: readiness.home,
      away: readiness.away,
      observationBasis: "first-complete-team-sheet-sync",
      providerPublicationTimestampAvailable: false,
    },
  }, { onConflict: "fixture_id,event_type", ignoreDuplicates: true }).select("fixture_id");
  const inserted = Array.isArray(data) && data.length === 1;
  return error
    ? { recorded: false, readiness, error: error.code ?? "lifecycle-write-failed" } as const
    : {
      recorded: inserted,
      outcome: inserted ? "inserted" : "noop_existing",
      readiness,
    } as const;
}

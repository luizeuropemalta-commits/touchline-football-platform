import type { SupabaseClient } from "@supabase/supabase-js";

import { checksumTouchlineCanonicalJson } from "../../lib/touchlineArena/social-lineup-render-source.ts";
import {
  TOUCHLINE_SOCIAL_MAX_CANDIDATES_PER_CYCLE,
  TOUCHLINE_SOCIAL_SOURCE_READ_TIMEOUT_MS,
} from "../../lib/touchlineArena/social-lineup-worker-budget.ts";

const NUMERIC_ID = /^[1-9]\d{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const PREMIER_LEAGUE_PROVIDER_COMPETITION_ID = "8";
const OFFICIAL_TEAM_SHEET_STABILITY_MS = 2 * 60 * 1000;

export type TouchlineSocialLineupCandidate = {
  fixtureId: string;
  teamId: string;
  firstObservedAt: string;
  inputChecksum: string;
  sourceRevisionManifest: Record<string, number>;
  sourceRevisionChecksum: string;
  startsAt: string;
  sourceReadiness: "READY" | "REVIEW_REQUIRED";
  sourceReasonCode?: string;
};

export function touchlineSocialReviewReason(value: string) {
  const normalized = value.split(":", 1)[0]!
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]+/g, "_")
    .slice(0, 160);
  return normalized || "GENERATION_GATE_FAILED";
}

function parseSourceRevision(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const manifestValue = payload.sourceRevisionManifest ?? payload.manifest;
  const checksum = String(payload.sourceRevisionChecksum ?? payload.checksum ?? "");
  if (!manifestValue || typeof manifestValue !== "object" || Array.isArray(manifestValue)
    || !SHA256.test(checksum)) return null;
  const manifest: Record<string, number> = {};
  for (const [key, revisionValue] of Object.entries(manifestValue as Record<string, unknown>)) {
    const revision = Number(revisionValue);
    if (!/^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking):[A-Za-z0-9._-]{1,160}$/.test(key)
      || !Number.isSafeInteger(revision) || revision < 0) return null;
    manifest[key] = revision;
  }
  if (Object.keys(manifest).length < 1 || Object.keys(manifest).length > 128) return null;
  return { sourceRevisionManifest: manifest, sourceRevisionChecksum: checksum };
}

async function readMinimalSourceRevision(admin: SupabaseClient, fixtureId: string) {
  const { data, error } = await admin.rpc("touchline_social_read_source_revision", {
    p_source_keys: [`fixture-provider:${fixtureId}`],
  });
  if (error) throw new Error("TL_SOCIAL_CANDIDATE_SOURCE_REVISION_UNAVAILABLE");
  const parsed = parseSourceRevision(data);
  if (!parsed) throw new Error("TL_SOCIAL_CANDIDATE_SOURCE_REVISION_INVALID");
  return parsed;
}

async function readCurrentSource(input: {
  base: URL;
  renderSecret: string;
  fixtureId: string;
  teamId: string;
}) {
  const url = new URL("/api/admin/social-publications/source", input.base);
  url.searchParams.set("fixtureId", input.fixtureId);
  url.searchParams.set("teamId", input.teamId);
  const response = await fetch(url, {
    method: "GET",
    headers: { cookie: `tl-social-render=${encodeURIComponent(input.renderSecret)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(TOUCHLINE_SOCIAL_SOURCE_READ_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null) as {
    ok?: unknown;
    fixtureId?: unknown;
    teamId?: unknown;
    sourceVersion?: unknown;
    sourceChecksum?: unknown;
    sourceRevisionManifest?: unknown;
    sourceRevisionChecksum?: unknown;
    sourceSnapshotAt?: unknown;
  } | null;
  if (!response.ok
    || payload?.ok !== true
    || String(payload.fixtureId ?? "") !== input.fixtureId
    || String(payload.teamId ?? "") !== input.teamId
    || !String(payload.sourceVersion ?? "").match(/^[A-Za-z0-9._-]{1,160}$/)
    || !String(payload.sourceChecksum ?? "").match(SHA256)
    || !Number.isFinite(Date.parse(String(payload.sourceSnapshotAt ?? "")))) {
    throw new Error("TL_SOCIAL_CANDIDATE_CURRENT_SOURCE_UNAVAILABLE");
  }
  const sourceRevision = parseSourceRevision(payload);
  if (!sourceRevision) throw new Error("TL_SOCIAL_CANDIDATE_SOURCE_REVISION_INVALID");
  return {
    sourceVersion: String(payload.sourceVersion),
    sourceChecksum: String(payload.sourceChecksum),
    sourceSnapshotAt: String(payload.sourceSnapshotAt),
    ...sourceRevision,
  };
}

export async function discoverTouchlineSocialLineupCandidates(input: {
  admin: SupabaseClient;
  base: URL;
  renderSecret: string;
  explicitFixtureId?: string | null;
  explicitTeamId?: string | null;
  expectedInputChecksum?: string | null;
  expectedSourceRevisionChecksum?: string | null;
  nowMs?: number;
}): Promise<TouchlineSocialLineupCandidate[]> {
  const explicitFixtureId = input.explicitFixtureId?.trim() || null;
  const explicitTeamId = input.explicitTeamId?.trim() || null;
  if ((explicitFixtureId || explicitTeamId)
    && (!explicitFixtureId || !explicitTeamId
      || !NUMERIC_ID.test(explicitFixtureId) || !NUMERIC_ID.test(explicitTeamId))) {
    throw new Error("TL_SOCIAL_CANDIDATE_EXPLICIT_IDENTITY_INVALID");
  }
  if ((input.expectedInputChecksum || input.expectedSourceRevisionChecksum)
    && (!explicitFixtureId || !explicitTeamId
      || !SHA256.test(input.expectedInputChecksum ?? "")
      || !SHA256.test(input.expectedSourceRevisionChecksum ?? ""))) {
    throw new Error("TL_SOCIAL_CANDIDATE_EXPECTED_SOURCE_INVALID");
  }

  const competitionResult = await input.admin
    .from("football_competitions")
    .select("id")
    .eq("provider", "sportmonks")
    .eq("provider_competition_id", PREMIER_LEAGUE_PROVIDER_COMPETITION_ID)
    .maybeSingle();
  const competitionId = String(competitionResult.data?.id ?? "");
  if (competitionResult.error || !competitionId) {
    throw new Error("TL_SOCIAL_CANDIDATE_COMPETITION_READ_FAILED");
  }

  const fixtureSelect = "id,provider,provider_fixture_id,competition_id,season_id,starts_at,home_club_id,away_club_id";
  let fixtures: Array<Record<string, unknown>> = [];
  let lifecycle: Array<Record<string, unknown>> = [];
  if (explicitFixtureId) {
    const fixtureResult = await input.admin
      .from("football_fixtures")
      .select(fixtureSelect)
      .eq("provider", "sportmonks")
      .eq("competition_id", competitionId)
      .eq("provider_fixture_id", explicitFixtureId)
      .maybeSingle();
    if (fixtureResult.error) throw new Error("TL_SOCIAL_CANDIDATE_FIXTURE_READ_FAILED");
    if (!fixtureResult.data) throw new Error("TL_SOCIAL_CANDIDATE_EXPLICIT_FIXTURE_NOT_FOUND");
    fixtures = [fixtureResult.data];
    const lifecycleResult = await input.admin
      .from("football_fixture_lifecycle_events")
      .select("fixture_id,first_observed_at")
      .eq("event_type", "LINEUP_AVAILABLE")
      .eq("fixture_id", fixtureResult.data.id)
      .order("first_observed_at", { ascending: true })
      .limit(1);
    if (lifecycleResult.error || !Array.isArray(lifecycleResult.data)) {
      throw new Error("TL_SOCIAL_CANDIDATE_LIFECYCLE_READ_FAILED");
    }
    if (!lifecycleResult.data.length) throw new Error("TL_SOCIAL_CANDIDATE_LINEUP_NOT_OBSERVED");
    lifecycle = lifecycleResult.data;
  } else {
    const lifecycleResult = await input.admin
      .from("football_fixture_lifecycle_events")
      .select("fixture_id,first_observed_at")
      .eq("event_type", "LINEUP_AVAILABLE")
      .order("first_observed_at", { ascending: false })
      .limit(80);
    if (lifecycleResult.error || !Array.isArray(lifecycleResult.data)) {
      throw new Error("TL_SOCIAL_CANDIDATE_LIFECYCLE_READ_FAILED");
    }
    lifecycle = lifecycleResult.data;
    const fixtureIds = [...new Set(lifecycle.map((row) => String(row.fixture_id ?? "")).filter(Boolean))];
    if (!fixtureIds.length) return [];
    const fixturesResult = await input.admin
      .from("football_fixtures")
      .select(fixtureSelect)
      .in("id", fixtureIds)
      .eq("provider", "sportmonks")
      .eq("competition_id", competitionId);
    if (fixturesResult.error || !Array.isArray(fixturesResult.data)) {
      throw new Error("TL_SOCIAL_CANDIDATE_FIXTURE_READ_FAILED");
    }
    fixtures = fixturesResult.data;
  }

  const clubIds = [...new Set(fixtures.flatMap((fixture) => (
    [fixture.home_club_id, fixture.away_club_id]
  )).filter(Boolean))];
  const { data: clubs, error: clubsError } = clubIds.length
    ? await input.admin
      .from("football_clubs")
      .select("id,provider,provider_team_id")
      .in("id", clubIds)
      .eq("provider", "sportmonks")
    : { data: [], error: null };
  if (clubsError || !Array.isArray(clubs)) throw new Error("TL_SOCIAL_CANDIDATE_CLUB_READ_FAILED");

  const providerFixtureIds = fixtures
    .map((fixture) => String(fixture.provider_fixture_id ?? ""))
    .filter((id) => NUMERIC_ID.test(id));
  const feedsResult = providerFixtureIds.length
    ? await input.admin
      .from("football_fantasy_fixture_feeds")
      .select("provider_fixture_id,fixture_payload,lineups_payload,formations_payload,sidelined_payload,events_payload")
      .eq("provider", "sportmonks")
      .in("provider_fixture_id", providerFixtureIds)
    : { data: [], error: null };
  if (feedsResult.error || !Array.isArray(feedsResult.data)) {
    throw new Error("TL_SOCIAL_CANDIDATE_FEED_PROBE_FAILED");
  }
  const discoveryFingerprintByFixtureId = new Map(feedsResult.data.map((row) => [
    String(row.provider_fixture_id ?? ""),
    checksumTouchlineCanonicalJson({
      fixture: row.fixture_payload,
      lineups: row.lineups_payload,
      formations: row.formations_payload,
      sidelined: row.sidelined_payload,
      events: row.events_payload,
    }),
  ]));
  const teamByClubId = new Map(clubs.map((club) => (
    [String(club.id), String(club.provider_team_id)] as const
  )));
  const firstObservedByFixtureId = new Map(lifecycle.map((row) => (
    [String(row.fixture_id), String(row.first_observed_at)] as const
  )));
  const now = input.nowMs ?? Date.now();
  const candidates = fixtures.flatMap((fixture) => {
    const fixtureId = String(fixture.provider_fixture_id ?? "");
    const startsAtMs = Date.parse(String(fixture.starts_at ?? ""));
    const startsAt = String(fixture.starts_at ?? "");
    const firstObservedAt = firstObservedByFixtureId.get(String(fixture.id)) ?? "";
    const inputChecksum = discoveryFingerprintByFixtureId.get(fixtureId) ?? "";
    const teamIds = [
      teamByClubId.get(String(fixture.home_club_id)),
      teamByClubId.get(String(fixture.away_club_id)),
    ];
    if (!NUMERIC_ID.test(fixtureId)
      || !Number.isFinite(startsAtMs)
      || (!explicitFixtureId && startsAtMs < now - 24 * 60 * 60 * 1000)
      || (!explicitFixtureId && startsAtMs > now + 36 * 60 * 60 * 1000)
      || !Number.isFinite(Date.parse(firstObservedAt))
      || Date.parse(firstObservedAt) > now - OFFICIAL_TEAM_SHEET_STABILITY_MS
      || !SHA256.test(inputChecksum)
      || teamIds.some((teamId) => !teamId || !NUMERIC_ID.test(teamId))) return [];
    return teamIds.map((teamId) => ({
      fixtureId,
      teamId: teamId!,
      firstObservedAt,
      inputChecksum,
      startsAt,
    }));
  }).filter((candidate) => (
    (!explicitFixtureId || candidate.fixtureId === explicitFixtureId)
    && (!explicitTeamId || candidate.teamId === explicitTeamId)
  )).sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
    .slice(0, explicitFixtureId ? 2 : TOUCHLINE_SOCIAL_MAX_CANDIDATES_PER_CYCLE);

  const resolved = await Promise.all(candidates.map(async (candidate): Promise<TouchlineSocialLineupCandidate> => {
    try {
      const current = await readCurrentSource({
        base: input.base,
        renderSecret: input.renderSecret,
        fixtureId: candidate.fixtureId,
        teamId: candidate.teamId,
      });
      return {
        ...candidate,
        inputChecksum: current.sourceChecksum,
        sourceRevisionManifest: current.sourceRevisionManifest,
        sourceRevisionChecksum: current.sourceRevisionChecksum,
        sourceReadiness: "READY",
      };
    } catch (error) {
      const minimalRevision = await readMinimalSourceRevision(input.admin, candidate.fixtureId);
      return {
        ...candidate,
        ...minimalRevision,
        sourceReadiness: "REVIEW_REQUIRED",
        sourceReasonCode: touchlineSocialReviewReason(
          error instanceof Error ? error.message : "SOURCE_NOT_READY",
        ),
      };
    }
  }));

  if (input.expectedInputChecksum || input.expectedSourceRevisionChecksum) {
    const candidate = resolved[0];
    if (resolved.length !== 1
      || !candidate
      || candidate.sourceReadiness !== "READY"
      || candidate.inputChecksum !== input.expectedInputChecksum
      || candidate.sourceRevisionChecksum !== input.expectedSourceRevisionChecksum) {
      throw new Error("TL_SOCIAL_CANDIDATE_QUEUED_SOURCE_CHANGED");
    }
  }
  return resolved;
}

export const TOUCHLINE_SOCIAL_LINEUP_STABILITY_MS = OFFICIAL_TEAM_SHEET_STABILITY_MS;

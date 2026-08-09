import "server-only";

import { createAdminClient } from "../supabase/admin.ts";
import {
  type OwnerApprovedMarketValueApplicationCandidate,
  type OwnerApprovedMarketValueBindingIssue,
  type OwnerApprovedMarketValueBindingManifest,
  type TouchlineCanonicalMarketValueBinding,
} from "./owner-approved-market-value-binding.ts";
import {
  OWNER_APPROVED_MARKET_VALUE_BINDING_BATCH_SIZE,
  prepareOwnerApprovedMarketValueCanonicalBinding as prepareWithCanonicalBindingReader,
  touchlineCanonicalMarketValueBindingRevision,
  type TouchlineCanonicalMarketValueBindingBatchReader,
  type TouchlineCanonicalMarketValueBindingRead,
  type TouchlineCanonicalMarketValueBindingReadRequest,
} from "./owner-approved-market-value-binding-runner.ts";

export type {
  TouchlineCanonicalMarketValueBindingBatchReader,
  TouchlineCanonicalMarketValueBindingRead,
  TouchlineCanonicalMarketValueBindingReadRequest,
} from "./owner-approved-market-value-binding-runner.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DatabaseRow = Record<string, unknown>;
type QueryResult = Readonly<{ data: DatabaseRow[]; error: unknown | null }>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: unknown) {
  return UUID_PATTERN.test(text(value));
}

function hasTimestamp(value: unknown) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(text(value)));
}

function asRows(value: unknown): DatabaseRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is DatabaseRow => Boolean(row && typeof row === "object"))
    : [];
}

function issue(
  detail: string,
  values: Partial<Pick<OwnerApprovedMarketValueBindingIssue, "providerPlayerId" | "providerTeamId">> = {},
): OwnerApprovedMarketValueBindingIssue {
  return Object.freeze({
    code: "CANONICAL_READ_BLOCKED",
    detail,
    providerPlayerId: values.providerPlayerId ?? null,
    providerTeamId: values.providerTeamId ?? null,
  });
}

async function queryRows(query: PromiseLike<{ data: unknown; error: unknown | null }>): Promise<QueryResult> {
  const result = await query;
  return { data: asRows(result.data), error: result.error };
}

function normalizedRequest(request: TouchlineCanonicalMarketValueBindingReadRequest) {
  const expectedProviderTeamId = text(request.expectedProviderTeamId);
  const providerPlayerIds = [...new Set(request.providerPlayerIds.map(text))];
  if (
    !expectedProviderTeamId.match(/^\d+$/)
    || !providerPlayerIds.length
    || providerPlayerIds.length > OWNER_APPROVED_MARKET_VALUE_BINDING_BATCH_SIZE
    || providerPlayerIds.some((providerPlayerId) => !providerPlayerId.match(/^\d+$/))
  ) return null;
  return { expectedProviderTeamId, providerPlayerIds };
}

function blocked(
  request: TouchlineCanonicalMarketValueBindingReadRequest,
  issues: readonly OwnerApprovedMarketValueBindingIssue[],
): TouchlineCanonicalMarketValueBindingRead {
  return Object.freeze({
    status: "blocked",
    request,
    sourceRevisionSha256: null,
    bindings: Object.freeze([]),
    issues: Object.freeze([...issues]),
  });
}

/**
 * Fresh private canonical binding read for the owner-approved value batch.
 *
 * This intentionally does not call the cached public projection or query
 * market values. It reads only normalized identity/membership tables and
 * refuses a batch on any missing, duplicate, stale-shape or cross-club row.
 */
export async function readTouchlineCanonicalMarketValueBindingBatch(
  request: TouchlineCanonicalMarketValueBindingReadRequest,
): Promise<TouchlineCanonicalMarketValueBindingRead> {
  const normalized = normalizedRequest(request);
  if (!normalized) return blocked(request, [issue("The canonical binding request is empty, malformed or exceeds the 60-player limit.")]);

  const admin = createAdminClient();
  if (!admin) return blocked(request, [issue("The server-only canonical projection is unavailable.")]);

  const playersResult = await queryRows(admin
    .from("football_players")
    .select("id,provider,provider_player_id,current_club_id,source_updated_at")
    .eq("provider", "sportmonks")
    .in("provider_player_id", normalized.providerPlayerIds));
  if (playersResult.error) return blocked(request, [issue("The canonical player projection could not be read.")]);

  const playerRowsByProviderId = new Map<string, DatabaseRow[]>();
  for (const row of playersResult.data) {
    const providerPlayerId = text(row.provider_player_id);
    if (!providerPlayerId) continue;
    playerRowsByProviderId.set(providerPlayerId, [...(playerRowsByProviderId.get(providerPlayerId) ?? []), row]);
  }
  const playerIssues: OwnerApprovedMarketValueBindingIssue[] = [];
  for (const providerPlayerId of normalized.providerPlayerIds) {
    const matches = playerRowsByProviderId.get(providerPlayerId) ?? [];
    if (matches.length !== 1) {
      playerIssues.push(issue(
        matches.length ? "The canonical projection has duplicate rows for a provider player ID." : "The canonical projection is missing a requested provider player ID.",
        { providerPlayerId, providerTeamId: normalized.expectedProviderTeamId },
      ));
    }
  }
  if (playerIssues.length) return blocked(request, playerIssues);

  const players = normalized.providerPlayerIds.map((providerPlayerId) => playerRowsByProviderId.get(providerPlayerId)![0]!);
  const playerIds = players.map((player) => text(player.id));
  const playerIdentityIssues = players.flatMap((player) => (
    text(player.provider) !== "sportmonks"
    || !isUuid(player.id)
    || !text(player.current_club_id)
    || !hasTimestamp(player.source_updated_at)
      ? [issue("A canonical player lacks a Sportmonks UUID/current-club/freshness binding.", { providerPlayerId: text(player.provider_player_id), providerTeamId: normalized.expectedProviderTeamId })]
      : []
  ));
  if (playerIdentityIssues.length) return blocked(request, playerIdentityIssues);

  const membershipsResult = await queryRows(admin
    .from("football_squad_members")
    .select("id,provider,player_id,club_id,competition_id,status,source_updated_at")
    .eq("provider", "sportmonks")
    .eq("status", "active")
    .in("player_id", playerIds));
  if (membershipsResult.error) return blocked(request, [issue("The canonical active-membership projection could not be read.")]);

  const membershipRowsByPlayerId = new Map<string, DatabaseRow[]>();
  for (const row of membershipsResult.data) {
    const playerId = text(row.player_id);
    if (!playerId) continue;
    membershipRowsByPlayerId.set(playerId, [...(membershipRowsByPlayerId.get(playerId) ?? []), row]);
  }
  const membershipIssues: OwnerApprovedMarketValueBindingIssue[] = [];
  for (const player of players) {
    const providerPlayerId = text(player.provider_player_id);
    const memberships = membershipRowsByPlayerId.get(text(player.id)) ?? [];
    if (memberships.length !== 1) {
      membershipIssues.push(issue(
        memberships.length ? "A requested player has more than one active Sportmonks membership." : "A requested player has no active Sportmonks membership.",
        { providerPlayerId, providerTeamId: normalized.expectedProviderTeamId },
      ));
    }
  }
  if (membershipIssues.length) return blocked(request, membershipIssues);

  const memberships = players.map((player) => membershipRowsByPlayerId.get(text(player.id))![0]!);
  const clubIds = [...new Set([
    ...players.map((player) => text(player.current_club_id)),
    ...memberships.map((membership) => text(membership.club_id)),
  ])];
  const clubsResult = await queryRows(admin
    .from("football_clubs")
    .select("id,provider,provider_team_id,competition_id,source_updated_at")
    .in("id", clubIds));
  if (clubsResult.error) return blocked(request, [issue("The canonical club projection could not be read.")]);
  const clubsById = new Map<string, DatabaseRow[]>();
  for (const row of clubsResult.data) {
    const clubId = text(row.id);
    if (!clubId) continue;
    clubsById.set(clubId, [...(clubsById.get(clubId) ?? []), row]);
  }

  const competitionIds = [...new Set(clubsResult.data.map((club) => text(club.competition_id)).filter(Boolean))];
  const competitionsResult = await queryRows(admin
    .from("football_competitions")
    .select("id,provider,provider_competition_id,source_updated_at")
    .in("id", competitionIds));
  if (competitionsResult.error) return blocked(request, [issue("The canonical competition projection could not be read.")]);
  const competitionsById = new Map<string, DatabaseRow[]>();
  for (const row of competitionsResult.data) {
    const competitionId = text(row.id);
    if (!competitionId) continue;
    competitionsById.set(competitionId, [...(competitionsById.get(competitionId) ?? []), row]);
  }

  const bindings: TouchlineCanonicalMarketValueBinding[] = [];
  const integrityIssues: OwnerApprovedMarketValueBindingIssue[] = [];
  for (const player of players) {
    const providerPlayerId = text(player.provider_player_id);
    const providerTeamId = normalized.expectedProviderTeamId;
    const membership = membershipRowsByPlayerId.get(text(player.id))![0]!;
    const currentClubMatches = clubsById.get(text(player.current_club_id)) ?? [];
    const membershipClubMatches = clubsById.get(text(membership.club_id)) ?? [];
    if (currentClubMatches.length !== 1 || membershipClubMatches.length !== 1) {
      integrityIssues.push(issue("A canonical current-club or membership-club UUID cannot be resolved uniquely.", { providerPlayerId, providerTeamId }));
      continue;
    }
    const club = currentClubMatches[0]!;
    const membershipClub = membershipClubMatches[0]!;
    const competitionMatches = competitionsById.get(text(club.competition_id)) ?? [];
    if (
      text(membership.provider) !== "sportmonks"
      || text(membership.status) !== "active"
      || !isUuid(membership.id)
      || !hasTimestamp(membership.source_updated_at)
      || text(membership.club_id) !== text(player.current_club_id)
      || text(membership.club_id) !== text(membershipClub.id)
      || text(club.provider) !== "sportmonks"
      || !isUuid(club.id)
      || text(club.provider_team_id) !== providerTeamId
      || !hasTimestamp(club.source_updated_at)
      || text(membership.competition_id) !== text(club.competition_id)
      || competitionMatches.length !== 1
    ) {
      integrityIssues.push(issue("The player/current-club/active-membership/provider-team binding is not exact.", { providerPlayerId, providerTeamId }));
      continue;
    }
    const competition = competitionMatches[0]!;
    if (
      text(competition.provider) !== "sportmonks"
      || text(competition.provider_competition_id) !== "8"
      || !isUuid(competition.id)
      || !hasTimestamp(competition.source_updated_at)
    ) {
      integrityIssues.push(issue("The player binding is not in the canonical Sportmonks Premier League competition.", { providerPlayerId, providerTeamId }));
      continue;
    }
    bindings.push(Object.freeze({
      providerPlayerId,
      providerTeamId,
      canonicalPlayerId: text(player.id),
      canonicalClubId: text(club.id),
      canonicalMembershipId: text(membership.id),
      canonicalCompetitionId: text(competition.id),
      playerSourceUpdatedAt: text(player.source_updated_at),
      clubSourceUpdatedAt: text(club.source_updated_at),
      membershipSourceUpdatedAt: text(membership.source_updated_at),
      competitionSourceUpdatedAt: text(competition.source_updated_at),
    }));
  }
  if (integrityIssues.length || bindings.length !== normalized.providerPlayerIds.length) {
    return blocked(request, integrityIssues.length ? integrityIssues : [issue("The canonical binding read is partial.")]);
  }
  const sortedBindings = bindings.sort((left, right) => left.providerPlayerId.localeCompare(right.providerPlayerId));
  return Object.freeze({
    status: "ready",
    request: Object.freeze({ providerPlayerIds: normalized.providerPlayerIds, expectedProviderTeamId: normalized.expectedProviderTeamId }),
    sourceRevisionSha256: touchlineCanonicalMarketValueBindingRevision(sortedBindings),
    bindings: Object.freeze(sortedBindings),
    issues: Object.freeze([]),
  });
}

/**
 * Produces a review-only UUID/club/membership manifest from the persisted
 * canonical projection. Two uncached reads must agree before any binding is
 * returned. This function has no route, importer or write capability.
 */
export async function prepareOwnerApprovedMarketValueCanonicalBinding(input: Readonly<{
  candidate: OwnerApprovedMarketValueApplicationCandidate;
  readBatch?: TouchlineCanonicalMarketValueBindingBatchReader;
}>): Promise<OwnerApprovedMarketValueBindingManifest> {
  return prepareWithCanonicalBindingReader({
    candidate: input.candidate,
    readBatch: input.readBatch ?? readTouchlineCanonicalMarketValueBindingBatch,
  });
}

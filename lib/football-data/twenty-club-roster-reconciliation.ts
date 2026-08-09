/**
 * Deterministic, side-effect-free roster reconciliation planner.
 *
 * This is intentionally only a dry-run planner. It accepts two already
 * captured canonical snapshots and emits review records; it never fetches a
 * provider, opens a database client, mutates a snapshot, or applies a roster
 * change. The server-only facade is the only intended product import point.
 */

export const TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE = Object.freeze([
  { clubName: "Sunderland AFC", providerTeamId: "3", manualValueScope: true },
  { clubName: "Tottenham Hotspur", providerTeamId: "6", manualValueScope: true },
  { clubName: "Liverpool FC", providerTeamId: "8", manualValueScope: false },
  { clubName: "Manchester City", providerTeamId: "9", manualValueScope: true },
  { clubName: "Fulham FC", providerTeamId: "11", manualValueScope: true },
  { clubName: "Everton FC", providerTeamId: "13", manualValueScope: true },
  { clubName: "Manchester United", providerTeamId: "14", manualValueScope: true },
  { clubName: "Aston Villa", providerTeamId: "15", manualValueScope: true },
  { clubName: "Chelsea FC", providerTeamId: "18", manualValueScope: true },
  { clubName: "Arsenal FC", providerTeamId: "19", manualValueScope: true },
  { clubName: "Newcastle United", providerTeamId: "20", manualValueScope: true },
  { clubName: "Hull City", providerTeamId: "22", manualValueScope: true },
  { clubName: "Crystal Palace", providerTeamId: "51", manualValueScope: true },
  { clubName: "AFC Bournemouth", providerTeamId: "52", manualValueScope: true },
  { clubName: "Nottingham Forest", providerTeamId: "63", manualValueScope: true },
  { clubName: "Leeds United", providerTeamId: "71", manualValueScope: true },
  { clubName: "Brighton & Hove Albion", providerTeamId: "78", manualValueScope: true },
  { clubName: "Ipswich Town", providerTeamId: "116", manualValueScope: true },
  { clubName: "Coventry City", providerTeamId: "117", manualValueScope: true },
  { clubName: "Brentford FC", providerTeamId: "236", manualValueScope: true },
] as const);

export type TouchlineTwentyClubScopeEntry = typeof TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE[number];

export type TouchlineCanonicalRosterCompetition = Readonly<{
  id: string;
  provider: string;
  provider_competition_id: string;
  source_updated_at: string;
}>;

export type TouchlineCanonicalRosterClub = Readonly<{
  id: string;
  provider: string;
  provider_team_id: string;
  competition_id: string;
  name: string;
  source_updated_at: string;
}>;

export type TouchlineCanonicalRosterPlayer = Readonly<{
  id: string;
  provider: string;
  provider_player_id: string;
  current_club_id: string;
  name: string;
  display_name?: string | null;
  source_updated_at: string;
}>;

export type TouchlineCanonicalRosterMembership = Readonly<{
  id: string;
  provider: string;
  player_id: string;
  club_id: string;
  competition_id: string;
  status: string;
  source_updated_at: string;
}>;

export type TouchlineCanonicalRosterExport = Readonly<{
  schemaVersion: "touchline-canonical-roster-export-v1";
  exportedAt: string;
  source: Readonly<{
    runId: string;
    sourceRevision: string;
  }>;
  competitions: readonly TouchlineCanonicalRosterCompetition[];
  clubs: readonly TouchlineCanonicalRosterClub[];
  players: readonly TouchlineCanonicalRosterPlayer[];
  memberships: readonly TouchlineCanonicalRosterMembership[];
}>;

/**
 * A roster entry from owner-approved staging. It is a completeness signal
 * only: matching a name never creates a player identity binding or a write.
 */
export type TouchlineOwnerRosterEntry = Readonly<{
  clubProviderTeamId: string;
  normalizedPlayerName: string;
  sourceRowSha256: string;
}>;

export type TouchlineTwentyClubRosterReconciliationInput = Readonly<{
  canonicalBaseline: TouchlineCanonicalRosterExport;
  incomingProviderSnapshot: TouchlineCanonicalRosterExport;
  ownerRosterEntries?: readonly TouchlineOwnerRosterEntry[];
}>;

export type TouchlineRosterReconciliationBlocker =
  | "BLOCKED_INVALID_SNAPSHOT_PROVENANCE"
  | "BLOCKED_PARTIAL_PROVIDER_RESPONSE"
  | "BLOCKED_DUPLICATE_PROVIDER_PLAYER_ID"
  | "BLOCKED_DUPLICATE_ACTIVE_MEMBERSHIP"
  | "BLOCKED_INVALID_ACTIVE_MEMBERSHIP";

export type TouchlineRosterReconciliationOperationKind =
  | "NO_CHANGE"
  | "ADD_REVIEW_REQUIRED"
  | "TRANSFER_REVIEW_REQUIRED"
  | "PRESERVE_UNSEEN_REVIEW_REQUIRED";

export type TouchlineRosterReconciliationOperation = Readonly<{
  kind: TouchlineRosterReconciliationOperationKind;
  providerPlayerId: string;
  canonicalPlayerId: string;
  baselineClubProviderTeamId: string | null;
  incomingClubProviderTeamId: string | null;
  baselineMembershipId: string | null;
  incomingMembershipId: string | null;
  reason: string;
  applicationEligible: false;
}>;

export type TouchlineRosterReconciliationIssue = Readonly<{
  code: TouchlineRosterReconciliationBlocker;
  scopeProviderTeamId: string | null;
  providerPlayerId: string | null;
  canonicalPlayerIds: readonly string[];
  membershipIds: readonly string[];
  detail: string;
}>;

export type TouchlineRosterQuarantineRecord = Readonly<{
  reconciliationState: "QUARANTINED";
  manualValueState: "PENDING";
  applicationEligible: false;
  providerPlayerId: string;
  canonicalPlayerId: string;
  canonicalClubId: string;
  providerTeamId: string;
  canonicalMembershipId: string;
  playerSourceUpdatedAt: string;
  membershipSourceUpdatedAt: string;
  reason: "NO_EXACT_OWNER_ROSTER_ENTRY";
}>;

export type TouchlineTwentyClubRosterReconciliationPlan = Readonly<{
  schemaVersion: "touchline-20-club-roster-reconciliation-plan-v1";
  status: "blocked" | "review-required";
  applicationEligible: false;
  execution: "dry-run-only";
  source: Readonly<{
    canonicalBaselineRunId: string;
    canonicalBaselineRevision: string;
    incomingProviderRunId: string;
    incomingProviderRevision: string;
  }>;
  scope: readonly TouchlineTwentyClubScopeEntry[];
  issues: readonly TouchlineRosterReconciliationIssue[];
  operations: readonly TouchlineRosterReconciliationOperation[];
  quarantined: readonly TouchlineRosterQuarantineRecord[];
  counts: Readonly<{
    expectedClubs: number;
    incomingActiveMembers: number;
    baselineActiveMembers: number;
    noChange: number;
    additionsForReview: number;
    transfersForReview: number;
    preservedUnseenForReview: number;
    quarantinedPending: number;
  }>;
}>;

type NormalizedMember = Readonly<{
  providerPlayerId: string;
  canonicalPlayerId: string;
  canonicalClubId: string;
  providerTeamId: string;
  canonicalMembershipId: string;
  playerSourceUpdatedAt: string;
  membershipSourceUpdatedAt: string;
  normalizedPlayerName: string;
}>;

type NormalizedSnapshot = Readonly<{
  members: readonly NormalizedMember[];
  issues: readonly TouchlineRosterReconciliationIssue[];
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: unknown) {
  return UUID_PATTERN.test(text(value));
}

function hasTimestamp(value: unknown) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(text(value)));
}

function normalizedName(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function issue(
  code: TouchlineRosterReconciliationBlocker,
  detail: string,
  values: Partial<Omit<TouchlineRosterReconciliationIssue, "code" | "detail">> = {},
): TouchlineRosterReconciliationIssue {
  return Object.freeze({
    code,
    detail,
    scopeProviderTeamId: values.scopeProviderTeamId ?? null,
    providerPlayerId: values.providerPlayerId ?? null,
    canonicalPlayerIds: Object.freeze([...(values.canonicalPlayerIds ?? [])]),
    membershipIds: Object.freeze([...(values.membershipIds ?? [])]),
  });
}

function snapshotProvenanceIsValid(snapshot: TouchlineCanonicalRosterExport) {
  return snapshot.schemaVersion === "touchline-canonical-roster-export-v1"
    && hasTimestamp(snapshot.exportedAt)
    && Boolean(text(snapshot.source?.runId))
    && Boolean(text(snapshot.source?.sourceRevision));
}

function normalizeSnapshot(snapshot: TouchlineCanonicalRosterExport): NormalizedSnapshot {
  const issues: TouchlineRosterReconciliationIssue[] = [];
  if (!snapshotProvenanceIsValid(snapshot)) {
    issues.push(issue(
      "BLOCKED_INVALID_SNAPSHOT_PROVENANCE",
      "Snapshot must carry a valid schema version, export timestamp, run ID and source revision.",
    ));
    return { members: Object.freeze([]), issues: Object.freeze(issues) };
  }

  const targetCompetition = snapshot.competitions.filter((competition) => (
    isUuid(competition.id)
    && text(competition.provider) === "sportmonks"
    && text(competition.provider_competition_id) === "8"
    && hasTimestamp(competition.source_updated_at)
  ));
  if (targetCompetition.length !== 1) {
    issues.push(issue(
      "BLOCKED_PARTIAL_PROVIDER_RESPONSE",
      "Snapshot must contain exactly one fresh Sportmonks Premier League competition (provider competition 8).",
    ));
    return { members: Object.freeze([]), issues: Object.freeze(issues) };
  }
  const competitionId = targetCompetition[0]!.id;

  const clubsById = new Map<string, TouchlineCanonicalRosterClub>();
  const scopeClubByTeamId = new Map<string, TouchlineCanonicalRosterClub>();
  for (const club of snapshot.clubs) {
    if (!isUuid(club.id)) continue;
    clubsById.set(club.id, club);
    if (text(club.provider) !== "sportmonks" || text(club.competition_id) !== competitionId) continue;
    const teamId = text(club.provider_team_id);
    if (!TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.some((entry) => entry.providerTeamId === teamId)) continue;
    const duplicate = scopeClubByTeamId.get(teamId);
    if (duplicate) {
      issues.push(issue(
        "BLOCKED_PARTIAL_PROVIDER_RESPONSE",
        "Snapshot contains more than one scoped club for the same provider team ID.",
        { scopeProviderTeamId: teamId },
      ));
      continue;
    }
    if (!hasTimestamp(club.source_updated_at)) {
      issues.push(issue(
        "BLOCKED_PARTIAL_PROVIDER_RESPONSE",
        "Scoped club is missing source_updated_at provenance.",
        { scopeProviderTeamId: teamId },
      ));
      continue;
    }
    scopeClubByTeamId.set(teamId, club);
  }
  for (const expectedClub of TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE) {
    if (!scopeClubByTeamId.has(expectedClub.providerTeamId)) {
      issues.push(issue(
        "BLOCKED_PARTIAL_PROVIDER_RESPONSE",
        "Provider response does not cover every expected 20-club team ID.",
        { scopeProviderTeamId: expectedClub.providerTeamId },
      ));
    }
  }

  const playersById = new Map(snapshot.players.map((player) => [text(player.id), player] as const));
  const members: NormalizedMember[] = [];
  const activeMembershipsByPlayerId = new Map<string, TouchlineCanonicalRosterMembership[]>();
  const activeMembershipsByProviderPlayerId = new Map<string, NormalizedMember[]>();
  const activeMembershipIds = new Set<string>();

  for (const membership of snapshot.memberships) {
    if (text(membership.status) !== "active") continue;
    const club = clubsById.get(text(membership.club_id));
    if (!club || !scopeClubByTeamId.has(text(club.provider_team_id))) continue;
    const playerId = text(membership.player_id);
    activeMembershipsByPlayerId.set(playerId, [
      ...(activeMembershipsByPlayerId.get(playerId) ?? []),
      membership,
    ]);
  }

  for (const [playerId, memberships] of activeMembershipsByPlayerId) {
    if (memberships.length > 1) {
      issues.push(issue(
        "BLOCKED_DUPLICATE_ACTIVE_MEMBERSHIP",
        "A player has more than one active membership inside the 20-club scope.",
        {
          canonicalPlayerIds: [playerId],
          membershipIds: memberships.map((membership) => text(membership.id)).filter(Boolean),
        },
      ));
    }
  }

  for (const membership of snapshot.memberships) {
    if (text(membership.status) !== "active") continue;
    const club = clubsById.get(text(membership.club_id));
    if (!club || !scopeClubByTeamId.has(text(club.provider_team_id))) continue;
    const player = playersById.get(text(membership.player_id));
    const teamId = text(club.provider_team_id);
    const membershipId = text(membership.id);
    const playerId = text(player?.id);
    const providerPlayerId = text(player?.provider_player_id);
    const valid = (
      text(membership.provider) === "sportmonks"
      && isUuid(membershipId)
      && text(membership.competition_id) === competitionId
      && hasTimestamp(membership.source_updated_at)
      && Boolean(player)
      && isUuid(playerId)
      && text(player?.provider) === "sportmonks"
      && /^\d+$/.test(providerPlayerId)
      && text(player?.current_club_id) === club.id
      && hasTimestamp(player?.source_updated_at)
    );
    if (!valid) {
      issues.push(issue(
        "BLOCKED_INVALID_ACTIVE_MEMBERSHIP",
        "Active membership does not have a coherent Sportmonks player/current-club/competition provenance binding.",
        {
          scopeProviderTeamId: teamId,
          providerPlayerId: providerPlayerId || null,
          canonicalPlayerIds: playerId ? [playerId] : [],
          membershipIds: membershipId ? [membershipId] : [],
        },
      ));
      continue;
    }
    if (activeMembershipIds.has(membershipId)) {
      issues.push(issue(
        "BLOCKED_DUPLICATE_ACTIVE_MEMBERSHIP",
        "Active membership ID is repeated in the incoming snapshot.",
        { scopeProviderTeamId: teamId, providerPlayerId, canonicalPlayerIds: [playerId], membershipIds: [membershipId] },
      ));
      continue;
    }
    activeMembershipIds.add(membershipId);
    const member: NormalizedMember = Object.freeze({
      providerPlayerId,
      canonicalPlayerId: playerId,
      canonicalClubId: club.id,
      providerTeamId: teamId,
      canonicalMembershipId: membershipId,
      playerSourceUpdatedAt: text(player?.source_updated_at),
      membershipSourceUpdatedAt: text(membership.source_updated_at),
      normalizedPlayerName: normalizedName(player?.display_name || player?.name),
    });
    members.push(member);
    activeMembershipsByProviderPlayerId.set(providerPlayerId, [
      ...(activeMembershipsByProviderPlayerId.get(providerPlayerId) ?? []),
      member,
    ]);
  }

  for (const [providerPlayerId, duplicateMembers] of activeMembershipsByProviderPlayerId) {
    if (duplicateMembers.length > 1) {
      issues.push(issue(
        "BLOCKED_DUPLICATE_PROVIDER_PLAYER_ID",
        "A provider player ID appears more than once as active in the 20-club scope.",
        {
          providerPlayerId,
          canonicalPlayerIds: duplicateMembers.map((member) => member.canonicalPlayerId),
          membershipIds: duplicateMembers.map((member) => member.canonicalMembershipId),
        },
      ));
    }
  }

  for (const expectedClub of TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE) {
    if (!members.some((member) => member.providerTeamId === expectedClub.providerTeamId)) {
      issues.push(issue(
        "BLOCKED_PARTIAL_PROVIDER_RESPONSE",
        "A scoped club has no valid active member records; the provider response is partial or incoherent.",
        { scopeProviderTeamId: expectedClub.providerTeamId },
      ));
    }
  }
  return { members: Object.freeze(members), issues: Object.freeze(issues) };
}

function ownerRowsByClubAndName(entries: readonly TouchlineOwnerRosterEntry[]) {
  const result = new Map<string, Set<string>>();
  for (const entry of entries) {
    const teamId = text(entry.clubProviderTeamId);
    const name = normalizedName(entry.normalizedPlayerName);
    if (!teamId || !name || !text(entry.sourceRowSha256)) continue;
    const names = result.get(teamId) ?? new Set<string>();
    names.add(name);
    result.set(teamId, names);
  }
  return result;
}

function toOperation(
  kind: TouchlineRosterReconciliationOperationKind,
  member: NormalizedMember,
  baseline: NormalizedMember | null,
  reason: string,
): TouchlineRosterReconciliationOperation {
  return Object.freeze({
    kind,
    providerPlayerId: member.providerPlayerId,
    canonicalPlayerId: member.canonicalPlayerId,
    baselineClubProviderTeamId: baseline?.providerTeamId ?? null,
    incomingClubProviderTeamId: member.providerTeamId,
    baselineMembershipId: baseline?.canonicalMembershipId ?? null,
    incomingMembershipId: member.canonicalMembershipId,
    reason,
    applicationEligible: false,
  });
}

function preservedOperation(member: NormalizedMember): TouchlineRosterReconciliationOperation {
  return Object.freeze({
    kind: "PRESERVE_UNSEEN_REVIEW_REQUIRED",
    providerPlayerId: member.providerPlayerId,
    canonicalPlayerId: member.canonicalPlayerId,
    baselineClubProviderTeamId: member.providerTeamId,
    incomingClubProviderTeamId: null,
    baselineMembershipId: member.canonicalMembershipId,
    incomingMembershipId: null,
    reason: "The incoming provider snapshot does not contain this formerly active player. Preserve the existing membership until an explicit reviewed change is authorized.",
    applicationEligible: false,
  });
}

/**
 * Builds a complete 20-club dry-run plan. Any malformed, partial or duplicate
 * source blocks every proposed change. Even a complete plan remains human
 * review only; there is intentionally no apply function in this module.
 */
export function planTouchlineTwentyClubRosterReconciliation(
  input: TouchlineTwentyClubRosterReconciliationInput,
): TouchlineTwentyClubRosterReconciliationPlan {
  const baseline = normalizeSnapshot(input.canonicalBaseline);
  const incoming = normalizeSnapshot(input.incomingProviderSnapshot);
  const issues = Object.freeze([...baseline.issues, ...incoming.issues]);
  const source = Object.freeze({
    canonicalBaselineRunId: text(input.canonicalBaseline.source?.runId),
    canonicalBaselineRevision: text(input.canonicalBaseline.source?.sourceRevision),
    incomingProviderRunId: text(input.incomingProviderSnapshot.source?.runId),
    incomingProviderRevision: text(input.incomingProviderSnapshot.source?.sourceRevision),
  });

  if (issues.length > 0) {
    return Object.freeze({
      schemaVersion: "touchline-20-club-roster-reconciliation-plan-v1",
      status: "blocked",
      applicationEligible: false,
      execution: "dry-run-only",
      source,
      scope: TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE,
      issues,
      operations: Object.freeze([]),
      quarantined: Object.freeze([]),
      counts: Object.freeze({
        expectedClubs: TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.length,
        incomingActiveMembers: incoming.members.length,
        baselineActiveMembers: baseline.members.length,
        noChange: 0,
        additionsForReview: 0,
        transfersForReview: 0,
        preservedUnseenForReview: 0,
        quarantinedPending: 0,
      }),
    });
  }

  const baselineByProviderPlayerId = new Map(baseline.members.map((member) => [member.providerPlayerId, member] as const));
  const incomingProviderIds = new Set(incoming.members.map((member) => member.providerPlayerId));
  const operations: TouchlineRosterReconciliationOperation[] = [];
  for (const member of incoming.members) {
    const previous = baselineByProviderPlayerId.get(member.providerPlayerId) ?? null;
    if (!previous) {
      operations.push(toOperation(
        "ADD_REVIEW_REQUIRED",
        member,
        null,
        "New active provider player in a complete snapshot; no automatic membership creation is permitted.",
      ));
    } else if (previous.providerTeamId !== member.providerTeamId || previous.canonicalPlayerId !== member.canonicalPlayerId) {
      operations.push(toOperation(
        "TRANSFER_REVIEW_REQUIRED",
        member,
        previous,
        "Provider identity moved between canonical clubs or IDs; preserve history and require a reviewed, atomic transfer operation.",
      ));
    } else {
      operations.push(toOperation("NO_CHANGE", member, previous, "Same provider player and canonical club in both complete snapshots."));
    }
  }
  for (const member of baseline.members) {
    if (!incomingProviderIds.has(member.providerPlayerId)) operations.push(preservedOperation(member));
  }

  const ownerRows = ownerRowsByClubAndName(input.ownerRosterEntries ?? []);
  const quarantined: TouchlineRosterQuarantineRecord[] = [];
  if (ownerRows.size > 0) {
    for (const member of incoming.members) {
      const scopeEntry = TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.find((entry) => entry.providerTeamId === member.providerTeamId);
      if (!scopeEntry?.manualValueScope) continue;
      const names = ownerRows.get(member.providerTeamId) ?? new Set<string>();
      if (names.has(member.normalizedPlayerName)) continue;
      quarantined.push(Object.freeze({
        reconciliationState: "QUARANTINED",
        manualValueState: "PENDING",
        applicationEligible: false,
        providerPlayerId: member.providerPlayerId,
        canonicalPlayerId: member.canonicalPlayerId,
        canonicalClubId: member.canonicalClubId,
        providerTeamId: member.providerTeamId,
        canonicalMembershipId: member.canonicalMembershipId,
        playerSourceUpdatedAt: member.playerSourceUpdatedAt,
        membershipSourceUpdatedAt: member.membershipSourceUpdatedAt,
        reason: "NO_EXACT_OWNER_ROSTER_ENTRY",
      }));
    }
  }

  const counts = Object.freeze({
    expectedClubs: TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.length,
    incomingActiveMembers: incoming.members.length,
    baselineActiveMembers: baseline.members.length,
    noChange: operations.filter((operation) => operation.kind === "NO_CHANGE").length,
    additionsForReview: operations.filter((operation) => operation.kind === "ADD_REVIEW_REQUIRED").length,
    transfersForReview: operations.filter((operation) => operation.kind === "TRANSFER_REVIEW_REQUIRED").length,
    preservedUnseenForReview: operations.filter((operation) => operation.kind === "PRESERVE_UNSEEN_REVIEW_REQUIRED").length,
    quarantinedPending: quarantined.length,
  });
  return Object.freeze({
    schemaVersion: "touchline-20-club-roster-reconciliation-plan-v1",
    status: "review-required",
    applicationEligible: false,
    execution: "dry-run-only",
    source,
    scope: TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE,
    issues,
    operations: Object.freeze(operations),
    quarantined: Object.freeze(quarantined),
    counts,
  });
}

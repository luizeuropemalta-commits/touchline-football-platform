import { TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE } from "../football-data/twenty-club-roster-reconciliation.ts";

/**
 * Pure validation and manifest shaping for the owner-approved 2026/27 batch.
 *
 * This module cannot read a database, a provider, a file, or an environment
 * variable. The server-only facade supplies fresh canonical bindings from the
 * persisted football model. A returned manifest remains review-only: it is
 * deliberately not an import payload and cannot authorize a write.
 */

export const OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT = 533;
export const OWNER_APPROVED_MARKET_VALUE_PENDING_VALUE_COUNT = 5;
export const OWNER_APPROVED_MARKET_VALUE_PROVIDER_ONLY_PENDING_COUNT = 23;
export const OWNER_APPROVED_MARKET_VALUE_OWNER_ONLY_REVIEW_COUNT = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const MANUAL_SCOPE_PROVIDER_TEAM_IDS = Object.freeze(
  TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE
    .filter((entry) => entry.manualValueScope)
    .map((entry) => entry.providerTeamId)
    .sort((left, right) => Number(left) - Number(right)),
);

export type OwnerApprovedMarketValueCandidateRow = Readonly<{
  row_idempotency_key_sha256: string;
  source_row_sha256: string;
  club_name: string;
  player_display_name: string;
  provider_team_id: string;
  provider_player_id: string;
  provider_player_name: string;
  market_value_eur: number | null;
  currency: string | null;
  reconciliation_state: "READY_AFTER_CANONICAL_UUID_BINDING" | "PENDING_VALUE_MISSING";
  application_eligible: boolean;
}>;

export type OwnerApprovedMarketValueApplicationCandidate = Readonly<{
  schemaVersion: "touchline-owner-approved-sportmonks-market-value-application-candidate-v1";
  candidateId: string;
  candidateFingerprintSha256: string;
  status: "LOCAL_PLAN_ONLY_REQUIRES_CANONICAL_UUID_BINDING";
  applicationEligible: false;
  source: Readonly<{
    sourceSelectionSha256: string;
    providerRosterSourceRevision: string;
  }>;
  counts: Readonly<{
    ownerRows: number;
    exactMatches: number;
    readyAfterCanonicalUuidBinding: number;
    pendingValueMissing: number;
    providerOnlyPending: number;
    ownerOnlyReview: number;
    ambiguousNameGroups: number;
  }>;
  rows: readonly OwnerApprovedMarketValueCandidateRow[];
}>;

export type TouchlineCanonicalMarketValueBinding = Readonly<{
  providerPlayerId: string;
  providerTeamId: string;
  canonicalPlayerId: string;
  canonicalClubId: string;
  canonicalMembershipId: string;
  canonicalCompetitionId: string;
  playerSourceUpdatedAt: string;
  clubSourceUpdatedAt: string;
  membershipSourceUpdatedAt: string;
  competitionSourceUpdatedAt: string;
}>;

export type OwnerApprovedMarketValueBindingIssue = Readonly<{
  code:
    | "CANDIDATE_CONTRACT_INVALID"
    | "CANDIDATE_ROW_INVALID"
    | "CANDIDATE_SCOPE_INCOMPLETE"
    | "CANONICAL_READ_BLOCKED"
    | "CANONICAL_BINDING_MISSING"
    | "CANONICAL_BINDING_DUPLICATE"
    | "CANONICAL_BINDING_INVALID";
  providerPlayerId: string | null;
  providerTeamId: string | null;
  detail: string;
}>;

export type OwnerApprovedMarketValueBoundRow = Readonly<{
  row_idempotency_key_sha256: string;
  source_row_sha256: string;
  club_name: string;
  player_display_name: string;
  provider_player_name: string;
  provider_team_id: string;
  provider_player_id: string;
  canonical_player_id: string;
  canonical_club_id: string;
  canonical_membership_id: string;
  canonical_competition_id: string;
  player_source_updated_at: string;
  club_source_updated_at: string;
  membership_source_updated_at: string;
  competition_source_updated_at: string;
  market_value_eur: number;
  currency: "EUR";
  binding_status: "BOUND_PENDING_SEPARATE_WRITE_AUTHORIZATION";
  application_eligible: false;
}>;

export type OwnerApprovedMarketValueBindingManifest = Readonly<{
  schemaVersion: "touchline-owner-approved-market-value-canonical-binding-v1";
  status: "blocked" | "review-required";
  applicationEligible: false;
  candidate: Readonly<{
    candidateId: string;
    candidateFingerprintSha256: string;
    sourceSelectionSha256: string;
    providerRosterSourceRevision: string;
  }>;
  canonicalReadRevisionSha256: string | null;
  rows: readonly OwnerApprovedMarketValueBoundRow[];
  issues: readonly OwnerApprovedMarketValueBindingIssue[];
  excluded: Readonly<{
    pendingValueMissing: number;
    providerOnlyPending: number;
    ownerOnlyReview: number;
    excludedFromEveryWriteSet: true;
  }>;
  counts: Readonly<{
    readyRowsRequested: number;
    canonicalRowsBound: number;
    blockedRows: number;
  }>;
}>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: unknown) {
  return UUID_PATTERN.test(text(value));
}

function isSha256(value: unknown) {
  return SHA256_PATTERN.test(text(value));
}

function hasTimestamp(value: unknown) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(text(value)));
}

function isSafeNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function issue(
  code: OwnerApprovedMarketValueBindingIssue["code"],
  detail: string,
  values: Partial<Pick<OwnerApprovedMarketValueBindingIssue, "providerPlayerId" | "providerTeamId">> = {},
): OwnerApprovedMarketValueBindingIssue {
  return Object.freeze({
    code,
    detail,
    providerPlayerId: values.providerPlayerId ?? null,
    providerTeamId: values.providerTeamId ?? null,
  });
}

function candidateContractIssues(candidate: OwnerApprovedMarketValueApplicationCandidate) {
  const issues: OwnerApprovedMarketValueBindingIssue[] = [];
  const counts = candidate.counts;
  if (
    candidate.schemaVersion !== "touchline-owner-approved-sportmonks-market-value-application-candidate-v1"
    || candidate.status !== "LOCAL_PLAN_ONLY_REQUIRES_CANONICAL_UUID_BINDING"
    || candidate.applicationEligible !== false
    || !text(candidate.candidateId)
    || !isSha256(candidate.candidateFingerprintSha256)
    || !isSha256(candidate.source.sourceSelectionSha256)
    || !text(candidate.source.providerRosterSourceRevision)
  ) {
    issues.push(issue("CANDIDATE_CONTRACT_INVALID", "The source candidate is not the expected immutable, review-only contract."));
  }
  if (
    counts.ownerRows !== 558
    || counts.exactMatches !== 538
    || counts.readyAfterCanonicalUuidBinding !== OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT
    || counts.pendingValueMissing !== OWNER_APPROVED_MARKET_VALUE_PENDING_VALUE_COUNT
    || counts.providerOnlyPending !== OWNER_APPROVED_MARKET_VALUE_PROVIDER_ONLY_PENDING_COUNT
    || counts.ownerOnlyReview !== OWNER_APPROVED_MARKET_VALUE_OWNER_ONLY_REVIEW_COUNT
    || counts.ambiguousNameGroups !== 0
  ) {
    issues.push(issue("CANDIDATE_CONTRACT_INVALID", "The owner-approved batch count vector 558/538/533/5/23/20/0 does not match."));
  }
  return issues;
}

function candidateRowIssues(row: OwnerApprovedMarketValueCandidateRow) {
  const providerPlayerId = text(row.provider_player_id);
  const providerTeamId = text(row.provider_team_id);
  const common = { providerPlayerId: providerPlayerId || null, providerTeamId: providerTeamId || null };
  if (
    !isSha256(row.row_idempotency_key_sha256)
    || !isSha256(row.source_row_sha256)
    || !providerPlayerId.match(/^\d+$/)
    || !providerTeamId.match(/^\d+$/)
    || !text(row.club_name)
    || !text(row.player_display_name)
    || !text(row.provider_player_name)
    || row.application_eligible !== false
  ) {
    return issue("CANDIDATE_ROW_INVALID", "A source candidate row is missing immutable identity or review-only state.", common);
  }
  if (row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING") {
    if (!isSafeNonNegativeInteger(row.market_value_eur) || row.currency !== "EUR") {
      return issue("CANDIDATE_ROW_INVALID", "A ready row must contain an explicit non-negative EUR value.", common);
    }
  } else if (row.reconciliation_state === "PENDING_VALUE_MISSING") {
    if (row.market_value_eur !== null || row.currency !== null) {
      return issue("CANDIDATE_ROW_INVALID", "A pending owner row must remain value-less and outside the binding write set.", common);
    }
  } else {
    return issue("CANDIDATE_ROW_INVALID", "The row reconciliation state is not supported by this binding adapter.", common);
  }
  return null;
}

function canonicalBindingIssue(binding: TouchlineCanonicalMarketValueBinding) {
  const providerPlayerId = text(binding.providerPlayerId);
  const providerTeamId = text(binding.providerTeamId);
  const common = { providerPlayerId: providerPlayerId || null, providerTeamId: providerTeamId || null };
  if (
    !providerPlayerId.match(/^\d+$/)
    || !providerTeamId.match(/^\d+$/)
    || !isUuid(binding.canonicalPlayerId)
    || !isUuid(binding.canonicalClubId)
    || !isUuid(binding.canonicalMembershipId)
    || !isUuid(binding.canonicalCompetitionId)
    || !hasTimestamp(binding.playerSourceUpdatedAt)
    || !hasTimestamp(binding.clubSourceUpdatedAt)
    || !hasTimestamp(binding.membershipSourceUpdatedAt)
    || !hasTimestamp(binding.competitionSourceUpdatedAt)
  ) {
    return issue("CANONICAL_BINDING_INVALID", "A canonical binding is missing UUID or freshness proof.", common);
  }
  return null;
}

function baseManifest(
  candidate: OwnerApprovedMarketValueApplicationCandidate,
  canonicalReadRevisionSha256: string | null,
  issues: readonly OwnerApprovedMarketValueBindingIssue[],
  rows: readonly OwnerApprovedMarketValueBoundRow[],
  readyRowsRequested: number,
): OwnerApprovedMarketValueBindingManifest {
  return Object.freeze({
    schemaVersion: "touchline-owner-approved-market-value-canonical-binding-v1",
    status: issues.length ? "blocked" : "review-required",
    applicationEligible: false,
    candidate: Object.freeze({
      candidateId: text(candidate.candidateId),
      candidateFingerprintSha256: text(candidate.candidateFingerprintSha256),
      sourceSelectionSha256: text(candidate.source?.sourceSelectionSha256),
      providerRosterSourceRevision: text(candidate.source?.providerRosterSourceRevision),
    }),
    canonicalReadRevisionSha256,
    rows: Object.freeze([...rows]),
    issues: Object.freeze([...issues]),
    excluded: Object.freeze({
      pendingValueMissing: candidate.counts?.pendingValueMissing ?? 0,
      providerOnlyPending: candidate.counts?.providerOnlyPending ?? 0,
      ownerOnlyReview: candidate.counts?.ownerOnlyReview ?? 0,
      excludedFromEveryWriteSet: true,
    }),
    counts: Object.freeze({
      readyRowsRequested,
      canonicalRowsBound: rows.length,
      blockedRows: issues.length ? readyRowsRequested : 0,
    }),
  });
}

/**
 * Joins the staged values to a fresh, already-validated canonical binding
 * read. It never matches by player name and returns no partial manifest.
 */
export function bindOwnerApprovedMarketValueCandidate(input: Readonly<{
  candidate: OwnerApprovedMarketValueApplicationCandidate;
  canonicalBindings: readonly TouchlineCanonicalMarketValueBinding[];
  canonicalReadRevisionSha256: string;
  preflightIssues?: readonly OwnerApprovedMarketValueBindingIssue[];
}>): OwnerApprovedMarketValueBindingManifest {
  const candidate = input.candidate;
  const issues = [...candidateContractIssues(candidate), ...(input.preflightIssues ?? [])];
  const candidateRows = Array.isArray(candidate.rows) ? candidate.rows : [];
  const readyRows = candidateRows.filter((row) => row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING");
  const pendingRows = candidateRows.filter((row) => row.reconciliation_state === "PENDING_VALUE_MISSING");

  if (!isSha256(input.canonicalReadRevisionSha256)) {
    issues.push(issue("CANONICAL_BINDING_INVALID", "The canonical read does not carry a valid revision fingerprint."));
  }
  if (candidateRows.length !== 538 || readyRows.length !== OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT || pendingRows.length !== OWNER_APPROVED_MARKET_VALUE_PENDING_VALUE_COUNT) {
    issues.push(issue("CANDIDATE_CONTRACT_INVALID", "Only the exact 533 ready rows may enter this binding run; the five pending rows remain excluded."));
  }

  const readyKeys = new Set<string>();
  const readyProviderPairs = new Set<string>();
  const readyTeamIds = new Set<string>();
  for (const row of candidateRows) {
    const rowIssue = candidateRowIssues(row);
    if (rowIssue) issues.push(rowIssue);
    if (row.reconciliation_state !== "READY_AFTER_CANONICAL_UUID_BINDING") continue;
    const rowKey = text(row.row_idempotency_key_sha256);
    const providerPair = `${text(row.provider_team_id)}\u0000${text(row.provider_player_id)}`;
    if (readyKeys.has(rowKey)) {
      issues.push(issue("CANDIDATE_ROW_INVALID", "A ready row idempotency key is duplicated.", { providerPlayerId: text(row.provider_player_id), providerTeamId: text(row.provider_team_id) }));
    }
    if (readyProviderPairs.has(providerPair)) {
      issues.push(issue("CANDIDATE_ROW_INVALID", "A ready provider team/player pair is duplicated.", { providerPlayerId: text(row.provider_player_id), providerTeamId: text(row.provider_team_id) }));
    }
    readyKeys.add(rowKey);
    readyProviderPairs.add(providerPair);
    readyTeamIds.add(text(row.provider_team_id));
  }
  if (
    readyTeamIds.size !== MANUAL_SCOPE_PROVIDER_TEAM_IDS.length
    || MANUAL_SCOPE_PROVIDER_TEAM_IDS.some((teamId) => !readyTeamIds.has(teamId))
  ) {
    issues.push(issue("CANDIDATE_SCOPE_INCOMPLETE", "Ready rows must cover each of the 19 approved manual-value clubs exactly through provider team IDs."));
  }

  const bindingsByPair = new Map<string, TouchlineCanonicalMarketValueBinding>();
  const canonicalPlayerIds = new Set<string>();
  const canonicalMembershipIds = new Set<string>();
  for (const binding of input.canonicalBindings) {
    const bindingIssue = canonicalBindingIssue(binding);
    if (bindingIssue) issues.push(bindingIssue);
    const pair = `${text(binding.providerTeamId)}\u0000${text(binding.providerPlayerId)}`;
    if (bindingsByPair.has(pair)) {
      issues.push(issue("CANONICAL_BINDING_DUPLICATE", "The canonical read contains more than one binding for a provider team/player pair.", { providerPlayerId: text(binding.providerPlayerId), providerTeamId: text(binding.providerTeamId) }));
    }
    if (canonicalPlayerIds.has(text(binding.canonicalPlayerId))) {
      issues.push(issue("CANONICAL_BINDING_DUPLICATE", "The canonical read maps more than one ready row to the same player UUID.", { providerPlayerId: text(binding.providerPlayerId), providerTeamId: text(binding.providerTeamId) }));
    }
    if (canonicalMembershipIds.has(text(binding.canonicalMembershipId))) {
      issues.push(issue("CANONICAL_BINDING_DUPLICATE", "The canonical read maps more than one ready row to the same active membership UUID.", { providerPlayerId: text(binding.providerPlayerId), providerTeamId: text(binding.providerTeamId) }));
    }
    bindingsByPair.set(pair, binding);
    canonicalPlayerIds.add(text(binding.canonicalPlayerId));
    canonicalMembershipIds.add(text(binding.canonicalMembershipId));
  }

  const rows: OwnerApprovedMarketValueBoundRow[] = [];
  for (const row of readyRows) {
    const binding = bindingsByPair.get(`${text(row.provider_team_id)}\u0000${text(row.provider_player_id)}`);
    if (!binding) {
      issues.push(issue("CANONICAL_BINDING_MISSING", "The ready row has no exact canonical player/current-club/active-membership binding.", { providerPlayerId: text(row.provider_player_id), providerTeamId: text(row.provider_team_id) }));
      continue;
    }
    rows.push(Object.freeze({
      row_idempotency_key_sha256: text(row.row_idempotency_key_sha256),
      source_row_sha256: text(row.source_row_sha256),
      club_name: text(row.club_name),
      player_display_name: text(row.player_display_name),
      provider_player_name: text(row.provider_player_name),
      provider_team_id: text(row.provider_team_id),
      provider_player_id: text(row.provider_player_id),
      canonical_player_id: text(binding.canonicalPlayerId),
      canonical_club_id: text(binding.canonicalClubId),
      canonical_membership_id: text(binding.canonicalMembershipId),
      canonical_competition_id: text(binding.canonicalCompetitionId),
      player_source_updated_at: text(binding.playerSourceUpdatedAt),
      club_source_updated_at: text(binding.clubSourceUpdatedAt),
      membership_source_updated_at: text(binding.membershipSourceUpdatedAt),
      competition_source_updated_at: text(binding.competitionSourceUpdatedAt),
      market_value_eur: row.market_value_eur as number,
      currency: "EUR",
      binding_status: "BOUND_PENDING_SEPARATE_WRITE_AUTHORIZATION",
      application_eligible: false,
    }));
  }

  if (bindingsByPair.size !== readyRows.length) {
    issues.push(issue("CANONICAL_BINDING_MISSING", "The canonical read must bind exactly one record for every ready candidate row."));
  }
  if (issues.length) {
    return baseManifest(candidate, null, issues, [], readyRows.length);
  }
  return baseManifest(candidate, input.canonicalReadRevisionSha256, [], rows.sort((left, right) => left.source_row_sha256.localeCompare(right.source_row_sha256)), readyRows.length);
}

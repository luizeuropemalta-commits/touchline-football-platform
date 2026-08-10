import { createHash } from "node:crypto";

import { TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE } from "../football-data/twenty-club-roster-reconciliation.ts";
import {
  OWNER_APPROVED_MARKET_VALUE_OWNER_ONLY_REVIEW_COUNT,
  OWNER_APPROVED_MARKET_VALUE_PENDING_VALUE_COUNT,
  OWNER_APPROVED_MARKET_VALUE_PROVIDER_ONLY_PENDING_COUNT,
  OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT,
  type OwnerApprovedMarketValueBindingManifest,
  type OwnerApprovedMarketValueBoundRow,
} from "./owner-approved-market-value-binding.ts";

/**
 * Pure, non-executable planning step for the separately-authorized market
 * value transaction. It accepts only a complete canonical binding manifest
 * and deliberately cannot access a client, environment, network or database.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const MANUAL_SCOPE_PROVIDER_TEAM_IDS = Object.freeze(
  TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE
    .filter((entry) => entry.manualValueScope)
    .map((entry) => entry.providerTeamId)
    .sort((left, right) => Number(left) - Number(right)),
);

export const OWNER_APPROVED_MARKET_VALUE_APPLICATION_PLAN_TARGETS = Object.freeze([
  "football_player_market_values",
  "football_player_market_value_history",
  "football_market_value_import_runs",
  "football_market_value_import_items",
  "football_market_value_job_runs",
] as const);

const PROTECTED_CANONICAL_FIELDS = Object.freeze([
  "card_tier",
  "card_price",
  "contract",
  "club_assignment",
] as const);

export type OwnerApprovedMarketValueApplicationPlanIssue = Readonly<{
  code:
    | "BINDING_MANIFEST_CONTRACT_INVALID"
    | "BOUND_ROW_INVALID"
    | "BOUND_ROW_DUPLICATE"
    | "BOUND_SCOPE_INCOMPLETE";
  detail: string;
  providerPlayerId: string | null;
  providerTeamId: string | null;
}>;

export type OwnerApprovedMarketValueApplicationPlanRow = Readonly<{
  rowIdempotencyKeySha256: string;
  sourceRowSha256: string;
  canonicalPlayerId: string;
  canonicalClubId: string;
  canonicalMembershipId: string;
  canonicalCompetitionId: string;
  providerTeamId: string;
  providerPlayerId: string;
  marketValueEur: number;
  currency: "EUR";
  sourceUpdatedAt: Readonly<{
    player: string;
    club: string;
    membership: string;
    competition: string;
  }>;
}>;

export type OwnerApprovedMarketValueApplicationPlan = Readonly<{
  schemaVersion: "touchline-owner-approved-market-value-application-plan-v1";
  status: "blocked" | "review-required";
  applicationEligible: false;
  execution: "dry-run-only";
  source: Readonly<{
    candidateId: string;
    candidateFingerprintSha256: string;
    canonicalReadRevisionSha256: string | null;
    applicationPlanFingerprintSha256: string | null;
  }>;
  allowedTargets: readonly typeof OWNER_APPROVED_MARKET_VALUE_APPLICATION_PLAN_TARGETS[number][];
  protectedCanonicalFields: readonly ("card_tier" | "card_price" | "contract" | "club_assignment")[];
  excluded: Readonly<{
    pendingValueMissing: number;
    providerOnlyPending: number;
    ownerOnlyReview: number;
    excludedFromEveryWriteSet: true;
  }>;
  counts: Readonly<{
    plannedValueRows: number;
    blockedRows: number;
  }>;
  rows: readonly OwnerApprovedMarketValueApplicationPlanRow[];
  issues: readonly OwnerApprovedMarketValueApplicationPlanIssue[];
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

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [
    key,
    stableValue((value as Record<string, unknown>)[key]),
  ]));
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value)), "utf8").digest("hex");
}

function issue(
  code: OwnerApprovedMarketValueApplicationPlanIssue["code"],
  detail: string,
  row?: Partial<Pick<OwnerApprovedMarketValueBoundRow, "provider_player_id" | "provider_team_id">>,
): OwnerApprovedMarketValueApplicationPlanIssue {
  return Object.freeze({
    code,
    detail,
    providerPlayerId: text(row?.provider_player_id) || null,
    providerTeamId: text(row?.provider_team_id) || null,
  });
}

function applicationRowIssue(row: OwnerApprovedMarketValueBoundRow) {
  if (
    !isSha256(row.row_idempotency_key_sha256)
    || !isSha256(row.source_row_sha256)
    || !text(row.provider_team_id).match(/^\d+$/)
    || !text(row.provider_player_id).match(/^\d+$/)
    || !isUuid(row.canonical_player_id)
    || !isUuid(row.canonical_club_id)
    || !isUuid(row.canonical_membership_id)
    || !isUuid(row.canonical_competition_id)
    || !hasTimestamp(row.player_source_updated_at)
    || !hasTimestamp(row.club_source_updated_at)
    || !hasTimestamp(row.membership_source_updated_at)
    || !hasTimestamp(row.competition_source_updated_at)
    || !isSafeNonNegativeInteger(row.market_value_eur)
    || row.currency !== "EUR"
    || row.binding_status !== "BOUND_PENDING_SEPARATE_WRITE_AUTHORIZATION"
    || row.application_eligible !== false
  ) return issue("BOUND_ROW_INVALID", "A bound value row no longer carries the exact UUID, active-membership freshness and explicit-EUR proof required for a later transaction.", row);
  return null;
}

function basePlan(
  manifest: OwnerApprovedMarketValueBindingManifest,
  issues: readonly OwnerApprovedMarketValueApplicationPlanIssue[],
  rows: readonly OwnerApprovedMarketValueApplicationPlanRow[],
): OwnerApprovedMarketValueApplicationPlan {
  const safeRows = Object.freeze([...rows]);
  const planFingerprint = issues.length ? null : sha256({
    candidateFingerprintSha256: manifest.candidate.candidateFingerprintSha256,
    canonicalReadRevisionSha256: manifest.canonicalReadRevisionSha256,
    rows: safeRows,
  });
  return Object.freeze({
    schemaVersion: "touchline-owner-approved-market-value-application-plan-v1",
    status: issues.length ? "blocked" : "review-required",
    applicationEligible: false,
    execution: "dry-run-only",
    source: Object.freeze({
      candidateId: text(manifest.candidate?.candidateId),
      candidateFingerprintSha256: text(manifest.candidate?.candidateFingerprintSha256),
      canonicalReadRevisionSha256: issues.length ? null : text(manifest.canonicalReadRevisionSha256),
      applicationPlanFingerprintSha256: planFingerprint,
    }),
    allowedTargets: OWNER_APPROVED_MARKET_VALUE_APPLICATION_PLAN_TARGETS,
    protectedCanonicalFields: PROTECTED_CANONICAL_FIELDS,
    excluded: Object.freeze({
      pendingValueMissing: manifest.excluded?.pendingValueMissing ?? 0,
      providerOnlyPending: manifest.excluded?.providerOnlyPending ?? 0,
      ownerOnlyReview: manifest.excluded?.ownerOnlyReview ?? 0,
      excludedFromEveryWriteSet: true,
    }),
    counts: Object.freeze({
      plannedValueRows: issues.length ? 0 : safeRows.length,
      blockedRows: issues.length ? OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT : 0,
    }),
    rows: issues.length ? Object.freeze([]) : safeRows,
    issues: Object.freeze([...issues]),
  });
}

/**
 * Builds the sole accepted dry-run write set: exactly 533 explicit EUR rows.
 * Any bad or incomplete binding blocks the entire plan and returns no rows.
 */
export function planOwnerApprovedMarketValueApplication(
  manifest: OwnerApprovedMarketValueBindingManifest,
): OwnerApprovedMarketValueApplicationPlan {
  const issues: OwnerApprovedMarketValueApplicationPlanIssue[] = [];
  const rows = Array.isArray(manifest.rows) ? manifest.rows : [];
  const manifestIssues = Array.isArray(manifest.issues) ? manifest.issues : [];

  if (
    manifest.schemaVersion !== "touchline-owner-approved-market-value-canonical-binding-v1"
    || manifest.status !== "review-required"
    || manifest.applicationEligible !== false
    || !isSha256(manifest.canonicalReadRevisionSha256)
    || !text(manifest.candidate?.candidateId)
    || !isSha256(manifest.candidate?.candidateFingerprintSha256)
    || !isSha256(manifest.candidate?.sourceSelectionSha256)
    || !text(manifest.candidate?.providerRosterSourceRevision)
    || manifestIssues.length !== 0
  ) issues.push(issue("BINDING_MANIFEST_CONTRACT_INVALID", "The canonical binding manifest is not a complete, clean review-only manifest."));

  if (
    manifest.counts?.readyRowsRequested !== OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT
    || manifest.counts?.canonicalRowsBound !== OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT
    || manifest.counts?.blockedRows !== 0
    || rows.length !== OWNER_APPROVED_MARKET_VALUE_READY_ROW_COUNT
    || manifest.excluded?.pendingValueMissing !== OWNER_APPROVED_MARKET_VALUE_PENDING_VALUE_COUNT
    || manifest.excluded?.providerOnlyPending !== OWNER_APPROVED_MARKET_VALUE_PROVIDER_ONLY_PENDING_COUNT
    || manifest.excluded?.ownerOnlyReview !== OWNER_APPROVED_MARKET_VALUE_OWNER_ONLY_REVIEW_COUNT
    || manifest.excluded?.excludedFromEveryWriteSet !== true
  ) issues.push(issue("BINDING_MANIFEST_CONTRACT_INVALID", "The write set must be exactly 533 rows with the 5/23/20 non-value groups excluded."));

  const rowIdempotencyKeys = new Set<string>();
  const sourceRowHashes = new Set<string>();
  const providerPairs = new Set<string>();
  const canonicalPlayerIds = new Set<string>();
  const canonicalMembershipIds = new Set<string>();
  const canonicalCompetitionIds = new Set<string>();
  const providerTeamToClubId = new Map<string, string>();
  const scopeTeamIds = new Set<string>();
  const applicationRows: OwnerApprovedMarketValueApplicationPlanRow[] = [];

  for (const row of rows) {
    const rowIssue = applicationRowIssue(row);
    if (rowIssue) issues.push(rowIssue);

    const rowIdempotencyKey = text(row.row_idempotency_key_sha256);
    const sourceRowHash = text(row.source_row_sha256);
    const providerTeamId = text(row.provider_team_id);
    const providerPlayerId = text(row.provider_player_id);
    const canonicalPlayerId = text(row.canonical_player_id);
    const canonicalMembershipId = text(row.canonical_membership_id);
    const canonicalClubId = text(row.canonical_club_id);
    const providerPair = `${providerTeamId}\u0000${providerPlayerId}`;

    if (rowIdempotencyKeys.has(rowIdempotencyKey) || sourceRowHashes.has(sourceRowHash) || providerPairs.has(providerPair)) {
      issues.push(issue("BOUND_ROW_DUPLICATE", "A planned value row duplicates a source, idempotency key or provider team/player identity.", row));
    }
    if (canonicalPlayerIds.has(canonicalPlayerId) || canonicalMembershipIds.has(canonicalMembershipId)) {
      issues.push(issue("BOUND_ROW_DUPLICATE", "A planned value row duplicates a canonical player or active membership UUID.", row));
    }
    const teamClubId = providerTeamToClubId.get(providerTeamId);
    if (teamClubId && teamClubId !== canonicalClubId) {
      issues.push(issue("BOUND_ROW_DUPLICATE", "One provider team maps to more than one canonical current-club UUID.", row));
    }
    rowIdempotencyKeys.add(rowIdempotencyKey);
    sourceRowHashes.add(sourceRowHash);
    providerPairs.add(providerPair);
    canonicalPlayerIds.add(canonicalPlayerId);
    canonicalMembershipIds.add(canonicalMembershipId);
    canonicalCompetitionIds.add(text(row.canonical_competition_id));
    providerTeamToClubId.set(providerTeamId, canonicalClubId);
    scopeTeamIds.add(providerTeamId);

    applicationRows.push(Object.freeze({
      rowIdempotencyKeySha256: rowIdempotencyKey,
      sourceRowSha256: sourceRowHash,
      canonicalPlayerId,
      canonicalClubId,
      canonicalMembershipId,
      canonicalCompetitionId: text(row.canonical_competition_id),
      providerTeamId,
      providerPlayerId,
      marketValueEur: row.market_value_eur,
      currency: "EUR",
      sourceUpdatedAt: Object.freeze({
        player: text(row.player_source_updated_at),
        club: text(row.club_source_updated_at),
        membership: text(row.membership_source_updated_at),
        competition: text(row.competition_source_updated_at),
      }),
    }));
  }

  if (
    canonicalCompetitionIds.size !== 1
    || scopeTeamIds.size !== MANUAL_SCOPE_PROVIDER_TEAM_IDS.length
    || MANUAL_SCOPE_PROVIDER_TEAM_IDS.some((providerTeamId) => !scopeTeamIds.has(providerTeamId))
  ) issues.push(issue("BOUND_SCOPE_INCOMPLETE", "The 533 planned rows must retain one Premier League competition and all 19 approved manual-value clubs."));

  const sortedRows = applicationRows.sort((left, right) => left.sourceRowSha256.localeCompare(right.sourceRowSha256));
  return basePlan(manifest, issues, sortedRows);
}

#!/usr/bin/env node

/**
 * Builds a review-only, non-mutating market-value application candidate from
 * the owner-approved transcript and a previously archived direct Sportmonks
 * roster snapshot. It deliberately has no database, provider, or executor
 * capability: the resulting package is a future-application preflight only.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS,
  normalizeTranscriptIdentity,
  parseOwnerTranscriptCsv,
} from "./reconcile-owner-approved-transcript-market-values.mjs";

const STAGING_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09");
const DEFAULT_OWNER_CSV = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.csv");
const DEFAULT_OWNER_MANIFEST = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.manifest.json");
const DEFAULT_SNAPSHOT = resolve(STAGING_DIRECTORY, "provider-roster-audits/2026-08-09T19-11-27-889Z/sportmonks-roster-snapshot.json");
const ARCHIVE_DIRECTORY = resolve(STAGING_DIRECTORY, "application-candidates");

const OUTPUT_FILES = Object.freeze({
  manifest: "application-manifest.json",
  matchedRows: "matched-owner-values.csv",
  providerOnly: "provider-only-quarantined-pending.json",
  ownerOnly: "owner-only-review.json",
});

const PROHIBITED_CANONICAL_SURFACES = Object.freeze([
  "touchline_card_inventory",
  "touchline_card_contracts",
  "touchline_card_price_catalog",
  "touchline_card_market_value_history",
  "competition_tier",
  "price_table_version",
  "wallet",
  "offer",
  "membership",
  "roster",
]);

const FUTURE_VALUE_AUDIT_TABLES_ONLY = Object.freeze([
  "football_player_market_values",
  "football_player_market_value_history",
  "football_market_value_import_runs",
  "football_market_value_import_items",
  "football_market_value_job_runs",
]);

function text(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function timestampDirectory(timestamp) {
  return text(timestamp).replace(/[:.]/g, "-");
}

function csvCell(value) {
  const content = String(value ?? "");
  return /[",\n\r]/.test(content) ? `"${content.replaceAll('"', '""')}"` : content;
}

function renderCsv(rows) {
  const columns = [
    "row_idempotency_key_sha256",
    "source_row_sha256",
    "club_name",
    "player_display_name",
    "provider_team_id",
    "provider_player_id",
    "provider_player_name",
    "market_value_eur",
    "currency",
    "reconciliation_state",
    "application_eligible",
  ];
  return `${[columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((record) => record.map(csvCell).join(","))
    .join("\n")}\n`;
}

function parseEurValue(value) {
  const source = text(value);
  if (!source) return null;
  if (!/^\d+$/.test(source)) throw new Error("TL_APPLICATION_CANDIDATE_OWNER_VALUE_INVALID");
  const amount = Number(source);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("TL_APPLICATION_CANDIDATE_OWNER_VALUE_INVALID");
  return amount;
}

function applicationArchivePathIsSafe(path) {
  const archiveRelative = relative(ARCHIVE_DIRECTORY, path);
  return Boolean(archiveRelative)
    && !archiveRelative.startsWith("..")
    && !archiveRelative.includes(`..${process.platform === "win32" ? "\\" : "/"}`);
}

function assertSnapshotIsReady(snapshot) {
  if (snapshot?.schemaVersion !== "touchline-sportmonks-roster-snapshot-v1") {
    throw new Error("TL_APPLICATION_CANDIDATE_SNAPSHOT_SCHEMA_INVALID");
  }
  if (text(snapshot?.source?.provider) !== "sportmonks" || text(snapshot?.source?.readMode) !== "direct-get-only") {
    throw new Error("TL_APPLICATION_CANDIDATE_SNAPSHOT_SOURCE_INVALID");
  }
  if (text(snapshot?.validation?.state) !== "ready") {
    throw new Error("TL_APPLICATION_CANDIDATE_SNAPSHOT_NOT_READY");
  }
  if (!Array.isArray(snapshot.clubs) || !Array.isArray(snapshot?.validation?.duplicateProviderPlayerIds)) {
    throw new Error("TL_APPLICATION_CANDIDATE_SNAPSHOT_STRUCTURE_INVALID");
  }
  if (snapshot.validation.duplicateProviderPlayerIds.length > 0 || (snapshot.validation.ambiguousNameGroups ?? []).length > 0) {
    throw new Error("TL_APPLICATION_CANDIDATE_SNAPSHOT_IDENTITY_AMBIGUOUS");
  }
}

function expectedTeamIdForOwnerRow(row) {
  const clubName = text(row.club_name);
  const providerTeamId = text(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS[clubName]);
  if (!providerTeamId) throw new Error(`TL_APPLICATION_CANDIDATE_OWNER_CLUB_UNEXPECTED:${clubName || "missing"}`);
  return providerTeamId;
}

function keyFor(teamId, playerName) {
  return `${text(teamId)}\u0000${normalizeTranscriptIdentity(playerName)}`;
}

function assertManualScope(snapshot) {
  const expectedIds = new Set(Object.values(OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS));
  const manualClubs = snapshot.clubs.filter((club) => club?.manualValueScope === true);
  const observedIds = manualClubs.map((club) => text(club.providerTeamId));
  if (manualClubs.length !== expectedIds.size || new Set(observedIds).size !== expectedIds.size) {
    throw new Error("TL_APPLICATION_CANDIDATE_MANUAL_SCOPE_INCOMPLETE");
  }
  for (const providerTeamId of expectedIds) {
    if (!observedIds.includes(providerTeamId)) throw new Error(`TL_APPLICATION_CANDIDATE_MANUAL_SCOPE_MISSING:${providerTeamId}`);
  }
}

function candidateRow({ ownerRow, member, sourceSelectionSha256, snapshotRevision }) {
  const marketValueEur = parseEurValue(ownerRow.market_value_eur);
  const identity = {
    sourceRowSha256: text(ownerRow.source_row_sha256),
    providerTeamId: text(member.providerTeamId),
    providerPlayerId: text(member.providerPlayerId),
    marketValueEur,
    season: "2026/27",
    sourceSelectionSha256: text(sourceSelectionSha256),
    snapshotRevision: text(snapshotRevision),
  };
  if (!identity.sourceRowSha256 || !/^\d+$/.test(identity.providerPlayerId) || !identity.providerTeamId) {
    throw new Error("TL_APPLICATION_CANDIDATE_MATCH_IDENTITY_INVALID");
  }
  return Object.freeze({
    row_idempotency_key_sha256: sha256(stableStringify(identity)),
    source_row_sha256: identity.sourceRowSha256,
    club_name: text(ownerRow.club_name),
    player_display_name: text(ownerRow.player_display_name),
    provider_team_id: identity.providerTeamId,
    provider_player_id: identity.providerPlayerId,
    provider_player_name: text(member.playerName),
    market_value_eur: marketValueEur,
    currency: marketValueEur === null ? null : "EUR",
    reconciliation_state: marketValueEur === null
      ? "PENDING_VALUE_MISSING"
      : "READY_AFTER_CANONICAL_UUID_BINDING",
    application_eligible: false,
  });
}

/**
 * Purely joins an already-archived provider snapshot and the owner CSV.
 * A unique exact name/team pair is a staging match only: without canonical
 * TouchLine UUID and active-membership proof, every row stays non-executable.
 */
export function buildOwnerApprovedSportmonksApplicationCandidate({
  ownerRows,
  ownerManifest,
  snapshot,
  ownerCsvSha256,
  ownerManifestSha256,
  snapshotSha256,
  generatedAt = "local-script-output",
}) {
  assertSnapshotIsReady(snapshot);
  assertManualScope(snapshot);
  if (!Array.isArray(ownerRows) || !ownerRows.length) throw new Error("TL_APPLICATION_CANDIDATE_OWNER_ROWS_MISSING");
  const sourceSelectionSha256 = text(ownerManifest?.source?.sourceSelectionSha256);
  const snapshotRevision = text(snapshot?.source?.sourceRevision);
  if (!sourceSelectionSha256 || !snapshotRevision) throw new Error("TL_APPLICATION_CANDIDATE_SOURCE_PROVENANCE_MISSING");

  const ownersByKey = new Map();
  for (const ownerRow of ownerRows) {
    const providerTeamId = expectedTeamIdForOwnerRow(ownerRow);
    const normalizedName = normalizeTranscriptIdentity(ownerRow.normalized_player_name ?? ownerRow.player_display_name);
    if (!normalizedName || !text(ownerRow.source_row_sha256)) throw new Error("TL_APPLICATION_CANDIDATE_OWNER_ROW_IDENTITY_INVALID");
    const key = keyFor(providerTeamId, normalizedName);
    ownersByKey.set(key, [...(ownersByKey.get(key) ?? []), ownerRow]);
  }

  const providersByKey = new Map();
  const providerMembers = [];
  for (const club of snapshot.clubs) {
    if (club?.manualValueScope !== true) continue;
    const providerTeamId = text(club.providerTeamId);
    if (!Array.isArray(club.members)) throw new Error(`TL_APPLICATION_CANDIDATE_MEMBERS_MISSING:${providerTeamId}`);
    for (const member of club.members) {
      const providerPlayerId = text(member?.providerPlayerId);
      const playerName = text(member?.playerName);
      if (!/^\d+$/.test(providerPlayerId) || !playerName) {
        throw new Error("TL_APPLICATION_CANDIDATE_PROVIDER_MEMBER_INVALID");
      }
      const key = keyFor(providerTeamId, playerName);
      providersByKey.set(key, [...(providersByKey.get(key) ?? []), member]);
      providerMembers.push(member);
    }
  }

  const providerMemberIdCount = new Map();
  for (const member of providerMembers) {
    const providerPlayerId = text(member.providerPlayerId);
    providerMemberIdCount.set(providerPlayerId, (providerMemberIdCount.get(providerPlayerId) ?? 0) + 1);
  }
  if ([...providerMemberIdCount.values()].some((count) => count > 1)) {
    throw new Error("TL_APPLICATION_CANDIDATE_DUPLICATE_PROVIDER_PLAYER_ID");
  }

  const rows = [];
  const providerOnly = [];
  const ownerOnly = [];
  const ambiguous = [];
  const allKeys = new Set([...ownersByKey.keys(), ...providersByKey.keys()]);
  for (const key of [...allKeys].sort()) {
    const ownerGroup = ownersByKey.get(key) ?? [];
    const providerGroup = providersByKey.get(key) ?? [];
    if (ownerGroup.length === 1 && providerGroup.length === 1) {
      rows.push(candidateRow({
        ownerRow: ownerGroup[0],
        member: providerGroup[0],
        sourceSelectionSha256,
        snapshotRevision,
      }));
      continue;
    }
    if (ownerGroup.length > 0 && providerGroup.length > 0) {
      ambiguous.push({
        normalized_name: key.split("\u0000")[1],
        provider_team_id: key.split("\u0000")[0],
        owner_rows: ownerGroup.length,
        provider_members: providerGroup.length,
        reconciliation_state: "AMBIGUOUS_NAME_REVIEW_PENDING",
        application_eligible: false,
      });
      continue;
    }
    if (providerGroup.length > 0) {
      for (const member of providerGroup) {
        providerOnly.push(Object.freeze({
          provider_team_id: text(member.providerTeamId),
          club_name: text(member.clubName),
          provider_player_id: text(member.providerPlayerId),
          player_name: text(member.playerName),
          reconciliation_state: "PROVIDER_ONLY_REVIEW_PENDING",
          manual_value_state: "PENDING",
          market_value_eur: null,
          application_eligible: false,
        }));
      }
      continue;
    }
    for (const ownerRow of ownerGroup) {
      ownerOnly.push(Object.freeze({
        source_row_sha256: text(ownerRow.source_row_sha256),
        club_name: text(ownerRow.club_name),
        player_name: text(ownerRow.player_display_name),
        reconciliation_state: "OWNER_ONLY_REVIEW_PENDING",
        manual_value_state: text(ownerRow.market_value_eur) ? "REVIEW" : "PENDING",
        market_value_eur: null,
        application_eligible: false,
      }));
    }
  }

  const providerIds = rows.map((row) => row.provider_player_id);
  if (new Set(providerIds).size !== providerIds.length) throw new Error("TL_APPLICATION_CANDIDATE_DUPLICATE_MATCHED_PROVIDER_PLAYER_ID");
  if (ambiguous.length > 0) throw new Error("TL_APPLICATION_CANDIDATE_AMBIGUOUS_NAME_GROUP");

  const sortedRows = rows.sort((left, right) => left.source_row_sha256.localeCompare(right.source_row_sha256));
  const sortedProviderOnly = providerOnly.sort((left, right) => `${left.provider_team_id}:${left.provider_player_id}`.localeCompare(`${right.provider_team_id}:${right.provider_player_id}`));
  const sortedOwnerOnly = ownerOnly.sort((left, right) => left.source_row_sha256.localeCompare(right.source_row_sha256));
  const readyRows = sortedRows.filter((row) => row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING");
  const pendingMatchedRows = sortedRows.filter((row) => row.reconciliation_state === "PENDING_VALUE_MISSING");
  const candidateFingerprint = sha256(stableStringify({
    sourceSelectionSha256,
    snapshotRevision,
    rows: sortedRows,
    providerOnly: sortedProviderOnly,
    ownerOnly: sortedOwnerOnly,
  }));

  return Object.freeze({
    schemaVersion: "touchline-owner-approved-sportmonks-market-value-application-candidate-v1",
    generatedAt,
    candidateId: `owner-approved-sportmonks-2026-27-${candidateFingerprint}`,
    candidateFingerprintSha256: candidateFingerprint,
    status: "LOCAL_PLAN_ONLY_REQUIRES_CANONICAL_UUID_BINDING",
    applicationEligible: false,
    source: Object.freeze({
      ownerCsvSha256,
      ownerManifestSha256,
      sourceSelectionSha256,
      providerRosterSnapshotSha256: snapshotSha256,
      providerRosterSourceRevision: snapshotRevision,
      provider: "sportmonks",
      providerReadMode: "direct-get-only",
    }),
    counts: Object.freeze({
      ownerRows: ownerRows.length,
      providerMembersManualScope: providerMembers.length,
      exactMatches: sortedRows.length,
      readyAfterCanonicalUuidBinding: readyRows.length,
      pendingValueMissing: pendingMatchedRows.length,
      providerOnlyPending: sortedProviderOnly.length,
      ownerOnlyReview: sortedOwnerOnly.length,
      ambiguousNameGroups: ambiguous.length,
    }),
    rows: Object.freeze(sortedRows),
    providerOnlyQuarantinedPending: Object.freeze(sortedProviderOnly),
    ownerOnlyReview: Object.freeze(sortedOwnerOnly),
    idempotentFutureApplication: Object.freeze({
      status: "REQUIRES_SEPARATE_ATOMIC_EXECUTOR",
      rowKey: "row_idempotency_key_sha256",
      requiredPreconditions: Object.freeze([
        "fresh versioned canonical roster snapshot binds every provider_player_id and provider_team_id to one TouchLine player UUID, current club and active competition-8 membership",
        "all 533 READY_AFTER_CANONICAL_UUID_BINDING rows pass human identity review without a collision or transfer conflict",
        "a transaction locks the exact batch fingerprint and rejects a prior batch with a different source fingerprint",
        "a rerun with the same row key/value/season records unchanged rather than adding a duplicate history record",
        "the five PENDING_VALUE_MISSING, 23 PROVIDER_ONLY_REVIEW_PENDING and 20 OWNER_ONLY_REVIEW_PENDING rows are excluded from every write set",
      ]),
      futureWriteTablesOnly: FUTURE_VALUE_AUDIT_TABLES_ONLY,
      prohibitedCanonicalSurfaces: PROHIBITED_CANONICAL_SURFACES,
      noDatabaseWriteOccurred: true,
    }),
  });
}

function parseArgs(args) {
  const result = {
    ownerCsv: DEFAULT_OWNER_CSV,
    ownerManifest: DEFAULT_OWNER_MANIFEST,
    snapshot: DEFAULT_SNAPSHOT,
    outputDirectory: null,
    writeNew: false,
    check: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") result.check = true;
    else if (argument === "--write-new") result.writeNew = true;
    else if (["--owner-csv", "--owner-manifest", "--snapshot", "--output-directory"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`TL_APPLICATION_CANDIDATE_ARGUMENT_VALUE_MISSING:${argument}`);
      result[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = resolve(value);
      index += 1;
    } else {
      throw new Error(`TL_APPLICATION_CANDIDATE_ARGUMENT_UNKNOWN:${argument}`);
    }
  }
  if (result.check === result.writeNew) throw new Error("TL_APPLICATION_CANDIDATE_EXACTLY_ONE_MODE_REQUIRED");
  if (result.outputDirectory && !result.writeNew) throw new Error("TL_APPLICATION_CANDIDATE_OUTPUT_REQUIRES_WRITE_NEW");
  return result;
}

function artifactContents(candidate) {
  const rowsCsv = renderCsv(candidate.rows);
  const providerOnly = JSON.stringify({
    schemaVersion: "touchline-provider-only-quarantine-pending-v1",
    candidateId: candidate.candidateId,
    candidateFingerprintSha256: candidate.candidateFingerprintSha256,
    status: "REVIEW_ONLY_PENDING",
    applicationEligible: false,
    rows: candidate.providerOnlyQuarantinedPending,
  }, null, 2).concat("\n");
  const ownerOnly = JSON.stringify({
    schemaVersion: "touchline-owner-only-market-value-review-v1",
    candidateId: candidate.candidateId,
    candidateFingerprintSha256: candidate.candidateFingerprintSha256,
    status: "REVIEW_ONLY",
    applicationEligible: false,
    rows: candidate.ownerOnlyReview,
  }, null, 2).concat("\n");
  const manifest = JSON.stringify({
    ...candidate,
    artifactSha256: {
      [OUTPUT_FILES.matchedRows]: sha256(rowsCsv),
      [OUTPUT_FILES.providerOnly]: sha256(providerOnly),
      [OUTPUT_FILES.ownerOnly]: sha256(ownerOnly),
    },
  }, null, 2).concat("\n");
  return { manifest, rowsCsv, providerOnly, ownerOnly };
}

async function writeNewArchive({ outputDirectory, contents }) {
  if (!applicationArchivePathIsSafe(outputDirectory)) {
    throw new Error("TL_APPLICATION_CANDIDATE_OUTPUT_OUTSIDE_ARCHIVE_FORBIDDEN");
  }
  await mkdir(ARCHIVE_DIRECTORY, { recursive: true });
  await mkdir(outputDirectory, { recursive: false });
  await Promise.all([
    writeFile(resolve(outputDirectory, OUTPUT_FILES.manifest), contents.manifest, { encoding: "utf8", flag: "wx" }),
    writeFile(resolve(outputDirectory, OUTPUT_FILES.matchedRows), contents.rowsCsv, { encoding: "utf8", flag: "wx" }),
    writeFile(resolve(outputDirectory, OUTPUT_FILES.providerOnly), contents.providerOnly, { encoding: "utf8", flag: "wx" }),
    writeFile(resolve(outputDirectory, OUTPUT_FILES.ownerOnly), contents.ownerOnly, { encoding: "utf8", flag: "wx" }),
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [ownerCsv, ownerManifestText, snapshotText] = await Promise.all([
    readFile(args.ownerCsv, "utf8"),
    readFile(args.ownerManifest, "utf8"),
    readFile(args.snapshot, "utf8"),
  ]);
  const startedAt = new Date().toISOString();
  const candidate = buildOwnerApprovedSportmonksApplicationCandidate({
    ownerRows: parseOwnerTranscriptCsv(ownerCsv),
    ownerManifest: JSON.parse(ownerManifestText),
    snapshot: JSON.parse(snapshotText),
    ownerCsvSha256: sha256(ownerCsv),
    ownerManifestSha256: sha256(ownerManifestText),
    snapshotSha256: sha256(snapshotText),
    generatedAt: startedAt,
  });
  const contents = artifactContents(candidate);
  const outputDirectory = args.outputDirectory ?? resolve(ARCHIVE_DIRECTORY, timestampDirectory(startedAt));
  if (args.writeNew) await writeNewArchive({ outputDirectory, contents });
  process.stdout.write(`${JSON.stringify({
    candidateId: candidate.candidateId,
    candidateFingerprintSha256: candidate.candidateFingerprintSha256,
    status: candidate.status,
    applicationEligible: candidate.applicationEligible,
    counts: candidate.counts,
    outputDirectory: args.writeNew ? outputDirectory : null,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_APPLICATION_CANDIDATE_UNEXPECTED_FAILURE"}\n`);
    process.exitCode = 1;
  });
}

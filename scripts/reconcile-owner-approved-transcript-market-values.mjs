#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STAGING_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09");
const DEFAULT_INPUT = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.csv");
const DEFAULT_MANIFEST = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.manifest.json");
const DEFAULT_REPORT = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.reconciliation-report.json");
const ARCHIVE_DIRECTORY = resolve(STAGING_DIRECTORY, "roster-audits");

// This is a local scope registry copied from the existing canonical club/team
// map. It validates the owner-assigned club context but is not player identity
// or active-membership evidence.
export const OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS = {
  "Arsenal FC": "19",
  "Hull City": "22",
  "Chelsea FC": "18",
  "Brentford FC": "236",
  "AFC Bournemouth": "52",
  "Tottenham Hotspur": "6",
  "Crystal Palace": "51",
  "Leeds United": "71",
  "Ipswich Town": "116",
  "Manchester United": "14",
  "Aston Villa": "15",
  "Sunderland AFC": "3",
  "Fulham FC": "11",
  "Manchester City": "9",
  "Brighton & Hove Albion": "78",
  "Coventry City": "117",
  "Newcastle United": "20",
  "Everton FC": "13",
  "Nottingham Forest": "63",
};

// Liverpool is deliberately included in the roster audit but excluded from
// the 19-club owner-value batch. The audit must distinguish that legitimate
// out-of-scope roster from a DB-only member in a manual-value club.
export const TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS = {
  ...OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS,
  "Liverpool FC": "8",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function text(value) {
  return String(value ?? "").trim();
}

function isUuid(value) {
  return UUID_PATTERN.test(text(value));
}

function hasTimestamp(value) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(text(value)));
}

function isNewArchivePath(path) {
  const pathRelativeToArchive = relative(ARCHIVE_DIRECTORY, path);
  return Boolean(pathRelativeToArchive)
    && !pathRelativeToArchive.startsWith("..")
    && !pathRelativeToArchive.includes(`..${process.platform === "win32" ? "\\" : "/"}`);
}

export function normalizeTranscriptIdentity(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeTranscriptClub(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/\b(?:afc|fc|football club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseCsvRecord(record) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    const character = record[index];
    if (quoted && character === '"' && record[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("TL_OWNER_TRANSCRIPT_UNTERMINATED_CSV_QUOTE");
  cells.push(cell);
  return cells;
}

export function parseOwnerTranscriptCsv(csv) {
  const [header, ...records] = String(csv).trim().split(/\r?\n/);
  const columns = parseCsvRecord(header);
  const required = [
    "source_row_sha256",
    "club_name",
    "player_display_name",
    "normalized_player_name",
    "market_value_eur",
    "review_status",
  ];
  for (const column of required) {
    if (!columns.includes(column)) throw new Error(`TL_OWNER_TRANSCRIPT_MISSING_COLUMN:${column}`);
  }
  return records.map((record) => {
    const cells = parseCsvRecord(record);
    if (cells.length !== columns.length) throw new Error("TL_OWNER_TRANSCRIPT_CSV_COLUMN_COUNT_MISMATCH");
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  });
}

function normalizeCanonicalRoster(roster) {
  if (!roster || roster.schemaVersion !== "touchline-canonical-roster-export-v1") {
    throw new Error("TL_CANONICAL_ROSTER_EXPORT_SCHEMA_INVALID");
  }
  for (const key of ["competitions", "clubs", "players", "memberships"]) {
    if (!Array.isArray(roster[key])) throw new Error(`TL_CANONICAL_ROSTER_EXPORT_ARRAY_MISSING:${key}`);
  }
  if (!text(roster.exportedAt) || !text(roster?.source?.runId) || !text(roster?.source?.sourceRevision)) {
    throw new Error("TL_CANONICAL_ROSTER_EXPORT_PROVENANCE_MISSING");
  }

  const competitions = new Map(roster.competitions.map((competition) => [text(competition.id), competition]));
  const clubs = new Map(roster.clubs.map((club) => [text(club.id), club]));
  const targetCompetitions = roster.competitions.filter((competition) => (
    isUuid(competition.id)
    && text(competition.provider) === "sportmonks"
    && text(competition.provider_competition_id ?? competition.providerCompetitionId) === "8"
    && hasTimestamp(competition.source_updated_at ?? competition.sourceUpdatedAt)
  ));
  const targetCompetition = targetCompetitions.length === 1 ? targetCompetitions[0] : null;
  const targetCompetitionId = text(targetCompetition?.id);
  const expectedTeamIds = new Set(Object.values(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS));
  const scopeChecks = [...expectedTeamIds].sort((left, right) => Number(left) - Number(right)).map((providerTeamId) => {
    const matchingClubs = roster.clubs.filter((club) => (
      text(club.provider) === "sportmonks"
      && text(club.provider_team_id ?? club.providerTeamId) === providerTeamId
    ));
    const club = matchingClubs.length === 1 ? matchingClubs[0] : null;
    const expectedClubName = Object.entries(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS)
      .find(([, teamId]) => teamId === providerTeamId)?.[0] ?? "";
    const valid = Boolean(
      club
      && isUuid(club.id)
      && text(club.competition_id ?? club.competitionId) === targetCompetitionId
      && hasTimestamp(club.source_updated_at ?? club.sourceUpdatedAt)
    );
    return {
      expectedClubName,
      providerTeamId,
      state: matchingClubs.length === 0 ? "MISSING_CLUB" : matchingClubs.length > 1 ? "DUPLICATE_CLUB" : valid ? "READY" : "INVALID_CLUB",
      canonicalClubId: text(club?.id),
    };
  });
  const membershipsByPlayer = new Map();
  const activeMembershipCountsByClub = new Map();
  for (const membership of roster.memberships) {
    const playerId = text(membership.player_id ?? membership.playerId);
    membershipsByPlayer.set(playerId, [...(membershipsByPlayer.get(playerId) ?? []), membership]);
    if (text(membership.status) === "active" && text(membership.provider) === "sportmonks") {
      const clubId = text(membership.club_id ?? membership.clubId);
      activeMembershipCountsByClub.set(clubId, (activeMembershipCountsByClub.get(clubId) ?? 0) + 1);
    }
  }
  const rosterScopeChecks = scopeChecks.map((check) => {
    const activeMembershipCount = activeMembershipCountsByClub.get(check.canonicalClubId) ?? 0;
    return {
      ...check,
      activeMembershipCount,
      state: check.state === "READY" && activeMembershipCount === 0 ? "NO_ACTIVE_MEMBERSHIP" : check.state,
    };
  });
  const auditComplete = Boolean(targetCompetition) && rosterScopeChecks.every((check) => check.state === "READY");

  const candidates = [];
  const invalid = [];
  for (const player of roster.players) {
    const canonicalPlayerId = text(player.id);
    const providerPlayerId = text(player.provider_player_id ?? player.providerPlayerId);
    const currentClubId = text(player.current_club_id ?? player.currentClubId);
    const club = clubs.get(currentClubId);
    const competition = club ? competitions.get(text(club.competition_id ?? club.competitionId)) : null;
    const memberships = membershipsByPlayer.get(canonicalPlayerId) ?? [];
    const activeMemberships = memberships.filter((membership) => (
      text(membership.status) === "active"
      && text(membership.provider) === "sportmonks"
      && text(membership.club_id ?? membership.clubId) === currentClubId
      && text(membership.competition_id ?? membership.competitionId) === text(club?.competition_id ?? club?.competitionId)
    ));
    const activeMembership = activeMemberships.length === 1 ? activeMemberships[0] : null;
    const valid = (
      isUuid(canonicalPlayerId)
      && text(player.provider) === "sportmonks"
      && /^\d+$/.test(providerPlayerId)
      && hasTimestamp(player.source_updated_at ?? player.sourceUpdatedAt)
      && Boolean(club)
      && isUuid(club?.id)
      && text(club.provider) === "sportmonks"
      && /^\d+$/.test(text(club.provider_team_id ?? club.providerTeamId))
      && hasTimestamp(club.source_updated_at ?? club.sourceUpdatedAt)
      && Boolean(competition)
      && isUuid(competition?.id)
      && text(competition.provider) === "sportmonks"
      && text(competition.provider_competition_id ?? competition.providerCompetitionId) === "8"
      && text(competition.id) === targetCompetitionId
      && Boolean(activeMembership)
      && isUuid(activeMembership?.id)
      && hasTimestamp(activeMembership?.source_updated_at ?? activeMembership?.sourceUpdatedAt)
    );
    const candidate = {
      canonicalPlayerId,
      providerPlayerId,
      canonicalClubId: currentClubId,
      providerTeamId: text(club?.provider_team_id ?? club?.providerTeamId),
      clubName: text(club?.name),
      normalizedClubName: normalizeTranscriptClub(club?.name),
      canonicalMembershipId: text(activeMembership?.id),
      membershipStatus: text(activeMembership?.status),
      membershipSourceUpdatedAt: text(activeMembership?.source_updated_at ?? activeMembership?.sourceUpdatedAt),
      playerSourceUpdatedAt: text(player.source_updated_at ?? player.sourceUpdatedAt),
      names: new Set([player.name, player.display_name, player.displayName, player.short_name, player.shortName]
        .map(normalizeTranscriptIdentity)
        .filter(Boolean)),
    };
    (valid ? candidates : invalid).push(candidate);
  }
  return {
    candidates,
    invalid,
    audit: {
      state: auditComplete ? "ready" : "incomplete",
      targetCompetitionId,
      scopeChecks: rosterScopeChecks,
    },
  };
}

function countsFor(rows) {
  const by = (outcome) => rows.filter((row) => row.reconciliation_outcome === outcome).length;
  return {
    rows: rows.length,
    explicitValues: rows.filter((row) => text(row.market_value_eur)).length,
    pendingValues: by("PENDING_VALUE_MISSING"),
    matchedCandidates: by("MATCHED_EXACT_NAME_CURRENT_CLUB_REVIEW_REQUIRED"),
    review: rows.filter((row) => row.reconciliation_outcome.startsWith("REVIEW_")).length,
    unmatched: rows.filter((row) => row.reconciliation_outcome.startsWith("UNMATCHED_")).length,
    rosterUnavailable: by("REVIEW_CANONICAL_ROSTER_EXPORT_UNAVAILABLE"),
  };
}

function rosterCoverageAudit(sourceRows, normalizedRoster) {
  if (!normalizedRoster) {
    return {
      state: "unavailable",
      blocker: "LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE",
      quarantined: [],
      outOfManualValueScope: [],
      ownerListedPending: [],
      exceptions: [],
    };
  }
  if (normalizedRoster.audit.state !== "ready") {
    return {
      state: "incomplete",
      blocker: "ROSTER_AUDIT_EXPORT_INCOMPLETE",
      scopeChecks: normalizedRoster.audit.scopeChecks,
      quarantined: [],
      outOfManualValueScope: [],
      ownerListedPending: [],
      exceptions: normalizedRoster.invalid.map((candidate) => ({
        ...candidate,
        reconciliation_state: "REVIEW_CANONICAL_ROSTER_INVALID_OR_DUPLICATE",
      })),
    };
  }

  const sourceRowsByIdentity = new Map();
  for (const sourceRow of sourceRows) {
    const key = `${normalizeTranscriptClub(sourceRow.club_name)}:${normalizeTranscriptIdentity(sourceRow.player_display_name)}`;
    sourceRowsByIdentity.set(key, [...(sourceRowsByIdentity.get(key) ?? []), sourceRow]);
  }
  const quarantined = [];
  const outOfManualValueScope = [];
  const ownerListedPending = [];
  const reviewed = [];
  for (const candidate of normalizedRoster.candidates) {
    const matchingRows = [...candidate.names]
      .flatMap((name) => sourceRowsByIdentity.get(`${candidate.normalizedClubName}:${name}`) ?? []);
    const candidateRecord = {
      canonical_membership_id: candidate.canonicalMembershipId,
      canonical_player_id: candidate.canonicalPlayerId,
      provider_player_id: candidate.providerPlayerId,
      canonical_club_id: candidate.canonicalClubId,
      provider_team_id: candidate.providerTeamId,
      club_name: candidate.clubName,
      membership_status: candidate.membershipStatus,
      membership_source_updated_at: candidate.membershipSourceUpdatedAt,
      player_source_updated_at: candidate.playerSourceUpdatedAt,
      application_eligible: false,
    };
    if (candidate.providerTeamId === TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS["Liverpool FC"]) {
      outOfManualValueScope.push({
        ...candidateRecord,
        reconciliation_state: "OUT_OF_MANUAL_VALUE_SCOPE_LIVERPOOL",
        manual_value_state: "OUT_OF_SCOPE",
        market_value_eur: null,
      });
    } else if (matchingRows.length === 0) {
      quarantined.push({
        ...candidateRecord,
        reconciliation_state: "QUARANTINED",
        manual_value_state: "PENDING",
        market_value_eur: null,
        reason: "no exact owner transcript row",
      });
    } else if (matchingRows.some((row) => !text(row.market_value_eur))) {
      ownerListedPending.push({
        ...candidateRecord,
        reconciliation_state: "OWNER_LISTED_PENDING_VALUE",
        manual_value_state: "PENDING",
        market_value_eur: null,
      });
    } else {
      reviewed.push({
        ...candidateRecord,
        reconciliation_state: "OWNER_LISTED_EXACT_NAME_REVIEW_REQUIRED",
        manual_value_state: "REVIEW",
        market_value_eur: null,
      });
    }
  }
  return {
    state: "ready",
    blocker: null,
    scopeChecks: normalizedRoster.audit.scopeChecks,
    quarantined,
    outOfManualValueScope,
    ownerListedPending,
    reviewed,
    exceptions: normalizedRoster.invalid.map((candidate) => ({
      ...candidate,
      reconciliation_state: "REVIEW_CANONICAL_ROSTER_INVALID_OR_DUPLICATE",
    })),
  };
}

export function reconcileOwnerTranscriptRows(sourceRows, canonicalRoster = null) {
  const normalizedRoster = canonicalRoster ? normalizeCanonicalRoster(canonicalRoster) : null;
  const rosterAuditBlocked = normalizedRoster && normalizedRoster.audit.state !== "ready";
  const outputRows = sourceRows.map((sourceRow) => {
    const base = {
      source_row_sha256: sourceRow.source_row_sha256,
      club_name: sourceRow.club_name,
      player_display_name: sourceRow.player_display_name,
      normalized_player_name: sourceRow.normalized_player_name || normalizeTranscriptIdentity(sourceRow.player_display_name),
      market_value_eur: sourceRow.market_value_eur,
      source_review_status: sourceRow.review_status,
      expected_provider_team_id: OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS[sourceRow.club_name] ?? "",
      candidate_canonical_player_id: "",
      candidate_provider_player_id: "",
      candidate_canonical_club_id: "",
      candidate_provider_team_id: "",
      application_eligible: false,
    };
    if (!text(sourceRow.market_value_eur)) {
      return { ...base, reconciliation_outcome: "PENDING_VALUE_MISSING", reconciliation_reason: "owner supplied no explicit EUR value" };
    }
    if (!normalizedRoster) {
      return { ...base, reconciliation_outcome: "REVIEW_CANONICAL_ROSTER_EXPORT_UNAVAILABLE", reconciliation_reason: "no local versioned canonical roster export is available; remote DB/provider access is prohibited" };
    }
    if (rosterAuditBlocked) {
      return { ...base, reconciliation_outcome: "REVIEW_CANONICAL_ROSTER_EXPORT_INCOMPLETE", reconciliation_reason: "canonical roster export lacks complete 20-club active-membership/freshness evidence" };
    }

    const normalizedClub = normalizeTranscriptClub(sourceRow.club_name);
    const normalizedName = normalizeTranscriptIdentity(sourceRow.player_display_name);
    const matchingCandidates = normalizedRoster.candidates.filter((candidate) => (
      candidate.normalizedClubName === normalizedClub && candidate.names.has(normalizedName)
    ));
    const invalidCandidates = normalizedRoster.invalid.filter((candidate) => (
      candidate.normalizedClubName === normalizedClub && candidate.names.has(normalizedName)
    ));
    const sameNameOtherClub = [...normalizedRoster.candidates, ...normalizedRoster.invalid].some((candidate) => (
      candidate.normalizedClubName !== normalizedClub && candidate.names.has(normalizedName)
    ));
    const expectedProviderTeamId = text(base.expected_provider_team_id);
    const expectedTeamCandidates = matchingCandidates.filter((candidate) => candidate.providerTeamId === expectedProviderTeamId);
    const wrongTeamCandidates = matchingCandidates.filter((candidate) => candidate.providerTeamId !== expectedProviderTeamId);
    if (matchingCandidates.length > 1) {
      return { ...base, reconciliation_outcome: "REVIEW_AMBIGUOUS_NAME_CURRENT_CLUB", reconciliation_reason: "multiple valid canonical candidates share normalized name and club context" };
    }
    if (expectedTeamCandidates.length === 1) {
      const candidate = expectedTeamCandidates[0];
      return {
        ...base,
        candidate_canonical_player_id: candidate.canonicalPlayerId,
        candidate_provider_player_id: candidate.providerPlayerId,
        candidate_canonical_club_id: candidate.canonicalClubId,
        candidate_provider_team_id: candidate.providerTeamId,
        reconciliation_outcome: "MATCHED_EXACT_NAME_CURRENT_CLUB_REVIEW_REQUIRED",
        reconciliation_reason: "unique exact normalized-name, expected provider-team, and current-club candidate; requires human identity review before any write",
      };
    }
    if (wrongTeamCandidates.length) {
      const candidate = wrongTeamCandidates[0];
      return {
        ...base,
        candidate_canonical_player_id: candidate.canonicalPlayerId,
        candidate_provider_player_id: candidate.providerPlayerId,
        candidate_canonical_club_id: candidate.canonicalClubId,
        candidate_provider_team_id: candidate.providerTeamId,
        reconciliation_outcome: "REVIEW_EXPECTED_PROVIDER_TEAM_ID_MISMATCH",
        reconciliation_reason: "normalized club/name candidate does not carry the owner block's expected provider team ID",
      };
    }
    if (invalidCandidates.length) {
      return { ...base, reconciliation_outcome: "REVIEW_CANONICAL_ROSTER_INVALID_OR_DUPLICATE", reconciliation_reason: "name and club candidate exists but lacks valid provider/current-club/active-membership evidence" };
    }
    if (sameNameOtherClub) {
      return { ...base, reconciliation_outcome: "REVIEW_CURRENT_CLUB_MISMATCH", reconciliation_reason: "normalized name exists only under a different current club" };
    }
    return { ...base, reconciliation_outcome: "UNMATCHED_NO_CURRENT_CLUB_NAME_MATCH", reconciliation_reason: "no exact normalized-name candidate exists for this current club" };
  });
  return {
    runStatus: normalizedRoster && !rosterAuditBlocked ? "completed-local-review" : "blocked",
    blocker: !normalizedRoster ? "LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE" : rosterAuditBlocked ? "ROSTER_AUDIT_EXPORT_INCOMPLETE" : null,
    rows: outputRows,
    totals: countsFor(outputRows),
    rosterCoverageAudit: rosterCoverageAudit(sourceRows, normalizedRoster),
  };
}

function parseArgs(args) {
  const result = {
    input: DEFAULT_INPUT,
    manifest: DEFAULT_MANIFEST,
    roster: null,
    output: null,
    quarantineOutput: null,
    writeNew: false,
    allowUnavailable: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write") throw new Error("TL_OWNER_TRANSCRIPT_WRITE_RETIRED_USE_WRITE_NEW");
    else if (argument === "--write-new") result.writeNew = true;
    else if (argument === "--allow-unavailable") result.allowUnavailable = true;
    else if (argument === "--input" || argument === "--manifest" || argument === "--roster" || argument === "--output" || argument === "--quarantine-output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`TL_OWNER_TRANSCRIPT_ARGUMENT_VALUE_MISSING:${argument}`);
      result[argument === "--quarantine-output" ? "quarantineOutput" : argument.slice(2)] = resolve(value);
      index += 1;
    } else if (argument === "--check") {
      // Validation is always performed; this explicit flag is accepted for CI/read-only use.
    } else {
      throw new Error(`TL_OWNER_TRANSCRIPT_UNKNOWN_ARGUMENT:${argument}`);
    }
  }
  if (result.writeNew && (!result.output || !result.quarantineOutput)) {
    throw new Error("TL_OWNER_TRANSCRIPT_OUTPUT_AND_QUARANTINE_OUTPUT_REQUIRED_FOR_WRITE_NEW");
  }
  if ((result.output || result.quarantineOutput) && !result.writeNew) {
    throw new Error("TL_OWNER_TRANSCRIPT_WRITE_NEW_REQUIRED_FOR_OUTPUT");
  }
  if (result.output === DEFAULT_REPORT || result.quarantineOutput === DEFAULT_REPORT || result.output === result.quarantineOutput) {
    throw new Error("TL_OWNER_TRANSCRIPT_HISTORICAL_REPORT_OVERWRITE_FORBIDDEN");
  }
  if ((result.output && !isNewArchivePath(result.output)) || (result.quarantineOutput && !isNewArchivePath(result.quarantineOutput))) {
    throw new Error("TL_OWNER_TRANSCRIPT_OUTPUT_OUTSIDE_VERSIONED_ARCHIVE_FORBIDDEN");
  }
  return result;
}

function buildReport({ input, manifestPath, inputCsv, manifestText, manifest, canonicalRoster, reconciliation }) {
  const clubs = [...new Set(reconciliation.rows.map((row) => row.club_name))].map((clubName) => {
    const clubRows = reconciliation.rows.filter((row) => row.club_name === clubName);
    return { clubName, expectedProviderTeamId: OWNER_TRANSCRIPT_PROVIDER_TEAM_IDS[clubName] ?? "", ...countsFor(clubRows) };
  });
  return {
    schemaVersion: "owner-approved-transcript-reconciliation-v1",
    runStatus: reconciliation.runStatus,
    blocker: reconciliation.blocker,
    generatedAt: "local-script-output; not a provider or database timestamp",
    source: {
      stagingCsv: input,
      stagingCsvSha256: sha256(inputCsv),
      manifest: manifestPath,
      manifestSha256: sha256(manifestText),
      sourceSelectionSha256: manifest.source?.sourceSelectionSha256 ?? null,
    },
    canonicalRoster: canonicalRoster ? {
      state: "provided-local-export",
      sha256: sha256(JSON.stringify(canonicalRoster)),
      exportedAt: canonicalRoster.exportedAt,
      source: canonicalRoster.source,
    } : {
      state: "unavailable",
      reason: "No versioned local canonical roster export is committed in this candidate. The authoritative runtime reader requires a prohibited remote DB read.",
    },
    applicationEligible: false,
    totals: reconciliation.totals,
    clubs,
    rows: reconciliation.rows,
    rosterCoverageAudit: reconciliation.rosterCoverageAudit,
  };
}

function buildQuarantineReport(report) {
  const rosterCoverageAudit = report.rosterCoverageAudit;
  return {
    schemaVersion: "touchline-roster-quarantine-report-v1",
    generatedAt: report.generatedAt,
    source: report.source,
    canonicalRoster: report.canonicalRoster,
    state: rosterCoverageAudit?.state ?? "unavailable",
    blocker: rosterCoverageAudit?.blocker ?? "LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE",
    quarantined: rosterCoverageAudit?.quarantined ?? [],
    ownerListedPending: rosterCoverageAudit?.ownerListedPending ?? [],
    outOfManualValueScope: rosterCoverageAudit?.outOfManualValueScope ?? [],
    exceptions: rosterCoverageAudit?.exceptions ?? [],
    note: "Report-only classification. It never changes membership status, applies a value, or authorizes a database write.",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [inputCsv, manifestText, rosterText] = await Promise.all([
    readFile(args.input, "utf8"),
    readFile(args.manifest, "utf8"),
    args.roster ? readFile(args.roster, "utf8") : Promise.resolve(null),
  ]);
  const manifest = JSON.parse(manifestText);
  const canonicalRoster = rosterText ? JSON.parse(rosterText) : null;
  const sourceRows = parseOwnerTranscriptCsv(inputCsv);
  const reconciliation = reconcileOwnerTranscriptRows(sourceRows, canonicalRoster);
  const report = buildReport({ input: args.input, manifestPath: args.manifest, inputCsv, manifestText, manifest, canonicalRoster, reconciliation });
  const quarantineReport = buildQuarantineReport(report);

  if (args.writeNew) {
    await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await writeFile(args.quarantineOutput, `${JSON.stringify(quarantineReport, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify({
    runStatus: report.runStatus,
    blocker: report.blocker,
    output: args.writeNew ? args.output : null,
    quarantineOutput: args.writeNew ? args.quarantineOutput : null,
    totals: report.totals,
    clubs: report.clubs,
    rosterCoverageAudit: report.rosterCoverageAudit ? {
      state: report.rosterCoverageAudit.state,
      blocker: report.rosterCoverageAudit.blocker,
      quarantined: report.rosterCoverageAudit.quarantined.length,
      outOfManualValueScope: report.rosterCoverageAudit.outOfManualValueScope.length,
      ownerListedPending: report.rosterCoverageAudit.ownerListedPending.length,
      exceptions: report.rosterCoverageAudit.exceptions.length,
    } : null,
  }, null, 2)}\n`);
  if (report.runStatus === "blocked" && !args.allowUnavailable) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

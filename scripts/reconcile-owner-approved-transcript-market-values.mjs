#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STAGING_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09");
const DEFAULT_INPUT = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.csv");
const DEFAULT_MANIFEST = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.manifest.json");
const DEFAULT_REPORT = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.reconciliation-report.json");

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

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function text(value) {
  return String(value ?? "").trim();
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
  const membershipsByPlayer = new Map();
  for (const membership of roster.memberships) {
    const playerId = text(membership.player_id ?? membership.playerId);
    membershipsByPlayer.set(playerId, [...(membershipsByPlayer.get(playerId) ?? []), membership]);
  }

  const candidates = [];
  const invalid = [];
  for (const player of roster.players) {
    const canonicalPlayerId = text(player.id);
    const providerPlayerId = text(player.provider_player_id ?? player.providerPlayerId);
    const currentClubId = text(player.current_club_id ?? player.currentClubId);
    const club = clubs.get(currentClubId);
    const competition = club ? competitions.get(text(club.competition_id ?? club.competitionId)) : null;
    const memberships = membershipsByPlayer.get(canonicalPlayerId) ?? [];
    const activeMembership = memberships.find((membership) => (
      text(membership.status) === "active"
      && text(membership.club_id ?? membership.clubId) === currentClubId
      && text(membership.competition_id ?? membership.competitionId) === text(club?.competition_id ?? club?.competitionId)
    ));
    const valid = (
      text(player.provider) === "sportmonks"
      && /^\d+$/.test(providerPlayerId)
      && Boolean(club)
      && text(club.provider) === "sportmonks"
      && /^\d+$/.test(text(club.provider_team_id ?? club.providerTeamId))
      && Boolean(competition)
      && text(competition.provider) === "sportmonks"
      && text(competition.provider_competition_id ?? competition.providerCompetitionId) === "8"
      && Boolean(activeMembership)
    );
    const candidate = {
      canonicalPlayerId,
      providerPlayerId,
      canonicalClubId: currentClubId,
      providerTeamId: text(club?.provider_team_id ?? club?.providerTeamId),
      clubName: text(club?.name),
      normalizedClubName: normalizeTranscriptClub(club?.name),
      names: new Set([player.name, player.display_name, player.displayName, player.short_name, player.shortName]
        .map(normalizeTranscriptIdentity)
        .filter(Boolean)),
    };
    (valid ? candidates : invalid).push(candidate);
  }
  return { candidates, invalid };
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

export function reconcileOwnerTranscriptRows(sourceRows, canonicalRoster = null) {
  const normalizedRoster = canonicalRoster ? normalizeCanonicalRoster(canonicalRoster) : null;
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
    if (matchingCandidates.length === 1) {
      const candidate = matchingCandidates[0];
      return {
        ...base,
        candidate_canonical_player_id: candidate.canonicalPlayerId,
        candidate_provider_player_id: candidate.providerPlayerId,
        candidate_canonical_club_id: candidate.canonicalClubId,
        candidate_provider_team_id: candidate.providerTeamId,
        reconciliation_outcome: "MATCHED_EXACT_NAME_CURRENT_CLUB_REVIEW_REQUIRED",
        reconciliation_reason: "unique exact normalized-name and current-club candidate; requires human identity review before any write",
      };
    }
    if (matchingCandidates.length > 1) {
      return { ...base, reconciliation_outcome: "REVIEW_AMBIGUOUS_NAME_CURRENT_CLUB", reconciliation_reason: "multiple valid canonical candidates share normalized name and current club" };
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
    runStatus: normalizedRoster ? "completed-local-review" : "blocked",
    blocker: normalizedRoster ? null : "LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE",
    rows: outputRows,
    totals: countsFor(outputRows),
  };
}

function parseArgs(args) {
  const result = { input: DEFAULT_INPUT, manifest: DEFAULT_MANIFEST, roster: null, write: false, allowUnavailable: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write") result.write = true;
    else if (argument === "--allow-unavailable") result.allowUnavailable = true;
    else if (argument === "--input" || argument === "--manifest" || argument === "--roster") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`TL_OWNER_TRANSCRIPT_ARGUMENT_VALUE_MISSING:${argument}`);
      result[argument.slice(2)] = resolve(value);
      index += 1;
    } else if (argument === "--check") {
      // Validation is always performed; this explicit flag is accepted for CI/read-only use.
    } else {
      throw new Error(`TL_OWNER_TRANSCRIPT_UNKNOWN_ARGUMENT:${argument}`);
    }
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

  if (args.write) {
    await mkdir(dirname(DEFAULT_REPORT), { recursive: true });
    await writeFile(DEFAULT_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({
    runStatus: report.runStatus,
    blocker: report.blocker,
    output: args.write ? DEFAULT_REPORT : null,
    totals: report.totals,
    clubs: report.clubs,
  }, null, 2)}\n`);
  if (report.runStatus === "blocked" && !args.allowUnavailable) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

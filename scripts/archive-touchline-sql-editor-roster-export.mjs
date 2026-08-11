#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ARCHIVE_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits");
const PROVIDER = "sportmonks";
const COMPETITION_PROVIDER_ID = "8";
const ROSTER_SCOPE = Object.freeze({
  "Arsenal FC": "19", "Hull City": "22", "Chelsea FC": "18", "Brentford FC": "236",
  "AFC Bournemouth": "52", "Tottenham Hotspur": "6", "Crystal Palace": "51", "Leeds United": "71",
  "Ipswich Town": "116", "Manchester United": "14", "Aston Villa": "15", "Sunderland AFC": "3",
  "Fulham FC": "11", "Manchester City": "9", "Brighton & Hove Albion": "78", "Coventry City": "117",
  "Newcastle United": "20", "Everton FC": "13", "Nottingham Forest": "63", "Liverpool FC": "8",
});
const EXPECTED_COLUMNS = Object.freeze([
  "competition_id",
  "competition_provider",
  "provider_competition_id",
  "competition_source_updated_at",
  "club_id",
  "club_provider",
  "provider_team_id",
  "club_name",
  "club_source_updated_at",
  "player_id",
  "player_provider",
  "provider_player_id",
  "current_club_id",
  "player_name",
  "display_name",
  "player_source_updated_at",
  "membership_id",
  "membership_status",
  "membership_source_updated_at",
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

function hasTimestamp(value) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(text(value)));
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
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
  if (quoted) throw new Error("TL_SQL_EDITOR_ROSTER_CSV_UNTERMINATED_QUOTE");
  cells.push(cell);
  return cells;
}

/** Parses the exact, read-only Supabase SQL Editor CSV projection. */
export function parseSqlEditorCanonicalRosterCsv(csv) {
  const records = String(csv).replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);
  const columns = parseCsvRecord(records.shift() ?? "");
  if (columns.length !== EXPECTED_COLUMNS.length || columns.some((column, index) => column !== EXPECTED_COLUMNS[index])) {
    throw new Error("TL_SQL_EDITOR_ROSTER_CSV_COLUMNS_INVALID");
  }
  if (!records.length) throw new Error("TL_SQL_EDITOR_ROSTER_CSV_EMPTY");
  return records.map((record) => {
    const cells = parseCsvRecord(record);
    if (cells.length !== columns.length) throw new Error("TL_SQL_EDITOR_ROSTER_CSV_COLUMN_COUNT_MISMATCH");
    return Object.freeze(Object.fromEntries(columns.map((column, index) => [column, text(cells[index])])));
  });
}

function uniqueRows(rows, key, map) {
  const byKey = new Map();
  for (const row of rows) {
    const value = map(row);
    const prior = byKey.get(key(value));
    if (prior && JSON.stringify(prior) !== JSON.stringify(value)) throw new Error("TL_SQL_EDITOR_ROSTER_EXPORT_CONFLICTING_DUPLICATE");
    byKey.set(key(value), value);
  }
  return [...byKey.values()];
}

/** Shapes a two-pass SQL Editor result into the existing canonical export schema. */
export function canonicalRosterExportFromSqlEditorRows(rows, exportedAt) {
  const competitions = uniqueRows(rows, (row) => row.id, (row) => ({
    id: row.competition_id,
    provider: row.competition_provider,
    provider_competition_id: row.provider_competition_id,
    source_updated_at: row.competition_source_updated_at,
  }));
  const clubs = uniqueRows(rows, (row) => row.id, (row) => ({
    id: row.club_id,
    provider: row.club_provider,
    provider_team_id: row.provider_team_id,
    competition_id: row.competition_id,
    name: row.club_name,
    source_updated_at: row.club_source_updated_at,
  }));
  const players = uniqueRows(rows, (row) => row.id, (row) => ({
    id: row.player_id,
    provider: row.player_provider,
    provider_player_id: row.provider_player_id,
    current_club_id: row.current_club_id,
    name: row.player_name,
    display_name: row.display_name || null,
    source_updated_at: row.player_source_updated_at,
  }));
  const memberships = uniqueRows(rows, (row) => row.id, (row) => ({
    id: row.membership_id,
    provider: "sportmonks",
    club_id: row.club_id,
    player_id: row.player_id,
    competition_id: row.competition_id,
    status: row.membership_status,
    source_updated_at: row.membership_source_updated_at,
  }));
  const scopeChecks = Object.entries(ROSTER_SCOPE)
    .map(([expectedClubName, providerTeamId]) => {
      const matchingClubs = clubs.filter((club) => club.provider === PROVIDER && club.provider_team_id === providerTeamId);
      const club = matchingClubs.length === 1 ? matchingClubs[0] : null;
      const activeMembershipCount = memberships.filter((membership) => membership.club_id === club?.id && membership.status === "active").length;
      return {
        expectedClubName,
        providerTeamId,
        canonicalClubId: club?.id ?? "",
        activeMembershipCount,
        state: matchingClubs.length === 0 ? "MISSING_CLUB" : matchingClubs.length > 1 ? "DUPLICATE_CLUB" : club.competition_id !== competitions[0]?.id ? "CLUB_COMPETITION_MISMATCH" : !hasTimestamp(club.source_updated_at) ? "CLUB_SOURCE_TIMESTAMP_MISSING" : activeMembershipCount === 0 ? "NO_ACTIVE_MEMBERSHIP" : "READY",
      };
    })
    .sort((left, right) => Number(left.providerTeamId) - Number(right.providerTeamId));
  const playersById = new Map(players.map((player) => [player.id, player]));
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const activeByPlayer = new Map();
  const activeByProviderId = new Map();
  const exceptionalMemberships = [];
  for (const membership of memberships) {
    const player = playersById.get(membership.player_id);
    const club = clubsById.get(membership.club_id);
    const reasons = [
      membership.provider !== PROVIDER ? "MEMBERSHIP_PROVIDER_NOT_SPORTMONKS" : null,
      membership.status !== "active" ? "MEMBERSHIP_NOT_ACTIVE" : null,
      !uuid(membership.id) ? "INVALID_MEMBERSHIP_UUID" : null,
      !hasTimestamp(membership.source_updated_at) ? "MEMBERSHIP_SOURCE_TIMESTAMP_MISSING" : null,
      player?.provider !== PROVIDER ? "PLAYER_PROVIDER_NOT_SPORTMONKS" : null,
      !uuid(player?.id) ? "INVALID_PLAYER_UUID" : null,
      !/^\d+$/.test(player?.provider_player_id ?? "") ? "INVALID_PROVIDER_PLAYER_ID" : null,
      !hasTimestamp(player?.source_updated_at) ? "PLAYER_SOURCE_TIMESTAMP_MISSING" : null,
      player?.current_club_id !== club?.id ? "PLAYER_CURRENT_CLUB_MISMATCH" : null,
      membership.competition_id !== club?.competition_id ? "MEMBERSHIP_CLUB_COMPETITION_MISMATCH" : null,
    ].filter(Boolean);
    if (reasons.length) exceptionalMemberships.push({ canonicalMembershipId: membership.id, canonicalPlayerId: membership.player_id, canonicalClubId: membership.club_id, providerPlayerId: player?.provider_player_id ?? "", providerTeamId: club?.provider_team_id ?? "", reasons });
    activeByPlayer.set(membership.player_id, [...(activeByPlayer.get(membership.player_id) ?? []), membership]);
    activeByProviderId.set(player?.provider_player_id ?? "", [...(activeByProviderId.get(player?.provider_player_id ?? "") ?? []), membership]);
  }
  const duplicateActiveMemberships = [...activeByPlayer.entries()].filter(([, value]) => value.length > 1).map(([canonicalPlayerId, value]) => ({ canonicalPlayerId, canonicalMembershipIds: value.map((item) => item.id).sort() }));
  const duplicateProviderPlayerIds = [...activeByProviderId.entries()].filter(([providerPlayerId, value]) => providerPlayerId && value.length > 1).map(([providerPlayerId, value]) => ({ providerPlayerId, canonicalPlayerIds: value.map((item) => item.player_id).sort(), canonicalMembershipIds: value.map((item) => item.id).sort() }));
  const sourcePayload = { competitions, clubs, players, memberships, syncRuns: [] };
  const sourceRevision = sha256(stableStringify(sourcePayload));
  const auditState = competitions.length === 1
    && competitions[0]?.provider === PROVIDER
    && competitions[0]?.provider_competition_id === COMPETITION_PROVIDER_ID
    && uuid(competitions[0]?.id)
    && hasTimestamp(competitions[0]?.source_updated_at)
    && scopeChecks.every((check) => check.state === "READY")
    && exceptionalMemberships.length === 0
    && duplicateActiveMemberships.length === 0
    && duplicateProviderPlayerIds.length === 0
    ? "ready"
    : "incomplete";
  return {
    schemaVersion: "touchline-canonical-roster-export-v1",
    exportedAt,
    source: {
      runId: `sql-editor-read-only-${sourceRevision.slice(0, 16)}`,
      sourceRevision,
      querySpecHash: sha256(stableStringify({ provider: PROVIDER, competitionProviderId: COMPETITION_PROVIDER_ID, providerTeamIds: Object.values(ROSTER_SCOPE).sort((left, right) => Number(left) - Number(right)), access: "select-only/revision-fenced" })),
      kind: "authorized-sql-editor-select-only-two-pass-export",
      provider: PROVIDER,
      competitionProviderId: COMPETITION_PROVIDER_ID,
      consistency: "two-pass-membership-revision-fence",
    },
    competitions,
    clubs,
    players,
    memberships,
    audit: {
      scopeChecks,
      exceptionalMemberships,
      duplicateActiveMemberships,
      duplicateProviderPlayerIds,
      duplicateMembershipIds: [],
      observedSyncRuns: [],
      state: auditState,
    },
  };
}

function isNewArchivePath(path) {
  const relativePath = relative(ARCHIVE_DIRECTORY, path);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${process.platform === "win32" ? "\\\\" : "/"}`);
}

function parseArgs(args) {
  const result = { first: null, second: null, output: null, writeNew: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write-new") result.writeNew = true;
    else if (["--first", "--second", "--output"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`TL_SQL_EDITOR_ROSTER_${argument.slice(2).toUpperCase()}_REQUIRED`);
      result[argument.slice(2)] = resolve(value);
      index += 1;
    } else throw new Error(`TL_SQL_EDITOR_ROSTER_UNKNOWN_ARGUMENT:${argument}`);
  }
  if (!result.writeNew || !result.first || !result.second || !result.output) throw new Error("TL_SQL_EDITOR_ROSTER_WRITE_NEW_AND_TWO_PASSES_REQUIRED");
  if (!isNewArchivePath(result.output)) throw new Error("TL_SQL_EDITOR_ROSTER_OUTPUT_OUTSIDE_VERSIONED_ARCHIVE_FORBIDDEN");
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [firstCsv, secondCsv] = await Promise.all([readFile(args.first, "utf8"), readFile(args.second, "utf8")]);
  const firstHash = sha256(firstCsv);
  const secondHash = sha256(secondCsv);
  if (firstHash !== secondHash) throw new Error("TL_SQL_EDITOR_ROSTER_REVISION_CHANGED_DURING_READ");
  const firstRows = parseSqlEditorCanonicalRosterCsv(firstCsv);
  const secondRows = parseSqlEditorCanonicalRosterCsv(secondCsv);
  if (JSON.stringify(firstRows) !== JSON.stringify(secondRows)) throw new Error("TL_SQL_EDITOR_ROSTER_ROWS_CHANGED_DURING_READ");
  const roster = canonicalRosterExportFromSqlEditorRows(secondRows, new Date().toISOString());
  const exportDocument = {
    ...roster,
    source: {
      ...roster.source,
      kind: "authorized-sql-editor-select-only-two-pass-export",
      sqlEditorTwoPass: Object.freeze({
        csvSha256: firstHash,
        firstRowCount: firstRows.length,
        secondRowCount: secondRows.length,
      }),
    },
  };
  await writeFile(args.output, `${JSON.stringify(exportDocument, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    output: args.output,
    schemaVersion: exportDocument.schemaVersion,
    sourceRevision: exportDocument.source.sourceRevision,
    csvSha256: firstHash,
    auditState: exportDocument.audit.state,
    counts: { clubs: exportDocument.clubs.length, players: exportDocument.players.length, memberships: exportDocument.memberships.length },
    duplicates: {
      activeMemberships: exportDocument.audit.duplicateActiveMemberships.length,
      providerPlayerIds: exportDocument.audit.duplicateProviderPlayerIds.length,
      membershipIds: exportDocument.audit.duplicateMembershipIds.length,
    },
  }, null, 2)}\n`);
  if (exportDocument.audit.state !== "ready") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_SQL_EDITOR_ROSTER_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}

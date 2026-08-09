#!/usr/bin/env node

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS } from "./reconcile-owner-approved-transcript-market-values.mjs";

const PROVIDER = "sportmonks";
const COMPETITION_PROVIDER_ID = "8";
const PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARCHIVE_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits");

// The canonical ledger's SQL Editor incident gate supersedes the earlier
// read-only authorization. Keep this hard stop in code rather than accepting
// an environment-variable bypass; a separately reviewed change may remove it
// only after the incident has independently been closed.
function assertSqlIncidentHold() {
  throw new Error("TL_SQL_EDITOR_INCIDENT_HOLD_REQUIRES_INDEPENDENT_CLOSURE");
}

function text(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isUuid(value) {
  return UUID_PATTERN.test(text(value));
}

function isNewArchivePath(path) {
  const pathRelativeToArchive = relative(ARCHIVE_DIRECTORY, path);
  return Boolean(pathRelativeToArchive)
    && !pathRelativeToArchive.startsWith("..")
    && !pathRelativeToArchive.includes(`..${process.platform === "win32" ? "\\" : "/"}`);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function decodeJwtPayload(token, errorCode) {
  const [, payload] = text(token).split(".");
  if (!payload) throw new Error(errorCode);
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64url").toString("utf8"));
  } catch {
    throw new Error(errorCode);
  }
}

// Deliberately accepts a dedicated authenticated session only. A service-role
// key is not a database-enforced read-only capability and is never accepted.
export function readOnlyConnectionConfig(environment = process.env) {
  const url = text(environment.TOUCHLINE_ROSTER_EXPORT_URL);
  const anonKey = text(environment.TOUCHLINE_ROSTER_EXPORT_ANON_KEY);
  const accessToken = text(environment.TOUCHLINE_ROSTER_EXPORT_ACCESS_TOKEN);
  if (text(environment.TOUCHLINE_ROSTER_EXPORT_MODE) !== "read-only") {
    throw new Error("TL_ROSTER_EXPORT_READ_ONLY_MODE_REQUIRED");
  }
  if (!url || !anonKey || !accessToken) {
    throw new Error("TL_ROSTER_EXPORT_READ_ONLY_CONFIGURATION_REQUIRED");
  }
  const anonPayload = decodeJwtPayload(anonKey, "TL_ROSTER_EXPORT_ANON_KEY_REQUIRED");
  if (anonPayload.role !== "anon") {
    throw new Error("TL_ROSTER_EXPORT_ANON_KEY_REQUIRED");
  }
  const accessPayload = decodeJwtPayload(accessToken, "TL_ROSTER_EXPORT_AUTHENTICATED_TOKEN_REQUIRED");
  if (accessPayload.role !== "authenticated" || accessPayload.aud !== "authenticated") {
    throw new Error("TL_ROSTER_EXPORT_AUTHENTICATED_TOKEN_REQUIRED");
  }
  return { url, anonKey, accessToken };
}

function compareRows(left, right) {
  return stableStringify(left).localeCompare(stableStringify(right));
}

function canonicalRows(rows) {
  return [...(rows ?? [])].sort(compareRows);
}

function sourceRevisionPayload({ competitions, clubs, players, memberships, syncRuns }) {
  return {
    competitions: canonicalRows(competitions),
    clubs: canonicalRows(clubs),
    players: canonicalRows(players),
    memberships: canonicalRows(memberships),
    syncRuns: canonicalRows(syncRuns),
  };
}

function expectedClubName(providerTeamId) {
  return Object.entries(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS)
    .find(([, teamId]) => teamId === providerTeamId)?.[0] ?? "";
}

function activeMembershipsForClub(memberships, clubId) {
  return memberships.filter((membership) => (
    text(membership.provider) === PROVIDER
    && text(membership.club_id) === text(clubId)
    && text(membership.status) === "active"
  ));
}

export function buildCanonicalRosterExport({ competitions, clubs, players, memberships, syncRuns, exportedAt }) {
  const normalized = sourceRevisionPayload({ competitions, clubs, players, memberships, syncRuns });
  const targetCompetitions = normalized.competitions.filter((competition) => (
    text(competition.provider) === PROVIDER
    && text(competition.provider_competition_id) === COMPETITION_PROVIDER_ID
    && isUuid(competition.id)
  ));
  const targetCompetition = targetCompetitions.length === 1 ? targetCompetitions[0] : null;
  const targetCompetitionId = text(targetCompetition?.id);
  const scopeChecks = Object.values(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS)
    .sort((left, right) => Number(left) - Number(right))
    .map((providerTeamId) => {
      const matchingClubs = normalized.clubs.filter((club) => (
        text(club.provider) === PROVIDER && text(club.provider_team_id) === providerTeamId
      ));
      const club = matchingClubs.length === 1 ? matchingClubs[0] : null;
      const activeMembershipCount = club ? activeMembershipsForClub(normalized.memberships, club.id).length : 0;
      const state = matchingClubs.length === 0
        ? "MISSING_CLUB"
        : matchingClubs.length > 1
          ? "DUPLICATE_CLUB"
          : text(club.competition_id) !== targetCompetitionId
            ? "CLUB_COMPETITION_MISMATCH"
            : activeMembershipCount === 0
              ? "NO_ACTIVE_MEMBERSHIP"
              : "READY";
      return {
        expectedClubName: expectedClubName(providerTeamId),
        providerTeamId,
        canonicalClubId: text(club?.id),
        activeMembershipCount,
        state,
      };
    });
  const playersById = new Map(normalized.players.map((player) => [text(player.id), player]));
  const clubsById = new Map(normalized.clubs.map((club) => [text(club.id), club]));
  const exceptionalMemberships = normalized.memberships.map((membership) => {
    const player = playersById.get(text(membership.player_id));
    const club = clubsById.get(text(membership.club_id));
    const reasons = [
      text(membership.provider) !== PROVIDER ? "MEMBERSHIP_PROVIDER_NOT_SPORTMONKS" : null,
      text(membership.status) !== "active" ? "MEMBERSHIP_NOT_ACTIVE" : null,
      text(player?.provider) !== PROVIDER ? "PLAYER_PROVIDER_NOT_SPORTMONKS" : null,
      !/^\d+$/.test(text(player?.provider_player_id)) ? "INVALID_PROVIDER_PLAYER_ID" : null,
      text(player?.current_club_id) !== text(club?.id) ? "PLAYER_CURRENT_CLUB_MISMATCH" : null,
      text(membership.competition_id) !== text(club?.competition_id) ? "MEMBERSHIP_CLUB_COMPETITION_MISMATCH" : null,
      text(club?.competition_id) !== targetCompetitionId ? "CLUB_NOT_COMPETITION_8" : null,
    ].filter(Boolean);
    return reasons.length ? {
      canonicalMembershipId: text(membership.id),
      canonicalPlayerId: text(membership.player_id),
      canonicalClubId: text(membership.club_id),
      providerPlayerId: text(player?.provider_player_id),
      providerTeamId: text(club?.provider_team_id),
      reasons,
    } : null;
  }).filter(Boolean);
  const sourceRevision = sha256(stableStringify(normalized));
  const querySpec = {
    provider: PROVIDER,
    competitionProviderId: COMPETITION_PROVIDER_ID,
    providerTeamIds: Object.values(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS).sort((left, right) => Number(left) - Number(right)),
    tables: ["football_competitions", "football_clubs", "football_players", "football_squad_members", "football_data_sync_runs"],
    access: "select-only/revision-fenced",
  };
  return {
    schemaVersion: "touchline-canonical-roster-export-v1",
    exportedAt,
    source: {
      runId: `roster-read-only-${sourceRevision.slice(0, 16)}`,
      sourceRevision,
      querySpecHash: sha256(stableStringify(querySpec)),
      kind: "authorized-read-only-db-audit",
      provider: PROVIDER,
      competitionProviderId: COMPETITION_PROVIDER_ID,
      consistency: "two-pass-membership-revision-fence",
    },
    competitions: normalized.competitions,
    clubs: normalized.clubs,
    players: normalized.players,
    memberships: normalized.memberships,
    audit: {
      scopeChecks,
      exceptionalMemberships,
      observedSyncRuns: normalized.syncRuns,
      state: targetCompetition && scopeChecks.every((check) => check.state === "READY") ? "ready" : "incomplete",
    },
  };
}

async function readAll(buildQuery, label) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`TL_ROSTER_EXPORT_READ_FAILED:${label}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

function chunks(values, size = 200) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function readPlayers(db, clubIds, membershipPlayerIds) {
  const rows = new Map();
  for (const clubIdsChunk of chunks(clubIds)) {
    const currentClubPlayers = await readAll(
      () => db.from("football_players")
        .select("id,provider,provider_player_id,current_club_id,name,display_name,source_updated_at,created_at,updated_at")
        .in("current_club_id", clubIdsChunk)
        .order("id", { ascending: true }),
      "players-current-club",
    );
    for (const player of currentClubPlayers) rows.set(text(player.id), player);
  }
  for (const playerIdsChunk of chunks(membershipPlayerIds)) {
    const membershipPlayers = await readAll(
      () => db.from("football_players")
        .select("id,provider,provider_player_id,current_club_id,name,display_name,source_updated_at,created_at,updated_at")
        .in("id", playerIdsChunk)
        .order("id", { ascending: true }),
      "players-membership",
    );
    for (const player of membershipPlayers) rows.set(text(player.id), player);
  }
  return [...rows.values()];
}

async function readSnapshot(db) {
  const competitions = await readAll(
    () => db.from("football_competitions")
      .select("id,provider,provider_competition_id,name,source_updated_at,created_at,updated_at")
      .eq("provider", PROVIDER)
      .eq("provider_competition_id", COMPETITION_PROVIDER_ID)
      .order("id", { ascending: true }),
    "competitions",
  );
  const targetCompetitionId = text(competitions[0]?.id);
  const providerTeamIds = Object.values(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS);
  const clubs = await readAll(
    () => db.from("football_clubs")
      .select("id,provider,provider_team_id,competition_id,name,short_code,source_updated_at,created_at,updated_at")
      .eq("provider", PROVIDER)
      .in("provider_team_id", providerTeamIds)
      .order("provider_team_id", { ascending: true })
      .order("id", { ascending: true }),
    "clubs",
  );
  const clubIds = clubs.map((club) => text(club.id)).filter(Boolean);
  const memberships = clubIds.length ? await readAll(
    () => db.from("football_squad_members")
      .select("id,provider,club_id,player_id,competition_id,jersey_number,position,status,source_updated_at,created_at,updated_at")
      .eq("status", "active")
      .in("club_id", clubIds)
      .order("club_id", { ascending: true })
      .order("player_id", { ascending: true })
      .order("id", { ascending: true }),
    "active-memberships",
  ) : [];
  const membershipPlayerIds = [...new Set(memberships.map((membership) => text(membership.player_id)).filter(Boolean))];
  const players = await readPlayers(db, clubIds, membershipPlayerIds);
  const syncRuns = targetCompetitionId ? await readAll(
    () => db.from("football_data_sync_runs")
      .select("id,provider,sync_type,status,competition_id,club_id,started_at,completed_at,records_created,records_updated,records_skipped")
      .eq("provider", PROVIDER)
      .eq("competition_id", targetCompetitionId)
      .order("started_at", { ascending: false })
      .order("id", { ascending: true }),
    "sync-runs",
  ) : [];
  return { competitions, clubs, memberships, players, syncRuns };
}

function revisionFence(snapshot) {
  return sha256(stableStringify({
    competitions: canonicalRows(snapshot.competitions).map((competition) => ({ id: competition.id, source_updated_at: competition.source_updated_at })),
    clubs: canonicalRows(snapshot.clubs).map((club) => ({ id: club.id, source_updated_at: club.source_updated_at })),
    players: canonicalRows(snapshot.players).map((player) => ({ id: player.id, source_updated_at: player.source_updated_at })),
    memberships: canonicalRows(snapshot.memberships).map((membership) => ({ id: membership.id, source_updated_at: membership.source_updated_at })),
  }));
}

function parseArgs(args) {
  const result = { output: null, writeNew: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write-new") result.writeNew = true;
    else if (argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("TL_ROSTER_EXPORT_OUTPUT_REQUIRED");
      result.output = resolve(value);
      index += 1;
    } else if (argument === "--check") {
      // A live DB read is still performed; the result is printed only.
    } else {
      throw new Error(`TL_ROSTER_EXPORT_UNKNOWN_ARGUMENT:${argument}`);
    }
  }
  if (result.writeNew && !result.output) throw new Error("TL_ROSTER_EXPORT_OUTPUT_REQUIRED");
  if (result.output && !result.writeNew) throw new Error("TL_ROSTER_EXPORT_WRITE_NEW_REQUIRED");
  if (result.output && !isNewArchivePath(result.output)) throw new Error("TL_ROSTER_EXPORT_OUTPUT_OUTSIDE_VERSIONED_ARCHIVE_FORBIDDEN");
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertSqlIncidentHold();
  const config = readOnlyConnectionConfig();
  const db = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${config.accessToken}` } },
  });
  const firstSnapshot = await readSnapshot(db);
  const secondSnapshot = await readSnapshot(db);
  if (revisionFence(firstSnapshot) !== revisionFence(secondSnapshot)) {
    throw new Error("TL_ROSTER_EXPORT_REVISION_CHANGED_DURING_READ");
  }
  const exportDocument = buildCanonicalRosterExport({ ...secondSnapshot, exportedAt: new Date().toISOString() });
  if (args.writeNew) {
    await writeFile(args.output, `${JSON.stringify(exportDocument, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: exportDocument.schemaVersion,
    output: args.writeNew ? args.output : null,
    sourceRevision: exportDocument.source.sourceRevision,
    auditState: exportDocument.audit.state,
    scopeChecks: exportDocument.audit.scopeChecks,
    counts: {
      competitions: exportDocument.competitions.length,
      clubs: exportDocument.clubs.length,
      players: exportDocument.players.length,
      activeMemberships: exportDocument.memberships.length,
      exceptionalMemberships: exportDocument.audit.exceptionalMemberships.length,
    },
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_ROSTER_EXPORT_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}

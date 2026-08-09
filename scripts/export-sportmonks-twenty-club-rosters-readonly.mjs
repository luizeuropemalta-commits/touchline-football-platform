#!/usr/bin/env node

/**
 * One-shot, provider-only roster snapshot.
 *
 * This intentionally never imports a database client, sync helper, or app
 * route. It reads Sportmonks with GET only and archives a sanitized manifest
 * with `wx`; it never stores a request URL, token, or raw provider payload.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS,
  normalizeTranscriptIdentity,
  parseOwnerTranscriptCsv,
} from "./reconcile-owner-approved-transcript-market-values.mjs";

const DEFAULT_API_BASE_URL = "https://api.sportmonks.com/v3/football";
const MAX_PAGES_PER_TEAM = 10;
const MAX_MEMBERS_PER_TEAM = 200;
const REQUEST_TIMEOUT_MS = 15_000;
const STAGING_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09");
const OWNER_CSV = resolve(STAGING_DIRECTORY, "owner-approved-market-values-2026-08-09.csv");
const ARCHIVE_DIRECTORY = resolve(STAGING_DIRECTORY, "provider-roster-audits");

export const SPORTMONKS_TWENTY_CLUB_SCOPE = Object.entries(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS)
  .map(([clubName, providerTeamId]) => ({
    clubName,
    providerTeamId,
    manualValueScope: clubName !== "Liverpool FC",
  }))
  .sort((left, right) => Number(left.providerTeamId) - Number(right.providerTeamId));

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

function relationEntity(value, key) {
  const relation = value?.[key];
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) return null;
  if (relation.data && typeof relation.data === "object" && !Array.isArray(relation.data)) return relation.data;
  return relation;
}

function providerError(code, detail) {
  return { code, ...(detail ? { detail } : {}) };
}

function asBoolean(value) {
  return value === true || text(value).toLowerCase() === "true" || text(value) === "1";
}

export function readSportmonksRosterReadConfig(environment = process.env) {
  if (text(environment.TOUCHLINE_SPORTMONKS_ROSTER_READ_MODE) !== "read-only") {
    throw new Error("TL_SPORTMONKS_ROSTER_READ_ONLY_MODE_REQUIRED");
  }
  const token = text(environment.SPORTMONKS_API_TOKEN);
  if (!token) throw new Error("TL_SPORTMONKS_ROSTER_TOKEN_REQUIRED");

  const configuredUrl = text(environment.SPORTMONKS_BASE_URL) || DEFAULT_API_BASE_URL;
  let baseUrl;
  try {
    baseUrl = new URL(configuredUrl);
  } catch {
    throw new Error("TL_SPORTMONKS_ROSTER_BASE_URL_INVALID");
  }
  if (
    baseUrl.protocol !== "https:"
    || baseUrl.hostname !== "api.sportmonks.com"
    || baseUrl.pathname.replace(/\/$/, "") !== "/v3/football"
  ) {
    throw new Error("TL_SPORTMONKS_ROSTER_BASE_URL_FORBIDDEN");
  }
  return { apiBaseUrl: baseUrl.toString().replace(/\/$/, ""), token };
}

export function projectSportmonksSquadMember(rawMember, scope) {
  const player = relationEntity(rawMember, "player") ?? rawMember?.player ?? null;
  const providerPlayerId = text(player?.id ?? rawMember?.player_id);
  const playerName = text(
    player?.display_name
    ?? player?.name
    ?? [text(player?.firstname), text(player?.lastname)].filter(Boolean).join(" "),
  );
  const position = relationEntity(rawMember, "detailedPosition")
    ?? relationEntity(rawMember, "position")
    ?? rawMember?.detailedPosition
    ?? rawMember?.position
    ?? null;

  if (!/^\d+$/.test(providerPlayerId)) {
    return { error: providerError("INVALID_PROVIDER_PLAYER_ID") };
  }
  if (!playerName) return { error: providerError("PLAYER_NAME_MISSING", providerPlayerId) };

  return {
    member: {
      providerTeamId: scope.providerTeamId,
      clubName: scope.clubName,
      providerPlayerId,
      playerName,
      jerseyNumber: Number.isInteger(Number(rawMember?.jersey_number))
        ? Number(rawMember.jersey_number)
        : null,
      position: text(position?.name) || null,
    },
  };
}

function nextPageFromEnvelope(envelope, expectedPage, observedPages) {
  const pagination = envelope?.pagination ?? envelope?.data?.pagination ?? null;
  if (!pagination || !asBoolean(pagination.has_more)) return null;
  const reportedPage = Number(pagination.current_page);
  if (!Number.isInteger(reportedPage) || reportedPage !== expectedPage || observedPages.has(reportedPage)) {
    return { error: providerError("PAGINATION_METADATA_INVALID") };
  }
  observedPages.add(reportedPage);
  return { nextPage: expectedPage + 1 };
}

export async function readSportmonksTeamRoster({
  scope,
  config,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
}) {
  const members = [];
  const errors = [];
  const observedPages = new Set();
  let page = 1;
  let fetchedAt = null;

  while (page <= MAX_PAGES_PER_TEAM && members.length < MAX_MEMBERS_PER_TEAM) {
    const requestUrl = new URL(`squads/teams/${encodeURIComponent(scope.providerTeamId)}`, `${config.apiBaseUrl}/`);
    requestUrl.searchParams.set("api_token", config.token);
    requestUrl.searchParams.set("include", "player;position;detailedPosition");
    requestUrl.searchParams.set("per_page", "50");
    requestUrl.searchParams.set("page", String(page));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetchImpl(requestUrl, { method: "GET", redirect: "error", signal: controller.signal });
    } catch {
      clearTimeout(timeout);
      errors.push(providerError("SPORTMONKS_REQUEST_FAILED"));
      break;
    }
    clearTimeout(timeout);
    if (!response.ok) {
      errors.push(providerError(`SPORTMONKS_HTTP_${response.status}`));
      break;
    }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      errors.push(providerError("SPORTMONKS_RESPONSE_INVALID"));
      break;
    }
    const pageRows = Array.isArray(envelope?.data) ? envelope.data : null;
    if (!pageRows) {
      errors.push(providerError("SPORTMONKS_SQUAD_DATA_INVALID"));
      break;
    }
    fetchedAt ??= now();
    for (const rawMember of pageRows) {
      const projected = projectSportmonksSquadMember(rawMember, scope);
      if (projected.error) errors.push(projected.error);
      else members.push(projected.member);
    }
    if (members.length > MAX_MEMBERS_PER_TEAM) {
      errors.push(providerError("SPORTMONKS_SQUAD_MEMBER_LIMIT_EXCEEDED"));
      break;
    }

    const next = nextPageFromEnvelope(envelope, page, observedPages);
    if (!next) break;
    if (next.error) {
      errors.push(next.error);
      break;
    }
    page = next.nextPage;
  }

  if (page > MAX_PAGES_PER_TEAM) errors.push(providerError("SPORTMONKS_SQUAD_PAGE_LIMIT_EXCEEDED"));
  if (members.length === 0) errors.push(providerError("SPORTMONKS_SQUAD_EMPTY"));

  return {
    providerTeamId: scope.providerTeamId,
    clubName: scope.clubName,
    manualValueScope: scope.manualValueScope,
    fetchedAt,
    members,
    errors,
    state: errors.length ? "partial" : "ready",
  };
}

export function buildSportmonksRosterSnapshot({ clubs, ownerRows, startedAt, completedAt }) {
  const memberOccurrences = new Map();
  for (const club of clubs) {
    for (const member of club.members) {
      memberOccurrences.set(member.providerPlayerId, [...(memberOccurrences.get(member.providerPlayerId) ?? []), member]);
    }
  }
  const duplicateProviderPlayerIds = [...memberOccurrences.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([providerPlayerId, entries]) => ({
      providerPlayerId,
      clubs: [...new Set(entries.map((entry) => entry.clubName))].sort(),
      providerTeamIds: [...new Set(entries.map((entry) => entry.providerTeamId))].sort((left, right) => Number(left) - Number(right)),
    }));

  const ownerRowsByKey = new Map();
  const providerMembersByKey = new Map();
  for (const row of ownerRows) {
    const clubName = text(row.club_name);
    const normalizedName = normalizeTranscriptIdentity(row.normalized_player_name ?? row.player_display_name);
    if (!clubName || !normalizedName) continue;
    const key = `${clubName}\u0000${normalizedName}`;
    ownerRowsByKey.set(key, [...(ownerRowsByKey.get(key) ?? []), row]);
  }
  for (const club of clubs) {
    if (!club.manualValueScope) continue;
    for (const member of club.members) {
      const key = `${club.clubName}\u0000${normalizeTranscriptIdentity(member.playerName)}`;
      providerMembersByKey.set(key, [...(providerMembersByKey.get(key) ?? []), member]);
    }
  }
  const pendingProviderOnly = [];
  const ownerOnlyReview = [];
  const ambiguousNameGroups = [];
  let exactNameMatches = 0;
  const ownerComparisonKeys = new Set([...ownerRowsByKey.keys(), ...providerMembersByKey.keys()]);
  for (const key of [...ownerComparisonKeys].sort()) {
    const ownerGroup = ownerRowsByKey.get(key) ?? [];
    const providerGroup = providerMembersByKey.get(key) ?? [];
    if (ownerGroup.length === 1 && providerGroup.length === 1) {
      exactNameMatches += 1;
      continue;
    }
    if (ownerGroup.length && providerGroup.length) {
      ambiguousNameGroups.push({
        clubName: providerGroup[0]?.clubName ?? text(ownerGroup[0]?.club_name),
        normalizedPlayerName: key.split("\u0000")[1],
        ownerRows: ownerGroup.length,
        providerRows: providerGroup.length,
        reconciliationState: "AMBIGUOUS_NAME_REVIEW_PENDING",
        applicationEligible: false,
      });
      continue;
    }
    if (providerGroup.length) {
      for (const member of providerGroup) {
        pendingProviderOnly.push({
          providerTeamId: member.providerTeamId,
          clubName: member.clubName,
          providerPlayerId: member.providerPlayerId,
          playerName: member.playerName,
          reconciliationState: "PROVIDER_ONLY_REVIEW_PENDING",
          manualValueState: "PENDING",
          marketValueEur: null,
          applicationEligible: false,
        });
      }
      continue;
    }
    for (const row of ownerGroup) {
      ownerOnlyReview.push({
        clubName: text(row.club_name),
        playerName: text(row.player_display_name),
        sourceRowSha256: text(row.source_row_sha256),
        reconciliationState: "OWNER_ONLY_REVIEW_PENDING",
        manualValueState: text(row.market_value_eur) ? "REVIEW" : "PENDING",
        marketValueEur: null,
        applicationEligible: false,
      });
    }
  }
  const clubStates = clubs.map((club) => ({
    providerTeamId: club.providerTeamId,
    clubName: club.clubName,
    manualValueScope: club.manualValueScope,
    state: club.state,
    memberCount: club.members.length,
    errors: club.errors,
  }));
  const allReady = clubStates.length === SPORTMONKS_TWENTY_CLUB_SCOPE.length
    && clubStates.every((club) => club.state === "ready")
    && duplicateProviderPlayerIds.length === 0;
  const document = {
    schemaVersion: "touchline-sportmonks-roster-snapshot-v1",
    startedAt,
    completedAt,
    source: {
      provider: "sportmonks",
      readMode: "direct-get-only",
      scope: {
        competitionProviderId: "8",
        providerTeamIds: SPORTMONKS_TWENTY_CLUB_SCOPE.map((club) => club.providerTeamId),
      },
      containsRawPayload: false,
      containsRequestUrls: false,
      containsCredential: false,
    },
    clubs,
    validation: {
      state: allReady ? "ready" : "partial",
      clubStates,
      duplicateProviderPlayerIds,
      pendingProviderOnly,
      ownerOnlyReview,
      ambiguousNameGroups,
      exactNameMatches,
      counts: {
        expectedClubs: SPORTMONKS_TWENTY_CLUB_SCOPE.length,
        readyClubs: clubStates.filter((club) => club.state === "ready").length,
        partialClubs: clubStates.filter((club) => club.state !== "ready").length,
        members: clubs.reduce((total, club) => total + club.members.length, 0),
        duplicateProviderPlayerIds: duplicateProviderPlayerIds.length,
        exactNameMatches,
        pendingProviderOnly: pendingProviderOnly.length,
        ownerOnlyReview: ownerOnlyReview.length,
        ambiguousNameGroups: ambiguousNameGroups.length,
      },
    },
  };
  return {
    ...document,
    source: {
      ...document.source,
      sourceRevision: sha256(stableStringify(document)),
    },
  };
}

function parseArgs(args) {
  if (args.length !== 1 || !["--check", "--write-new"].includes(args[0])) {
    throw new Error("TL_SPORTMONKS_ROSTER_CHECK_OR_WRITE_NEW_REQUIRED");
  }
  return { check: args[0] === "--check", writeNew: args[0] === "--write-new" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readSportmonksRosterReadConfig();
  if (args.check) {
    process.stdout.write(`${JSON.stringify({ configured: true, mode: "read-only", expectedClubs: SPORTMONKS_TWENTY_CLUB_SCOPE.length })}\n`);
    return;
  }

  const ownerRows = parseOwnerTranscriptCsv(await readFile(OWNER_CSV, "utf8"));
  const startedAt = new Date().toISOString();
  const clubs = [];
  for (const scope of SPORTMONKS_TWENTY_CLUB_SCOPE) {
    clubs.push(await readSportmonksTeamRoster({ scope, config }));
  }
  const completedAt = new Date().toISOString();
  const snapshot = buildSportmonksRosterSnapshot({ clubs, ownerRows, startedAt, completedAt });
  const output = resolve(ARCHIVE_DIRECTORY, timestampDirectory(startedAt), "sportmonks-roster-snapshot.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    output,
    sourceRevision: snapshot.source.sourceRevision,
    state: snapshot.validation.state,
    counts: snapshot.validation.counts,
  })}\n`);
  if (snapshot.validation.state !== "ready") process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_SPORTMONKS_ROSTER_UNEXPECTED_FAILURE"}\n`);
    process.exitCode = 1;
  });
}

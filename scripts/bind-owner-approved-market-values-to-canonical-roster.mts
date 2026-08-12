#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  bindOwnerApprovedMarketValueCandidate,
  type OwnerApprovedMarketValueApplicationCandidate,
  type TouchlineCanonicalMarketValueBinding,
} from "../lib/touchlineArena/owner-approved-market-value-binding.ts";

const ARCHIVE_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits");

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isNewArchivePath(path: string) {
  const relativePath = relative(ARCHIVE_DIRECTORY, path);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${process.platform === "win32" ? "\\" : "/"}`);
}

type CanonicalRoster = Readonly<{
  schemaVersion: string;
  source?: Readonly<{ sourceRevision?: string }>;
  audit?: Readonly<{ state?: string }>;
  competitions?: readonly Record<string, unknown>[];
  clubs?: readonly Record<string, unknown>[];
  players?: readonly Record<string, unknown>[];
  memberships?: readonly Record<string, unknown>[];
}>;

/** Exact provider IDs only; no player-name matching is performed in this binding. */
export function canonicalBindingsForCandidate(
  roster: CanonicalRoster,
  candidate: OwnerApprovedMarketValueApplicationCandidate,
): readonly TouchlineCanonicalMarketValueBinding[] {
  if (roster.schemaVersion !== "touchline-canonical-roster-export-v1" || roster.audit?.state !== "ready") {
    throw new Error("TL_CANONICAL_ROSTER_NOT_READY");
  }
  const competition = (roster.competitions ?? []).find((item) => text(item.provider) === "sportmonks" && text(item.provider_competition_id) === "8");
  if (!competition) throw new Error("TL_CANONICAL_COMPETITION_8_MISSING");
  const clubsById = new Map((roster.clubs ?? []).map((club) => [text(club.id), club]));
  const playersById = new Map((roster.players ?? []).map((player) => [text(player.id), player]));
  const targetPairs = new Set(candidate.rows
    .filter((row) => row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING")
    .map((row) => `${text(row.provider_team_id)}\u0000${text(row.provider_player_id)}`));
  const bindings: TouchlineCanonicalMarketValueBinding[] = [];
  for (const membership of roster.memberships ?? []) {
    if (text(membership.provider) !== "sportmonks" || text(membership.status) !== "active" || text(membership.competition_id) !== text(competition.id)) continue;
    const player = playersById.get(text(membership.player_id));
    const club = clubsById.get(text(membership.club_id));
    const pair = `${text(club?.provider_team_id)}\u0000${text(player?.provider_player_id)}`;
    if (!targetPairs.has(pair)) continue;
    bindings.push(Object.freeze({
      providerPlayerId: text(player?.provider_player_id),
      providerTeamId: text(club?.provider_team_id),
      canonicalPlayerId: text(player?.id),
      canonicalClubId: text(club?.id),
      canonicalMembershipId: text(membership.id),
      canonicalCompetitionId: text(competition.id),
      playerSourceUpdatedAt: text(player?.source_updated_at),
      clubSourceUpdatedAt: text(club?.source_updated_at),
      membershipSourceUpdatedAt: text(membership.source_updated_at),
      competitionSourceUpdatedAt: text(competition.source_updated_at),
    }));
  }
  return Object.freeze(bindings);
}

function parseArgs(args: readonly string[]) {
  const result: { candidate: string | null; roster: string | null; output: string | null; writeNew: boolean } = { candidate: null, roster: null, output: null, writeNew: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write-new") result.writeNew = true;
    else if (argument === "--candidate" || argument === "--roster" || argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`TL_OWNER_VALUE_BINDING_${argument.slice(2).toUpperCase()}_REQUIRED`);
      result[argument.slice(2) as "candidate" | "roster" | "output"] = resolve(value);
      index += 1;
    } else throw new Error(`TL_OWNER_VALUE_BINDING_UNKNOWN_ARGUMENT:${argument}`);
  }
  if (!result.writeNew || !result.candidate || !result.roster || !result.output) throw new Error("TL_OWNER_VALUE_BINDING_WRITE_NEW_AND_INPUTS_REQUIRED");
  if (!isNewArchivePath(result.output)) throw new Error("TL_OWNER_VALUE_BINDING_OUTPUT_OUTSIDE_VERSIONED_ARCHIVE_FORBIDDEN");
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [candidateText, rosterText] = await Promise.all([readFile(args.candidate!, "utf8"), readFile(args.roster!, "utf8")]);
  const candidate = JSON.parse(candidateText) as OwnerApprovedMarketValueApplicationCandidate;
  const roster = JSON.parse(rosterText) as CanonicalRoster;
  const bindings = canonicalBindingsForCandidate(roster, candidate);
  const manifest = bindOwnerApprovedMarketValueCandidate({
    candidate,
    canonicalBindings: bindings,
    canonicalReadRevisionSha256: text(roster.source?.sourceRevision),
  });
  const output = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    canonicalRoster: {
      sourceRevisionSha256: text(roster.source?.sourceRevision),
      archiveSha256: sha256(rosterText),
      auditState: text(roster.audit?.state),
    },
    sourceCandidateSha256: sha256(candidateText),
    note: "Local review-only canonical binding. It is not an import payload and does not authorize a database write.",
  };
  await writeFile(args.output!, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    output: args.output,
    status: manifest.status,
    applicationEligible: manifest.applicationEligible,
    counts: manifest.counts,
    excluded: manifest.excluded,
    issues: manifest.issues.length,
  }, null, 2)}\n`);
  if (manifest.status !== "review-required") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_OWNER_VALUE_BINDING_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}

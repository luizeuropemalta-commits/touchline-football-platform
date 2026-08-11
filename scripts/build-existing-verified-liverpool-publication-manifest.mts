#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { prepareTouchlineManualMarketValueEditorialDecision } from "../lib/touchlineArena/manual-market-value-editorial.ts";

const ARCHIVE_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits");
const EXPECTED_TEAM_ID = "8";
const EXPECTED_ROWS = 29;

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function isUuid(value: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Row).sort().map((key) => [key, stable((value as Row)[key])]));
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value)), "utf8").digest("hex");
}

function underArchive(path: string) {
  const value = relative(ARCHIVE_DIRECTORY, path);
  return Boolean(value) && !value.startsWith("..") && !value.includes(`..${process.platform === "win32" ? "\\" : "/"}`);
}

export function buildExistingVerifiedLiverpoolPublicationManifest(input: Readonly<{
  rows: readonly Row[];
  sourceRowsSha256: string;
}>) {
  if (!/^[0-9a-f]{64}$/.test(input.sourceRowsSha256) || input.rows.length !== EXPECTED_ROWS) {
    throw new Error("TL_LIVERPOOL_PUBLICATION_SOURCE_INVALID");
  }

  const playerIds = new Set<string>();
  const membershipIds = new Set<string>();
  const providerIds = new Set<string>();
  const rows = input.rows.map((row) => {
    const playerId = text(row.player_id);
    const clubId = text(row.club_id);
    const membershipId = text(row.membership_id);
    const competitionId = text(row.competition_id);
    const providerTeamId = text(row.provider_team_id);
    const providerPlayerId = text(row.provider_player_id);
    const marketValueEur = integer(row.market_value_eur);
    const effectiveSeason = text(row.verified_season);
    const lastReviewedAt = text(row.last_verified);
    const status = text(row.status);
    const confidence = text(row.confidence);
    const source = text(row.value_source);
    const sourceUpdatedAt = {
      player: text(row.player_source_updated_at),
      club: text(row.club_source_updated_at),
      membership: text(row.membership_source_updated_at),
      competition: text(row.competition_source_updated_at),
    };
    if (
      !isUuid(playerId) || !isUuid(clubId) || !isUuid(membershipId) || !isUuid(competitionId)
      || providerTeamId !== EXPECTED_TEAM_ID || !providerPlayerId || !/^\d+$/.test(providerPlayerId)
      || marketValueEur === null || marketValueEur < 0 || !effectiveSeason || !lastReviewedAt
      || status !== "verified" || confidence !== "verified" || source !== "manual_approval"
      || !sourceUpdatedAt.player || !sourceUpdatedAt.club || !sourceUpdatedAt.membership || !sourceUpdatedAt.competition
      || playerIds.has(playerId) || membershipIds.has(membershipId) || providerIds.has(providerPlayerId)
    ) throw new Error("TL_LIVERPOOL_PUBLICATION_ROW_INVALID");
    playerIds.add(playerId);
    membershipIds.add(membershipId);
    providerIds.add(providerPlayerId);
    const decision = prepareTouchlineManualMarketValueEditorialDecision({
      playerId,
      effectiveSeason,
      marketValueEur,
      publicationState: "ready_to_publish",
      lastReviewedAt,
      internalSource: "existing-liverpool-manual-approval",
    });
    if (!decision) throw new Error("TL_LIVERPOOL_PUBLICATION_CLASSIFICATION_INVALID");
    return Object.freeze({
      rowIdempotencyKeySha256: sha256({ playerId, membershipId, providerPlayerId, marketValueEur, effectiveSeason, lastReviewedAt }),
      canonicalPlayerId: playerId,
      canonicalClubId: clubId,
      canonicalMembershipId: membershipId,
      canonicalCompetitionId: competitionId,
      providerTeamId,
      providerPlayerId,
      sourceUpdatedAt,
      manualMarketValueEur: marketValueEur,
      currency: "EUR" as const,
      calculatedTier: decision.classification.tierKey,
      canonicalNominalPriceGbp: decision.classification.nominalPrice,
      policyVersion: decision.classification.policyVersion,
      effectiveSeason,
      lastReviewedAt,
      publicationAction: "ready_to_publish" as const,
      applicationEligible: false,
    });
  }).sort((left, right) => left.providerPlayerId.localeCompare(right.providerPlayerId, "en", { numeric: true }));

  const withoutFingerprint = {
    schemaVersion: "touchline-existing-verified-liverpool-publication-manifest-v1" as const,
    status: "review-required" as const,
    applicationEligible: false as const,
    execution: "dry-run-only" as const,
    source: { providerTeamId: EXPECTED_TEAM_ID, sourceRowsSha256: input.sourceRowsSha256 },
    counts: { readyRows: rows.length, excludedRows: 0 },
    rows,
    note: "Existing verified Liverpool values only. This is a review manifest, never a sequential importer payload.",
  };
  return Object.freeze({ ...withoutFingerprint, manifestFingerprintSha256: sha256(withoutFingerprint) });
}

function parseArgs(args: readonly string[]) {
  const parsed: { input: string | null; output: string | null; writeNew: boolean } = { input: null, output: null, writeNew: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write-new") parsed.writeNew = true;
    else if (argument === "--input" || argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`TL_LIVERPOOL_PUBLICATION_${argument.slice(2).toUpperCase()}_REQUIRED`);
      parsed[argument.slice(2) as "input" | "output"] = resolve(value);
      index += 1;
    } else throw new Error(`TL_LIVERPOOL_PUBLICATION_UNKNOWN_ARGUMENT:${argument}`);
  }
  if (!parsed.writeNew || !parsed.input || !parsed.output || !underArchive(parsed.output)) throw new Error("TL_LIVERPOOL_PUBLICATION_WRITE_NEW_REQUIRED");
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = JSON.parse(await readFile(args.input!, "utf8")) as { rows?: Row[]; rowsSha256?: string };
  const manifest = buildExistingVerifiedLiverpoolPublicationManifest({ rows: source.rows ?? [], sourceRowsSha256: source.rowsSha256 ?? "" });
  await writeFile(args.output!, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ count: manifest.counts.readyRows, manifestFingerprintSha256: manifest.manifestFingerprintSha256, output: args.output }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_LIVERPOOL_PUBLICATION_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}

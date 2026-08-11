#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { prepareTouchlineManualMarketValueEditorialDecision } from "../lib/touchlineArena/manual-market-value-editorial.ts";
import {
  planOwnerApprovedMarketValueApplication,
  type OwnerApprovedMarketValueApplicationPlan,
} from "../lib/touchlineArena/owner-approved-market-value-application-plan.ts";
import type { OwnerApprovedMarketValueBindingManifest } from "../lib/touchlineArena/owner-approved-market-value-binding.ts";

const ARCHIVE_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits");
const EFFECTIVE_SEASON = "2026/27";
const REVIEWED_AT = "2026-08-09T19:25:39.089Z";
const PUBLICATION_ACTION = "ready_to_publish" as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stableValue((value as Record<string, unknown>)[key])]));
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value)), "utf8").digest("hex");
}

function isNewArchivePath(path: string) {
  const relativePath = relative(ARCHIVE_DIRECTORY, path);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${process.platform === "win32" ? "\\" : "/"}`);
}

/** Pure deterministic 533-row publication/backfill hand-off; it cannot write a database. */
export function buildOwnerApprovedCardPublicationManifest(
  plan: OwnerApprovedMarketValueApplicationPlan,
  input: Readonly<{ effectiveSeason?: string; reviewedAt?: string }> = {},
) {
  const effectiveSeason = input.effectiveSeason ?? EFFECTIVE_SEASON;
  const reviewedAt = input.reviewedAt ?? REVIEWED_AT;
  if (plan.status !== "review-required" || plan.applicationEligible || plan.execution !== "dry-run-only" || plan.counts.plannedValueRows !== 533 || plan.issues.length) {
    throw new Error("TL_OWNER_PUBLICATION_MANIFEST_PLAN_NOT_READY");
  }
  const rows = plan.rows.map((row) => {
    const decision = prepareTouchlineManualMarketValueEditorialDecision({
      playerId: row.canonicalPlayerId,
      effectiveSeason,
      marketValueEur: row.marketValueEur,
      publicationState: PUBLICATION_ACTION,
      lastReviewedAt: reviewedAt,
      internalSource: "owner-approved-2026-08-09",
    });
    if (!decision) throw new Error("TL_OWNER_PUBLICATION_MANIFEST_CLASSIFICATION_FAILED");
    return Object.freeze({
      rowIdempotencyKeySha256: row.rowIdempotencyKeySha256,
      sourceRowSha256: row.sourceRowSha256,
      canonicalPlayerId: row.canonicalPlayerId,
      canonicalClubId: row.canonicalClubId,
      canonicalMembershipId: row.canonicalMembershipId,
      canonicalCompetitionId: row.canonicalCompetitionId,
      providerTeamId: row.providerTeamId,
      providerPlayerId: row.providerPlayerId,
      sourceUpdatedAt: row.sourceUpdatedAt,
      manualMarketValueEur: row.marketValueEur,
      currency: "EUR" as const,
      calculatedTier: decision.classification.tierKey,
      canonicalNominalPriceGbp: decision.classification.nominalPrice,
      policyVersion: decision.classification.policyVersion,
      effectiveSeason,
      lastReviewedAt: reviewedAt,
      publicationAction: PUBLICATION_ACTION,
      applicationEligible: false,
    });
  });
  const manifestWithoutFingerprint = {
    schemaVersion: "touchline-owner-approved-card-publication-manifest-v1" as const,
    status: "review-required" as const,
    applicationEligible: false as const,
    execution: "dry-run-only" as const,
    source: {
      candidateId: plan.source.candidateId,
      candidateFingerprintSha256: plan.source.candidateFingerprintSha256,
      canonicalReadRevisionSha256: plan.source.canonicalReadRevisionSha256,
      applicationPlanFingerprintSha256: plan.source.applicationPlanFingerprintSha256,
    },
    excluded: plan.excluded,
    counts: { readyRows: rows.length, excludedRows: plan.excluded.pendingValueMissing + plan.excluded.providerOnlyPending + plan.excluded.ownerOnlyReview },
    rows,
    note: "Deterministic review-only manifest. It must not be submitted to a generic sequential importer.",
  };
  return Object.freeze({ ...manifestWithoutFingerprint, manifestFingerprintSha256: fingerprint(manifestWithoutFingerprint) });
}

function parseArgs(args: readonly string[]) {
  const result: { binding: string | null; output: string | null; writeNew: boolean } = { binding: null, output: null, writeNew: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write-new") result.writeNew = true;
    else if (argument === "--binding" || argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`TL_OWNER_PUBLICATION_MANIFEST_${argument.slice(2).toUpperCase()}_REQUIRED`);
      result[argument.slice(2) as "binding" | "output"] = resolve(value);
      index += 1;
    } else throw new Error(`TL_OWNER_PUBLICATION_MANIFEST_UNKNOWN_ARGUMENT:${argument}`);
  }
  if (!result.writeNew || !result.binding || !result.output) throw new Error("TL_OWNER_PUBLICATION_MANIFEST_WRITE_NEW_AND_BINDING_REQUIRED");
  if (!isNewArchivePath(result.output)) throw new Error("TL_OWNER_PUBLICATION_MANIFEST_OUTPUT_OUTSIDE_VERSIONED_ARCHIVE_FORBIDDEN");
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const binding = JSON.parse(await readFile(args.binding!, "utf8")) as OwnerApprovedMarketValueBindingManifest;
  const plan = planOwnerApprovedMarketValueApplication(binding);
  const manifest = buildOwnerApprovedCardPublicationManifest(plan);
  await writeFile(args.output!, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ output: args.output, status: manifest.status, applicationEligible: manifest.applicationEligible, count: manifest.counts.readyRows, excluded: manifest.excluded, manifestFingerprintSha256: manifest.manifestFingerprintSha256 }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_OWNER_PUBLICATION_MANIFEST_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}

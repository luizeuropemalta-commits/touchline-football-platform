#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  OWNER_APPROVED_TRANSCRIPT_CLUBS,
  extractOwnerApprovedTranscriptBlock,
  rowsToCsv,
} from "./owner-approved-transcript-market-values.mjs";

const DEFAULT_SOURCE = "/Users/luizlopez/.codex/sessions/2026/08/08/rollout-2026-08-08T06-46-52-019fdfb2-003a-7fa0-aa05-6b268b203143.jsonl";
const OUTPUT_DIRECTORY = resolve("docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09");
const CSV_OUTPUT = resolve(OUTPUT_DIRECTORY, "owner-approved-market-values-2026-08-09.csv");
const MANIFEST_OUTPUT = resolve(OUTPUT_DIRECTORY, "owner-approved-market-values-2026-08-09.manifest.json");

const EXPECTED_BLOCKS = new Map([
  [8842, { rows: 29, explicit: 29, pending: 0, total: 1_406_500_000, messageSha256: "0f075ff1275c1ac0d9ac7a1617b573205e26787a813ff2c8a514deb36357b59b" }],
  [9508, { rows: 27, explicit: 27, pending: 0, total: 105_300_000, messageSha256: "3f42f535ca54ed77d9292d5f95f5d9409500f1be9b513d11586a8ed15af3b600" }],
  [9593, { rows: 41, explicit: 39, pending: 2, total: 1_406_700_000, messageSha256: "4073a60e9d9cf028769a4900d18e9c1d8a7410a0df134b3a09083a0919fb71ba" }],
  [9693, { rows: 33, explicit: 32, pending: 1, total: 565_400_000, messageSha256: "d5378869e43931d78b057784e44e2fa30d87b84479dc512698c8865e4b564b01" }],
  [9730, { rows: 31, explicit: 31, pending: 0, total: 572_875_000, messageSha256: "ff4aa002e0baa0dfdac5be4ed6eb9b8eb09833533bc222a5cf5ba599f503295b" }],
  [9758, { rows: 36, explicit: 36, pending: 0, total: 920_500_000, messageSha256: "a92cf7b254e058d5913ccbedc4f5adba801e1ef127d5cfabe0d22c77f5965238" }],
  [9777, { rows: 29, explicit: 29, pending: 0, total: 504_700_000, messageSha256: "5b843830c3ee3814def599fb55dcd9df1507048242479b2c221888ec2a046bae" }],
  [9812, { rows: 27, explicit: 27, pending: 0, total: 426_950_000, messageSha256: "0e072067e731abc521bbff5af9ed4ef7b1a30c7a9e7ef0d43b33d80a9c7545f8" }],
  [9841, { rows: 31, explicit: 31, pending: 0, total: 280_150_000, messageSha256: "29c9f6a0142dd5a8eb98f07c6595fdd27120e07455dc64564d0fbc1382220404" }],
  [9875, { rows: 30, explicit: 29, pending: 1, total: 874_300_000, messageSha256: "b7d130f0cb6c222f670d9963a6d4dedf046c5be7dc6cfef3f01073e7efd4c293" }],
  [9912, { rows: 27, explicit: 27, pending: 0, total: 536_000_000, messageSha256: "9663b25124073c953a148ed7aab2ae04959f47f9307ec1e9ab5b9c35626f8b45" }],
  [9922, { rows: 30, explicit: 30, pending: 0, total: 392_075_000, messageSha256: "802270783425d6a963b5b6886940ac2b2f7f8567f2ad45240d82f28dc598e427" }],
  [9972, { rows: 21, explicit: 21, pending: 0, total: 328_800_000, messageSha256: "7453f9eac3fb3984cb19239464f6b975276668b30ab186753ff26de3d929df90" }],
  [10062, { rows: 31, explicit: 31, pending: 0, total: 1_470_300_000, messageSha256: "7ba4346b3794d8730d5f91e822a450a3f0efc3b0ae7a26cf714296d6cced0d0a" }],
  [10078, { rows: 30, explicit: 30, pending: 0, total: 619_500_000, messageSha256: "0df60974fee2c4be449717fbd2363079651b1a35c2b383ff3cf539e9e986a004" }],
  [10088, { rows: 27, explicit: 27, pending: 0, total: 236_850_000, messageSha256: "4e55da757a298c19c89b1cf144b7f8c8e8d1970a69530f57e6d120af0998fe05" }],
  [10104, { rows: 26, explicit: 25, pending: 1, total: 567_800_000, messageSha256: "eb07eba8420545d10f7a61f291b6514e73aa5fb8d1d4bf18166f6ee9284d061f" }],
  [10139, { rows: 24, explicit: 24, pending: 0, total: 459_100_000, messageSha256: "ce70612a611ffb5af53fa47b1a3012f6a64ea27d5d95d9054b21ba627d5c45b5" }],
  [10176, { rows: 28, explicit: 28, pending: 0, total: 517_800_000, messageSha256: "eba19c1d09bba3b9c9031a080344d5a76f70ee22809cf3f5cd97409ac9ff30d6" }],
]);

const EXPECTED_TIMESTAMPS = new Map([
  [8842, "2026-08-09T01:11:15.956Z"],
  [9508, "2026-08-09T01:40:26.203Z"],
  [9593, "2026-08-09T01:45:23.665Z"],
  [9693, "2026-08-09T01:51:23.236Z"],
  [9730, "2026-08-09T01:55:09.420Z"],
  [9758, "2026-08-09T01:56:47.435Z"],
  [9777, "2026-08-09T01:57:39.213Z"],
  [9812, "2026-08-09T01:59:28.301Z"],
  [9841, "2026-08-09T02:00:14.748Z"],
  [9875, "2026-08-09T02:01:18.735Z"],
  [9912, "2026-08-09T02:02:22.339Z"],
  [9922, "2026-08-09T02:03:12.161Z"],
  [9972, "2026-08-09T02:04:27.994Z"],
  [10062, "2026-08-09T02:06:48.787Z"],
  [10078, "2026-08-09T02:08:31.634Z"],
  [10088, "2026-08-09T02:09:26.735Z"],
  [10104, "2026-08-09T02:10:13.803Z"],
  [10139, "2026-08-09T02:12:19.882Z"],
  [10176, "2026-08-09T02:13:44.926Z"],
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseArgs(args) {
  const write = args.includes("--write");
  const source = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_SOURCE;
  if (args.some((arg) => arg !== "--write" && arg !== "--check" && arg !== source)) {
    throw new Error("TL_OWNER_TRANSCRIPT_UNKNOWN_ARGUMENT");
  }
  return { source, write };
}

function countBlock(rows) {
  const explicitRows = rows.filter((row) => row.market_value_eur !== "");
  return {
    rows: rows.length,
    explicit: explicitRows.length,
    pending: rows.length - explicitRows.length,
    total: explicitRows.reduce((sum, row) => sum + Number(row.market_value_eur), 0),
  };
}

function assertExpectedBlock({ clubName, line, timestamp, messageSha256, rows }) {
  const expected = EXPECTED_BLOCKS.get(line);
  if (!expected) throw new Error(`TL_OWNER_TRANSCRIPT_UNEXPECTED_LINE:${line}`);
  const actual = countBlock(rows);
  for (const key of ["rows", "explicit", "pending", "total"]) {
    if (actual[key] !== expected[key]) {
      throw new Error(`TL_OWNER_TRANSCRIPT_COUNT_MISMATCH:${clubName}:${key}:${actual[key]}:${expected[key]}`);
    }
  }
  if (messageSha256 !== expected.messageSha256) {
    throw new Error(`TL_OWNER_TRANSCRIPT_MESSAGE_HASH_MISMATCH:${clubName}`);
  }
  if (timestamp !== EXPECTED_TIMESTAMPS.get(line)) {
    throw new Error(`TL_OWNER_TRANSCRIPT_TIMESTAMP_MISMATCH:${clubName}`);
  }
  return actual;
}

function statusCounts(rows) {
  return Object.fromEntries([...new Set(rows.map((row) => row.review_status))]
    .sort()
    .map((status) => [status, rows.filter((row) => row.review_status === status).length]));
}

function buildManifest(source, sourceSelectionSha256, blocks, allRows) {
  const totals = countBlock(allRows);
  const applicationCandidateRows = allRows.filter((row) => row.club_name !== "Manchester City");
  return {
    schemaVersion: "owner-approved-transcript-market-values-v1",
    batchId: "owner-approved-2026-08-09-19-club-transcript-v1",
    source: {
      kind: "owner_approved_transcript",
      sourceFile: source,
      sourceSelectionSha256,
      parserVersion: "owner-transcript-eur-v1",
      ownerApprovedDateUtc: "2026-08-09",
      providerVerified: false,
      notes: "Values are owner-supplied transcript input. Do not attribute them to a provider or use transcript names as provider IDs.",
    },
    reconciliation: {
      rule: "name normalization may create a review candidate only; a future write requires reviewed canonical player UUID, provider player ID, canonical club identity and active membership evidence",
      canonicalIdentityReviewRequired: true,
      remoteApplicationAllowed: false,
      currentState: "local-staging-only",
    },
    supersededLegacyManchesterCityArtifact: {
      status: "superseded-by-owner-approved-transcript",
      legacyStagingPath: "docs/touchline-arena/audit/2026-08-07/premier-league-market-value-staging/manchester-city-2026-27-staging.csv",
      disposition: "removed after transcript staging validation; not present in this candidate",
      recovery: "any prior derivative checkpoint commit is historical only; never an input, comparison source, or application candidate",
      replacement: "Manchester City transcript rows in this manifest are the owner-approved City source and remain identity-review-only",
    },
    clubs: blocks.map((block) => ({
      clubName: block.clubName,
      sourceJsonlLine: block.line,
      ownerApprovalTimestampUtc: block.timestamp,
      sourceMessageSha256: block.messageSha256,
      ...countBlock(block.rows),
      reconciliationStatus: "review-provider-identity-required",
    })),
    totals: {
      allTranscriptRows: totals.rows,
      allTranscriptExplicitValues: totals.explicit,
      allTranscriptPendingValues: totals.pending,
      allTranscriptExplicitTotalEur: totals.total,
      nonCityRows: applicationCandidateRows.length,
      nonCityExplicitValues: countBlock(applicationCandidateRows).explicit,
      nonCityPendingValues: countBlock(applicationCandidateRows).pending,
      nonCityExplicitTotalEur: countBlock(applicationCandidateRows).total,
      canonicalIdentityMatched: 0,
      canonicalIdentityReviewRequired: allRows.length,
      reviewStatusCounts: statusCounts(allRows),
    },
  };
}

async function main() {
  const { source, write } = parseArgs(process.argv.slice(2));
  const raw = await readFile(source, "utf8");
  const lines = raw.split(/\n/);
  const sourceSelectionSha256 = sha256(OWNER_APPROVED_TRANSCRIPT_CLUBS.map(({ line }) => {
    const expected = EXPECTED_BLOCKS.get(line);
    return `${line}:${expected?.messageSha256 ?? ""}`;
  }).join("\n"));
  const blocks = OWNER_APPROVED_TRANSCRIPT_CLUBS.map(({ clubName, line }) => {
    const rawJsonLine = lines[line - 1];
    if (!rawJsonLine) throw new Error(`TL_OWNER_TRANSCRIPT_LINE_MISSING:${line}`);
    const block = extractOwnerApprovedTranscriptBlock({ clubName, line, rawJsonLine, sourceSelectionSha256 });
    assertExpectedBlock(block);
    return block;
  });
  const allRows = blocks.flatMap((block) => block.rows);
  const manifest = buildManifest(source, sourceSelectionSha256, blocks, allRows);

  if (manifest.totals.allTranscriptRows !== 558 || manifest.totals.allTranscriptExplicitValues !== 553 || manifest.totals.allTranscriptPendingValues !== 5 || manifest.totals.allTranscriptExplicitTotalEur !== 12_191_600_000) {
    throw new Error("TL_OWNER_TRANSCRIPT_TOTAL_MISMATCH");
  }

  if (write) {
    await mkdir(dirname(CSV_OUTPUT), { recursive: true });
    await writeFile(CSV_OUTPUT, rowsToCsv(allRows), "utf8");
    await writeFile(MANIFEST_OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify({
    sourceSelectionSha256,
    output: write ? { csv: CSV_OUTPUT, manifest: MANIFEST_OUTPUT } : null,
    totals: manifest.totals,
    clubs: manifest.clubs.map(({ clubName, rows, explicit, pending, total, reconciliationStatus }) => ({ clubName, rows, explicit, pending, total, reconciliationStatus })),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

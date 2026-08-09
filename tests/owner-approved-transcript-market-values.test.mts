import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collapseRepeatedDisplayName,
  extractOwnerApprovedTranscriptBlock,
  parseOwnerApprovedEuroValue,
} from "../scripts/owner-approved-transcript-market-values.mjs";

const artifactDirectory = new URL(
  "../docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/",
  import.meta.url,
);
const manifest = JSON.parse(readFileSync(new URL("owner-approved-market-values-2026-08-09.manifest.json", artifactDirectory), "utf8"));
const csv = readFileSync(new URL("owner-approved-market-values-2026-08-09.csv", artifactDirectory), "utf8").trim();
const parserSource = readFileSync(new URL("../scripts/owner-approved-transcript-market-values.mjs", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../scripts/build-owner-approved-transcript-staging.mjs", import.meta.url), "utf8");

function parseCsvRecord(record: string) {
  const cells: string[] = [];
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
  cells.push(cell);
  return cells;
}

function parseSimpleCsv(text: string) {
  const [header, ...records] = text.split(/\r?\n/);
  const columns = parseCsvRecord(header);
  return records.map((record) => Object.fromEntries(parseCsvRecord(record).map((value, index) => [columns[index], value])));
}

test("owner-approved transcript staging preserves the exact 19-block scope as local review only", () => {
  const rows = parseSimpleCsv(csv);
  assert.equal(manifest.batchId, "owner-approved-2026-08-09-19-club-transcript-v1");
  assert.equal(manifest.source.sourceSelectionSha256, "192692cf3a9cc303df1fd936a84b19e7e41e796f1cb0cf965f399ff08d319f94");
  assert.equal(manifest.clubs.length, 19);
  assert.deepEqual(manifest.totals, {
    allTranscriptRows: 558,
    allTranscriptExplicitValues: 553,
    allTranscriptPendingValues: 5,
    allTranscriptExplicitTotalEur: 12_191_600_000,
    nonCityRows: 527,
    nonCityExplicitValues: 522,
    nonCityPendingValues: 5,
    nonCityExplicitTotalEur: 10_721_300_000,
    canonicalIdentityMatched: 0,
    canonicalIdentityReviewRequired: 558,
    reviewStatusCounts: {
      PENDING_VALUE_MISSING: 5,
      REVIEW_PROVIDER_ID_MISSING: 553,
    },
  });
  assert.equal(rows.length, 558);
  assert.equal(rows.filter((row) => row.review_status === "PENDING_VALUE_MISSING").length, 5);
  assert.equal(rows.filter((row) => row.review_status === "REVIEW_PROVIDER_ID_MISSING").length, 553);
  assert.ok(rows.every((row) => row.canonical_player_id === "" && row.provider_player_id === ""));
  assert.ok(rows.every((row) => row.canonical_club_id === "" && row.provider_team_id === ""));
  assert.ok(rows.every((row) => row.valuation_date === ""));
  assert.ok(rows.every((row) => row.market_value_eur !== "0"));
  assert.equal(new Set(rows.map((row) => row.source_selection_sha256)).size, 1);

  const pending = rows
    .filter((row) => row.review_status === "PENDING_VALUE_MISSING")
    .map((row) => `${row.club_name}:${row.player_display_name}`)
    .sort();
  assert.deepEqual(pending, [
    "Brentford FC:Julian Eyestone",
    "Chelsea FC:Denner",
    "Chelsea FC:Mykhaylo Mudryk",
    "Manchester United:Dermot Mee",
    "Newcastle United:Leo Shahar",
  ]);
  assert.ok(rows.filter((row) => row.review_status === "PENDING_VALUE_MISSING").every((row) => (
    row.raw_market_value === "" && row.market_value_eur === "" && row.currency === ""
  )));
  assert.ok(rows.some((row) => row.player_display_name === "Illan Meslier" && row.normalized_player_name === "illan meslier"));
});

test("Manchester City transcript staging supersedes the legacy CSV without using its values", () => {
  assert.deepEqual(manifest.supersededLegacyManchesterCityArtifact, {
    status: "superseded-by-owner-approved-transcript",
    legacyStagingPath: "docs/touchline-arena/audit/2026-08-07/premier-league-market-value-staging/manchester-city-2026-27-staging.csv",
    disposition: "removed after transcript staging validation; not present in this candidate",
    recovery: "any prior derivative checkpoint commit is historical only; never an input, comparison source, or application candidate",
    replacement: "Manchester City transcript rows in this manifest are the owner-approved City source and remain identity-review-only",
  });
  assert.deepEqual(manifest.totals.reviewStatusCounts, {
    PENDING_VALUE_MISSING: 5,
    REVIEW_PROVIDER_ID_MISSING: 553,
  });
});

test("the parser accepts only explicit EUR values and hashes the user message rather than mutable JSONL framing", () => {
  assert.equal(parseOwnerApprovedEuroValue("€30.00m"), 30_000_000);
  assert.equal(parseOwnerApprovedEuroValue("28,00 M €"), 28_000_000);
  assert.equal(parseOwnerApprovedEuroValue("400 mil €"), 400_000);
  assert.equal(parseOwnerApprovedEuroValue("€500k"), 500_000);
  assert.equal(parseOwnerApprovedEuroValue("€0m"), 0);
  assert.equal(parseOwnerApprovedEuroValue("£10m"), null);
  assert.equal(collapseRepeatedDisplayName("Illan Meslier\tIllan Meslier"), "Illan Meslier");
  assert.equal(collapseRepeatedDisplayName("Gabriel Gabriel"), "Gabriel");
  assert.equal(collapseRepeatedDisplayName("Martin Ødegaard Martin Ødegaard"), "Martin Ødegaard");

  const message = [
    "context deliberately ignored",
    "## My request:",
    "Player One\tPlayer One",
    "Goalkeeper",
    "01/01/2000 (25)",
    "€1.50m",
    "Detailed squad",
    "not roster input",
  ].join("\n");
  const rawJsonLine = JSON.stringify({
    type: "event_msg",
    timestamp: "2026-08-09T00:00:00.000Z",
    payload: { type: "user_message", message },
  });
  const block = extractOwnerApprovedTranscriptBlock({
    clubName: "Arsenal FC",
    line: 1,
    rawJsonLine,
    sourceSelectionSha256: "selection",
  });
  assert.equal(block.rows.length, 1);
  assert.equal(block.rows[0].player_display_name, "Player One");
  assert.equal(block.rows[0].market_value_eur, 1_500_000);
  assert.equal(block.messageSha256, createHash("sha256").update(message, "utf8").digest("hex"));
  assert.notEqual(block.messageSha256, createHash("sha256").update(rawJsonLine, "utf8").digest("hex"));
});

test("staging tooling has no provider, database, or remote application path", () => {
  for (const source of [parserSource, generatorSource]) {
    assert.doesNotMatch(source, /createFootballDataProvider|supabase|createClient|fetch\s*\(|process\.env|insert into|update public\.|delete from/i);
  }
  assert.match(generatorSource, /--write/);
  assert.match(generatorSource, /sourceSelectionSha256/);
});

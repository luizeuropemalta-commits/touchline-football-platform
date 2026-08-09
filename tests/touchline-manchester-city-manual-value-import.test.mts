import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/051_touchline_manchester_city_manual_market_values_2026_08_09.sql", import.meta.url),
  "utf8",
);
const manifest = readFileSync(
  new URL("../docs/touchline-arena/market-values/manual-2026-27/manchester-city-owner-authorized-staging.csv", import.meta.url),
  "utf8",
);

type ManifestRow = {
  clubName: string;
  playerId: string;
  playerName: string;
  marketValueEur: string;
  valuationDate: string;
  status: string;
  sourceArtifactDate: string;
  externalPlayerId: string;
  sourceUrl: string;
  identityReviewState: string;
};

function parseManifest(): ManifestRow[] {
  return manifest.trim().split(/\r?\n/).slice(1).map((line) => {
    const [
      clubName,
      playerId,
      playerName,
      marketValueEur,
      valuationDate,
      status,
      sourceArtifactDate,
      externalPlayerId,
      sourceUrl,
      identityReviewState,
    ] = line.split(",");
    return {
      clubName,
      playerId,
      playerName,
      marketValueEur,
      valuationDate,
      status,
      sourceArtifactDate,
      externalPlayerId,
      sourceUrl,
      identityReviewState,
    };
  });
}

function parseMigrationSeed() {
  return [...migration.matchAll(
    /\('([0-9a-f-]{36})'::uuid, '([^']+)', (null|\d+), (null|'EUR'), '(verified|pending)', (null|'[^']+'), date '2026-08-07'\)/g,
  )].map((match) => ({
    playerId: match[1],
    externalPlayerId: match[2],
    marketValueEur: match[3] === "null" ? "" : match[3],
    currency: match[4] === "null" ? "" : match[4].replaceAll("'", ""),
    status: match[5],
    sourceUrl: match[6] === "null" ? "" : match[6].slice(1, -1),
  }));
}

test("Manchester City staging manifest preserves only supplied facts and one explicit pending row", () => {
  const rows = parseManifest();
  assert.equal(rows.length, 32);
  assert.equal(new Set(rows.map((row) => row.playerId)).size, 32);
  assert.equal(rows.filter((row) => row.status === "verified").length, 31);
  assert.equal(rows.filter((row) => row.status === "pending").length, 1);
  assert.equal(rows.filter((row) => row.marketValueEur === "").length, 1);
  assert.equal(rows.filter((row) => row.marketValueEur !== "").reduce((sum, row) => sum + Number(row.marketValueEur), 0), 1_312_900_000);

  for (const row of rows) {
    assert.equal(row.clubName, "Manchester City");
    assert.equal(row.playerName, "", "player names must not be inferred from UUIDs");
    assert.equal(row.valuationDate, "", "artifact provenance must not become a valuation date");
    assert.equal(row.sourceArtifactDate, "2026-08-07");
    assert.equal(row.identityReviewState, "awaiting_database_identity_guard");
  }

  assert.deepEqual(
    rows.find((row) => row.playerId === "b5d80b41-b77c-4459-9dc3-5d56d35e3e86"),
    {
      clubName: "Manchester City",
      playerId: "b5d80b41-b77c-4459-9dc3-5d56d35e3e86",
      playerName: "",
      marketValueEur: "",
      valuationDate: "",
      status: "pending",
      sourceArtifactDate: "2026-08-07",
      externalPlayerId: "37689559",
      sourceUrl: "",
      identityReviewState: "awaiting_database_identity_guard",
    },
  );
});

test("the local migration is an exact UUID-keyed transcription of the staging manifest", () => {
  const manifestRows = parseManifest();
  const migrationRows = parseMigrationSeed();
  assert.equal(migrationRows.length, 32);
  assert.equal(new Set(migrationRows.map((row) => row.playerId)).size, 32);

  const migrationByPlayerId = new Map(migrationRows.map((row) => [row.playerId, row]));
  for (const manifestRow of manifestRows) {
    const migrationRow = migrationByPlayerId.get(manifestRow.playerId);
    assert.ok(migrationRow, `missing UUID ${manifestRow.playerId} from migration seed`);
    assert.equal(migrationRow.externalPlayerId, manifestRow.externalPlayerId);
    assert.equal(migrationRow.marketValueEur, manifestRow.marketValueEur);
    assert.equal(migrationRow.status, manifestRow.status);
    assert.equal(migrationRow.sourceUrl, manifestRow.sourceUrl);
    assert.equal(migrationRow.currency, manifestRow.status === "verified" ? "EUR" : "");
  }
});

test("the migration fails closed on current Manchester City identity and active-membership mismatch", () => {
  assert.match(migration, /on player\.id = seed\.player_id/);
  assert.match(migration, /membership\.status = 'active'/);
  assert.match(migration, /club\.name = 'Manchester City'/);
  assert.match(migration, /club\.provider_team_id = '9'/);
  assert.match(migration, /resolved_count <> expected_count/);
  assert.match(migration, /resolved_club_count <> 1/);
  assert.match(migration, /verified_count <> 31/);
  assert.match(migration, /pending_count <> 1/);
  assert.match(migration, /TL_MANCHESTER_CITY_MANUAL_VALUE_IDENTITY_OR_COUNT_MISMATCH/);
  assert.doesNotMatch(migration, /on player\.name\s*=/);
});

test("only verified values update the canonical value/history records; pending is import-audit only", () => {
  const currentValueInsert = migration.slice(
    migration.indexOf("insert into public.football_player_market_values"),
    migration.indexOf("insert into public.football_player_market_value_history"),
  );
  const historyInsert = migration.slice(
    migration.indexOf("insert into public.football_player_market_value_history"),
    migration.indexOf("insert into public.football_market_value_import_items"),
  );
  const importItemsInsert = migration.slice(
    migration.indexOf("insert into public.football_market_value_import_items"),
    migration.indexOf("update public.football_market_value_import_runs"),
  );

  assert.match(currentValueInsert, /where resolved\.import_status = 'verified'/);
  assert.match(historyInsert, /where resolved\.import_status = 'verified'/);
  assert.match(importItemsInsert, /else 'pending' end/);
  assert.match(importItemsInsert, /TL_OWNER_VALUE_MISSING/);
  assert.doesNotMatch(currentValueInsert, /b5d80b41-b77c-4459-9dc3-5d56d35e3e86/);
  assert.doesNotMatch(historyInsert, /b5d80b41-b77c-4459-9dc3-5d56d35e3e86/);
});

test("the City import cannot alter card economics, contracts, rosters or source-provider identity", () => {
  for (const forbiddenWrite of [
    /update public\.touchline_card_inventory/i,
    /update public\.touchline_card_contracts/i,
    /update public\.touchline_card_price_catalog/i,
    /insert into public\.touchline_card_contracts/i,
    /delete from public\.touchline_card_contracts/i,
    /update public\.football_players/i,
    /update public\.football_clubs/i,
    /update public\.football_squad_members/i,
    /competition_tier/i,
    /price_table_version/i,
    /transfermarkt_player_id/i,
    /transfermarkt_url/i,
  ]) {
    assert.doesNotMatch(migration, forbiddenWrite);
  }
  assert.match(migration, /^begin;/m);
  assert.match(migration, /\ncommit;\s*$/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/033_touchline_player_market_value_tiers.sql", import.meta.url),
  "utf8",
);
const checkoutGuardMigration = readFileSync(
  new URL("../supabase/migrations/034_touchline_market_requires_verified_value.sql", import.meta.url),
  "utf8",
);

test("market value persistence uses the approved immutable policy version", () => {
  assert.match(migration, /2026-07-premier-v1/g);
  for (const boundary of [
    "5999999",
    "6000000",
    "9999999",
    "10000000",
    "19999999",
    "20000000",
    "34999999",
    "35000000",
    "49999999",
    "50000000",
    "69999999",
    "70000000",
  ]) {
    assert.match(migration, new RegExp(boundary));
  }
});

test("invalid or non-EUR provider values never become a free card", () => {
  assert.match(migration, /player_row\.market_value is null/);
  assert.match(migration, /player_row\.market_value < 0/);
  assert.match(migration, /market_value_currency[\s\S]*<> 'EUR'/);
  assert.match(migration, /return 0;/);
});

test("current inventory changes without rewriting contracts, orders or supply", () => {
  assert.match(migration, /update public\.touchline_card_inventory/);
  assert.doesNotMatch(migration, /update public\.touchline_card_contracts/);
  assert.doesNotMatch(migration, /update public\.touchline_market_order_items/);
  assert.doesNotMatch(migration, /update public\.touchline_market_orders/);
  assert.doesNotMatch(migration, /set[\s\S]{0,180}supply_limit\s*=/);
  assert.match(migration, /previous_market_value_eur = inventory_row\.market_value_eur/);
  assert.match(migration, /previous_tier_key[\s\S]*inventory_row\.competition_tier/);
});

test("provider updates and newly-created inventory both trigger synchronization", () => {
  assert.match(migration, /after insert or update of market_value, market_value_currency, source_updated_at/);
  assert.match(migration, /after insert on public\.touchline_card_inventory/);
  assert.match(migration, /sync_touchline_inventory_market_value\(new\.id\)/);
  assert.match(migration, /sync_touchline_inventory_market_value\(new\.player_id\)/);
});

test("the market read model exposes economic data separately from TL Points", () => {
  for (const field of [
    "marketValueEur",
    "previousMarketValueEur",
    "marketValueChangeEur",
    "marketValueUpdatedAt",
    "marketValueSource",
  ]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  assert.doesNotMatch(migration, /'touchlinePoints',\s*inventory\.market_value_eur/);
});

test("new contracts fail closed until market value provenance is verified", () => {
  assert.match(checkoutGuardMigration, /before insert on public\.touchline_market_order_items/);
  assert.match(checkoutGuardMigration, /inventory\.market_value_eur is null/);
  assert.match(checkoutGuardMigration, /inventory\.market_value_updated_at is null/);
  assert.match(checkoutGuardMigration, /market_value_source/);
  assert.match(checkoutGuardMigration, /TL_MARKET_VALUE_PENDING/);
  assert.match(checkoutGuardMigration, /TL_MARKET_CURRENT_ECONOMY_MISMATCH/);
  assert.doesNotMatch(checkoutGuardMigration, /update public\.touchline_card_contracts/);
  assert.doesNotMatch(checkoutGuardMigration, /delete from public\.touchline_card_contracts/);
});

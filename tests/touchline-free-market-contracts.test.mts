import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/032_touchline_free_market_contracts.sql", import.meta.url),
  "utf8",
);

test("applies the schema change atomically with a bounded lock wait", () => {
  assert.match(migration, /begin;[\s\S]*set local lock_timeout = '5s';/);
  assert.match(migration, /commit;\s*$/);
});

test("registers the approved immutable Premier price-table version", () => {
  const expectedRows = [
    ["ruby-red", 0],
    ["sapphire-blue", 1],
    ["amethyst-purple", 2],
    ["radiant-gold", 4],
    ["emerald-green", 7],
    ["clear-diamond", 10],
    ["diamond-gold", 15],
  ] as const;

  for (const [tier, price] of expectedRows) {
    assert.match(
      migration,
      new RegExp(`\\('2026-07-premier-v1', '${tier}', ${price}\\)`),
    );
  }
});

test("allows zero prices in orders and immutable contract snapshots", () => {
  assert.match(migration, /check \(price_tc >= 0\)/);
  assert.match(migration, /check \(total_tc >= 0\)/);
  assert.match(migration, /check \(unit_price_tc >= 0\)/);
  assert.match(migration, /check \(purchase_price_tc >= 0\)/);
});

test("keeps zero-value activity out of the canonical TC ledger", () => {
  assert.match(migration, /skip_touchline_zero_purchase_ledger/);
  assert.match(
    migration,
    /new\.entry_type = 'purchase_use'[\s\S]*new\.amount_cents = 0[\s\S]*btrim\(new\.currency\) = 'TC'[\s\S]*return null/,
  );
  assert.match(migration, /before insert on public\.clubowner_credit_ledger/);
  assert.match(migration, /linked_order\.user_id <> new\.user_id/);
  assert.match(migration, /linked_order\.status <> 'completed'/);
  assert.match(migration, /linked_order\.total_tc <> 0/);
  assert.match(migration, /'touchline-market:' \|\| linked_order\.user_id::text/);
  assert.match(migration, /TL_MARKET_FREE_LEDGER_MISMATCH/);
});

test("fails closed if the immutable price-table version already conflicts", () => {
  assert.match(migration, /TL_MARKET_PRICE_TABLE_CONFLICT_2026_07_PREMIER_V1/);
  assert.match(migration, /select count\(\*\)[\s\S]*price_table_version = '2026-07-premier-v1'/);
  assert.match(migration, /actual\.price_tc <> expected\.price_tc/);
});

test("keeps the canonical TC ledger append-only for the application role", () => {
  assert.match(
    migration,
    /revoke update, delete, truncate on table public\.clubowner_credit_ledger[\s\S]*from service_role/,
  );
});

test("does not rewrite contracts, products, inventory or supply", () => {
  assert.doesNotMatch(migration, /update\s+public\.touchline_card_contracts/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.touchline_card_contracts/i);
  assert.doesNotMatch(migration, /update\s+public\.touchline_card_inventory/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.touchline_card_inventory/i);
  assert.doesNotMatch(migration, /update\s+public\.football_players/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [checkoutMigration, canonicalTierMigration] = await Promise.all([
  readFile(new URL("../supabase/migrations/022_touchline_market_atomic_checkout.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/032_touchline_free_market_contracts.sql", import.meta.url), "utf8"),
]);

test("the former 2026-07 TC-v2 price catalog is absent from the local migration chain", () => {
  assert.doesNotMatch(checkoutMigration, /2026-07-tc-v2/);
  assert.doesNotMatch(checkoutMigration, /\('2026-07-tc-v2',/);
  assert.match(checkoutMigration, /price_table_version text not null default '2026-07-premier-v1'/);
  assert.match(checkoutMigration, /price_tc integer not null check \(price_tc >= 0\)/);
});

test("the only seeded player-card price table uses the approved nominal tier numbers", () => {
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
    assert.match(canonicalTierMigration, new RegExp(`\\('2026-07-premier-v1', '${tier}', ${price}\\)`));
  }
  assert.doesNotMatch(canonicalTierMigration, /'clear-diamond', 20|diamond-gold', 50/);
});

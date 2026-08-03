import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL("../supabase/migrations/039_touchline_renewal_quote_foundation.sql", import.meta.url);

async function migrationSource() {
  return readFile(fileURLToPath(migrationUrl), "utf8");
}

test("renewal quote migration preserves the purchase snapshot and separates current next-season quotes", async () => {
  const source = await migrationSource();

  assert.match(source, /purchase_market_value_eur bigint/i);
  assert.match(source, /purchase_market_value_source text/i);
  assert.match(source, /create table if not exists public\.touchline_contract_renewal_quotes/i);
  assert.match(source, /source_contract_id uuid not null references public\.touchline_card_contracts/i);
  assert.match(source, /next_season_id uuid not null references public\.football_seasons/i);
  assert.match(source, /market_value_eur bigint/i);
  assert.match(source, /tier_key text/i);
  assert.match(source, /price_tc integer/i);
  assert.match(source, /quote_expires_at timestamptz/i);
  assert.match(source, /is_current boolean not null default true/i);
  assert.match(source, /touchline_contract_renewal_quotes_current_source_season_idx/i);
});

test("renewal quote storage remains server-owned and does not mutate historical contracts", async () => {
  const source = await migrationSource();

  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on table public\.touchline_contract_renewal_quotes from anon, authenticated/i);
  assert.match(source, /grant select, insert, update on table public\.touchline_contract_renewal_quotes to service_role/i);
  assert.doesNotMatch(source, /delete\s+from\s+public\.touchline_card_contracts/i);
  assert.doesNotMatch(source, /truncate\s+public\.touchline_card_contracts/i);
  assert.doesNotMatch(source, /update\s+public\.touchline_card_contracts\s+set\s+purchase_/i);
});

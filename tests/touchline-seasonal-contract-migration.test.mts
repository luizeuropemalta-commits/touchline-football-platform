import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL("../supabase/migrations/038_touchline_seasonal_contract_lifecycle.sql", import.meta.url);

async function migrationSource() {
  return readFile(fileURLToPath(migrationUrl), "utf8");
}

test("seasonal contract migration preserves history and records an explicit season term", async () => {
  const source = await migrationSource();

  assert.match(source, /add column if not exists season_id uuid references public\.football_seasons/i);
  assert.match(source, /add column if not exists season_starts_at date/i);
  assert.match(source, /add column if not exists season_ends_at date/i);
  assert.match(source, /add column if not exists expires_at timestamptz/i);
  assert.match(source, /touchline_card_contracts_season_term_check/i);
  assert.match(source, /season_lifecycle_state text not null default 'active'/i);
  assert.match(source, /renewed_from_contract_id uuid references public\.touchline_card_contracts/i);
  assert.match(source, /touchline_season_lifecycles/i);
  assert.match(source, /data_validation_ends_at timestamptz not null/i);
  assert.match(source, /renewal_window_opens_at timestamptz not null/i);
  assert.match(source, /touchline_season_reset_runs/i);
  assert.doesNotMatch(source, /delete\s+from\s+public\.touchline_card_contracts/i);
  assert.doesNotMatch(source, /truncate\s+public\.touchline_card_contracts/i);
});

test("seasonal reset storage is server-only and cannot grant client-side contract authority", async () => {
  const source = await migrationSource();

  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on table public\.touchline_season_lifecycles from anon, authenticated/i);
  assert.match(source, /revoke all on table public\.touchline_season_reset_runs from anon, authenticated/i);
  assert.match(source, /grant select, insert, update on table public\.touchline_season_reset_runs to service_role/i);
});

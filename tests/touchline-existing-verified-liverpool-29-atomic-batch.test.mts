import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/054_touchline_existing_verified_liverpool_29_atomic_batch.sql", import.meta.url),
  "utf8",
);

test("Liverpool's existing 29-value lifecycle command is separate, exact, and does not rewrite values", () => {
  assert.match(migration, /^-- Atomic lifecycle publication for the existing verified Liverpool values/m);
  assert.match(migration, /v_rows_count <> 29/);
  assert.match(migration, /TL_LIVERPOOL_29_BATCH_COUNT_INVALID/);
  assert.match(migration, /club.provider_team_id <> '8'/);
  assert.match(migration, /value.market_value_eur <> row\."manualMarketValueEur"/);
  assert.match(migration, /value\.status <> 'verified' or value\.confidence <> 'verified'/);
  assert.match(migration, /player\.source_updated_at <>/);
  assert.match(migration, /membership\.status <> 'active'/);
  assert.match(migration, /or exists \(select 1 from public\.touchline_card_publications prior/);
  assert.match(migration, /insert into public\.touchline_card_publications/);
  assert.equal(/insert into public\.football_player_market_values/i.test(migration), false);
  assert.equal(/update public\.football_player_market_values/i.test(migration), false);
  assert.equal(/delete from public\.football_player_market_values/i.test(migration), false);
});

test("the dedicated command supports complete promotion, protected replay, and lifecycle-only rollback", () => {
  for (const name of [
    "touchline_apply_existing_verified_liverpool_29_card_publications",
    "touchline_publish_existing_verified_liverpool_29_card_publications",
    "touchline_revert_existing_verified_liverpool_29_card_publications",
  ]) assert.ok(migration.includes(name));
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_batch\.manifest_payload is distinct from p_rows/);
  assert.match(migration, /TL_LIVERPOOL_29_BATCH_FINGERPRINT_REUSED/);
  assert.match(migration, /publication_status = 'published'/);
  assert.match(migration, /TL_LIVERPOOL_29_PUBLISH_CANONICAL_FENCE_FAILED/);
  assert.match(migration, /publication_status = 'market_value_required'/);
  assert.match(migration, /TL_LIVERPOOL_29_REVERT_HISTORY_LINK_COUNT_INVALID/);
  assert.match(migration, /revoke all on function public\.touchline_apply_existing_verified_liverpool_29_card_publications[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.touchline_publish_existing_verified_liverpool_29_card_publications[\s\S]*to service_role/);
});

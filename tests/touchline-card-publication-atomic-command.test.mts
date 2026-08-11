import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/052_touchline_card_publication_atomic_commands.sql", import.meta.url),
  "utf8",
);

test("the deferred publish command is an additive atomic forward migration", () => {
  assert.match(migration, /LOCAL, UNAPPLIED forward migration/);
  assert.match(migration, /begin;[\s\S]*create or replace function public\.touchline_apply_manual_card_publication[\s\S]*commit;/);
  assert.match(migration, /security definer/);
  assert.match(migration, /for update/);
  assert.match(migration, /TL_CARD_PUBLICATION_MEMBERSHIP_NOT_UNIQUE/);
  assert.match(migration, /TL_CARD_PUBLICATION_COMPETITION_NOT_PREMIER_LEAGUE/);
  assert.match(migration, /football_player_market_values/);
  assert.match(migration, /football_player_market_value_history/);
  assert.match(migration, /touchline_card_publications/);
  assert.match(migration, /touchline_card_publication_history/);
  assert.match(migration, /revoke all on function public\.touchline_apply_manual_card_publication/);
  assert.match(migration, /grant execute on function public\.touchline_apply_manual_card_publication[\s\S]*to service_role/);
  assert.match(migration, /create or replace function public\.touchline_revert_manual_card_publication/);
  assert.match(migration, /TL_CARD_PUBLICATION_REVERT_HISTORY_INCOMPLETE/);
  assert.match(migration, /TL_CARD_PUBLICATION_REVERT_MEMBERSHIP_NOT_CANONICAL/);
  assert.match(migration, /TL_CARD_PUBLICATION_REVERT_VALUE_ID_MISMATCH/);
  assert.match(migration, /revoke all on function public\.touchline_revert_manual_card_publication\(uuid, uuid\)/);
});

test("nominal GBP price is explicit while legacy fields remain compatible", () => {
  assert.match(migration, /add column if not exists calculated_nominal_price_gbp integer/);
  assert.match(migration, /add column if not exists nominal_price_gbp integer/);
  assert.match(migration, /when 'ruby-red' then 0/);
  assert.match(migration, /when 'sapphire-blue' then 1/);
  assert.match(migration, /when 'amethyst-purple' then 2/);
  assert.match(migration, /when 'radiant-gold' then 4/);
  assert.match(migration, /when 'emerald-green' then 7/);
  assert.match(migration, /when 'clear-diamond' then 10/);
  assert.match(migration, /when 'diamond-gold' then 15/);
  assert.match(migration, /when p_market_value_eur < 6000000 then 'ruby-red'/);
  assert.match(migration, /when p_market_value_eur < 10000000 then 'sapphire-blue'/);
  assert.match(migration, /when p_market_value_eur < 20000000 then 'amethyst-purple'/);
  assert.match(migration, /when p_market_value_eur < 35000000 then 'radiant-gold'/);
  assert.match(migration, /when p_market_value_eur < 50000000 then 'emerald-green'/);
  assert.match(migration, /when p_market_value_eur < 70000000 then 'clear-diamond'/);
  assert.match(migration, /TL_CARD_PUBLICATION_TIER_MISMATCH/);
  assert.match(migration, /Launch-season payable amount is separate/);
  assert.match(migration, /calculated_price_tc = excluded\.calculated_price_tc/);
  assert.match(migration, /calculated_nominal_price_gbp = excluded\.calculated_nominal_price_gbp/);
});

test("revert safely restores a first-ever publication to its no-value state", () => {
  assert.match(migration, /v_restore_has_value boolean/);
  assert.match(migration, /v_restore_has_publication boolean/);
  assert.match(migration, /jsonb_typeof\(v_restore_value\) not in \('object', 'null'\)/);
  assert.match(migration, /publication_status = 'market_value_required'/);
  assert.match(migration, /delete from public\.football_player_market_values/);
  assert.match(migration, /case when v_restore_has_value then v_restored_value\.market_value_eur else null end/);
  assert.match(migration, /TL_CARD_PUBLICATION_REVERT_PUBLICATION_NOT_FOUND/);
});

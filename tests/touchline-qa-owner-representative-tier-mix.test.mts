import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../supabase/qa/008_touchline_qa_owner_representative_tier_mix.sql", import.meta.url),
  "utf8",
);

test("representative tier mix is QA-only and service-role guarded", () => {
  assert.match(source, /TouchLine Development QA only/);
  assert.match(source, /not a Production migration/);
  assert.match(source, /xgxbwqxjssxxuihuwmgy/);
  assert.match(source, /072900f3-27fc-41a5-9881-6913a486754e/);
  assert.match(source, /jl_nenelopes10@hotmail\.com/);
  assert.match(source, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(source, /grant execute on function[\s\S]+to service_role/i);
  assert.doesNotMatch(source, /vxireiswggllwhbsmdcj/);
});

test("selects exactly 35 existing published cards across all seven canonical tiers", () => {
  for (const tier of [
    "ruby-red",
    "sapphire-blue",
    "amethyst-purple",
    "radiant-gold",
    "emerald-green",
    "clear-diamond",
    "diamond-gold",
  ]) {
    assert.match(source, new RegExp(`'${tier}'`));
  }

  assert.match(source, /publication_status = 'published'/);
  assert.match(source, /join public\.football_players p on p\.id = i\.player_id/);
  assert.match(source, /distinct on \(i\.player_id, pub\.calculated_tier\)/);
  assert.match(source, /pc\.tier_key = pub\.calculated_tier/);
  assert.match(source, /pc\.price_tc = pub\.calculated_price_tc/);
  assert.match(source, /select count\(\*\) from tl_qa_candidates\) <> 35/);
  assert.match(source, /count\(\*\) from jsonb_object_keys\(v_tier_counts\)\) <> 7/);
  assert.doesNotMatch(source, /update\s+public\.touchline_card_publications/i);
  assert.doesNotMatch(source, /update\s+public\.touchline_card_price_catalog/i);
});

test("keeps checkout at zero while retaining publication editorial price metadata", () => {
  assert.match(source, /v_order\.total_tc <> 0/);
  assert.match(source, /v_order\.balance_before_tc <> v_order\.balance_after_tc/);
  assert.match(source, /'canonicalEditorialPriceTc'/);
  assert.match(source, /'canonicalEditorialPriceGbp'/);
  assert.match(source, /'qaCheckoutPriceTc', 0/);
  assert.doesNotMatch(
    source,
    /(insert\s+into|update|delete\s+from)\s+public\.clubowner_credit_ledger/i,
  );
});

test("preserves the 35/11/9/15 squad, coach and authoritative Arena identity", () => {
  assert.match(source, /v_active_contracts <> 35/);
  assert.match(source, /v_lineup_count <> 11/);
  assert.match(source, /v_tactical_count <> 35/);
  assert.match(source, /v_coach_provider_id is distinct from '455907'/);
  assert.match(source, /'startingXi', 11/);
  assert.match(source, /'bench', 9/);
  assert.match(source, /'outsideMatchday', 15/);
  assert.match(source, /'formationKey', '4-3-3'/);
  assert.match(source, /'inventoryId', mapping\.new_card_id::text/);
  assert.match(source, /'id', 'field-' \|\| mapping\.new_card_id::text/);
  assert.match(
    source,
    /touchline_apply_qa_owner_tactical_slots\(\s*p_project_ref,\s*p_run_id,\s*p_user_id\s*\)/,
  );
});

test("apply and rollback are idempotent and snapshot every mutated QA surface", () => {
  assert.match(source, /'status', 'already_applied'/);
  assert.match(source, /'status', 'already_rolled_back'/);
  assert.match(source, /'status', 'not_applied'/);
  for (const snapshot of [
    "prior_selected_card_ids",
    "prior_scenario_metadata",
    "prior_order",
    "prior_order_items",
    "prior_contracts",
    "prior_inventory",
    "prior_arena_state",
    "prior_tactical_slots",
  ]) {
    assert.match(source, new RegExp(snapshot));
  }
  assert.match(source, /touchline_rollback_qa_owner_representative_tier_mix/);
});

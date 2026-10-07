import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const forwardPath = "supabase/qa/057_touchline_qa_owner_avatar_preservation.sql";
const legacy = () => read("supabase/qa/003_touchline_qa_owner_scenario.sql");
function functions(source: string) {
  return [...source.matchAll(/create or replace function public\.(touchline_(?:apply|rollback)_qa_owner_scenario)\([\s\S]*?\n\$\$;/g)].map(match => match[0]);
}
function nonAvatar(source: string) {
  return source
    .replace(/  update public\.users\n     set avatar_url = (?:'[^']*'|v_scenario\.prior_avatar_url),\n         updated_at = now\(\)\n   where id = p_user_id;\n/g, "")
    .replace(/  v_avatar_outcome text;\n/g, "")
    .replace(/  v_avatar_outcome := case when v_scenario\.avatar_apply_outcome = 'preserved_no_write'\n    then 'preserved_no_write' else 'skipped_legacy_unversioned' end;\n/g, "")
    .replace(/\s*avatar_apply_outcome = 'preserved_no_write',/g, "")
    .replace(/\s*avatar_rollback_outcome = v_avatar_outcome,/g, "")
    .replace(/'avatarApplyOutcome', (?:coalesce\(v_scenario\.avatar_apply_outcome, 'legacy_unversioned'\)|'preserved_no_write'),\s*/g, "")
    .replace(/'avatarRollbackOutcome', (?:coalesce\(v_scenario\.avatar_rollback_outcome, 'legacy_unversioned'\)|v_avatar_outcome),\s*/g, "")
    .replace(/\s+/g, " ").trim();
}

test("forward retains both complete functions except explicit avatar writes and additive receipts", () => {
  const before = functions(legacy()), after = functions(read(forwardPath));
  assert.equal(before.length, 2); assert.equal(after.length, 2);
  assert.deepEqual(after.map(nonAvatar), before.map(nonAvatar));
  assert.doesNotMatch(after.join("\n"), /update public\.users|set avatar_url|set avatar_revision/i);
  assert.notEqual(nonAvatar(after[0].replace("'startingEleven', 11", "'startingEleven', 10")), nonAvatar(before[0]), "control: unrelated lineup changes are detected");
});

test("dedicated nullable outcomes preserve unversioned history and stay outside metadata snapshots", () => {
  const source = read(forwardPath);
  assert.match(source, /add column avatar_apply_outcome text/);
  assert.match(source, /add column avatar_rollback_outcome text/);
  assert.match(source, /avatar_apply_outcome is null or avatar_apply_outcome = 'preserved_no_write'/);
  assert.match(source, /avatar_rollback_outcome is null or avatar_rollback_outcome in \('preserved_no_write', 'skipped_legacy_unversioned'\)/);
  assert.doesNotMatch(source, /avatar_(?:apply|rollback)_outcome text[^,;]*default|update public\.touchline_qa_owner_scenarios[\s\S]*?set avatar_apply_outcome = 'legacy/i);
  const apply = functions(source)[0], rollback = functions(source)[1];
  assert.match(apply, /'avatarApplyOutcome', coalesce\(v_scenario\.avatar_apply_outcome, 'legacy_unversioned'\)/);
  assert.match(rollback, /'avatarRollbackOutcome', coalesce\(v_scenario\.avatar_rollback_outcome, 'legacy_unversioned'\)/);
  assert.match(rollback, /case when v_scenario\.avatar_apply_outcome = 'preserved_no_write'\s+then 'preserved_no_write' else 'skipped_legacy_unversioned' end/);
  const tier = read("supabase/qa/008_touchline_qa_owner_representative_tier_mix.sql");
  assert.match(tier, /metadata = v_run\.prior_scenario_metadata/);
  for (const path of ["supabase/qa/005_touchline_qa_tactical_slots.sql", "supabase/qa/008_touchline_qa_owner_representative_tier_mix.sql"]) {
    assert.doesNotMatch(read(path), /avatar_apply_outcome|avatar_rollback_outcome/);
  }
});

test("forward is QA-only, guarded, transactionally replaces functions and keeps exact execution grants", () => {
  const source = read(forwardPath);
  assert.match(source, /begin;/); assert.match(source, /commit;/);
  assert.match(source, /select public\.touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  const grants = (value: string) => value.split("\n").filter(line => /^(revoke|grant).*function public\.touchline_(apply|rollback)_qa_owner_scenario/.test(line));
  assert.deepEqual(grants(source), grants(legacy()));
  assert.doesNotMatch(source, /alter table public\.users|create policy|create table|storage\.|grant .* to (?:anon|authenticated)/i);
  assert.match(source, /Mandatory compatibility gate before avatar schema activation/i);
  assert.match(source, /preserves existing AND empty avatars/i);
});

test("SQL verification source requires isolation, rollback, avatar-write tripwire and new/legacy replay checks", () => {
  const source = read("supabase/tests/club_owner_avatar_qa_compatibility.sql");
  assert.match(source, /touchline\.avatar_qa_test_mode/); assert.match(source, /ISOLATED_DATASET_REQUIRED/);
  assert.match(source, /before update of avatar_url on public\.users/i);
  assert.match(source, /AVATAR_WRITE_ATTEMPT/);
  assert.match(source, /if sqlerrm <> 'TL_QA_FIXTURE_TARGET_FORBIDDEN' then raise; end if;/);
  assert.match(source, /avatar_apply_outcome = null/);
  assert.match(source, /skipped_legacy_unversioned/); assert.match(source, /legacy_unversioned/);
  assert.match(source, /preserved_no_write/); assert.match(source, /avatar_revision/);
  assert.match(source, /metadata = '\{\}'::jsonb/);
  assert.match(source, /has_function_privilege/);
  assert.match(source, /rollback;\s*$/i); assert.doesNotMatch(source, /\bcommit;/i);
  assert.doesNotMatch(source, /create (?:or replace )?function public\.(?:checkout_touchline_market_cart|release_touchline_card_contract)/i);
});

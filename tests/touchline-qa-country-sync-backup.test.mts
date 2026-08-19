import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/qa/009_touchline_qa_country_sync_backup.sql", import.meta.url), "utf8");

test("QA country-sync backup is isolated, complete, and service-role-only", () => {
  assert.match(migration, /Do not add this file to supabase\/migrations/);
  assert.match(migration, /project_ref text not null check \(project_ref = 'xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(migration, /v_expected_players constant integer := 588/);
  assert.match(migration, /perform public\.touchline_assert_qa_fixture_target\(p_project_ref\);/);
  assert.match(migration, /alter table public\.touchline_qa_country_sync_runs enable row level security/);
  assert.match(migration, /revoke all on public\.touchline_qa_country_sync_before from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.touchline_qa_country_sync_before to service_role/);
});

test("QA country-sync rollback restores only the backed-up nationality fields", () => {
  const rollback = migration.slice(migration.indexOf("create or replace function public.touchline_rollback_qa_country_sync"));

  assert.match(rollback, /set nationality = before\.nationality,\s*country_id = before\.country_id/);
  assert.doesNotMatch(rollback, /set[\s\S]*?membership|touchline_card_publications|touchline_card_inventory|card_price/i);
  assert.match(rollback, /if v_restored <> 588 then/);
  assert.match(rollback, /v_status not in \('backed_up', 'applied'\)/);
});

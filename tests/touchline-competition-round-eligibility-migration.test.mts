import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/044_touchline_competition_round_eligibility.sql", import.meta.url),
  "utf8",
);

test("round eligibility uses the TouchLine competition engine rather than an external league calendar", () => {
  assert.match(migration, /TouchLine competition-engine schedule/i);
  assert.match(migration, /touchline_competition_engine_rounds/);
  assert.match(migration, /'SCHEDULED', 'OPEN', 'LOCKED', 'SETTLED'/);
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /premier|fixture|sportmonks/i);
});

test("locked round entries preserve eligibility after a later maintenance lapse", () => {
  assert.match(migration, /touchline_competition_round_entries/);
  assert.match(migration, /eligibility_status = 'ELIGIBLE_AT_LOCK'/);
  assert.match(migration, /Immutable club eligibility snapshot at TouchLine round lock/i);
  assert.match(migration, /status in \('ACTIVE', 'REACTIVATED'\)/);
  assert.match(migration, /round_status <> 'OPEN'/);
});

test("round entry is server-only, scoped to the entitlement competition and idempotent", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('touchline-round-entry:'/);
  assert.match(migration, /round_competition <> entitlement_competition/);
  assert.match(migration, /primary key \(round_id, entitlement_id\)/);
  assert.match(migration, /grant execute on function public\.lock_touchline_competition_round_entry\(uuid, uuid, text\) to service_role/i);
  assert.doesNotMatch(migration, /grant .*authenticated.*lock_touchline_competition_round_entry/i);
});

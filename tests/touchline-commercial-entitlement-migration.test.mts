import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/041_touchline_competition_maintenance_entitlement.sql", import.meta.url),
  "utf8",
);

test("commercial entitlement migration remains local-only and contains no payment integration", () => {
  const executableSql = migration.replace(/^--.*$/gm, "");
  assert.match(migration, /Local-only V2\.10\.2–3 foundation/i);
  assert.doesNotMatch(executableSql, /stripe|payment_intent|checkout session|price_id/i);
});

test("commercial registry locks the approved competition-to-currency mapping", () => {
  assert.match(migration, /\('england', 'GBP', 'planned'\)/);
  assert.match(migration, /\('europe', 'EUR', 'future'\)/);
  assert.match(migration, /\('brazil', 'BRL', 'future'\)/);
  assert.match(migration, /foreign key \(competition_key, official_currency\)/i);
});

test("entitlement states are separate from card contracts and user mutation is denied", () => {
  assert.match(migration, /touchline_competition_entitlements/);
  assert.match(migration, /'ACTIVE',\s*'PAYMENT_PAST_DUE',\s*'INACTIVE_MAINTENANCE',\s*'REACTIVATED'/s);
  assert.match(migration, /revoke all on table public\.touchline_competition_entitlements from public, anon, authenticated/i);
  assert.match(migration, /users read own touchline competition entitlement/i);
  assert.doesNotMatch(migration, /users (insert|update|delete) own touchline competition entitlement/i);
});

test("entitlement events are append-only, idempotent and service-write-only", () => {
  assert.match(migration, /touchline_competition_entitlement_events/);
  assert.match(migration, /idempotency_key text not null unique/i);
  assert.match(migration, /grant select, insert on table public\.touchline_competition_entitlement_events to service_role/i);
  assert.doesNotMatch(migration, /grant .*update.*touchline_competition_entitlement_events/i);
});

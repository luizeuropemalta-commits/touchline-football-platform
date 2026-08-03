import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/042_touchline_founder_and_stripe_test_boundary.sql", import.meta.url),
  "utf8",
);

test("legacy Founder reservation is retained as evidence but no longer callable by clients", () => {
  assert.match(migration, /revoke all on function public\.reserve_founder_plan_slot\(\) from public, anon, authenticated/i);
  assert.match(migration, /Retired historical subscription-reservation model/i);
  assert.match(migration, /touchline_founder_entitlements/);
  assert.match(migration, /founder_number integer not null unique check \(founder_number between 1 and 100\)/i);
});

test("Founder allocation is serialized, permanent, fulfilled-only and records a unique audit event", () => {
  assert.match(migration, /pg_advisory_xact_lock\(729101\)/);
  assert.match(migration, /operation\.state = 'FULFILLED'/);
  assert.match(migration, /entitlement\.activated_at is not null/);
  assert.match(migration, /provider_mode = 'test'/);
  assert.match(migration, /initial_activation_operation_id uuid not null unique/i);
  assert.match(migration, /idempotency_key text not null unique/i);
  assert.match(migration, /on delete restrict/);
});

test("Test Mode webhook claim rejects live events, is durable and keeps the ledger non-monetary", () => {
  assert.match(migration, /touchline_stripe_test_webhook_events/);
  assert.match(migration, /stripe_event_id text primary key/);
  assert.match(migration, /if p_livemode then raise exception/i);
  assert.match(migration, /on conflict \(stripe_event_id\) do nothing/i);
  assert.match(migration, /touchline_stripe_test_ledger_observations/);
  assert.match(migration, /Non-monetary Test Mode audit observations only/i);
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /sk_live_|sk_test_|price_live_/i);
});

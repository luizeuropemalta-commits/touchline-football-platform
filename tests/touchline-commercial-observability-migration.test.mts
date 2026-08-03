import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/045_touchline_commercial_observability.sql", import.meta.url),
  "utf8",
);

test("operational observability is allowlisted, idempotent and service-only", () => {
  assert.match(migration, /touchline_commercial_operational_observations/);
  assert.match(migration, /'WEBHOOK_CLAIMED', 'WEBHOOK_DUPLICATE', 'OPERATION_AWAITING_FULFILLMENT'/);
  assert.match(migration, /idempotency_key text not null unique/i);
  assert.match(migration, /revoke all on table public\.touchline_commercial_operational_observations from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on table public\.touchline_commercial_operational_observations to service_role/i);
});

test("observability schema excludes sensitive payload and financial fields", () => {
  const executableSql = migration
    .replace(/^--.*$/gm, "")
    .replace(/comment on table[\s\S]*?;/gi, "");
  assert.doesNotMatch(executableSql, /payload|secret|email|card_number|amount|currency|tax|invoice|wallet/i);
});

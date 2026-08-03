import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/043_touchline_central_inbox_foundation.sql", import.meta.url),
  "utf8",
);

test("Central is an admin-owned canonical source with lifecycle, audience and localization", () => {
  assert.match(migration, /touchline_central_messages/);
  assert.match(migration, /origin = 'ADMIN'/);
  assert.match(migration, /'COMING_SOON', 'PRE_REGISTRATION', 'OPEN', 'ACTIVE'/);
  assert.match(migration, /'GLOBAL', 'COMPETITION', 'USER'/);
  assert.match(migration, /touchline_central_message_localizations/);
  assert.match(migration, /locale in \('pt-BR', 'en'\)/);
  assert.match(migration, /deep_link like '\/%'/);
});

test("ClubOwner Inbox stores only owner-scoped read receipts and does not duplicate notification history", () => {
  assert.match(migration, /touchline_central_inbox_receipts/);
  assert.match(migration, /primary key \(message_id, user_id\)/);
  assert.match(migration, /ClubOwner reads own Central receipts/);
  assert.match(migration, /ClubOwner creates own Central receipt/);
  assert.match(migration, /revoke all on table public\.touchline_central_messages from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /(?:from|into|update|delete from)\s+public\.notification_history/i);
});

test("Central foundation stays local-only and contains no delivery or financial fulfillment", () => {
  const executableSql = migration.replace(/^--.*$/gm, "");
  assert.match(migration, /Local-only V2\.10\.10 foundation/i);
  assert.doesNotMatch(executableSql, /stripe|payment_intent|checkout|wallet|invoice|tax/i);
});

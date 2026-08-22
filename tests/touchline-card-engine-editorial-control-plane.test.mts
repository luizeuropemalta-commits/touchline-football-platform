import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseCardEngineDelimitedInput,
  resolveCardEngineImportRows,
  summarizeCardEngineRows,
} from "../lib/touchlineArena/card-engine-editorial-import.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260818100529_touchline_card_engine_editorial_control_plane.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/card-engine/route.ts", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../components/admin-card-engine-console.tsx", import.meta.url), "utf8");

const candidates = [{
  playerId: "11111111-1111-4111-8111-111111111111", providerPlayerId: "101", name: "Ada Lovelace", club: "TouchLine FC", dateOfBirth: "2000-01-01",
  provider: { displayName: "Ada Lovelace", jerseyNumber: 8, sourceUpdatedAt: "2026-08-18T00:00:00Z" },
}] as const;

test("Card Engine resolves provider id first and makes name plus club manual-review-only", () => {
  const provider = resolveCardEngineImportRows([{ providerPlayerId: "101", displayName: "A. Lovelace" }], candidates);
  assert.equal(provider[0]?.matchStatus, "matched"); assert.equal(provider[0]?.matchStrategy, "provider_player_id");
  const nameOnly = resolveCardEngineImportRows([{ name: "Ada Lovelace", club: "TouchLine FC", displayName: "A. Lovelace" }], candidates);
  assert.equal(nameOnly[0]?.matchStatus, "review"); assert.equal(nameOnly[0]?.matchStrategy, "name_club_manual");
  assert.deepEqual(summarizeCardEngineRows(nameOnly), { matched: 0, review: 1, conflict: 0, unmatched: 0 });
});

test("Card Engine rejects formula-like cells and bounds delimited imports", () => {
  const rows = parseCardEngineDelimitedInput("provider_player_id,display_name\n101,=HYPERLINK(\"x\")");
  assert.equal(rows.length, 1);
  const resolved = resolveCardEngineImportRows(rows, candidates);
  assert.notEqual(resolved[0]?.matchStatus, "matched");
  assert.match(resolved[0]?.errors.join(",") ?? "", /no-supported-editorial-change|formula/);
});

test("Card Engine migration is protected, atomic, audited, idempotent and reversible", () => {
  for (const required of [
    "touchline_card_editorial_batches", "touchline_card_editorial_batch_items", "touchline_card_editorial_overrides", "touchline_card_editorial_audit_events",
    "provider_value", "touchline_override", "effective_value", "touchline_card_editorial_effective_values", "is_stale",
    "touchline_card_engine_create_batch", "TL_CARD_ENGINE_IDEMPOTENCY_PAYLOAD_MISMATCH", "touchline_card_engine_approve_batch", "touchline_card_engine_publish_batch", "touchline_card_engine_revert_batch",
    "TL_CARD_ENGINE_PROVIDER_IDENTITY_FENCE_FAILED", "TL_CARD_ENGINE_BATCH_REVIEW_REQUIRED", "security definer", "enable row level security", "from public, anon, authenticated", "to service_role",
  ]) assert.ok(migration.includes(required), `missing ${required}`);
  assert.match(migration, /begin;[\s\S]*commit;/);
  assert.match(migration, /field_key in \('displayName', 'shirtNumber', 'marketValueEur', 'cardTemplateKey'\)/);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)[\s\S]*\bto\s+(?:anon|authenticated)\b/i);
});

test("server route enforces owner access, same-origin writes, bounds and never writes provider facts directly", () => {
  assert.match(route, /isOwnerEmail/); assert.match(route, /hasTouchLineArenaAccess/); assert.match(route, /isSameOrigin/); assert.match(route, /MAX_IMPORT_BYTES/); assert.match(route, /readBoundedJson/); assert.match(route, /reader\.cancel/);
  assert.match(route, /touchline_card_engine_create_batch/); assert.match(route, /touchline_card_engine_approve_batch/); assert.match(route, /touchline_card_engine_publish_batch/); assert.match(route, /touchline_card_engine_revert_batch/);
  assert.doesNotMatch(route, /\.from\("football_players"\)[\s\S]{0,240}\.(?:update|upsert|insert|delete)\(/);
  assert.doesNotMatch(route, /sportmonks\.com|fetch\s*\(/);
  assert.doesNotMatch(route, /"xlsx"/);
  assert.doesNotMatch(consoleSource, /from "xlsx"|\.xlsx|XLSX\./);
});

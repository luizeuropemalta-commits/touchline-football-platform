import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseTouchlineMarketContractReleaseRequest } from "../lib/touchlineArena/market-contract-release-request.ts";

const CARD_ID = "cb58b289-dbb6-4a2f-8db5-bf3af1cb8d6e";

const [migration, lineupIntegrityMigration, route, marketInventory] = await Promise.all([
  readFile(
    new URL("../supabase/migrations/026_touchline_market_contract_release.sql", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../supabase/migrations/028_touchline_release_lineup_integrity.sql", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../app/api/touchline-arena/contracts/release/route.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../lib/touchlineArena/market-inventory.ts", import.meta.url),
    "utf8",
  ),
]);

test("accepts only a normalized inventory card id and idempotency key", () => {
  assert.deepEqual(parseTouchlineMarketContractReleaseRequest({
    cardId: ` ${CARD_ID.toUpperCase()} `,
    idempotencyKey: " contract-release-001 ",
  }), {
    ok: true,
    value: {
      cardId: CARD_ID,
      idempotencyKey: "contract-release-001",
    },
  });
});

test("rejects malformed ids, weak keys and client-controlled business fields", () => {
  assert.deepEqual(
    parseTouchlineMarketContractReleaseRequest(null),
    { ok: false, error: "invalid-body" },
  );
  assert.deepEqual(parseTouchlineMarketContractReleaseRequest({
    cardId: "demo-haaland",
    idempotencyKey: "contract-release-002",
  }), { ok: false, error: "invalid-card-id" });
  assert.deepEqual(parseTouchlineMarketContractReleaseRequest({
    cardId: CARD_ID,
    idempotencyKey: "short",
  }), { ok: false, error: "invalid-idempotency-key" });
  assert.deepEqual(parseTouchlineMarketContractReleaseRequest({
    cardId: CARD_ID,
    idempotencyKey: "contract-release-003",
    userId: "another-user",
    refundTc: 50,
  }), { ok: false, error: "unexpected-field" });
});

test("release RPC is owner-scoped, serialized and idempotent", () => {
  assert.match(migration, /create or replace function public\.release_touchline_card_contract/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(
    migration,
    /unique \(user_id, idempotency_key\)/,
  );
  assert.match(
    migration,
    /from public\.users[\s\S]*where id = requested_user_id[\s\S]*for update/,
  );
  assert.match(
    migration,
    /from public\.touchline_card_inventory[\s\S]*where id = requested_card_id[\s\S]*for update/,
  );
  assert.match(
    migration,
    /from public\.touchline_card_contracts[\s\S]*where user_id = requested_user_id[\s\S]*and card_id = requested_card_id[\s\S]*and status = 'active'[\s\S]*for update/,
  );
  assert.match(migration, /TL_MARKET_RELEASE_IDEMPOTENCY_CONFLICT/);
  assert.match(
    migration,
    /revoke all on function public\.release_touchline_card_contract\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.release_touchline_card_contract\(uuid, uuid, text\)[\s\S]*to service_role/,
  );
});

test("release ends one active contract and never refunds or edits the wallet", () => {
  assert.match(
    migration,
    /update public\.touchline_card_contracts[\s\S]*set status = 'ended'[\s\S]*ended_at = released_at_value/,
  );
  assert.match(migration, /'refundTc', 0/);
  assert.doesNotMatch(migration, /insert into public\.clubowner_credit_ledger/);
  assert.doesNotMatch(migration, /update public\.clubowner_credit_ledger/);
  assert.match(
    migration,
    /where user_id = requested_user_id[\s\S]*and status = 'active'/,
  );
  assert.match(
    migration,
    /where card_id = requested_card_id[\s\S]*and status = 'active'/,
  );
  assert.match(migration, /'openContractSlots', greatest\(35 - active_contract_count, 0\)/);
  assert.match(
    migration,
    /'availableCopies', greatest\(inventory\.supply_limit - active_supply_count, 0\)/,
  );
});

test("ending a contract atomically removes its inventory card from the saved Arena lineup", () => {
  assert.match(
    lineupIntegrityMigration,
    /after update of status on public\.touchline_card_contracts/,
  );
  assert.match(
    lineupIntegrityMigration,
    /when \(old\.status = 'active' and new\.status <> 'active'\)/,
  );
  assert.match(
    lineupIntegrityMigration,
    /update public\.touchline_user_arena_state as arena_state[\s\S]*jsonb_array_elements\(arena_state\.lineup\) with ordinality/,
  );
  assert.match(lineupIntegrityMigration, /\{card,inventoryId\}/);
  assert.match(lineupIntegrityMigration, /new\.card_id::text/);
  assert.match(lineupIntegrityMigration, /security definer[\s\S]*set search_path = ''/);
});

test("POST authenticates the session and never accepts a user id from the client", () => {
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /parseTouchlineMarketContractReleaseRequest/);
  assert.match(route, /admin\.rpc\("release_touchline_card_contract"/);
  assert.match(route, /requested_user_id: user\.id/);
  assert.match(route, /requested_card_id: parsed\.value\.cardId/);
  assert.match(route, /requested_idempotency_key: parsed\.value\.idempotencyKey/);
  assert.doesNotMatch(route, /requested_user_id:\s*parsed/);
});

test("market inventory normalizes and validates contract UUIDs", () => {
  assert.match(
    marketInventory,
    /export function normalizeTouchlineMarketInventoryId[\s\S]*value\.trim\(\)\.toLowerCase\(\)[\s\S]*UUID_PATTERN\.test\(normalized\)/,
  );
});

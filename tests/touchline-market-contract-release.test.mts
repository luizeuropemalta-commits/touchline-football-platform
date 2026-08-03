import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseTouchlineMarketContractReleaseRequest } from "../lib/touchlineArena/market-contract-release-request.ts";

const CARD_ID = "cb58b289-dbb6-4a2f-8db5-bf3af1cb8d6e";

const [migration, lineupIntegrityMigration, route, arenaClient, marketInventory] = await Promise.all([
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
    new URL("../app/arena/ArenaClient.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../lib/touchlineArena/market-inventory.ts", import.meta.url),
    "utf8",
  ),
]);

function sourceSection(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const checkoutFlow = sourceSection(
  arenaClient,
  "async function checkoutBuilderCart()",
  "async function releaseAuthoritativeContract(",
);
const releaseFlow = sourceSection(
  arenaClient,
  "async function releaseAuthoritativeContract(",
  "async function releaseSelectedBenchContract()",
);

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

test("Arena releases only authoritative inventory ids before mutating its local roster", () => {
  assert.match(
    arenaClient,
    /releaseSelectedBenchContract[\s\S]*releaseAuthoritativeContract\([\s\S]*selectedBench\.inventoryId[\s\S]*if \(!released\) return;[\s\S]*nextBench/,
  );
  assert.match(
    arenaClient,
    /replaceAndReleaseSelectedContract[\s\S]*releasedPlayer\.card\?\.inventoryId[\s\S]*if \(!released\) return;[\s\S]*incomingPlayer/,
  );
  assert.match(
    arenaClient,
    /fetch\("\/api\/touchline-arena\/contracts\/release"[\s\S]*JSON\.stringify\(\{ cardId: normalizedCardId, idempotencyKey \}\)/,
  );
  assert.doesNotMatch(
    arenaClient,
    /releaseAuthoritativeContract\([\s\S]{0,120}selectedBench\.id\s*,/,
  );
});

test("Arena normalizes and validates inventory UUIDs before release", () => {
  assert.match(
    marketInventory,
    /export function normalizeTouchlineMarketInventoryId[\s\S]*value\.trim\(\)\.toLowerCase\(\)[\s\S]*UUID_PATTERN\.test\(normalized\)/,
  );
  assert.match(arenaClient, /import \{[\s\S]*normalizeTouchlineMarketInventoryId,[\s\S]*\} from "@\/lib\/touchlineArena\/market-inventory"/);
  assert.match(releaseFlow, /const normalizedCardId = normalizeTouchlineMarketInventoryId\(cardId\)/);
  assert.match(releaseFlow, /JSON\.stringify\(\{ cardId: normalizedCardId, idempotencyKey \}\)/);
  assert.match(releaseFlow, /parseTouchlineMarketContractReleaseResult\(payload, normalizedCardId\)/);
});

test("only an explicit local demo can bypass the release API", () => {
  assert.match(
    releaseFlow,
    /const isExplicitLocalDemo = arenaPersistencePrincipal\?\.kind === "demo"[\s\S]*!normalizedCardId[\s\S]*marketInventoryMode !== "authoritative"/,
  );
  assert.match(releaseFlow, /if \(isExplicitLocalDemo\) return true/);
  assert.doesNotMatch(releaseFlow, /kind !== "authenticated"\) return true/);
});

test("checkout and release share one mutation lock and disable each other", () => {
  assert.match(
    checkoutFlow,
    /if \(isMarketCheckoutPending \|\| isContractReleasePending \|\| marketMutationPendingRef\.current\) return/,
  );
  assert.match(checkoutFlow, /marketMutationPendingRef\.current = "checkout"/);
  assert.match(checkoutFlow, /marketMutationPendingRef\.current === "checkout"[\s\S]*marketMutationPendingRef\.current = null/);
  assert.match(
    releaseFlow,
    /if \(isContractReleasePending \|\| isMarketCheckoutPending \|\| marketMutationPendingRef\.current\) return false/,
  );
  assert.match(releaseFlow, /marketMutationPendingRef\.current = "release"/);
  assert.match(releaseFlow, /marketMutationPendingRef\.current === "release"[\s\S]*marketMutationPendingRef\.current = null/);
  assert.match(
    arenaClient,
    /className="team-builder-cart-checkout"[\s\S]{0,240}disabled=\{!marketCartQuote\.valid \|\| isMarketCheckoutPending \|\| isContractReleasePending\}/,
  );
  assert.match(
    arenaClient,
    /className="bench-release-contract" disabled=\{isContractReleasePending \|\| isMarketCheckoutPending\}/,
  );
});

test("an idempotent replay discards historical counters and requests reconciliation", () => {
  assert.match(
    arenaClient,
    /typeof payload\.idempotentReplay !== "boolean"/,
  );
  const replayStart = releaseFlow.indexOf("if (released.idempotentReplay)");
  const liveCounterStart = releaseFlow.indexOf("} else {", replayStart);
  assert.notEqual(replayStart, -1);
  assert.notEqual(liveCounterStart, -1);
  const replayBranch = releaseFlow.slice(replayStart, liveCounterStart);
  assert.match(replayBranch, /setMarketInventorySnapshot\(null\)/);
  assert.doesNotMatch(replayBranch, /activeContractCount|openContractSlots|soldCopies|availableCopies|supplyLimit/);
  assert.match(releaseFlow.slice(liveCounterStart), /setMarketInventoryRevision\(\(revision\) => revision \+ 1\)/);
});

test("network ambiguity keeps the local roster and schedules authoritative reconciliation", () => {
  assert.match(
    releaseFlow,
    /catch \{[\s\S]*setSaveStatus\(marketUi\.releaseConnectionUnavailable\)[\s\S]*setMarketInventoryRevision\(\(revision\) => revision \+ 1\)[\s\S]*return false/,
  );
  assert.doesNotMatch(releaseFlow, /setMarketWalletBalanceTc|writeMarketWalletBalanceTc/);
});

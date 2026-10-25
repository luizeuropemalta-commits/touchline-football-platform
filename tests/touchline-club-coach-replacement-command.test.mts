import test from "node:test";
import assert from "node:assert/strict";
import { isClubCoachReplacementReceipt, parseClubCoachReplacementCommand, parseClubCoachReplacementEnvelope, parseClubCoachReplacementResponse, selectClubCoachReplacementSnapshot } from "../lib/touchlineFantasy/club-coach-replacement-command.ts";
import { replaceClubCoach } from "../lib/touchlineFantasy/club-coach-replacement.ts";
import { inspectClubAcquisition, type ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";

const authority = { expectedAccountId: "11111111-1111-4111-8111-111111111111", expectedSeasonId: "22222222-2222-4222-8222-222222222222" };
const command = { action: "replace-coach" as const, currentCoachId: "307", incomingCoachId: "455907", expectedRevision: 3, idempotencyKey: "replace_coach_1" };
const before = (): ClubAcquisitionState => ({ revision: 3, seasonId: authority.expectedSeasonId, plan: "standard", balanceEur: 100_000_000,
  coach: { id: "307", tier: "ruby-red", valueEur: 5_000_000 }, players: [], receipts: [] });
const response = () => ({ ok: true as const, accountId: authority.expectedAccountId, seasonId: authority.expectedSeasonId,
  ...replaceClubCoach(before(), command, { marketOpen: true, roundLocked: false, offer: { id: "455907", tier: "sapphire-blue", valueEur: 10_000_000, published: true } }), replayed: false });
const parse = (input: unknown) => parseClubCoachReplacementResponse(input, command, authority, before());

test("legacy replacement receipts reject vacant before or after state without accepting a hire", () => {
  const result = response();
  assert.equal(parseClubCoachReplacementResponse(result, command, authority, { ...before(), coach: null }), null);
  const vacant = { ...result, state: { ...result.state, coach: null } };
  assert.equal(parse(vacant), null);
  const current = before();
  assert.strictEqual(selectClubCoachReplacementSnapshot(current, vacant, authority), current);
});

test("strict command and envelope preserve input; numeric catalogue ids are not UUIDs", () => {
  const input = { ...command, ...authority }, copy = structuredClone(input);
  assert.deepEqual(parseClubCoachReplacementCommand(command), command);
  assert.deepEqual(parseClubCoachReplacementEnvelope(input, authority), { authority, command });
  assert.deepEqual(input, copy);
  for (const key of ["price", "balance", "ownerId", "fee", "refund", "marketOpen", "unknown"]) {
    assert.equal(parseClubCoachReplacementEnvelope({ ...input, [key]: 1 }, authority), null);
    assert.equal(parseClubCoachReplacementCommand({ ...command, [key]: 1 }), null);
  }
  for (const key of Object.keys(command)) { const incomplete = { ...command } as Record<string, unknown>; delete incomplete[key]; assert.equal(parseClubCoachReplacementCommand(incomplete), null); }
});
test("invalid ids, authority spoofing, unsafe revisions and bad keys fail closed", () => {
  for (const id of ["", " ", "307 ", "sportmonks:307", authority.expectedAccountId, "1".repeat(17), 307, null]) {
    assert.equal(parseClubCoachReplacementCommand({ ...command, currentCoachId: id }), null);
    assert.equal(parseClubCoachReplacementCommand({ ...command, incomingCoachId: id }), null);
  }
  assert.equal(parseClubCoachReplacementCommand({ ...command, incomingCoachId: command.currentCoachId }), null);
  for (const revision of [-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER, "3"]) assert.equal(parseClubCoachReplacementCommand({ ...command, expectedRevision: revision }), null);
  for (const idempotencyKey of ["short", "a".repeat(121), "has spaces", 1, null]) assert.equal(parseClubCoachReplacementCommand({ ...command, idempotencyKey }), null);
  for (const field of ["expectedAccountId", "expectedSeasonId"]) {
    assert.equal(parseClubCoachReplacementEnvelope({ ...command, ...authority, [field]: "bad" }, authority), null);
    assert.equal(parseClubCoachReplacementEnvelope({ ...command, ...authority, [field]: "33333333-3333-4333-8333-333333333333" }, authority), null);
  }
  assert.equal(parseClubCoachReplacementEnvelope({ ...command, ...authority }, { ...authority, expectedAccountId: "bad" }), null);
  for (const invalid of [null, [], "command", {}, true]) assert.equal(parseClubCoachReplacementCommand(invalid), null);
});
test("receipt and response accept exact deterministic financial result without mutation", () => {
  const input = response(), copy = structuredClone(input);
  assert.equal(isClubCoachReplacementReceipt(input.receipt, command), true);
  assert.deepEqual(parse(input), input);
  assert.deepEqual(input, copy);
});
test("receipt rejects mismatched command, extras, broken money and revision", () => {
  const { receipt } = response();
  for (const changes of [{ key: "other_key" }, { outgoingCoachId: "95" }, { incomingCoachId: "307" }, { feeCredits: 0 }, { refundCredits: 5_000_000 }, { paidCredits: 1 }, { signingCredits: 1 }, { balanceCredits: -1 }, { revision: 3 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { extra: true }]) {
    assert.equal(isClubCoachReplacementReceipt({ ...receipt, ...changes }, command), false);
  }
  for (const field of ["paidCredits", "feeCredits", "refundCredits", "signingCredits", "balanceCredits", "revision"]) for (const value of [null, NaN, Infinity, 0.5, "1"]) {
    assert.equal(isClubCoachReplacementReceipt({ ...receipt, [field]: value }, command), false);
  }
  assert.equal(isClubCoachReplacementReceipt(null, command), false);
});
test("response rejects spoofed identity, broken balance, missing state and mismatched new coach", () => {
  const input = response();
  for (const changes of [{ ok: false }, { replayed: "false" }, { accountId: authority.expectedSeasonId }, { seasonId: authority.expectedAccountId }, { state: null }, { receipt: null }, { extra: 1 }]) assert.equal(parse({ ...input, ...changes }), null);
  assert.equal(parse({ ...input, receipt: { ...input.receipt, balanceCredits: input.receipt.balanceCredits + 1 } }), null);
  assert.equal(parse({ ...input, state: { ...input.state, coach: before().coach } }), null);
  assert.equal(parse({ ...input, state: { ...input.state, balanceEur: input.state.balanceEur + 1 } }), null);
  assert.equal(parse({ ...input, state: { ...input.state, revision: 2 } }), null);
  assert.equal(parse({ ...input, state: { ...input.state, seasonId: authority.expectedAccountId } }), null);
  assert.equal(parseClubCoachReplacementResponse(input, command, authority, { ...before(), revision: 2 }), null);
  assert.equal(parseClubCoachReplacementResponse(input, command, authority, { ...before(), coach: { ...before().coach!, id: "95" } }), null);
  for (const invalid of [null, [], {}, "response"]) assert.equal(parse(invalid), null);
});
test("replay may return later current state with another coach; late response never rolls view backward", () => {
  const input = response();
  const newer: ClubAcquisitionState = { ...input.state, revision: 6, balanceEur: 50_000_000, coach: { id: "95", tier: "ruby-red", valueEur: 5_000_000 } };
  const replay = parse({ ...input, replayed: true, state: newer });
  assert.ok(replay);
  assert.equal(replay.receipt.revision, 4);
  assert.strictEqual(selectClubCoachReplacementSnapshot(newer, parse(input)!, authority), newer);
  assert.strictEqual(selectClubCoachReplacementSnapshot(input.state, replay, authority), newer);
  const initial = before();
  assert.strictEqual(selectClubCoachReplacementSnapshot(initial, replay, { ...authority, expectedSeasonId: authority.expectedAccountId }), initial);
});

function contractedBefore(): ClubAcquisitionState {
  return { ...before(), formationCode: "4-3-3", players: [
    { playerId: "keeper-one", clubId: "club", position: "GK", valueEur: 1_000_000, area: "outside", slot: 0 },
    { playerId: "keeper-two", clubId: "club", position: "GK", valueEur: 2_000_000, area: "outside", slot: 1 },
  ], receipts: [
    { key: "purchase_one", playerId: "keeper-one", area: "outside", slot: 0, valueEur: 1_000_000, revision: 1 },
    { key: "purchase_two", playerId: "keeper-two", area: "outside", slot: 1, valueEur: 2_000_000, revision: 2 },
  ] };
}
function contractedResponse(original: ClubAcquisitionState) {
  return { ok: true as const, accountId: authority.expectedAccountId, seasonId: authority.expectedSeasonId,
    ...replaceClubCoach(original, command, { marketOpen: true, roundLocked: false,
      offer: { id: "455907", tier: "sapphire-blue", valueEur: 10_000_000, published: true } }), replayed: false };
}
const withoutFormation = (state: ClubAcquisitionState): ClubAcquisitionState => {
  const result = { ...state }; delete result.formationCode; return result;
};

test("operation-revision replacement rejects unrelated valid snapshot changes, including exact replays", () => {
  const original = contractedBefore(), input = contractedResponse(original);
  const changes: Array<[string, (state: ClubAcquisitionState) => ClubAcquisitionState]> = [
    ["plan", state => ({ ...state, plan: "vip" })],
    ["player removed", state => ({ ...state, players: state.players.slice(1) })],
    ["player added", state => ({ ...state, players: [...state.players, { ...state.players[0], playerId: "keeper-three", slot: 2 }] })],
    ["player contract", state => ({ ...state, players: state.players.map((player, index) => index ? player : { ...player, valueEur: 3_000_000 }) })],
    ["player position", state => ({ ...state, players: state.players.map((player, index) => index ? player : { ...player, position: "CB" }) })],
    ["player allocation", state => ({ ...state, players: state.players.map((player, index) => index ? player : { ...player, slot: 2 }) })],
    ["player order", state => ({ ...state, players: [...state.players].reverse() })],
    ["receipt removed", state => ({ ...state, receipts: state.receipts.slice(1) })],
    ["receipt added", state => ({ ...state, receipts: [...state.receipts, { ...state.receipts[0], key: "purchase_three", revision: 3 }] })],
    ["receipt changed", state => ({ ...state, receipts: state.receipts.map((receipt, index) => index ? receipt : { ...receipt, valueEur: 3_000_000 }) })],
    ["receipt order", state => ({ ...state, receipts: [...state.receipts].reverse() })],
    ["formation removed", withoutFormation],
    ["formation changed", state => ({ ...state, formationCode: "4-4-2" })],
  ];
  const originalCopy = structuredClone(original), inputCopy = structuredClone(input);
  for (const [name, change] of changes) for (const replayed of [false, true]) {
    const candidate = { ...input, replayed, state: change(input.state) };
    assert.doesNotThrow(() => inspectClubAcquisition(candidate.state), `${name} must test transition integrity, not malformed input`);
    assert.equal(parseClubCoachReplacementResponse(candidate, command, authority, original), null, `${name}; replayed=${replayed}`);
  }
  assert.deepEqual(original, originalCopy); assert.deepEqual(input, inputCopy);
});

test("operation snapshot distinguishes omitted fields from undefined without depending on property order", () => {
  const absent = withoutFormation(contractedBefore());
  const explicit = { ...absent, formationCode: undefined };
  for (const [original, changed] of [[absent, explicit], [explicit, absent]] as const) {
    const input = contractedResponse(original);
    assert.equal(parseClubCoachReplacementResponse({ ...input, state: { ...changed,
      coach: input.state.coach, balanceEur: input.state.balanceEur, revision: input.state.revision } }, command, authority, original), null);
  }
  const noFormation = contractedResponse(absent);
  assert.equal(parseClubCoachReplacementResponse({ ...noFormation, state: { ...noFormation.state, formationCode: "4-3-3" } }, command, authority, absent), null);
  for (const original of [contractedBefore(), { ...contractedBefore(), players: contractedBefore().players.map(player => ({ ...player, primaryDetail: undefined })) }]) {
    const input = contractedResponse(original);
    const players = input.state.players.map(player => {
      const changed = { ...player };
      if (Object.hasOwn(changed, "primaryDetail")) delete changed.primaryDetail;
      else changed.primaryDetail = undefined;
      return changed;
    });
    assert.doesNotThrow(() => inspectClubAcquisition({ ...input.state, players }));
    assert.equal(parseClubCoachReplacementResponse({ ...input, state: { ...input.state, players } }, command, authority, original), null);
  }
  const original = contractedBefore(), input = contractedResponse(original);
  const reorder = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
  const reordered = { ...input, state: reorder({ ...input.state,
    players: input.state.players.map(reorder), receipts: input.state.receipts.map(reorder) }) };
  const copy = structuredClone(reordered);
  assert.deepEqual(parseClubCoachReplacementResponse(reordered, command, authority, original), reordered);
  assert.deepEqual(reordered, copy);
});

test("a newer replay snapshot may include later unrelated operations, never a non-replay response", () => {
  const original = contractedBefore(), input = contractedResponse(original);
  const newer: ClubAcquisitionState = { ...input.state, revision: 6, plan: "vip", formationCode: "4-4-2",
    balanceEur: 50_000_000, coach: { id: "95", tier: "ruby-red", valueEur: 5_000_000 },
    players: input.state.players.slice(1), receipts: [...input.state.receipts, { ...input.state.receipts[0], key: "later_purchase", revision: 5 }] };
  const parsed = parseClubCoachReplacementResponse({ ...input, replayed: true, state: newer }, command, authority, original);
  assert.ok(parsed); assert.strictEqual(parsed.state, newer); assert.equal(parsed.receipt.revision, 4);
  assert.equal(parseClubCoachReplacementResponse({ ...input, state: newer }, command, authority, original), null);
  const exact = parseClubCoachReplacementResponse(input, command, authority, original)!;
  assert.strictEqual(selectClubCoachReplacementSnapshot(newer, exact, authority), newer);
});

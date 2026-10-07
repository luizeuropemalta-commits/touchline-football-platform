import assert from "node:assert/strict";
import test from "node:test";
import {
  readLineupReminderSource,
  type LineupReminderRpcPort,
  type LineupReminderSource,
} from "../lib/touchlineFantasy/lineup-reminder-source.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { userId: id(1), gameweekId: id(2), competitionId: id(3), seasonId: id(4) };
const policy = () => ({ ...scope, maximumAgeMs: 1_000 });
function source(count = 11): LineupReminderSource {
  const slotIds = Array.from({ length: 11 }, (_, i) => `slot-${i}`);
  return { schemaVersion: 1, ...scope, checkedAtMs: 9_500, read: {
    status: "complete", checkedAtMs: 9_500, marketEditable: true, effectiveDeadlineMs: 20_000,
    formation: { published: true, code: "4-3-3", slotIds },
    userGameweek: { state: "DRAFT", formationCode: "4-3-3", selectedCoachId: "307" },
    selections: slotIds.slice(0, count).map((slotId, i) => ({ slotId, playerId: id(100 + i) })),
  } };
}
function port(data: unknown, error: unknown = null): LineupReminderRpcPort {
  return { rpc: async (name, args) => {
    assert.equal(name, "touchline_fantasy_read_lineup_reminder");
    assert.deepEqual(args, { p_user_id: scope.userId, p_gameweek_id: scope.gameweekId });
    return { data, error };
  } };
}
const read = (data: unknown) => readLineupReminderSource(port(data), policy(), () => 10_000);
const unavailable = { status: "UNAVAILABLE", source: null };

test("actual adapter and classifier distinguish zero/eleven, confirmed and closed without writes", async () => {
  for (const [count, expected] of [[0, "INCOMPLETE"], [11, "COMPLETE_UNCONFIRMED"]] as const) {
    const dto = source(count), result = await read(dto);
    assert.equal(result.status, expected); assert.deepEqual(result.source, dto);
  }
  const confirmed = source(); confirmed.read.userGameweek!.state = "CONFIRMED";
  assert.equal((await read(confirmed)).status, "CONFIRMED");
  confirmed.read.selections.pop(); assert.deepEqual(await read(confirmed), unavailable);
  for (const state of ["LOCKED", "FINAL"] as const) {
    const dto = source(); dto.read.userGameweek!.state = state;
    assert.equal((await read(dto)).status, "CLOSED");
  }
  const deadline = source(); deadline.read.effectiveDeadlineMs = 10_000;
  assert.equal((await read(deadline)).status, "CLOSED");
  const closed = source(); closed.read.marketEditable = false;
  assert.equal((await read(closed)).status, "CLOSED");
  const absent = source(0); absent.read.userGameweek = null;
  assert.equal((await read(absent)).status, "INCOMPLETE");
});

test("null, RPC errors, throws and unavailable DTO never masquerade as empty team", async () => {
  for (const data of [null, undefined, [], {}, { ...source(), read: { status: "unavailable" } }]) {
    assert.deepEqual(await read(data), unavailable);
  }
  assert.deepEqual(await readLineupReminderSource(port(source(0), { message: "private detail" }), policy(), () => 10_000), unavailable);
  assert.deepEqual(await readLineupReminderSource({ rpc: async () => { throw new Error("private detail"); } }, policy(), () => 10_000), unavailable);
});

test("exact schema and all four requested identities must match; no coercion", async () => {
  for (const key of ["userId", "gameweekId", "competitionId", "seasonId"] as const) {
    for (const wrong of [id(999), "invalid", null, 1]) assert.deepEqual(await read({ ...source(), [key]: wrong }), unavailable);
  }
  for (const schemaVersion of [undefined, "1", 2]) assert.deepEqual(await read({ ...source(), schemaVersion }), unavailable);
});

test("malformed entire shapes fail closed, even on a known closed round; arrays are not filtered", async () => {
  const changes: Array<(dto: LineupReminderSource) => unknown> = [
    dto => ({ ...dto, read: { ...dto.read, selections: [null, ...dto.read.selections.slice(1)] } }),
    dto => ({ ...dto, read: { ...dto.read, selections: {} } }),
    dto => ({ ...dto, read: { ...dto.read, selections: [...dto.read.selections, dto.read.selections[0]] } }),
    dto => ({ ...dto, read: { ...dto.read, userGameweek: undefined } }),
    dto => ({ ...dto, read: { ...dto.read, marketEditable: "true" } }),
    dto => ({ ...dto, read: { ...dto.read, effectiveDeadlineMs: "20000" } }),
    dto => { dto.read.selections[0].playerId = "invalid"; return dto; },
    dto => { dto.read.selections[1].playerId = dto.read.selections[0].playerId; return dto; },
    dto => { dto.read.selections[1].slotId = dto.read.selections[0].slotId; return dto; },
    dto => { dto.read.selections[0].slotId = "unknown"; return dto; },
    dto => { dto.read.formation.slotIds[1] = dto.read.formation.slotIds[0]; return dto; },
    dto => { dto.read.formation.slotIds.pop(); return dto; },
    dto => { dto.read.formation.published = false; return dto; },
    dto => { dto.read.userGameweek!.formationCode = "4-4-2"; return dto; },
    dto => { dto.read.userGameweek!.selectedCoachId = "12345678901234567"; return dto; },
    dto => { dto.read.userGameweek = null; return dto; },
  ];
  for (const change of changes) for (const marketEditable of [true, false]) {
    const dto = source(); dto.read.marketEditable = marketEditable;
    assert.deepEqual(await read(change(dto)), unavailable);
  }
});

test("original matching timestamps must be finite, nonfuture and fresh at completion", async () => {
  for (const checkedAtMs of [NaN, Infinity, -1, 9_500.5, 10_001, 8_999, "9500"]) {
    const dto = source();
    assert.deepEqual(await read({ ...dto, checkedAtMs, read: { ...dto.read, checkedAtMs } }), unavailable);
  }
  const mismatch = source(); mismatch.read.checkedAtMs++;
  assert.deepEqual(await read(mismatch), unavailable);
  const edge = source(); edge.checkedAtMs = edge.read.checkedAtMs = 9_000;
  assert.equal((await read(edge)).status, "COMPLETE_UNCONFIRMED");
  let calls = 0;
  assert.deepEqual(await readLineupReminderSource(port(source()), policy(), () => calls++ === 0 ? 10_000 : 10_501), unavailable);
  calls = 0;
  assert.deepEqual(await readLineupReminderSource(port(source()), policy(), () => calls++ === 0 ? 10_000 : 9_999), unavailable);
  calls = 0;
  const during = source(); during.checkedAtMs = during.read.checkedAtMs = 10_050;
  assert.equal((await readLineupReminderSource(port(during), policy(), () => calls++ === 0 ? 10_000 : 10_100)).status, "COMPLETE_UNCONFIRMED");
});

test("invalid requests do not invoke the port", async () => {
  let calls = 0;
  const never: LineupReminderRpcPort = { rpc: async () => { calls++; return { data: null, error: null }; } };
  for (const maximumAgeMs of [0, -1, NaN, Infinity, 0.5]) {
    assert.deepEqual(await readLineupReminderSource(never, { ...scope, maximumAgeMs }, () => 10_000), unavailable);
  }
  for (const now of [NaN, Infinity, -1, 0.5]) assert.deepEqual(await readLineupReminderSource(never, policy(), () => now), unavailable);
  for (const key of ["userId", "gameweekId", "competitionId", "seasonId"] as const) {
    assert.deepEqual(await readLineupReminderSource(never, { ...policy(), [key]: "bad" }, () => 10_000), unavailable);
  }
  assert.equal(calls, 0);
});

test("scope/policy are captured before await, and validated output does not alias transport objects", async () => {
  const request = policy(), dto = source();
  const result = await readLineupReminderSource({ rpc: async () => {
    request.userId = id(999); request.maximumAgeMs = 1;
    return { data: dto, error: null };
  } }, request, () => 10_000);
  assert.equal(result.status, "COMPLETE_UNCONFIRMED");
  const copy = structuredClone(result.source);
  dto.read.selections[0].playerId = id(999); dto.read.formation.slotIds[0] = "changed";
  dto.read.userGameweek!.selectedCoachId = null;
  assert.deepEqual(result.source, copy);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createArenaSaveIntent } from "../lib/touchlineArena/arena-save-intent.ts";

test("in-flight writes serialize; unknown completion blocks subsequent edits", () => {
  const gate = createArenaSaveIntent(); gate.scope("a");
  const first = gate.edit("a")!; assert.equal(gate.claim("a", first), true);
  const second = gate.edit("a")!;
  assert.equal(gate.claim("a", second), false, "second write must wait for acknowledgement");
  assert.equal(gate.settle("a", first, true), true);
  assert.equal(gate.claim("a", second), true);
  gate.settle("a", second, false);
  assert.equal(gate.edit("a"), null);
  gate.scope("b"); gate.scope("a");
  assert.equal(gate.edit("a"), null, "switching accounts cannot clear uncertain write");
});

test("remote autosave requires explicit intent and acknowledges HTTP success before status", () => {
  const source = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const start = source.indexOf("if (!hasLoadedSavedLineup || !hasLoadedClubOwnerRoster");
  const effect = source.slice(start, source.indexOf("useEffect(() =>", start));
  assert.match(effect, /arenaSaveIntent\.ticket/);
  assert.match(effect, /arenaSaveIntent\.claim/);
  assert.match(effect, /response\.ok/);
  assert.match(effect, /acknowledgement\?\.ok !== true/);
  assert.ok(effect.indexOf("acknowledgement?.ok !== true") < effect.indexOf('t("autoSaved")'));
});

function realEffect(ack: boolean, deferred = false, source = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8")) {
  const start = source.indexOf("if (!hasLoadedSavedLineup || !hasLoadedClubOwnerRoster");
  const end = source.indexOf("}, [arenaAccountSyncStatus", start);
  const gate = createArenaSaveIntent(); gate.scope("a");
  const timers = new Map<number, () => void>(); let sequence = 0, writes = 0;
  const statuses: string[] = [];
  let resolveRequest: (() => void) | undefined;
  let revisionState = 0, dependencyChanged = false;
  const context = vm.createContext({
    hasLoadedSavedLineup: true, hasLoadedClubOwnerRoster: true, isDemoLineup: false,
    arenaPersistencePrincipal: { kind: "authenticated", userId: "a" }, isQaReadOnly: false,
    isQuickSubstitutionOpen: false, isArenaMatchdayViewActive: false, players: [{ id: "p" }],
    accountLineupSaveTimerRef: { current: null }, selectedFormationKey: "4-3-3",
    arenaAccountSyncStatus: "ready", arenaRosterSyncStatus: "ready", arenaSavePrincipal: "a",
    arenaSaveIntent: gate, saveLineup() {}, canPersistArenaAccountState: () => true,
    lockArenaPlayerSize: (p: unknown) => p, readLockedFormationLayouts: () => ({}),
    setSaveStatus: (s: string) => statuses.push(s), t: (s: string) => s, queueMicrotask,
    setArenaSaveRevision(value: number | ((previous: number) => number)) {
      const next = typeof value === "function" ? value(revisionState) : value;
      if (!Object.is(next, revisionState)) dependencyChanged = true;
      revisionState = next;
    },
    blockQaReadOnlyMutation: () => false, persistArenaRoster() {}, benchPlayers: [],
    AbortController, fetch: async () => { writes++; if (deferred) await new Promise<void>(resolve => { resolveRequest = resolve; }); return { ok: ack, json: async () => ({ ok: ack }) }; },
    window: { setTimeout: (fn: () => void) => { timers.set(++sequence, fn); return sequence; }, clearTimeout: (id: number) => timers.delete(id) },
  });
  const handlerStart = source.indexOf("function requestArenaStateSave()");
  const handlerEnd = source.indexOf("\n  useEffect(", handlerStart);
  const manualStart = source.indexOf("function handleManualSave()");
  const manualEnd = source.indexOf("\n  function writeQaVisualDraft", manualStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart && manualStart >= 0 && manualEnd > manualStart);
  const code = ts.transpileModule(`${source.slice(handlerStart, handlerEnd)}\n${source.slice(manualStart, manualEnd)}\nfunction effect() { ${source.slice(start, end)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  vm.runInContext(code, context);
  return { gate, statuses, writes: () => writes, resolve: () => resolveRequest?.(),
    edit: () => vm.runInContext("requestArenaStateSave()", context),
    manual: () => vm.runInContext("handleManualSave()", context),
    flushChangedDependency: () => { if (dependencyChanged) { dependencyChanged = false; vm.runInContext("effect()", context); } },
    run: () => vm.runInContext("effect()", context) as (() => void) | undefined,
    fire: () => { const first = timers.entries().next().value; if (first) { timers.delete(first[0]); first[1](); } },
  };
}

test("queued A/B acknowledgements cannot swallow a later unchanged Manual Save", async () => {
  const source = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const oldSource = source.replace("if (revision !== null) setArenaSaveRevision((value) => value + 1);", "if (revision !== null) setArenaSaveRevision(revision);");
  assert.notEqual(oldSource, source, "counterfactual must restore the former assignment");
  async function scenario(input: string) {
    const h = realEffect(true, true, input);
    h.edit(); h.flushChangedDependency(); h.fire(); assert.equal(h.writes(), 1);
    h.edit(); h.flushChangedDependency(); assert.equal(h.writes(), 1);
    h.resolve(); await new Promise(resolve => setImmediate(resolve));
    h.flushChangedDependency(); h.fire(); assert.equal(h.writes(), 2);
    h.resolve(); await new Promise(resolve => setImmediate(resolve));
    h.manual(); h.flushChangedDependency(); h.fire();
    assert.equal(h.writes(), 3, "Manual Save must dispatch even when players and formation are unchanged");
    h.resolve(); await new Promise(resolve => setImmediate(resolve));
  }
  // RED uses the previous production handler only in memory; saved source is untouched.
  await assert.rejects(scenario(oldSource), /Manual Save must dispatch/);
  await scenario(source);
});

test("deferred request A prevents B dispatch until A ack; unknown A blocks B", async () => {
  for (const ack of [true, false]) {
    const h = realEffect(ack, true);
    h.gate.edit("a"); h.run(); h.fire(); assert.equal(h.writes(), 1);
    h.gate.edit("a"); h.run(); assert.equal(h.writes(), 1);
    h.resolve(); await new Promise(resolve => setImmediate(resolve));
    h.run(); h.fire(); assert.equal(h.writes(), ack ? 2 : 1);
    if (ack) { h.resolve(); await new Promise(resolve => setImmediate(resolve)); }
  }
});

test("deferred timeout then edit B and late success A remain blocked without autoSaved", async () => {
  const h = realEffect(true, true);
  h.gate.edit("a"); h.run(); h.fire();
  assert.equal(h.writes(), 1);
  h.fire(); // The only remaining timer is the request deadline.
  assert.equal(h.gate.blocked("a"), true);
  assert.equal(h.gate.edit("a"), null);
  h.run(); h.fire(); assert.equal(h.writes(), 1);
  h.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.gate.blocked("a"), true);
  assert.equal(h.gate.edit("a"), null);
  assert.deepEqual(h.statuses, ["savedLocallySyncUnavailable"]);
  h.run(); h.fire(); assert.equal(h.writes(), 1);
});

test("A to B to A scope transition cannot overlap pending A or accept its stale status", async () => {
  const h = realEffect(true, true);
  h.gate.edit("a"); h.run(); h.fire(); assert.equal(h.writes(), 1);
  h.gate.scope("b");
  assert.equal(h.gate.edit("a"), null);
  h.gate.scope("a");
  const next = h.gate.edit("a"); assert.notEqual(next, null);
  h.run(); assert.equal(h.gate.ticket("a"), null);
  assert.equal(h.writes(), 1);
  h.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.statuses, [], "old A acknowledgement cannot label newer A edit saved");
  assert.equal(h.gate.ticket("a"), next);
  h.run(); h.fire(); assert.equal(h.writes(), 2);
  h.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.statuses, ["autoSaved"]);
});

test("real autosave effect: hydration zero PUT; edit one PUT; success only after acknowledgement", async () => {
  const h = realEffect(true);
  h.run(); h.run(); h.fire(); assert.equal(h.writes(), 0);
  h.gate.edit("a"); h.run(); h.fire();
  assert.equal(h.writes(), 1); assert.deepEqual(h.statuses, []);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.statuses, ["autoSaved"]);
  h.run(); h.fire(); assert.equal(h.writes(), 1);
});

test("real autosave effect: cancelled timer, changed principal and rejected acknowledgement", async () => {
  const cancelled = realEffect(true); cancelled.gate.edit("a"); cancelled.run()?.(); cancelled.fire();
  assert.equal(cancelled.writes(), 0);
  const stale = realEffect(true); stale.gate.edit("a"); stale.run(); stale.gate.scope("b"); stale.fire();
  assert.equal(stale.writes(), 0);
  const failed = realEffect(false); failed.gate.edit("a"); failed.run(); failed.fire();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(failed.statuses, ["savedLocallySyncUnavailable"]);
  failed.run(); failed.fire(); assert.equal(failed.writes(), 1);
});

test("mount and repeated hydration never create remote write authority", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  for (let i = 0; i < 5; i++) { gate.scope("a"); assert.equal(gate.ticket("a"), null); }
});
test("explicit edit authorizes one attempt only, including unknown outcome", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  const ticket = gate.edit("a")!;
  assert.equal(gate.claim("a", ticket), true);
  assert.equal(gate.claim("a", ticket), false);
  assert.equal(gate.ticket("a"), null);
});
test("principal change rejects stale timer and acknowledgement", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  const ticket = gate.edit("a")!; gate.scope("b");
  assert.equal(gate.edit("a"), null, "late async edit cannot restore the old principal");
  assert.equal(gate.claim("a", ticket), false);
  assert.equal(gate.current("a", ticket), false);
  assert.equal(gate.ticket("b"), null);
});
test("rapid edits invalidate old timers and preserve the newest intent", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  const first = gate.edit("a")!; const latest = gate.edit("a")!;
  assert.equal(gate.claim("a", first), false);
  assert.equal(gate.claim("a", latest), true);
  const next = gate.edit("a");
  assert.equal(gate.current("a", latest), false);
  assert.equal(gate.ticket("a"), null);
  gate.settle("a", latest, true);
  assert.equal(gate.ticket("a"), next);
});

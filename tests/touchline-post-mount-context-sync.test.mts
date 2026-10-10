import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function effect(path: string, setter: string) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect"
      && node.arguments[0]?.getText(tree).includes(`${setter}(`)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(matches.length, 1, setter);
  return ts.transpileModule(matches[0].getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

function frames() {
  let next = 0;
  const pending = new Map<number, () => void>();
  return {
    window: {
      requestAnimationFrame(callback: () => void) { pending.set(++next, callback); return next; },
      cancelAnimationFrame(id: number) { pending.delete(id); },
    },
    flush() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); },
    size: () => pending.size,
  };
}

function mount(code: string, scheduler: ReturnType<typeof frames>, context: Record<string, unknown>) {
  let commit: (() => () => void) | undefined;
  runInNewContext(code, {
    ...context, window: scheduler.window,
    useEffect(callback: () => () => void) { commit = callback; },
    fetch: () => assert.fail("context synchronization must not fetch"),
  });
  assert.ok(commit);
  return commit();
}

const filterCode = effect("app/fantasy/FantasyGameweekClient.tsx", "applyPlayerClubTeamId");
const zoneCode = effect("components/touchline/match-centre/TouchlineMatchCentre.tsx", "setTimeZone");

test("club handoff writes only after commit/frame; cleanup rejects stale routes and preserves draft state", () => {
  const scheduler = frames();
  let selected = "manual-club", writes = 0;
  const draft = Object.freeze({ coach: "coach", formation: "4-3-3", player: "kept" });
  const context = {
    appliedClubRoute: { current: "initial" },
    clubSelectionVersion: { current: 0 },
    TOUCHLINE_ENGLAND_CLUBS_BY_RANK: [{ teamId: "first" }, { teamId: "second" }],
    applyPlayerClubTeamId(update: (current: string) => string) { writes++; selected = update(selected); },
    setSelections: () => assert.fail("do not reset XI"),
    setSelectedCoachId: () => assert.fail("do not reset coach"),
    setFormationCode: () => assert.fail("do not reset formation"),
    draft,
  };
  const disposeOld = mount(filterCode, scheduler, { ...context, initialPlayerClubTeamId: "first" });
  assert.equal(writes, 0); assert.equal(selected, "manual-club");
  disposeOld();
  const disposeNew = mount(filterCode, scheduler, { ...context, initialPlayerClubTeamId: "second" });
  assert.equal(scheduler.size(), 1);
  scheduler.flush();
  assert.equal(writes, 1); assert.equal(selected, "second");
  disposeNew();
  const disposeUnmount = mount(filterCode, scheduler, { ...context, initialPlayerClubTeamId: "first" });
  disposeUnmount(); scheduler.flush();
  assert.equal(writes, 1); assert.equal(selected, "second");
  assert.deepEqual(draft, { coach: "coach", formation: "4-3-3", player: "kept" });
  mount(filterCode, scheduler, { ...context, initialPlayerClubTeamId: "unknown" }); scheduler.flush();
  assert.equal(selected, "first", "unknown handoff uses the existing canonical fallback");
  mount(filterCode, scheduler, { ...context, initialPlayerClubTeamId: "second" });
  context.clubSelectionVersion.current++;
  selected = "manual-club";
  scheduler.flush();
  assert.equal(selected, "manual-club", "a manual choice wins over the pending route frame");
  const before = writes;
  mount(filterCode, scheduler, { ...context, initialPlayerClubTeamId: "second" });
  assert.equal(scheduler.size(), 0, "already applied initial route needs no frame");
  assert.equal(writes, before);
});

test("timezone preserves SSR value until frame and cancels obsolete fallback/unmounted updates", () => {
  const scheduler = frames();
  let zone = "UTC";
  const reads: string[] = [], writes: string[] = [];
  const context = {
    browserTimeZone(fallback: string) { reads.push(fallback); return "Europe/Malta"; },
    setTimeZone(value: string) { writes.push(value); zone = value; },
  };
  const disposeOld = mount(zoneCode, scheduler, { ...context, initialTimeZone: "UTC" });
  assert.equal(zone, "UTC"); assert.deepEqual(reads, []); assert.deepEqual(writes, []);
  disposeOld();
  const disposeNew = mount(zoneCode, scheduler, { ...context, initialTimeZone: "Europe/London" });
  scheduler.flush();
  assert.deepEqual(reads, ["Europe/London"]); assert.deepEqual(writes, ["Europe/Malta"]);
  disposeNew();
  const disposeUnmount = mount(zoneCode, scheduler, { ...context, initialTimeZone: "UTC" });
  disposeUnmount(); scheduler.flush();
  assert.equal(zone, "Europe/Malta"); assert.equal(writes.length, 1);
});

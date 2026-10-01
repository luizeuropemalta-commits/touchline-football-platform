import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import * as authority from "../lib/touchlineArena/card-leadership-authority.ts";

const require = createRequire(import.meta.url);
type Element = { type: unknown; props: Record<string, unknown> };
type Component = (props: Record<string, unknown>) => Element | Promise<Element>;
const provider = Symbol("leadership-provider");
const children = Symbol("unchanged-profile");
const record = { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 };
const coaches = { phase: "ranked" as const, snapshotId: "coach-snapshot", seasonId: "season", scoringVersion: "coach_scoring_v2" as const, fixtureIds: ["fixture"], generatedAt: null,
  rows: [{ rank: 1, coachProviderId: "42", coachName: "Coach", clubName: "Club", touchlinePoints: 6, wins: 2, draws: 0, losses: 0, awayWins: 1, home: record, away: record }] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function compile(path: string, imports: Record<string, unknown>, exportName = "default"): Component {
  const exports: Record<string, unknown> = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return require(name);
    assert.ok(Object.hasOwn(imports, name), `unexpected dependency: ${name}`);
    return imports[name];
  } });
  return exports[exportName] as Component;
}

function boundary(player: () => Promise<unknown>, coach: () => Promise<unknown>) {
  return compile("components/touchline/cards/TouchlineCardLeadershipBoundary.tsx", {
    "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: player },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: coach },
    "@/lib/touchlineArena/card-leadership-authority": authority,
    "./TouchlineCardLeadershipProvider": { TouchlineCardLeadershipProvider: provider },
  });
}

test("coach-only ignores a never-resolving player read and preserves canonical coach authority", async () => {
  let playerCalls = 0, coachCalls = 0;
  const never = new Promise<never>(() => {});
  const render = boundary(() => { playerCalls++; return never; }, async () => { coachCalls++; return coaches; });
  const pending = render({ enabled: true, scope: "coach-only", children });
  assert.equal(playerCalls, 0, "coach profile must not request player rankings");
  const result = await pending;
  assert.equal(coachCalls, 1);
  assert.equal(result.type, provider);
  assert.equal(result.props.children, children);
  assert.equal(result.props.livePlayerUpdates, false);
  assert.deepEqual(result.props.value, authority.buildTouchlineCardLeadershipValue(null, coaches));
});

test("coach-only still waits for the coach snapshot; late failure withdraws authority", async () => {
  const coach = deferred<typeof coaches>();
  const render = boundary(async () => assert.fail("player read forbidden"), () => coach.promise);
  let settled = false;
  const pending = Promise.resolve(render({ enabled: true, scope: "coach-only", children })).then(value => { settled = true; return value; });
  await setImmediate();
  assert.equal(settled, false);
  coach.reject(new Error("synthetic coach failure"));
  const result = await pending;
  assert.deepEqual(result.props.value, authority.EMPTY_CARD_LEADERSHIP_AUTHORITY);
  assert.equal(result.props.livePlayerUpdates, false);
});

test("default callers start both reads and await both before providing authority", async () => {
  const player = deferred<null>(), coach = deferred<typeof coaches>();
  let playerCalls = 0, coachCalls = 0, settled = false;
  const render = boundary(() => { playerCalls++; return player.promise; }, () => { coachCalls++; return coach.promise; });
  const pending = Promise.resolve(render({ enabled: true, children })).then(value => { settled = true; return value; });
  assert.equal(playerCalls, 1); assert.equal(coachCalls, 1);
  coach.resolve(coaches); await setImmediate(); assert.equal(settled, false);
  player.resolve(null);
  const result = await pending;
  assert.equal(result.props.livePlayerUpdates, true);
  assert.deepEqual(result.props.value, authority.buildTouchlineCardLeadershipValue(null, coaches));
});

test("disabled scope performs zero reads and preserves descendants", async () => {
  const render = boundary(async () => assert.fail("disabled player read"), async () => assert.fail("disabled coach read"));
  for (const scope of [undefined, "coach-only"]) {
    const result = await render({ enabled: false, scope, children });
    assert.equal(result.props.children, children);
    assert.deepEqual(result.props.value, authority.EMPTY_CARD_LEADERSHIP_AUTHORITY);
    assert.notEqual(result.props.livePlayerUpdates, true);
  }
});

test("immediate read failures and unavailable or ambiguous coach publications fail closed", async () => {
  for (const state of [null, { ...coaches, phase: "unavailable" }, { ...coaches, snapshotId: null }, { ...coaches, rows: [...coaches.rows, { ...coaches.rows[0], coachProviderId: "43" }] }]) {
    const result = await boundary(async () => null, async () => state)({ enabled: true, scope: "coach-only", children });
    assert.deepEqual(result.props.value, authority.EMPTY_CARD_LEADERSHIP_AUTHORITY);
  }
  const result = await boundary(async () => { throw Error("player"); }, async () => { throw Error("coach"); })({ enabled: true, children });
  assert.deepEqual(result.props.value, authority.EMPTY_CARD_LEADERSHIP_AUTHORITY);
});

test("real coach family selects coach-only; shared layout keeps isolation and direct-source gates", async () => {
  const boundaryComponent = Symbol("boundary");
  for (const isolated of [false, true]) for (const dataSource of ["direct", "mirror"]) {
    const layoutImports = {
      "next/headers": { headers: async () => ({ get: () => isolated ? "isolated" : null }) },
      "@/lib/touchlinePreview/isolation": { TOUCHLINE_ISOLATED_PREVIEW_HEADER: "preview", isTouchlineIsolatedPreviewRequest: (value: unknown) => value === "isolated" },
      "@/lib/touchlineMirror/runtime": { resolveTouchlineDataSource: () => dataSource },
      "./TouchlineCardLeadershipBoundary": { default: boundaryComponent },
    };
    const layout = compile("components/touchline/cards/TouchlineCardLeadershipLayout.tsx", layoutImports, "ScopedTouchlineCardLeadershipLayout");
    const coachLayout = compile("app/touchline-coaches/layout.tsx", {
      "@/components/touchline/cards/TouchlineCardLeadershipLayout": { ScopedTouchlineCardLeadershipLayout: layout },
    });
    const coachTree = await coachLayout({ children });
    assert.equal(coachTree.type, layout);
    const scoped = await layout(coachTree.props);
    assert.equal(scoped.type, boundaryComponent);
    assert.equal(scoped.props.scope, "coach-only");
    assert.equal(scoped.props.enabled, !isolated && dataSource === "direct");
    assert.equal(scoped.props.children, children);
    const defaultLayout = compile("components/touchline/cards/TouchlineCardLeadershipLayout.tsx", layoutImports);
    const defaultTree = await defaultLayout({ children });
    assert.equal(defaultTree.props.scope, "all");
    const unchanged = await (defaultTree.type as Component)(defaultTree.props);
    assert.equal(unchanged.props.scope, "all");
    assert.equal(unchanged.props.enabled, !isolated && dataSource === "direct");
  }
});

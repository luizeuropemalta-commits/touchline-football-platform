import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as authority from "../lib/touchlineArena/card-leadership-authority.ts";

const require = createRequire(import.meta.url);
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
type Element = { props: { value: unknown; children: unknown } };
function fixture(player: () => Promise<unknown>, coach: () => Promise<unknown>) {
  const timers = new Map<number, () => void>();
  let nextId = 0;
  const deadline: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(read("lib/touchlineArena/server-read-deadline.ts"), { compilerOptions: options }).outputText, {
    exports: deadline,
    setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 8_000); const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: player },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: coach },
    "@/lib/touchlineArena/server-read-deadline": deadline,
    "@/lib/touchlineArena/card-leadership-authority": authority,
    "./TouchlineCardLeadershipProvider": { TouchlineCardLeadershipProvider: "provider" },
  };
  const exports = {} as { default: (props: object) => Promise<Element> };
  runInNewContext(ts.transpileModule(read("components/touchline/cards/TouchlineCardLeadershipBoundary.tsx"), { compilerOptions: options }).outputText, {
    exports, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
  });
  return { render: exports.default, timers, expire: () => {
    for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
  } };
}

test("both stalled rankings release descendants at the bounded deadline", async () => {
  const never = () => new Promise<never>(() => {});
  const h = fixture(never, never);
  const pending = h.render({ enabled: true, children: "account" });
  assert.equal(h.timers.size, 2);
  h.expire();
  const result = await pending;
  assert.equal(result.props.children, "account");
  assert.deepEqual(result.props.value, authority.buildTouchlineCardLeadershipValue(null, null));
});

test("rejected reads withdraw leadership without waiting for the deadline", async () => {
  const fail = async () => { throw new Error("read unavailable"); };
  const h = fixture(fail, fail);
  const result = await h.render({ enabled: true, children: "account" });
  assert.deepEqual(result.props.value, authority.buildTouchlineCardLeadershipValue(null, null));
  assert.equal(h.timers.size, 0);
});

test("late results cannot replace the already returned fail-closed authority", async () => {
  const record = { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 };
  const late = { phase: "ranked" as const, snapshotId: "late", seasonId: "season", scoringVersion: "coach_scoring_v2" as const, fixtureIds: ["fixture"], generatedAt: null,
    rows: [{ rank: 1, coachProviderId: "42", coachName: "Coach", clubName: "Club", touchlinePoints: 6, wins: 2, draws: 0, losses: 0, awayWins: 1, home: record, away: record }] };
  let finish!: (value: typeof late) => void;
  const h = fixture(async () => null, () => new Promise<typeof late>(resolve => { finish = resolve; }));
  const pending = h.render({ enabled: true, children: "account" });
  h.expire();
  const result = await pending;
  const value = result.props.value;
  assert.notDeepEqual(authority.buildTouchlineCardLeadershipValue(null, late), value);
  finish(late);
  await Promise.resolve();
  assert.equal(result.props.value, value);
  assert.deepEqual(value, authority.buildTouchlineCardLeadershipValue(null, null));
});

test("disabled gate starts no reads or deadlines; coach-only never reads players", async () => {
  const forbidden = async () => assert.fail("read forbidden by gate");
  const disabled = fixture(forbidden, forbidden);
  const result = await disabled.render({ enabled: false, children: "account" });
  assert.equal(disabled.timers.size, 0);
  assert.equal(result.props.value, authority.EMPTY_CARD_LEADERSHIP_AUTHORITY);
  const coachOnly = fixture(forbidden, () => new Promise<never>(() => {}));
  const pending = coachOnly.render({ enabled: true, scope: "coach-only", children: "coach" });
  assert.equal(coachOnly.timers.size, 1);
  coachOnly.expire();
  assert.equal((await pending).props.children, "coach");
});

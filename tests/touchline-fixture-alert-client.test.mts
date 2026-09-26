import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness(body: unknown, delayed = false) {
  const state: unknown[] = [true, 0, null, "loading"];
  const refs = [{ current: null }, { current: false }, { current: 0 }];
  let cursor = 0, refCursor = 0;
  let effect: (() => unknown) | undefined;
  let deadline: (() => void) | undefined;
  let release: (() => void) | undefined;
  const exports: { default?: (props: object) => unknown } = {};
  const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineFixtureAlerts.tsx", import.meta.url), "utf8");
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, AbortController,
    setTimeout: (action: () => void) => { deadline = action; return 1; }, clearTimeout() {},
    fetch: async () => ({ ok: true, status: 200, json: async () => {
      if (delayed) await new Promise<void>(resolve => { release = resolve; });
      return body;
    } }),
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return {
        useId: () => "fixture-alert",
        useState: () => { const i = cursor++; return [state[i], (value: unknown) => { state[i] = value; }]; },
        useRef: () => refs[refCursor++], useEffect: (action: () => unknown) => { effect = action; },
      };
      if (name === "lucide-react") return { Bell: "Bell", BellRing: "BellRing" };
      if (name.endsWith(".css")) return { default: {} };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const render = () => { cursor = 0; refCursor = 0; return exports.default!({ fixtureId: "123", label: "Arsenal vs Leeds", locale: "en-GB" }); };
  render();
  return { state, render, start: () => effect?.(), expire: () => deadline?.(), release: () => release?.() };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("saved fixture interest never shows a ringing bell without mobile delivery", async () => {
  const instance = harness({ ok: true, data: { subscribed: true }, delivery: "unavailable" });
  instance.start(); await flush();
  assert.equal(instance.state[3], "ready");
  const rendered = JSON.stringify(instance.render());
  assert.doesNotMatch(rendered, /"type":"BellRing"/);
  assert.match(rendered, /Saving this match does not enable notifications/);
});

test("an expired preference response cannot become ready after its body resolves late", async () => {
  const instance = harness({ ok: true, data: { subscribed: true }, delivery: "unavailable" }, true);
  instance.start(); await flush(); instance.expire(); instance.release(); await flush();
  assert.equal(instance.state[3], "error");
  assert.equal(instance.state[2], null);
});

test("only the explicit fixture preference acknowledgement is accepted", async () => {
  for (const body of [{ ok: "true", data: { subscribed: true }, delivery: "unavailable" }, { ok: true, data: { subscribed: true } }]) {
    const instance = harness(body); instance.start(); await flush();
    assert.equal(instance.state[3], "error");
    assert.equal(instance.state[2], null);
  }
});

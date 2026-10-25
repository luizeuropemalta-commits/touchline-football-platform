/* eslint-disable @typescript-eslint/no-explicit-any -- This isolated hook runner interprets arbitrary React JSX and hook slots. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getTouchlineFixtureAlertCopy } from "../lib/touchlineArena/fixture-alert-i18n.ts";
import { parseFixtureAlertSavedInterest } from "../lib/touchlineArena/fixture-alert-readiness.ts";
import { parseFixtureAlertStatus } from "../lib/touchlineArena/fixture-alert-status-client.ts";
import { startAccountLocaleIdentityObserver } from "../lib/touchlineArena/account-locale-identity-observer.ts";

type Node = { type: unknown; props: Record<string, any> };
function harness(accountId: string | null = null, initialAuthCallback = true) {
  const slots: any[] = [];
  let cursor = 0, dirty = true, tree: Node;
  let props: { fixtureId: string; label: string; locale: string; expectedAccountId: string | null } = { fixtureId: "123", label: "First fixture", locale: "en-GB", expectedAccountId: accountId ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  let authListener: ((event: string, session: unknown) => void) | undefined;
  let subscriptions = 0;
  let layouts: (() => void)[] = [], effects: (() => void)[] = [];
  const timers = new Map<number, () => void>(); let timerId = 0;
  const requests: { url: string; method: string; body?: BodyInit | null; headers: HeadersInit | undefined; signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  const exports: { default?: (props: object) => Node } = {};
  const effect = (queue: "layout" | "effect", callback: () => void | (() => void), deps: unknown[]) => {
    const i = cursor++, prior = slots[i];
    if (!prior || deps.some((value, index) => value !== prior.deps[index])) {
      const work = () => { prior?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; };
      (queue === "layout" ? layouts : effects).push(work);
    }
  };
  const jsx = (type: unknown, props: Record<string, any>): Node => ({ type, props });
  const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineFixtureAlerts.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, AbortController,
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, options: RequestInit) => new Promise((resolve, reject) => {
      if (accountId === null && url.endsWith("/readiness")) { resolve({ ok: true, status: 200, json: async () => statusBody(props.expectedAccountId ?? owner, props.fixtureId) }); return; }
      // Deliberately ignore abort: late network/body work must still be fenced.
      requests.push({ url, method: options.method ?? "GET", body: options.body, headers: options.headers, signal: options.signal as AbortSignal, reject,
        resolve: value => resolve(value) });
    }),
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return {
        useId: () => "alerts",
        useState: (initial: unknown) => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: any) => { const next = typeof value === "function" ? value(slots[i]) : value; if (next !== slots[i]) { slots[i] = next; dirty = true; } }]; },
        useRef: (initial: unknown) => { const i = cursor++; return slots[i] ??= { current: initial }; },
        useLayoutEffect: (callback: () => void, deps: unknown[]) => effect("layout", callback, deps),
        useEffect: (callback: () => void, deps: unknown[]) => effect("effect", callback, deps),
      };
      if (name === "lucide-react") return { Bell: "Bell" };
      if (name === "@/lib/touchlineArena/fixture-alert-i18n") return { getTouchlineFixtureAlertCopy };
      if (name === "@/lib/touchlineArena/fixture-alert-readiness") return { parseFixtureAlertSavedInterest };
      if (name === "@/lib/touchlineArena/fixture-alert-status-client") return { parseFixtureAlertStatus };
      if (name === "@/lib/touchlineArena/account-locale-identity-observer") return { startAccountLocaleIdentityObserver };
      if (name === "@/lib/touchlineArena/push-device-registration") return { readTouchlinePushInstallationId: () => null };
      if (name === "@/lib/supabase/client") return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: props.expectedAccountId } }, error: null }), onAuthStateChange: (callback: typeof authListener) => {
        authListener = callback; subscriptions++;
        if (initialAuthCallback) callback?.("INITIAL_SESSION", { user: { id: props.expectedAccountId } });
        return { data: { subscription: { unsubscribe: () => { subscriptions--; authListener = undefined; } } } };
      } } }) };
      if (name.endsWith(".css")) return { default: {} };
      throw Error(`Unexpected import ${name}`);
    },
  });
  function render() {
    // React discards an interrupted render and rerenders same-component state
    // adjustments before committing either layout or passive effects.
    for (let i = 0; i < 10; i++) {
      cursor = 0; layouts = []; effects = []; dirty = false; tree = exports.default!(props);
      if (!dirty) return;
    }
    assert.fail("render-phase state adjustment did not converge");
  }
  function commitLayout() { const work = layouts; layouts = []; for (const callback of work) callback(); }
  function commitEffects() { const work = effects; effects = []; for (const callback of work) callback(); }
  function commit() { commitLayout(); commitEffects(); }
  function flush() { for (let i = 0; dirty && i < 10; i++) { render(); commit(); } assert.equal(dirty, false); }
  function buttons(node: any): Node[] {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(buttons);
    return [...(node.type === "button" ? [node] : []), ...buttons(node.props?.children)];
  }
  flush();
  return {
    requests, timers, flush,
    async tick() { await new Promise<void>(resolve => setImmediate(resolve)); flush(); },
    click(index: number) { buttons(tree)[index].props.onClick(); flush(); },
    renderFixture(fixtureId: string) { props = { ...props, fixtureId, label: "Next fixture" }; dirty = true; render(); },
    renderAccount(expectedAccountId: string | null) { props = { ...props, expectedAccountId }; dirty = true; render(); },
    auth(id: string | null) { authListener?.("SIGNED_OUT", id ? { user: { id } } : null); flush(); },
    authSession(session: unknown) { authListener?.("TOKEN_REFRESHED", session); flush(); },
    subscriptions: () => subscriptions,
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    commit, commitLayout, commitEffects, text: () => JSON.stringify(tree),
    reply(index: number, subscribed: boolean, status = 200, body?: unknown) { requests[index].resolve({ ok: status >= 200 && status < 300, status, json: async () => body ?? { ok: true, delivery: "unavailable", data: { accountId: props.expectedAccountId, fixtureId: requests[index].url.split("/").at(-1), subscribed,
      revision: requests[index].method === "PUT" ? (BigInt(JSON.parse(String(requests[index].body)).expectedRevision) + 1n).toString() : "0" } } }); },
    expire() { const timer = timers.values().next().value; assert.ok(timer); timer(); flush(); },
  };
}

test("new fixture commit invalidates old PUT before passive cleanup and removes prior selection", async () => {
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1);
  assert.equal(h.requests[1].method, "PUT");
  h.renderFixture("456"); h.commitLayout();
  assert.equal(h.requests[1].signal.aborted, true);
  h.reply(1, true);
  await new Promise<void>(resolve => setImmediate(resolve)); // old PUT settles before passive cleanup
  h.commitEffects(); await h.tick();
  assert.doesNotMatch(h.text(), /Match added to your preferences/);
  assert.equal(h.requests.at(-1)?.url, "/api/notifications/fixtures/456");
  h.reply(h.requests.length - 1, false); await h.tick();
  assert.match(h.text(), /This match is not in your preferences yet/);
});
test("closing and reopening cancels previous generation and ignores its late response", async () => {
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1);
  h.click(0); h.click(0);
  assert.equal(h.requests[1].signal.aborted, true);
  h.reply(1, true); await h.tick();
  assert.doesNotMatch(h.text(), /Match added to your preferences/);
  h.reply(2, false); await h.tick(); assert.match(h.text(), /Further changes are paused/);
});
test("double click cannot create two writes; timeout gets readback only", async () => {
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1); h.click(1);
  assert.equal(h.requests.filter(r => r.method === "PUT").length, 1);
  h.expire();
  assert.equal(h.requests.at(-1)?.method, "GET");
  h.reply(1, true); await h.tick(); // Late PUT is not final proof.
  assert.doesNotMatch(h.text(), /Match added to your preferences/);
  h.reply(2, true); await h.tick();
  assert.match(h.text(), /Further changes are paused/);
  assert.doesNotMatch(h.text(), /Match added to your preferences|Remove match|Save match/);
  h.click(1); // Explicit reread, never an automatic replay of the old intention.
  assert.equal(h.requests.at(-1)?.method, "GET");
  h.reply(3, true); await h.tick();
  assert.match(h.text(), /Remove match/);
  assert.equal(h.requests.filter(r => r.method === "PUT").length, 1);
  assert.match(h.text(), /Saving this match does not enable notifications/);
});

test("revision conflict waits for explicit reread and the next intention uses the new revision", async () => {
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1);
  assert.deepEqual(JSON.parse(String(h.requests[1].body)), { active: true, expectedRevision: "0" });
  h.reply(1, false, 409, { ok: false, error: "REVISION_CONFLICT" }); await h.tick();
  assert.equal(h.requests.length, 2, "conflict never replays or automatically rereads");
  assert.match(h.text(), /could not be confirmed/);
  h.click(1);
  h.reply(2, true, 200, { ok: true, delivery: "unavailable", data: { accountId: owner, fixtureId: "123", subscribed: true, revision: "9" } });
  await h.tick(); h.click(1);
  assert.deepEqual(JSON.parse(String(h.requests[3].body)), { active: false, expectedRevision: "9" });
  h.reply(3, false); await h.tick();
  assert.match(h.text(), /This match is not in your preferences yet/);
  assert.match(h.text(), /Saving this match does not enable notifications/);
});

test("fresh mounting carries revisions and ignores the old mounting's delayed write receipt", async () => {
  const old = harness(); old.click(0); old.reply(0, false); await old.tick(); old.click(1); old.unmount();
  const fresh = harness(); fresh.click(0); fresh.reply(0, false); await fresh.tick(); fresh.click(1);
  fresh.reply(1, true); await fresh.tick(); fresh.click(1);
  assert.deepEqual(JSON.parse(String(fresh.requests[2].body)), { active: false, expectedRevision: "1" });
  fresh.reply(2, false); await fresh.tick();
  old.reply(1, false, 409, { ok: false, error: "REVISION_CONFLICT" }); await old.tick();
  assert.match(fresh.text(), /This match is not in your preferences yet/);
  assert.equal(fresh.requests.filter(r => r.method === "PUT").length, 2);
});
test("GET timeout fails visibly even if fetch ignores abort; explicit retry only reads", async () => {
  const h = harness(); h.click(0); await h.tick(); h.expire();
  assert.match(h.text(), /could not be confirmed/);
  h.reply(0, true); await h.tick(); assert.match(h.text(), /could not be confirmed/);
  h.click(1); assert.deepEqual(h.requests.map(r => r.method), ["GET", "GET"]);
  h.reply(1, false); await h.tick(); assert.match(h.text(), /not in your preferences/);
});
test("401 and disabled 503 retain truthful UI; ambiguous 503 PUT triggers one GET", async () => {
  for (const [status, body, copy] of [[401, {}, /Sign in to Arena/], [503, { error: "ALERTS_NOT_ENABLED" }, /have not been enabled/]] as const) {
    const h = harness(); h.click(0); h.reply(0, false, status, body); await h.tick(); assert.match(h.text(), copy);
    assert.equal(h.requests.length, 1);
  }
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1);
  h.reply(1, false, 503, { error: "ALERTS_UNAVAILABLE" }); await h.tick();
  assert.deepEqual(h.requests.map(r => r.method), ["GET", "PUT", "GET"]);
});

test("contradictory PUT acknowledgement reconciles by GET without another write or active bell", async () => {
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1);
  h.reply(1, false); await h.tick();
  assert.deepEqual(h.requests.map(r => r.method), ["GET", "PUT", "GET"]);
  assert.doesNotMatch(h.text(), /Match added to your preferences/);
  h.reply(2, false); await h.tick();
  assert.match(h.text(), /Further changes are paused/);
  assert.match(h.text(), /Saving this match does not enable notifications/);
});

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function statusBody(accountId = owner, fixtureId = "123") {
  return { ok: true, version: 1, data: { accountId, fixtureId, installationId: null, subscribed: true, configuration: "configured", device: "not-requested", preference: "enabled", operational: "unknown", delivery: "unconfirmed", active: false } };
}
test("readiness reads only on open and never turns saved interest into active delivery", async () => {
  const h = harness(owner);
  assert.equal(h.requests.length, 0); assert.equal(h.subscriptions(), 0);
  h.click(0); assert.deepEqual(h.requests.map(r => r.url), ["/api/notifications/fixtures/123/readiness", "/api/notifications/fixtures/123"]);
  assert.equal(new Headers(h.requests[0].headers).get("X-Touchline-Expected-Account"), owner);
  assert.equal(new Headers(h.requests[0].headers).get("X-Touchline-Installation"), null);
  h.reply(0, false, 200, statusBody()); h.reply(1, false); await h.tick();
  assert.match(h.text(), /"data-readiness":"observed"/);
  assert.match(h.text(), /Saving this match does not enable notifications/);
  h.flush(); assert.equal(h.requests.length, 2);
  h.click(1); assert.equal(h.requests[2].method, "PUT");
  h.reply(2, true); await h.tick(); assert.match(h.text(), /Match added to your preferences/);
  assert.equal(h.requests.filter(r => r.url.endsWith("readiness")).length, 1);
  h.click(0); assert.equal(h.subscriptions(), 0);
});
test("logout cancels observation and saved-interest work without accepting late receipts", async () => {
  const h = harness(owner); h.click(0); h.auth(null);
  assert.equal(h.requests.every(r => r.signal.aborted), true);
  h.expire(); // A stale readiness timer must not turn confirmed logout into unknown.
  assert.match(h.text(), /Sign in to Arena/);
  h.reply(0, false, 200, statusBody()); h.reply(1, true); await h.tick();
  assert.doesNotMatch(h.text(), /"data-readiness":"observed"|Match added to your preferences/);
  assert.match(h.text(), /Sign in to Arena/);
  h.unmount(); assert.equal(h.subscriptions(), 0);
});
test("account and fixture commit fences late readiness before passive cleanup", async () => {
  const h = harness(owner); h.click(0);
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  h.renderAccount(other); h.commitLayout();
  h.auth(null); // old observer must not invalidate the new account.
  h.reply(0, false, 200, statusBody()); h.reply(1, true);
  h.commitEffects(); await h.tick();
  assert.equal(h.requests.length, 4);
  h.reply(2, false, 200, statusBody(other)); h.reply(3, false); await h.tick();
  assert.match(h.text(), /"data-readiness":"observed"/);
  h.renderFixture("456"); h.commit(); await h.tick();
  h.reply(4, false, 200, statusBody(other, "123")); h.reply(5, false); await h.tick();
  assert.match(h.text(), /"data-readiness":"unconfirmed"/);
  h.unmount(); assert.equal(h.subscriptions(), 0);
});
test("unmount and timeout ignore late readiness without polling or writes", async () => {
  const h = harness(owner); h.click(0); h.expire();
  h.reply(0, false, 200, statusBody()); await h.tick();
  assert.doesNotMatch(h.text(), /"data-readiness":"observed"/);
  assert.equal(h.requests.length, 2);
  h.unmount(); assert.equal(h.requests.every(r => r.signal.aborted), true);
});
test("SDK unreadable user proxy stays unknown and explicit retry only restores after scoped reads", async () => {
  const h = harness(owner); h.click(0);
  const unreadable = { user: new Proxy({}, { get() { throw Error("user unavailable"); } }) };
  assert.doesNotThrow(() => h.authSession(unreadable));
  assert.match(h.text(), /could not be confirmed/);
  assert.doesNotMatch(h.text(), /Sign in to Arena/);
  h.reply(0, false, 200, statusBody()); h.reply(1, true); await h.tick();
  assert.doesNotMatch(h.text(), /Match added to your preferences/);
  h.click(1); // Explicit retry creates only a readiness GET while identity is fenced.
  assert.equal(h.requests.at(-1)?.url, "/api/notifications/fixtures/123/readiness");
  assert.equal(h.requests.every(r => r.method === "GET"), true);
  h.reply(2, false, 200, statusBody()); await h.tick();
  assert.equal(h.requests.at(-1)?.url, "/api/notifications/fixtures/123");
  h.reply(3, false); await h.tick();
  h.click(1); assert.equal(h.requests.at(-1)?.method, "PUT");
  h.unmount();
});
test("foreign account receipt and 409 never replay a write or revive from older readiness", async () => {
  const h = harness(owner); h.click(0);
  h.reply(1, false); await h.tick(); h.click(1);
  assert.equal(h.requests[2].method, "PUT");
  assert.equal(new Headers(h.requests[2].headers).get("X-Touchline-Expected-Account"), owner);
  h.reply(2, false, 409, { ok: false, error: "ACCOUNT_CHANGED" });
  await h.tick(); h.reply(0, false, 200, statusBody()); await h.tick();
  assert.match(h.text(), /could not be confirmed/);
  assert.equal(h.requests.filter(r => r.method === "PUT").length, 1);
  assert.equal(h.requests.length, 3);
  h.unmount();
});

test("missing INITIAL_SESSION keeps the identity watchdog through both receipts and offers read-only recovery", async () => {
  const h = harness(owner, false); h.click(0);
  h.reply(0, false, 200, statusBody()); h.reply(1, false); await h.tick();
  assert.match(h.text(), /Checking preference/);
  assert.doesNotMatch(h.text(), /Save match|Remove match|Sign in to Arena/);
  h.expire();
  assert.match(h.text(), /could not be confirmed/);
  assert.doesNotMatch(h.text(), /Sign in to Arena/);
  h.auth(owner); // A late initial event cannot erase the deadline failure.
  assert.match(h.text(), /could not be confirmed/);
  h.click(1);
  h.reply(2, false, 200, statusBody()); await h.tick();
  assert.doesNotMatch(h.text(), /Save match/);
  h.auth(owner); await h.tick();
  assert.equal(h.requests[3].url, "/api/notifications/fixtures/123");
  h.reply(3, false); await h.tick();
  assert.match(h.text(), /Save match/);
  assert.equal(h.requests.every(request => request.method === "GET"), true);
  h.unmount();
});

test("identity arriving after receipts but before deadline unlocks only the same context", async () => {
  const h = harness(owner, false); h.click(0);
  h.reply(0, false, 200, statusBody()); h.reply(1, false); await h.tick();
  assert.doesNotMatch(h.text(), /Save match/);
  h.auth(owner);
  assert.match(h.text(), /Save match/);
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test("readback before delayed PUT commit cannot authorize another mutation, including reopening", async () => {
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1);
  h.expire();
  h.reply(2, false); await h.tick(); // GET observed the pre-commit value.
  assert.match(h.text(), /Further changes are paused/);
  h.reply(1, true); await h.tick(); // Server commits after readback; no usable command receipt survived.
  h.click(0); h.click(0);
  h.reply(3, true); await h.tick();
  assert.match(h.text(), /Further changes are paused/);
  assert.doesNotMatch(h.text(), /Match added to your preferences|Save match|Remove match/);
  assert.equal(h.requests.filter(request => request.method === "PUT").length, 1);
  h.unmount();
});

test("A to B to A needs fresh identity and receipts instead of a previous presentation", async () => {
  const h = harness(owner, false); h.click(0);
  h.auth(owner); h.reply(0, false, 200, statusBody()); h.reply(1, true); await h.tick();
  assert.match(h.text(), /Match added to your preferences/);
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  h.renderAccount(other); h.commit(); await h.tick();
  h.renderAccount(owner); h.commit(); await h.tick();
  assert.match(h.text(), /Checking preference/);
  assert.doesNotMatch(h.text(), /Save match|Remove match|"data-readiness":"observed"/);
  h.auth(owner); // Identity alone must not revive the old A preference receipt.
  assert.doesNotMatch(h.text(), /Save match|Remove match|Match added to your preferences/);
  h.reply(2, false, 200, statusBody(other));
  h.reply(3, true, 200, { ok: true, delivery: "unavailable", data: { accountId: other, fixtureId: "123", subscribed: true } });
  await h.tick();
  assert.doesNotMatch(h.text(), /Save match|Remove match|"data-readiness":"observed"/);
  h.reply(4, false, 200, statusBody()); h.reply(5, false); await h.tick();
  assert.match(h.text(), /Save match|"data-readiness":"observed"/);
  assert.equal(h.requests.every(request => request.method === "GET"), true);
  h.unmount();
});

test("reopening clears observed readiness until that opening receives a new receipt", async () => {
  const h = harness(owner); h.click(0);
  h.reply(0, false, 200, statusBody()); h.reply(1, false); await h.tick();
  assert.match(h.text(), /"data-readiness":"observed"/);
  h.click(0); h.click(0);
  assert.match(h.text(), /"data-readiness":"loading"/);
  assert.doesNotMatch(h.text(), /Save match|Remove match/);
  h.reply(2, false, 200, statusBody()); h.reply(3, false); await h.tick();
  assert.match(h.text(), /"data-readiness":"observed"/);
  assert.match(h.text(), /Save match/);
  h.unmount();
});

test("guest presentation is immediately signed out without an auth observer or requests", () => {
  const h = harness(owner); h.renderAccount(null); h.commit(); h.flush(); h.click(0);
  assert.match(h.text(), /Sign in to Arena/);
  assert.doesNotMatch(h.text(), /Save match|Remove match/);
  assert.equal(h.requests.length, 0); assert.equal(h.subscriptions(), 0);
  h.unmount();
});

test("uncertain write stays locked when leaving and returning to its fixture", async () => {
  const h = harness(); h.click(0); h.reply(0, false); await h.tick(); h.click(1);
  h.renderFixture("456"); h.commit(); await h.tick();
  h.reply(2, false); await h.tick(); assert.match(h.text(), /Save match/);
  h.renderFixture("123"); h.commit(); await h.tick();
  h.reply(3, true); await h.tick();
  assert.match(h.text(), /Further changes are paused/);
  assert.doesNotMatch(h.text(), /Save match|Remove match/);
  h.reply(1, true); await h.tick(); // Late old write receipt remains fenced.
  assert.match(h.text(), /Further changes are paused/);
  assert.equal(h.requests.filter(request => request.method === "PUT").length, 1);
  h.unmount();
});

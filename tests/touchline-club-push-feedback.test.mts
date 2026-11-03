import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Element = { type: string; props: { children?: unknown; onClick?: () => Promise<void>; disabled?: boolean } };
async function harness(push: unknown, permission: NotificationPermission = "granted", rejectPermission = false, registrationError?: string, locale = "en-GB") {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const state: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  const cleanups: Array<() => void> = [];
  let cursor = 0, registrations = 0, prompts = 0, saves = 0;
  const exports: { default?: (props: object) => Element } = {};
  const jsx = (type: string, props: Element["props"]) => ({ type, props });
  const source = readFileSync(new URL("../components/touchline/club-social/TouchlineClubFollowButton.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(output, {
    exports,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return {
        useEffect(effect: () => void | (() => void), deps: unknown[]) {
          const index = cursor++, previous = state[index] as unknown[] | undefined;
          if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) { state[index] = deps; effects.push(effect); }
        },
        useRef(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
        useState(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
      };
      if (name.includes("push-device-registration")) return { touchlinePushIsConfigured: () => "configured", registerTouchlinePushDevice: async (options: { expectedAccountId: string; signal: AbortSignal; isCurrentAccount: () => boolean }) => {
        assert.equal(options.expectedAccountId, accountId);
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(options.signal.aborted, false);
        assert.equal(options.isCurrentAccount(), true);
        registrations++; if (registrationError) throw new Error(registrationError); return "registered"; } };
      if (name.endsWith(".css")) return { default: {} };
      if (name === "lucide-react" || name.includes("club-follow-preferences")) return {};
      throw new Error(`Unexpected import ${name}`);
    },
    Error, AbortController, AbortSignal,
    window: { Notification: {} },
    Notification: { permission, requestPermission: async () => { prompts++; if (rejectPermission) throw new Error("browser refused"); return "granted"; } },
    fetch: async (url: string, init?: RequestInit) => {
      assert.equal(url, "/api/notifications/preferences");
      if (init?.method === "PUT") {
        saves++;
        assert.equal((init.headers as Record<string, string>)["X-Touchline-Expected-Account"], accountId);
        assert.equal(init.signal?.aborted, false);
        return { ok: true, json: async () => ({ ok: true, data: { accountId, channels: { push } } }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: { accountId, settings: { scopes: { clubs: ["19"] } }, channels: { push: false } } }) };
    },
  });
  function render() { cursor = 0; return exports.default!({ clubId: "19", clubName: "Arsenal", locale }); }
  function buttons(node: unknown): Element[] {
    if (Array.isArray(node)) return node.flatMap(buttons);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    return [...(element.type === "button" ? [element] : []), ...buttons(element.props.children)];
  }
  render();
  for (const effect of effects.splice(0)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state[0], "ready", "real mount effect must establish the authenticated account");
  return { state, dispose: () => cleanups.forEach(cleanup => cleanup()), button: () => buttons(render())[1], counts: () => ({ registrations, prompts, saves }) };
}

test("existing browser permission still exposes registration and false server push is never called active", async () => {
  const instance = await harness(false);
  assert.ok(instance.button(), "already granted permission must not hide registration");
  await instance.button().props.onClick!();
  assert.deepEqual(instance.counts(), { registrations: 1, prompts: 0, saves: 1 });
  assert.match(String(instance.state[3]), /phone delivery remains unavailable/);
  assert.equal(instance.state[0], "ready");
});

test("saving a true push preference acknowledges only storage, not delivery", async () => {
  const instance = await harness(true);
  await instance.button().props.onClick!();
  assert.match(String(instance.state[3]), /delivery has not been verified/);
  assert.doesNotMatch(String(instance.state[3]), /Push is active/);
});

test("permission rejection is caught and allows a later explicit retry", async () => {
  const instance = await harness(false, "default", true);
  await instance.button().props.onClick!();
  assert.deepEqual(instance.counts(), { registrations: 0, prompts: 1, saves: 0 });
  assert.equal(instance.state[0], "ready");
  assert.match(String(instance.state[3]), /could not be confirmed/);
});

test("malformed preference acknowledgement never confirms success", async () => {
  const instance = await harness("false");
  await instance.button().props.onClick!();
  assert.match(String(instance.state[3]), /could not be confirmed/);
});

test("key mismatch explains explicit re-registration without saving preferences", async () => {
  for (const locale of ["en-GB", "pt-BR"]) {
    const instance = await harness(false, "granted", false, "touchline-push-re-registration-required", locale);
    await instance.button().props.onClick!();
    assert.deepEqual(instance.counts(), { registrations: 1, prompts: 0, saves: 0 });
    assert.equal(instance.state[0], "ready");
    assert.match(String(instance.state[3]), locale === "en-GB" ? /browser.*settings.*register again/i : /configurações.*navegador.*cadastre novamente/i);
  }
});

test("unmount retires lifecycle and stale push callbacks cannot register or save", async () => {
  const instance = await harness(true);
  const button = instance.button();
  instance.dispose();
  await button.props.onClick!();
  assert.deepEqual(instance.counts(), { registrations: 0, prompts: 0, saves: 0 });
});

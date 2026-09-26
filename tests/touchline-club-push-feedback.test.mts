import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Element = { type: string; props: { children?: unknown; onClick?: () => Promise<void>; disabled?: boolean } };
function harness(push: unknown, permission: NotificationPermission = "granted", rejectPermission = false) {
  const state: unknown[] = ["ready", { settings: { scopes: { clubs: ["19"] } }, channels: { push: false } }, true, ""];
  let cursor = 0, registrations = 0, prompts = 0, saves = 0;
  const exports: { default?: (props: object) => Element } = {};
  const jsx = (type: string, props: Element["props"]) => ({ type, props });
  const source = readFileSync(new URL("../components/touchline/club-social/TouchlineClubFollowButton.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(output, {
    exports,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return { useEffect() {}, useState() { const index = cursor++; return [state[index], (value: unknown) => { state[index] = value; }]; } };
      if (name.includes("push-device-registration")) return { touchlinePushIsConfigured: () => "configured", registerTouchlinePushDevice: async () => { registrations++; return "registered"; } };
      if (name.endsWith(".css")) return { default: {} };
      if (name === "lucide-react" || name.includes("club-follow-preferences")) return {};
      throw new Error(`Unexpected import ${name}`);
    },
    window: { Notification: {} },
    Notification: { permission, requestPermission: async () => { prompts++; if (rejectPermission) throw new Error("browser refused"); return "granted"; } },
    fetch: async () => { saves++; return { ok: true, json: async () => ({ ok: true, data: { channels: { push } } }) }; },
  });
  function render() { cursor = 0; return exports.default!({ clubId: "19", clubName: "Arsenal", locale: "en-GB" }); }
  function buttons(node: unknown): Element[] {
    if (Array.isArray(node)) return node.flatMap(buttons);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    return [...(element.type === "button" ? [element] : []), ...buttons(element.props.children)];
  }
  return { state, button: () => buttons(render())[1], counts: () => ({ registrations, prompts, saves }) };
}

test("existing browser permission still exposes registration and false server push is never called active", async () => {
  const instance = harness(false);
  assert.ok(instance.button(), "already granted permission must not hide registration");
  await instance.button().props.onClick!();
  assert.deepEqual(instance.counts(), { registrations: 1, prompts: 0, saves: 1 });
  assert.match(String(instance.state[3]), /phone delivery remains unavailable/);
  assert.equal(instance.state[0], "ready");
});

test("saving a true push preference acknowledges only storage, not delivery", async () => {
  const instance = harness(true);
  await instance.button().props.onClick!();
  assert.match(String(instance.state[3]), /delivery has not been verified/);
  assert.doesNotMatch(String(instance.state[3]), /Push is active/);
});

test("permission rejection is caught and allows a later explicit retry", async () => {
  const instance = harness(false, "default", true);
  await instance.button().props.onClick!();
  assert.deepEqual(instance.counts(), { registrations: 0, prompts: 1, saves: 0 });
  assert.equal(instance.state[0], "ready");
  assert.match(String(instance.state[3]), /could not be confirmed/);
});

test("malformed preference acknowledgement never confirms success", async () => {
  const instance = harness("false");
  await instance.button().props.onClick!();
  assert.match(String(instance.state[3]), /could not be confirmed/);
});

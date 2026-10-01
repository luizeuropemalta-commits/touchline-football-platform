import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createMarketNotificationConsent, gameNotificationSelection } from "../lib/touchlineArena/market-notification-consent.ts";

const current = { settings: { goalsAndEvents: false, creditsPromotionsRewards: true, generalComms: true, scopes: { clubs: ["1"] } }, channels: { in_app: true, push: false, email: false }, frequency: "realtime", quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" }, explicitConsentAt: null as string | null };
test("game consent excludes default marketing but preserves previously consented choices and scope", () => {
  const next = gameNotificationSelection(current);
  assert.equal(next.creditsPromotionsRewards, false); assert.equal(next.generalComms, false);
  assert.equal(next.goalsAndEvents, true); assert.deepEqual(next.scopes, current.settings.scopes);
  assert.equal(gameNotificationSelection({ ...current, explicitConsentAt: "earlier" }).creditsPromotionsRewards, true);
});
test("creation has no effects; permission precedes registration and preference save", async () => {
  const calls: string[] = [];
  const run = createMarketNotificationConsent({ configured: () => true, permission: () => "default", requestPermission: async () => { calls.push("permission"); return "granted"; }, register: async () => { calls.push("register"); return "registered"; }, save: async value => { calls.push("save"); return value; } });
  assert.deepEqual(calls, []); assert.equal((await run(current, "enable")).state, "saved"); assert.deepEqual(calls, ["permission", "register", "save"]);
});
test("negative permission and unavailable registration never save", async () => {
  for (const permission of ["denied", "unsupported", "default"] as const) {
    let writes = 0;
    const run = createMarketNotificationConsent({ configured: () => true, permission: () => permission, requestPermission: async () => "denied", register: async () => { writes++; return "registered"; }, save: async value => { writes++; return value; } });
    await run(current, "enable"); assert.equal(writes, 0);
  }
});
test("single flight suppresses duplicate gesture and failed save exposes partial registration", async () => {
  let release!: (value: string) => void; let writes = 0;
  const run = createMarketNotificationConsent({ configured: () => true, permission: () => "granted", requestPermission: async () => { throw Error("must not ask again"); }, register: () => new Promise(resolve => { release = resolve; }), save: async () => { writes++; throw Error("timeout"); } });
  const pending = run(current, "enable"); assert.equal((await run(current, "enable")).state, "busy"); release("registered");
  assert.equal((await pending).state, "partial"); assert.equal(writes, 1);
});
test("pause never asks permission/registers or invents email, and honours effective server refusal", async () => {
  const run = createMarketNotificationConsent({ configured: () => true, permission: () => "granted", requestPermission: async () => { throw Error(); }, register: async () => "registered", save: async value => { if (value.frequency === "paused") { assert.equal(value.channels.email, false); assert.equal(value.channels.push, false); } return { ...value, channels: { ...value.channels, push: false } }; } });
  assert.equal((await run(current, "pause")).state, "saved"); assert.equal((await run(current, "enable")).state, "partial");
});

test("registration errors/timeouts do not save; pause revokes all channels explicitly", async () => {
  let writes = 0;
  const run = createMarketNotificationConsent({ configured: () => true, permission: () => "granted", requestPermission: async () => "granted", register: async () => { throw Error("preparation-timeout"); }, save: async value => { writes++; assert.deepEqual(value.channels, { in_app: false, push: false, email: false }); assert.equal(value.explicitConsent, false); assert.equal(value.frequency, "paused"); return value; } });
  assert.equal((await run(current, "enable")).state, "failed"); assert.equal(writes, 0);
  assert.equal((await run(current, "pause")).state, "saved"); assert.equal(writes, 1);
});

test("real component handlers only read on opening and discard stale reads after close/reopen", async () => {
  const source = readFileSync(new URL("../components/touchline/notifications/TouchlineMarketNotifications.tsx", import.meta.url), "utf8");
  const handlers = source.slice(source.indexOf("  function close()"), source.indexOf("  return <section"));
  const pending: Array<(value: unknown) => void> = [];
  let focused = 0;
  const context: Record<string, unknown> = {
    open: false, pt: false, preferences: null, generation: { current: 0 }, busyRef: { current: false }, mounted: { current: true },
    trigger: { current: { focus() { focused++; } } }, title: { current: { focus() {} } },
    requestAnimationFrame: (fn: () => void) => fn(),
    preferencesRequest: () => new Promise(resolve => pending.push(resolve)),
    run: () => assert.fail("opening is not consent"),
    setOpen: (value: boolean) => { context.open = value; },
    setPreferences: (value: unknown) => { context.preferences = value; }, setMessage() {}, setBusy() {},
  };
  const api = runInNewContext(ts.transpileModule(`${handlers}\n({show, close})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const first = api.show(); api.close(); const second = api.show();
  pending[1]({ version: "new" }); await second;
  pending[0]({ version: "old" }); await first;
  assert.deepEqual(context.preferences, { version: "new" }); assert.equal(focused, 1);
  assert.match(source, /aria-expanded=\{open\}/); assert.match(source, /aria-live="polite"/);
});

test("every divergent pause acknowledgement fails closed", async () => {
  for (const patch of [{ frequency: "realtime" }, { explicitConsentAt: "old" }, ...["in_app", "push", "email"].map(key => ({ channels: { in_app: false, push: false, email: false, [key]: true } }))]) {
    const run = createMarketNotificationConsent({ configured: () => false, permission: () => "unsupported", requestPermission: async () => assert.fail(), register: async () => assert.fail(), save: async value => ({ ...value, explicitConsentAt: null, ...patch }) });
    assert.equal((await run(current, "pause")).state, "partial");
  }
});
test("unconfigured and unavailable registration never write preferences", async () => {
  for (const configured of [false, true]) {
    const run = createMarketNotificationConsent({ configured: () => configured, permission: () => "granted", requestPermission: async () => assert.fail(), register: async () => { assert.equal(configured, true); return "unsupported"; }, save: async () => assert.fail("must not PUT") });
    assert.equal((await run(current, "enable")).state, "unavailable");
  }
});

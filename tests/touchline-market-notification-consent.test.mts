import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createMarketNotificationConsent, gameNotificationSelection, GAME_NOTIFICATION_KEYS, type MarketNotificationPreferences } from "../lib/touchlineArena/market-notification-consent.ts";
import { getTouchlineMarketNotificationsCopy } from "../lib/touchlineArena/market-notifications-i18n.ts";

const current = { settings: { goalsAndEvents: false, creditsPromotionsRewards: true, generalComms: true, scopes: { clubs: ["1"] } }, channels: { in_app: true, push: false, email: false }, frequency: "realtime", quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" }, explicitConsentAt: null as string | null };
test("silent reception is presentation only and survives first game consent", () => {
  assert.equal(gameNotificationSelection({ ...current, settings: { ...current.settings, silentPush: true } }).silentPush, true);
  const source = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8");
  const contract = source.slice(source.indexOf("const DEFAULT_NOTIFICATION_SETTINGS"), source.indexOf("function normalizeChannels"));
  const normalize = runInNewContext(ts.transpileModule(`${contract}\nnormalizeSettings`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  for (const value of [undefined, false, "true", null]) assert.equal(normalize({ silentPush: value }).silentPush, false);
  assert.equal(normalize({ silentPush: true }).silentPush, true);
});

test("sound handler sends only presentation action without permission or registration", async () => {
  const source = readFileSync(new URL("../components/touchline/notifications/TouchlineMarketNotifications.tsx", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("  async function changeSound"), source.indexOf("  async function show"));
  const calls: unknown[] = [];
  const context = { preferences: current, busyRef: { current: false }, generation: { current: 0 }, mounted: { current: true }, notificationCopy: getTouchlineMarketNotificationsCopy("en-GB"),
    setBusy() {}, setMessage() {}, setPreferences() {},
    preferencesRequest: async (input: unknown) => { calls.push(input); return { ...current, settings: { ...current.settings, silentPush: true } }; },
  };
  const run = runInNewContext(ts.transpileModule(`${handler}\nchangeSound`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await run(true);
  assert.equal(JSON.stringify(calls), JSON.stringify([{ action: "set_push_sound", silentPush: true }]));
  assert.equal(context.busyRef.current, false);
});
test("lineup reminders require explicit category selection; old stored preferences stay off", () => {
  const source = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8");
  const contract = source.slice(source.indexOf("const DEFAULT_NOTIFICATION_SETTINGS"), source.indexOf("function normalizeChannels"));
  const normalize = runInNewContext(ts.transpileModule(`${contract}\nnormalizeSettings`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  assert.equal(normalize({ goalsAndEvents: true }).lineupReminders, false);
  assert.equal(normalize({ lineupReminders: "true" }).lineupReminders, false);
  assert.equal(normalize({ lineupReminders: true }).lineupReminders, true);
  assert.equal(gameNotificationSelection(current).lineupReminders, true);
  assert.equal(current.settings.goalsAndEvents, false);
});
test("game consent excludes default marketing but preserves previously consented choices and scope", () => {
  const next = gameNotificationSelection(current);
  assert.equal(next.creditsPromotionsRewards, false); assert.equal(next.generalComms, false);
  assert.equal(next.goalsAndEvents, true); assert.deepEqual(next.scopes, current.settings.scopes);
  assert.equal(gameNotificationSelection({ ...current, explicitConsentAt: "earlier" }).creditsPromotionsRewards, true);
});
test("creation has no effects; permission precedes registration and preference save", async () => {
  const calls: string[] = [];
  const run = createMarketNotificationConsent({ configured: () => true, permission: () => "default", requestPermission: async () => { calls.push("permission"); return "granted"; }, register: async () => { calls.push("register"); return "registered"; }, save: async value => { calls.push("save"); return { ...value, explicitConsentAt: "2026-10-02T00:00:00.000Z" }; } });
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
    open: false, notificationCopy: getTouchlineMarketNotificationsCopy("en-GB"), preferences: null, generation: { current: 0 }, busyRef: { current: false }, mounted: { current: true },
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

test("enable never confirms incomplete server consent or game selections", async () => {
  const patches: Partial<MarketNotificationPreferences>[] = [
    { explicitConsentAt: null }, { explicitConsentAt: "invalid" }, { explicitConsentAt: "1" },
    { explicitConsentAt: "2026-02-30T00:00:00Z" },
    { frequency: "paused" }, { frequency: "daily_digest" },
    { channels: { in_app: false, push: true, email: false } },
    { channels: { in_app: true, push: true, email: true } },
    ...GAME_NOTIFICATION_KEYS.map(key => ({ settings: { ...gameNotificationSelection(current), [key]: false } })),
    ...["creditsPromotionsRewards", "generalComms"].map(key => ({ settings: { ...gameNotificationSelection(current), [key]: true } })),
  ];
  for (const patch of patches) {
    const run = createMarketNotificationConsent({ configured: () => true, permission: () => "granted",
      requestPermission: async () => assert.fail(), register: async () => "registered",
      save: async value => ({ ...value, explicitConsentAt: "2026-10-02T00:00:00.000Z", ...patch }),
    });
    assert.equal((await run(current, "enable")).state, "partial", JSON.stringify(patch));
  }
});

test("complete enable acknowledgement preserves an existing digest or resumes paused realtime", async () => {
  for (const frequency of ["realtime", "hourly_digest", "daily_digest", "paused"]) {
    let registrations = 0;
    const prior = { ...current, frequency, explicitConsentAt: "2026-10-01T00:00:00.000Z",
      channels: { in_app: false, push: false, email: true } };
    const run = createMarketNotificationConsent({ configured: () => true, permission: () => "granted",
      requestPermission: async () => assert.fail(), register: async () => { registrations++; return "registered"; },
      save: async value => {
        assert.equal(value.frequency, frequency === "paused" ? "realtime" : frequency);
        assert.equal(value.channels.email, true);
        return { ...value, explicitConsentAt: "2026-10-02T02:00:00.123456+02:00" };
      },
    });
    assert.equal((await run(prior, "enable")).state, "saved");
    assert.equal(registrations, 1);
  }
});

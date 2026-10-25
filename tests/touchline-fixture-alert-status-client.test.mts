import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parseFixtureAlertStatus } from "../lib/touchlineArena/fixture-alert-status-client.ts";

const expected = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fixtureId: "123", installationId: null };
const observation = () => ({ ok: true, version: 1, data: { ...expected, subscribed: true, configuration: "configured", device: "not-requested", preference: "enabled", operational: "unknown", delivery: "unconfirmed", active: false } });
test("strict scoped status remains inactive even when server configuration and preferences exist", () => {
  assert.equal(parseFixtureAlertStatus(observation(), expected)?.active, false);
  assert.equal(parseFixtureAlertStatus(observation(), expected)?.operational, "unknown");
  const installed = { ...expected, installationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  assert.equal(parseFixtureAlertStatus({ ...observation(), data: { ...observation().data, ...installed, device: "registered" } }, installed)?.device, "registered");
});
test("rejects wrong ownership, fixture, installation, unknown schema and forged activation", () => {
  for (const patch of [{ accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, { fixtureId: "124" }, { installationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { active: true }, { delivery: "sent" }, { operational: "ready" }, { preference: ["enabled"] }, { configuration: ["configured"] }, { device: "registered" }, { extra: true }]) {
    assert.equal(parseFixtureAlertStatus({ ...observation(), data: { ...observation().data, ...patch } }, expected), null);
  }
  assert.equal(parseFixtureAlertStatus({ ...observation(), version: 2 }, expected), null);
  assert.equal(parseFixtureAlertStatus({ ...observation(), extra: true }, expected), null);
  assert.equal(parseFixtureAlertStatus(Object.create(observation()), expected), null);
});
test("installation observer never creates storage, permission, service worker or subscription", () => {
  const source = readFileSync(new URL("../lib/touchlineArena/push-device-registration.ts", import.meta.url), "utf8");
  const exports: { readTouchlinePushInstallationId?: () => string | null } = {};
  let value: string | null = null, reads = 0, denied = false;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, window: { localStorage: { getItem: (key: string) => { reads++; assert.equal(key, "touchline:push-installation-id:v1"); if (denied) throw Error("denied"); return value; } } },
  });
  const read = exports.readTouchlinePushInstallationId!;
  assert.equal(read(), null);
  value = "not-an-id"; assert.equal(read(), null);
  value = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB"; assert.equal(read(), value.toLowerCase());
  denied = true; assert.equal(read(), null); assert.equal(reads, 4);
});

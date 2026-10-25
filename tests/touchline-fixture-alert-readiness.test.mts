import test from "node:test";
import assert from "node:assert/strict";
import { deriveFixtureAlertReadiness, parseFixtureAlertSavedInterest, proposeFixtureAlertStep, settleFixtureAlertStep, type FixtureAlertFacts, type FixtureAlertControl } from "../lib/touchlineArena/fixture-alert-readiness.ts";

const facts = (): FixtureAlertFacts => ({ contextKey: "account-season", fixtureId: "12345", observation: "confirmed", saved: true,
  serverDelivery: "ready", browserSupported: true, installation: "ready", permission: "granted", device: "registered", preference: "enabled" });
const control = (): FixtureAlertControl => ({ contextKey: "account-season", fixtureId: "12345", pending: null, completedKeys: [] });
const gesture = { explicit: true, key: "gesture_1" };
const expected = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fixtureId: "123" };

test("current fixture receipt acknowledges only saved interest, never readiness or delivery", () => {
  for (const subscribed of [false, true]) {
    const body = { ok: true, delivery: "unavailable", data: { ...expected, subscribed, revision: "1" } };
    assert.deepEqual(parseFixtureAlertSavedInterest(body, expected), { subscribed, revision: "1", delivery: "unavailable" });
    assert.deepEqual(parseFixtureAlertSavedInterest(body, expected, subscribed, "1"), { subscribed, revision: "1", delivery: "unavailable" });
    assert.equal(parseFixtureAlertSavedInterest(body, expected, subscribed, "2"), null);
    for (const revision of [undefined, null, 1, "01", "-1", "9223372036854775808"]) {
      assert.equal(parseFixtureAlertSavedInterest({ ...body, data: { ...body.data, revision } }, expected), null);
    }
    assert.equal(parseFixtureAlertSavedInterest(body, expected, !subscribed), null);
    assert.equal(parseFixtureAlertSavedInterest(body, { ...expected, accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }), null);
    assert.equal(parseFixtureAlertSavedInterest(body, { ...expected, fixtureId: "124" }), null);
  }
  for (const body of [null, [], { ok: true, delivery: "ready", data: { subscribed: true } },
    { ok: true, delivery: "sent", data: { subscribed: true } }, { ok: "true", delivery: "unavailable", data: { subscribed: true } },
    { ok: true, data: { subscribed: true } }, { ok: true, delivery: "unavailable", data: [] },
    { ok: true, delivery: "unavailable", data: { subscribed: "true" } },
    Object.create({ ok: true, delivery: "unavailable", data: { subscribed: true } }),
    { ok: true, delivery: "unavailable", data: Object.create({ subscribed: true }) }]) {
    assert.equal(parseFixtureAlertSavedInterest(body, expected), null);
  }
});

test("saved match is not active with current API delivery unavailable", () => {
  assert.deepEqual(deriveFixtureAlertReadiness({ ...facts(), serverDelivery: "unavailable" }), { status: "server-unavailable", saved: true, active: false });
  assert.deepEqual(deriveFixtureAlertReadiness(facts()), { status: "active", saved: true, active: true });
  assert.equal(deriveFixtureAlertReadiness({ ...facts(), saved: false }).status, "not-saved");
});
test("every missing prerequisite is distinct and never reported active", () => {
  const cases: [Partial<FixtureAlertFacts>, string][] = [
    [{ observation: "loading" }, "loading"], [{ observation: "error" }, "error"], [{ serverDelivery: "unknown" }, "unknown"],
    [{ browserSupported: false }, "unsupported"], [{ installation: "required", browserSupported: false }, "install-required"],
    [{ installation: "unknown" }, "unknown"], [{ permission: "denied" }, "permission-denied"], [{ permission: "default" }, "permission-required"],
    [{ permission: "unknown" }, "unknown"], [{ device: "missing" }, "device-required"], [{ device: "unknown" }, "unknown"],
    [{ preference: "consent-required" }, "consent-required"], [{ preference: "paused" }, "paused"], [{ preference: "unknown" }, "unknown"], [{ saved: null }, "unknown"],
  ];
  for (const [patch, status] of cases) {
    const state = deriveFixtureAlertReadiness({ ...facts(), ...patch });
    assert.equal(state.status, status); assert.equal(state.active, false);
  }
});
test("follow only proposes saving; it never requests browser permission or all-game preferences", () => {
  const input = { ...facts(), saved: false, permission: "default" as const, preference: "consent-required" as const };
  const copy = structuredClone(input);
  assert.equal(proposeFixtureAlertStep(control(), input, "save-match", gesture).operation?.step, "save-fixture");
  assert.deepEqual(input, copy);
  assert.equal(proposeFixtureAlertStep(control(), input, "save-match", { ...gesture, explicit: false }).status, "blocked");
});
test("enable proposes one explicit preparation step, not an automatic permission chain", () => {
  for (const [patch, step] of [
    [{ permission: "default" }, "request-permission"], [{ device: "missing" }, "register-device"],
    [{ preference: "consent-required" }, "request-scoped-consent"], [{ saved: false }, "save-fixture"],
  ] as const) assert.equal(proposeFixtureAlertStep(control(), { ...facts(), ...patch }, "enable-match", gesture).operation?.step, step);
  for (const patch of [{ permission: "denied" }, { installation: "required" }, { browserSupported: false }, { serverDelivery: "unavailable" }, { preference: "paused" }, { observation: "error" }] as const)
    assert.equal(proposeFixtureAlertStep(control(), { ...facts(), ...patch }, "enable-match", gesture).status, "blocked");
  assert.equal(proposeFixtureAlertStep(control(), facts(), "enable-match", gesture).status, "no-op");
});
test("remove only this fixture even when push is unavailable; not a global pause", () => {
  const proposal = proposeFixtureAlertStep(control(), { ...facts(), serverDelivery: "unavailable" }, "remove-match", gesture);
  assert.equal(proposal.operation?.step, "remove-fixture");
  assert.equal(proposeFixtureAlertStep(control(), { ...facts(), saved: false }, "remove-match", gesture).status, "no-op");
});
test("context, gesture key and saved-state uncertainty prevent proposals", () => {
  for (const patch of [{ contextKey: "other" }, { fixtureId: "54321" }, { saved: null }, { observation: "error" }] as const)
    assert.equal(proposeFixtureAlertStep(control(), { ...facts(), ...patch }, "remove-match", gesture).status, "blocked");
  assert.equal(proposeFixtureAlertStep(control(), facts(), "remove-match", { explicit: true, key: "bad" }).status, "blocked");
});
test("pending writes are idempotent, ambiguous outcomes stay pending and completed keys cannot repeat", () => {
  const initial = control(), original = structuredClone(initial);
  const planned = proposeFixtureAlertStep(initial, facts(), "remove-match", gesture);
  assert.deepEqual(initial, original);
  assert.equal(planned.status, "proposed");
  assert.equal(proposeFixtureAlertStep(planned.control, facts(), "remove-match", gesture).status, "duplicate");
  assert.equal(proposeFixtureAlertStep(planned.control, facts(), "save-match", { explicit: true, key: "gesture_2" }).status, "busy");
  assert.strictEqual(settleFixtureAlertStep(planned.control, gesture.key, "unknown"), planned.control);
  assert.strictEqual(settleFixtureAlertStep(planned.control, "wrong_key", "confirmed"), planned.control);
  const settled = settleFixtureAlertStep(planned.control, gesture.key, "confirmed");
  assert.equal(settled.pending, null);
  assert.equal(proposeFixtureAlertStep(settled, facts(), "remove-match", gesture).status, "duplicate");
});

import assert from "node:assert/strict";
import test from "node:test";
import { fixtureAlertStatusReasons, parseFixtureAlertStatus } from "../lib/touchlineArena/fixture-alert-status-client.ts";
import { getTouchlineFixtureAlertCopy, TOUCHLINE_FIXTURE_ALERT_CATALOGUES } from "../lib/touchlineArena/fixture-alert-i18n.ts";
import { fixtureAlertPreferenceStatus, type FixtureAlertStatusObservation } from "../lib/touchlineArena/fixture-alert-status.ts";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const installationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function observation(patch: Partial<FixtureAlertStatusObservation> = {}): FixtureAlertStatusObservation {
  return { accountId: owner, fixtureId: "123", installationId, subscribed: true,
    configuration: "configured", device: "registered", preference: "enabled",
    operational: "unknown", delivery: "unconfirmed", active: false, ...patch };
}

test("presentation distinguishes every observed impediment without treating enabled settings as delivery", () => {
  const cases: [Partial<FixtureAlertStatusObservation>, string[]][] = [
    [{ configuration: "unconfigured" }, ["mobileAlertsUnavailable"]],
    [{ installationId: null, device: "not-requested" }, ["deviceNotLinked"]],
    [{ device: "missing" }, ["deviceMissing"]],
    [{ device: "invalid" }, ["deviceUnverified"]],
    [{ preference: "consent-required" }, ["consentRequired"]],
    [{ preference: "paused" }, ["alertsPaused"]],
    [{ preference: "quiet-hours" }, ["quietHours"]],
    [{ preference: "unconfirmed" }, ["preferenceUnconfirmed"]],
    [{}, []],
  ];
  for (const [patch, expected] of cases) {
    const source = observation(patch), before = JSON.stringify(source);
    const parsed = parseFixtureAlertStatus({ ok: true, version: 1, data: source }, source);
    assert.ok(parsed);
    assert.deepEqual(fixtureAlertStatusReasons(parsed), expected);
    assert.equal(JSON.stringify(source), before, "presentation cannot mutate stored facts");
    assert.equal(parsed.active, false); assert.equal(parsed.delivery, "unconfirmed");
  }
  assert.deepEqual(fixtureAlertStatusReasons(observation({ configuration: "unconfigured", device: "missing", preference: "paused" })),
    ["mobileAlertsUnavailable", "deviceMissing", "alertsPaused"], "one known impediment must not conceal another");
  for (const patch of [{ active: true }, { delivery: "sent" }, { operational: "ready" }]) {
    const body = { ok: true, version: 1, data: { ...observation(), ...patch } };
    assert.equal(parseFixtureAlertStatus(body, observation()), null, "forged activation never reaches presentation");
  }
});

test("all eight catalogues supply distinct reasons and an explicit unconfirmed-delivery message", () => {
  const keys = ["deliveryUnconfirmed", "mobileAlertsUnavailable", "deviceNotLinked", "deviceMissing", "deviceUnverified",
    "consentRequired", "alertsPaused", "quietHours", "preferenceUnconfirmed"] as const;
  for (const locale of Object.keys(TOUCHLINE_FIXTURE_ALERT_CATALOGUES)) {
    const copy = getTouchlineFixtureAlertCopy(locale, true);
    assert.equal(new Set(keys.map(key => copy[key])).size, keys.length, `${locale}: distinct reasons`);
    for (const key of keys) {
      assert.ok(copy[key].length > 8, `${locale}/${key}`);
      if (locale !== "en-GB") assert.notEqual(copy[key], getTouchlineFixtureAlertCopy("en-GB")[key], `${locale}/${key}: no English fallback`);
    }
    if (!["en-GB", "pt-BR"].includes(locale)) {
      assert.equal(getTouchlineFixtureAlertCopy(locale).deliveryUnconfirmed, getTouchlineFixtureAlertCopy("en-GB").deliveryUnconfirmed,
        "presentation does not silently enable draft locale gates");
    }
  }
  assert.equal(getTouchlineFixtureAlertCopy("en-GB").deliveryUnconfirmed,
    "Mobile delivery has not been confirmed. Saving this match does not enable notifications.");
  assert.equal(getTouchlineFixtureAlertCopy("pt-BR").deliveryUnconfirmed,
    "O envio para o celular não foi confirmado. Salvar a partida não ativa notificações.");
});


test("consent-required presentation covers existing consent with disabled settings without claiming permission was denied", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const allowed = { settings: { goalsAndEvents: true }, channels: { push: true }, frequency: "realtime",
    explicit_consent_at: "2026-10-24T12:00:00Z", quiet_hours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" } };
  assert.equal(fixtureAlertPreferenceStatus(allowed, now), "enabled");
  for (const preference of [
    { ...allowed, channels: { push: false } },
    { ...allowed, settings: { goalsAndEvents: false } },
    { ...allowed, frequency: "daily" },
    { ...allowed, explicit_consent_at: null },
  ]) {
    const state = fixtureAlertPreferenceStatus(preference, now);
    assert.equal(state, "consent-required");
    const reasons = fixtureAlertStatusReasons(observation({ preference: state }));
    assert.deepEqual(reasons, ["consentRequired"]);
    assert.equal(getTouchlineFixtureAlertCopy("en-GB")[reasons[0]], "Your current preferences do not allow match alerts.");
    assert.equal(getTouchlineFixtureAlertCopy("pt-BR")[reasons[0]], "Suas preferências atuais não permitem alertas de partidas.");
  }
});

test("unrequested device observation states uncertainty rather than claiming absent registration", () => {
  // A missing installation ID also represents unreadable local storage or an
  // invalid saved ID. The server deliberately skips the device lookup then.
  const data = observation({ installationId: null, device: "not-requested" });
  const parsed = parseFixtureAlertStatus({ ok: true, version: 1, data }, data);
  assert.ok(parsed);
  assert.deepEqual(fixtureAlertStatusReasons(parsed), ["deviceNotLinked"]);
  const copy = getTouchlineFixtureAlertCopy("en-GB");
  assert.equal(copy.deviceNotLinked, "This browser’s connection to mobile alerts could not be confirmed.");
  assert.notEqual(copy.deviceNotLinked, copy.deviceMissing);
  assert.equal(getTouchlineFixtureAlertCopy("pt-BR").deviceNotLinked,
    "Não foi possível confirmar o vínculo deste navegador com alertas no celular.");
});

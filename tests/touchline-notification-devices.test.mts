import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseTouchlineDeviceRegistration } from "../lib/touchlineArena/push-device-contract.ts";
import { hasTouchlineServerPushConfiguration, resolveTouchlinePushPreference } from "../lib/touchlineArena/push-preference-contract.ts";

const installationId = "11111111-1111-4111-8111-111111111111";
const subscription = {
  endpoint: "https://push.example.test/subscription/123",
  keys: { p256dh: createECDH("prime256v1").generateKeys().toString("base64url"), auth: randomBytes(16).toString("base64url") },
};

test("a push device becomes registerable only with granted permission and a complete HTTPS subscription", () => {
  assert.deepEqual(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription }), {
    installationId, permission: "granted", subscription,
  });
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription: null }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription: { ...subscription, endpoint: "https://" } }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription: { ...subscription, endpoint: "https:///" } }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription: { ...subscription, endpoint: "https://?x" } }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription: { ...subscription, endpoint: "https://push.example.test/has space" } }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription: { ...subscription, keys: { p256dh: " ", auth: "auth-key" } } }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "default", subscription }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "denied", subscription }), null);
  assert.deepEqual(parseTouchlineDeviceRegistration({ installationId, permission: "denied", subscription: null }), {
    installationId, permission: "denied", subscription: null,
  });
  assert.equal(parseTouchlineDeviceRegistration({ installationId: "not-a-uuid", permission: "granted", subscription }), null);
  assert.equal(parseTouchlineDeviceRegistration({ installationId, permission: "granted", subscription: { ...subscription, endpoint: "http://unsafe.test" } }), null);
});

test("the authenticated device route and RLS migration fail closed without a real subscription", () => {
  const route = readFileSync(new URL("../app/api/notifications/devices/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260910183000_touchline_notification_devices.sql", import.meta.url), "utf8");
  const client = readFileSync(new URL("../lib/touchlineArena/push-device-registration.ts", import.meta.url), "utf8");
  assert.match(route, /hasTouchLineArenaAccess\(user\)/);
  assert.match(route, /handlePushDeviceRegistration\(request/);
  assert.match(route, /return \{ id: user\.id, allowed:/);
  assert.match(route, /user_id: userId/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/i);
  assert.match(migration, /grant select, insert, update on public\.notification_devices to authenticated/i);
  assert.match(migration, /permission in \('denied', 'default'\)\s+and push_subscription is null/is);
  assert.match(migration, /permission = 'granted'\s+and jsonb_typeof\(push_subscription\) = 'object'/is);
  assert.match(migration, /jsonb_typeof\(push_subscription->'endpoint'\) = 'string'/i);
  assert.match(migration, /https:\/\/\[\^\/:\?\#\[:space:\]\]\+/i);
  assert.match(migration, /jsonb_typeof\(push_subscription->'keys'->'p256dh'\) = 'string'/i);
  assert.match(migration, /jsonb_typeof\(push_subscription->'keys'->'auth'\) = 'string'/i);
  assert.match(migration, /\^\[A-Za-z0-9_-\]\{16,512\}\$/);
  assert.doesNotMatch(migration, /push_subscription is null\s+or/i);
  assert.match(client, /if \(!publicKey\) return "subscription-unconfigured"/);
  assert.match(client, /subscription: subscription\.toJSON\(\)/);
  assert.doesNotMatch(client, /subscription:\s*null/);
});

test("push preferences require literal consent, server VAPID and a registered device", () => {
  const configured = {
    NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: "A".repeat(43),
    TOUCHLINE_WEB_PUSH_PRIVATE_KEY: "B".repeat(43),
    TOUCHLINE_WEB_PUSH_SUBJECT: "mailto:push@touchline.example",
  };
  assert.equal(hasTouchlineServerPushConfiguration(configured), true);
  assert.equal(hasTouchlineServerPushConfiguration({ ...configured, TOUCHLINE_WEB_PUSH_PRIVATE_KEY: undefined }), false);
  assert.equal(resolveTouchlinePushPreference({ requested: true, serverConfigured: false, hasRegisteredDevice: true, explicitConsent: true }), false);
  assert.equal(resolveTouchlinePushPreference({ requested: true, serverConfigured: true, hasRegisteredDevice: false, explicitConsent: true }), false);
  assert.equal(resolveTouchlinePushPreference({ requested: true, serverConfigured: true, hasRegisteredDevice: true, explicitConsent: true }), true);
  for (const explicitConsent of [false, "false", "true", 1, {}, null, undefined]) {
    assert.equal(resolveTouchlinePushPreference({ requested: true, serverConfigured: true, hasRegisteredDevice: true, explicitConsent }), false);
  }
  for (const requested of [false, true]) {
    for (const serverConfigured of [false, true]) {
      for (const hasRegisteredDevice of [false, true]) {
        for (const explicitConsent of [false, true]) {
          assert.equal(
            resolveTouchlinePushPreference({ requested, serverConfigured, hasRegisteredDevice, explicitConsent }),
            [requested, serverConfigured, hasRegisteredDevice, explicitConsent].every((value) => value === true),
          );
        }
      }
    }
  }

  const preferencesRoute = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8");
  assert.match(preferencesRoute, /userHasRegisteredPushDevice\(supabase, user\.id\)/);
  assert.match(preferencesRoute, /parseTouchlineDeviceRegistration/);
  assert.match(preferencesRoute, /hasTouchlineServerPushConfiguration\(\)/);
  assert.match(preferencesRoute, /resolveTouchlinePushPreference/);
  assert.match(preferencesRoute, /payload\.explicitConsent === true/);
  assert.doesNotMatch(preferencesRoute, /Boolean\(payload\.explicitConsent\)/);
  assert.match(preferencesRoute, /request\.headers\.get\("origin"\) !== new URL\(request\.url\)\.origin/);
  assert.match(preferencesRoute, /explicitConsent: hasConsent/);
  assert.match(preferencesRoute, /Array\.isArray\(payload\)/);
});

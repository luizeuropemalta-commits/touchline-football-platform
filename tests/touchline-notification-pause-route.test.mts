import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasTouchlineServerPushConfiguration, resolveTouchlinePushPreference } from "../lib/touchlineArena/push-preference-contract.ts";

test("real preference route allows paused empty channels with revoked consent; active frequencies reject", async () => {
  for (const frequency of ["paused", "realtime", "hourly_digest", "daily_digest", "invalid", undefined]) {
    const writes: Array<Record<string, unknown>> = [];
    const source = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8").replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
    const db = {
      auth: { getUser: async () => ({ data: { user: { id: "synthetic" } } }) },
      from: (table: string) => {
        assert.equal(table, "notification_preferences", "pausing must not query devices");
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: writes.at(-1), error: null }) }) }), upsert: (value: Record<string, unknown>) => {
          writes.push(value);
          return { select: () => ({ single: async () => ({ data: { ...value, updated_at: "now" }, error: null }) }) };
        } };
      },
    };
    const route = runInNewContext(ts.transpileModule(`${source}\n({ PUT, GET })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
      createClient: async () => db, hasTouchLineArenaAccess: () => true,
      URL,
      NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) },
      parseNotificationQuietHours: (value: unknown) => value,
      hasTouchlineServerPushConfiguration: () => false,
      resolveTouchlinePushPreference,
    });
    const result = await route.PUT({ url: "https://synthetic.test/api/notifications/preferences", headers: new Headers({ origin: "https://synthetic.test" }), json: async () => ({ settings: {}, channels: { in_app: false, push: false, email: false }, frequency, explicitConsent: false, quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" } }) });
    assert.equal(result.status, frequency === "paused" ? 200 : 400);
    assert.equal(writes.length, frequency === "paused" ? 1 : 0);
    if (frequency === "paused") {
      assert.equal(writes[0].explicit_consent_at, null);
      assert.equal(JSON.stringify(writes[0].channels), JSON.stringify({ in_app: false, push: false, email: false }));
      const read = await route.GET();
      assert.equal(read.status, 200); assert.equal(read.body.data.frequency, "paused"); assert.equal(read.body.data.explicitConsentAt, null);
      assert.equal(JSON.stringify(read.body.data.channels), JSON.stringify({ in_app: false, push: false, email: false }));
    }
  }
});

test("real server push resolver requires all three independent gates", () => {
  const env = { NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: "A".repeat(40), TOUCHLINE_WEB_PUSH_PRIVATE_KEY: "B".repeat(40), TOUCHLINE_WEB_PUSH_SUBJECT: "mailto:synthetic@example.test" };
  for (const vapid of [true, false]) for (const device of [true, false]) for (const consent of [true, false]) {
    assert.equal(resolveTouchlinePushPreference({ requested: true, explicitConsent: consent, hasRegisteredDevice: device, serverConfigured: hasTouchlineServerPushConfiguration(vapid ? env : {}) }), vapid && device && consent);
  }
});

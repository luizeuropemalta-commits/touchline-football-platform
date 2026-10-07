import assert from "node:assert/strict";
import { createECDH, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as dispatcher from "../lib/touchlineArena/match-push-dispatch.ts";
import * as transport from "../lib/touchlineArena/match-push-transport.ts";
import * as vapidParser from "../lib/touchlineArena/match-push-vapid-config.ts";
import * as fingerprints from "../lib/touchlineArena/push-subscription-fingerprint.ts";
import * as deliveryPolicy from "../lib/touchlineFantasy/lineup-reminder-delivery-policy.ts";
import * as notification from "../lib/touchlineFantasy/lineup-reminder-notification.ts";
import { readLineupReminderSource } from "../lib/touchlineFantasy/lineup-reminder-source.ts";
import type * as sourceServer from "../lib/touchlineFantasy/lineup-reminder-claimed-source-server.ts";
import type * as singleServer from "../lib/touchlineFantasy/lineup-reminder-single-claim-server.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const baseMs = Date.now();
const claim = { id: id(1), leaseToken: id(2), leaseUntil: new Date(baseMs + 60_000).toISOString(), expiresAt: new Date(baseMs + 90_000).toISOString() };
const scope = { userId: id(3), gameweekId: id(4), competitionId: id(5), seasonId: id(6) };
const curve = createECDH("prime256v1"); curve.setPrivateKey(Buffer.alloc(32, 1));
const vapid = { subject: "mailto:owner@example.test", publicKey: curve.getPublicKey().toString("base64url"), privateKey: Buffer.alloc(32, 1).toString("base64url") };
const registration = { installationId: id(7), permission: "granted" as const,
  subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/private-token", keys: { p256dh: vapid.publicKey, auth: Buffer.alloc(16, 2).toString("base64url") } } };
type Fresh = Omit<NonNullable<Awaited<ReturnType<typeof sourceServer.readClaimedLineupReminderSource>>>, "locale"> & { locale: unknown };
type RpcResponse = { data: unknown; error: unknown };
const js = ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/lineup-reminder-single-claim-server.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const state = { reads: 0, admins: 0, wall: baseMs, elapsed: 0, noAdmin: false, sourceMissing: false,
    reserve: { data: true, error: null } as RpcResponse, finish: { data: true, error: null } as RpcResponse,
    pendingRpc: "", status: 201, networkThrows: false,
    alter: (() => {}) as (fresh: Fresh, read: number) => void,
    calls: [] as Array<{ name: string; args: Record<string, unknown>; signal?: AbortSignal }>,
    sends: [] as Array<Parameters<typeof transport.sendMatchWebPush>[0]>, requests: [] as RequestInit[], signals: [] as AbortSignal[] };
  const timers = new Map<number, { callback: () => void; delay: number }>(); let timerId = 0;
  let resolveLate!: (value: RpcResponse) => void;
  const pending = new Promise<RpcResponse>(resolve => { resolveLate = resolve; });
  const imports: Record<string, unknown> = {
    "server-only": {}, "node:crypto": { randomUUID },
    "../touchlineArena/match-push-dispatch.ts": dispatcher,
    "../touchlineArena/match-push-vapid-config.ts": vapidParser,
    "../touchlineArena/push-subscription-fingerprint.ts": fingerprints,
    "./lineup-reminder-delivery-policy.ts": deliveryPolicy,
    "./lineup-reminder-notification.ts": notification,
    "../touchlineArena/match-push-transport.ts": {
      isSupportedMatchPushEndpoint: transport.isSupportedMatchPushEndpoint,
      sendMatchWebPush: async (input: Parameters<typeof transport.sendMatchWebPush>[0]) => {
        state.sends.push(input);
        // Real encrypted transport, with only the HTTP boundary replaced.
        return transport.sendMatchWebPush(input, async (_url, request) => {
          state.requests.push(request!);
          if (state.networkThrows) throw new Error("PRIVATE network outcome");
          return new Response(null, { status: state.status });
        });
      },
    },
    "@/lib/supabase/admin": { createAdminClient: () => {
      state.admins++; if (state.noAdmin) return null;
      return { rpc: (name: string, args: Record<string, unknown>) => {
        const call = { name, args } as typeof state.calls[number]; state.calls.push(call);
        assert.ok(["touchline_game_notification_reserve", "touchline_game_notification_finish"].includes(name));
        return { abortSignal: (signal: AbortSignal) => {
          call.signal = signal;
          return name === state.pendingRpc ? pending : Promise.resolve(name.endsWith("_reserve") ? state.reserve : state.finish);
        } };
      } };
    } },
    "./lineup-reminder-claimed-source-server.ts": { readClaimedLineupReminderSource: async (owned: unknown, options: { signal: AbortSignal }) => {
      assert.deepEqual(owned, claim); state.reads++; state.signals.push(options.signal);
      if (state.sourceMissing) return null;
      const source = await readLineupReminderSource({ rpc: async () => ({ error: null, data: {
        schemaVersion: 1, ...scope, checkedAtMs: state.wall,
        read: { status: "complete", checkedAtMs: state.wall, marketEditable: true, effectiveDeadlineMs: baseMs + 90_000,
          formation: { published: true, code: "4-3-3", slotIds: Array.from({ length: 11 }, (_, i) => `slot-${i}`) },
          userGameweek: { state: "DRAFT", formationCode: "4-3-3", selectedCoachId: "307" }, selections: [] },
      } }) }, { ...scope, maximumAgeMs: 30_000 }, () => state.wall);
      assert.ok(source.source);
      const binding = fingerprints.touchlinePushSubscriptionFingerprint(registration)!;
      const fresh: Fresh = { locale: "en-GB", identityId: id(8), deviceId: id(9), registration: structuredClone(registration), source: source.source,
        queuedSubscriptionFingerprint: binding,
        policy: { maximumAgeMs: 30_000, source: source.source,
          queued: { ...scope, deviceId: id(9), kind: "missing_xi", generation: "2", effectiveDeadlineMs: baseMs + 90_000, subscriptionFingerprint: binding },
          current: { ...scope, deviceId: id(9), checkedAtMs: state.wall, generation: "2", needsBaseline: false, suppressed: false,
            permission: "granted", subscriptionFingerprint: binding, enrollmentConsentAt: new Date(baseMs - 60_000).toISOString(),
            explicitConsentAt: new Date(baseMs - 60_000).toISOString(), channels: { push: true }, settings: { lineupReminders: true }, frequency: "realtime",
            quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" } },
        } };
      state.alter(fresh, state.reads); return fresh;
    } },
  };
  class ClockDate extends Date { constructor(value: string | number = state.wall) { super(value); } static now() { return state.wall; } }
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(js, { exports, Date: ClockDate, AbortController, Buffer,
    performance: { now: () => state.elapsed },
    setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (key: number) => timers.delete(key),
    require: (name: string) => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; },
  });
  const api = exports as unknown as typeof singleServer;
  return { state, timers, resolveLate,
    run: (options: Parameters<typeof api.dispatchClaimedLineupReminder>[1] = { enabled: true, maximumAgeMs: 30_000, vapid }) => api.dispatchClaimedLineupReminder(claim, options),
    timeout: () => { const timer = timers.values().next().value; assert.ok(timer); assert.equal(timer.delay, 5_000); state.elapsed += 5_000; timer.callback(); },
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("default OFF and malformed config never read, reserve or send", async () => {
  for (const options of [{}, { enabled: false }, { enabled: true },
    { enabled: true, locale: "en-GB" as const, maximumAgeMs: 0, vapid },
    { enabled: true, locale: "en-GB" as const, maximumAgeMs: 30_000, vapid: { ...vapid, privateKey: "invalid" } }]) {
    const h = harness(); assert.equal(await h.run(options), options.enabled ? "unconfigured" : "disabled");
    assert.deepEqual([h.state.reads, h.state.admins, h.state.requests.length], [0, 0, 0]);
  }
});

test("fresh source rebuilds localized copy and uses real encrypted protected transport once", async () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const) {
    const h = harness(); h.state.alter = fresh => { fresh.locale = locale; };
    assert.equal(await h.run(), "provider_accepted");
    assert.equal(h.state.reads, 2); assert.equal(h.state.requests.length, 1);
    assert.equal(h.state.sends[0].expiresAt.getTime(), baseMs + 30_000);
    const payload = JSON.parse(h.state.sends[0].payload);
    assert.deepEqual(payload, notification.buildLineupReminderNotification({ identityId: id(8), kind: "missing_xi", locale }));
    assert.doesNotMatch(h.state.sends[0].payload, new RegExp(scope.userId));
    assert.equal(h.state.requests[0].redirect, "error"); assert.equal(h.state.requests[0].method, "POST");
    assert.ok(h.state.requests[0].body instanceof Uint8Array);
    assert.equal(Buffer.from(h.state.requests[0].body as Uint8Array).includes(Buffer.from(payload.body)), false);
    assert.equal(h.state.calls.length, 2);
    const [reserve, finish] = h.state.calls;
    assert.equal(reserve.name, "touchline_game_notification_reserve"); assert.equal(reserve.args.p_id, claim.id); assert.equal(reserve.args.p_lease_token, claim.leaseToken);
    assert.match(String(reserve.args.p_attempt_id), /^[a-f0-9-]{36}$/);
    assert.equal(finish.name, "touchline_game_notification_finish"); assert.equal(finish.args.p_attempt_id, reserve.args.p_attempt_id);
    assert.equal(finish.args.p_state, "provider_accepted"); assert.equal(h.timers.size, 0);
  }
});

test("post-reservation account locale replaces the first read and legacy deployment locale", async () => {
  const h = harness(); h.state.alter = (fresh, read) => { fresh.locale = read === 1 ? "en-GB" : "ar-SA"; };
  assert.equal(await h.run({ enabled: true, locale: "pt-BR", maximumAgeMs: 30_000, vapid }), "provider_accepted");
  assert.equal(h.state.reads, 2); assert.equal(h.state.requests.length, 1);
  const payload = JSON.parse(h.state.sends[0].payload);
  assert.equal(payload.title, "فريقك ينتظرك"); assert.equal(payload.body, "كوّن تشكيلتك");
  assert.equal(payload.href, "/clubowner?lang=ar-SA");
  assert.equal(payload.tag, `lineup:${id(8)}`); assert.equal(payload.update, false);
});

test("invalid fresh locale never falls back to legacy options before or after reservation", async () => {
  for (const readAt of [1, 2]) for (const locale of [undefined, null, "en-US", "constructor", "__proto__", {}, ["en-GB"]]) {
    const h = harness(); h.state.alter = (fresh, read) => { if (read === readAt) fresh.locale = locale; };
    assert.equal(await h.run({ enabled: true, locale: "en-GB", maximumAgeMs: 30_000, vapid }), "cancelled");
    assert.equal(h.state.requests.length, 0); assert.equal(h.state.sends.length, 0);
    const finish = h.state.calls.at(-1)!;
    assert.equal(finish.name, "touchline_game_notification_finish"); assert.equal(finish.args.p_state, "cancelled");
    assert.equal(finish.args.p_attempt_id, readAt === 1 ? null : h.state.calls[0].args.p_attempt_id);
  }
});

test("sound preference uses the post-reservation fresh read without suppressing delivery", async () => {
  for (const silent of [true, false]) {
    const h = harness();
    h.state.alter = (fresh, read) => { fresh.policy.current.settings = { lineupReminders: true, silentPush: read === 2 ? silent : !silent }; };
    assert.equal(await h.run(), "provider_accepted");
    assert.equal(h.state.reads, 2);
    assert.equal(h.state.sends.length, 1);
    assert.equal(JSON.parse(h.state.sends[0].payload).silent === true, silent);
  }
});

test("missing settings before or after reservation never permit delivery", async () => {
  for (const readAt of [1, 2]) {
    const h = harness();
    h.state.alter = (fresh, read) => { if (read === readAt) fresh.policy.current.settings = null; };
    assert.equal(await h.run(), "cancelled");
    assert.equal(h.state.sends.length, 0); assert.equal(h.state.requests.length, 0);
  }
});

test("source, consent, deadline or binding revoked after reservation prevents HTTP", async () => {
  for (const change of ["state", "consent", "explicit-consent", "deadline", "generation", "fingerprint"]) {
    const h = harness(); h.state.alter = (fresh, read) => {
      if (read !== 2) return;
      fresh.locale = "ar-SA";
      if (change === "state") fresh.source.read.userGameweek!.state = "CONFIRMED";
      if (change === "consent") fresh.policy.current.settings = { lineupReminders: false };
      if (change === "explicit-consent") fresh.policy.current.explicitConsentAt = null;
      if (change === "deadline") fresh.source.read.effectiveDeadlineMs++;
      if (change === "generation") fresh.policy.current.generation = "3";
      if (change === "fingerprint") fresh.queuedSubscriptionFingerprint = `sha256:${"f".repeat(64)}`;
    };
    assert.equal(await h.run(), "cancelled"); assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.calls.at(-1)?.args.p_state, "cancelled");
    assert.equal(h.state.calls.at(-1)?.args.p_attempt_id, h.state.calls[0].args.p_attempt_id);
  }
});

test("missing/unsupported source cancels before reservation with a null nonce", async () => {
  for (const missing of [true, false]) {
    const h = harness(); h.state.sourceMissing = missing;
    if (!missing) h.state.alter = fresh => { fresh.registration = { ...fresh.registration, subscription: { ...registration.subscription, endpoint: "https://example.test/private" } }; };
    assert.equal(await h.run(), "cancelled"); assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.calls.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(h.state.calls[0].args)), { p_id: claim.id, p_lease_token: claim.leaseToken, p_attempt_id: null, p_state: "cancelled" });
  }
});

test("reserve false is refusal; null/error/malformed/absent admin remain uncertain and never finish", async () => {
  for (const response of [{ data: false, error: null }, { data: null, error: null }, { data: "true", error: null }, { data: true, error: { message: "PRIVATE" } }]) {
    const h = harness(); h.state.reserve = response;
    assert.equal(await h.run(), response.data === false ? "reservation-not-granted" : "reservation-unconfirmed");
    assert.equal(h.state.calls.length, 1); assert.equal(h.state.requests.length, 0);
  }
  const h = harness(); h.state.noAdmin = true;
  assert.equal(await h.run(), "reservation-unconfirmed"); assert.equal(h.state.requests.length, 0);
});

test("bounded reserve timeout ignores late true, without retry or receipt on unowned attempt", async () => {
  const h = harness(); h.state.pendingRpc = "touchline_game_notification_reserve";
  const result = h.run(); await flush(); h.timeout();
  assert.equal(await result, "reservation-unconfirmed"); assert.equal(h.state.calls[0].signal?.aborted, true);
  h.resolveLate({ data: true, error: null }); await flush();
  assert.equal(h.state.calls.length, 1); assert.equal(h.state.requests.length, 0); assert.equal(h.timers.size, 0);
});

test("provider rejection, uncertain network and lost finish never retry encrypted transport", async () => {
  for (const mode of ["rejected", "unknown", "lost-finish"]) {
    const h = harness();
    if (mode === "rejected") h.state.status = 410;
    if (mode === "unknown") h.state.networkThrows = true;
    if (mode === "lost-finish") h.state.finish = { data: null, error: null };
    assert.equal(await h.run(), mode === "rejected" ? "failed" : mode === "unknown" ? "uncertain" : "receipt-unconfirmed");
    assert.equal(h.state.requests.length, 1); assert.equal(h.state.calls.length, 2);
  }
});

test("finish is independently abortable and bounded after acceptance", async () => {
  const h = harness(); h.state.pendingRpc = "touchline_game_notification_finish";
  const result = h.run(); await flush(); h.timeout();
  assert.equal(await result, "receipt-unconfirmed"); assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.calls.at(-1)?.signal?.aborted, true); assert.equal(h.timers.size, 0);
});

import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import vm from "node:vm";
import ts from "typescript";
import * as sourceReader from "../lib/touchlineFantasy/lineup-reminder-source.ts";
import * as registration from "../lib/touchlineArena/push-device-contract.ts";
import * as fingerprint from "../lib/touchlineArena/push-subscription-fingerprint.ts";
import * as policy from "../lib/touchlineFantasy/lineup-reminder-delivery-policy.ts";
import * as notificationI18n from "../lib/touchlineArena/notification-i18n.ts";
import type * as claimedServer from "../lib/touchlineFantasy/lineup-reminder-claimed-source-server.ts";

const nowMs = Date.parse("2026-10-02T12:00:00Z"), iso = (ms: number) => new Date(ms).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { userId: id(1), gameweekId: id(2), competitionId: id(3), seasonId: id(4) };
const claim = { id: id(6), leaseToken: id(7), leaseUntil: iso(nowMs + 30_000), expiresAt: iso(nowMs + 60_000) };
const curve = createECDH("prime256v1"); curve.setPrivateKey(Buffer.alloc(32, 1));
const subscription = { endpoint: "https://push.example.test/private-endpoint", keys: {
  p256dh: curve.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url"),
} };
const tables = {
  queue: "touchline_game_notification_deliveries", identity: "touchline_game_notification_identities",
  enrollment: "touchline_game_notification_enrollments", gameweek: "touchline_fantasy_gameweeks",
  device: "notification_devices", preferences: "notification_preferences",
};
type Row = Record<string, unknown>;
type Response = { data: unknown; error: unknown };
const transpile = (file: string) => ts.transpileModule(readFileSync(new URL(`../lib/touchlineFantasy/${file}`, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const claimedJs = transpile("lineup-reminder-claimed-source-server.ts"), sourceJs = transpile("lineup-reminder-source-server.ts");
function harness() {
  const db: Record<string, Row[]> = {
    [tables.queue]: [{ id: claim.id, identity_id: id(8), device_id: id(5), generation: "9007199254740993", subscription: structuredClone(subscription),
      created_at: iso(nowMs - 1_000), expires_at: claim.expiresAt, state: "queued", lease_token: claim.leaseToken,
      lease_expires_at: claim.leaseUntil, attempt_id: null, attempt_started_at: null }],
    [tables.identity]: [{ id: id(8), user_id: scope.userId, gameweek_id: scope.gameweekId, kind: "missing_xi" }],
    [tables.gameweek]: [{ id: scope.gameweekId, competition_id: scope.competitionId, season_id: scope.seasonId }],
    [tables.enrollment]: [{ user_id: scope.userId, device_id: id(5), gameweek_id: scope.gameweekId, generation: "9007199254740993",
      needs_baseline: false, suppressed: false, deadline: claim.expiresAt, subscription: structuredClone(subscription), consent_at: iso(nowMs - 2_000) }],
    [tables.device]: [{ id: id(5), user_id: scope.userId, installation_id: id(9), permission: "granted", push_subscription: structuredClone(subscription) }],
    [tables.preferences]: [{ user_id: scope.userId, game_locale: "en-GB", channels: { push: true }, settings: { lineupReminders: true }, frequency: "realtime",
      explicit_consent_at: iso(nowMs - 2_000), quiet_hours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" } }],
  };
  const slotIds = Array.from({ length: 11 }, (_, i) => `slot-${i}`);
  const source: sourceReader.LineupReminderSource = { ...scope, schemaVersion: 1, checkedAtMs: nowMs, read: {
    status: "complete", checkedAtMs: nowMs, marketEditable: true, effectiveDeadlineMs: nowMs + 60_000,
    formation: { published: true, code: "4-3-3", slotIds },
    userGameweek: { state: "DRAFT", formationCode: "4-3-3", selectedCoachId: "307" }, selections: [],
  } };
  const state = { admins: 0, rpcCalls: 0, noAdmin: false, factoryError: false, rpcError: false,
    failTable: "", pendingAt: "", wall: nowMs, elapsed: 0, source: source as unknown,
    onSource: (() => {}) as () => void,
    reads: [] as Array<{ table: string; columns: string; filters: Record<string, string> }>, signals: [] as AbortSignal[] };
  const timers = new Map<number, { callback: () => void; ms: number }>(); let timerId = 0;
  let resolveLate!: (response: Response) => void, rejectLate!: (error: Error) => void;
  const pending = new Promise<Response>((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
  const admin = {
    from(table: string) {
      assert.ok(Object.hasOwn(db, table));
      const filters: Record<string, string> = {}; let columns = "";
      const query = {
        select(value: string) { columns = value; return query; },
        eq(key: string, value: string) { filters[key] = value; return query; },
        abortSignal(signal: AbortSignal) { state.signals.push(signal); return query; },
        async maybeSingle(): Promise<Response> {
          state.reads.push({ table, columns, filters: { ...filters } });
          if (state.pendingAt === table) return pending;
          if (state.failTable === table) return { data: null, error: { message: "PRIVATE SQL" } };
          const matched = db[table].filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
          if (matched.length > 1) return { data: null, error: { message: "ambiguous" } };
          if (!matched.length) return { data: null, error: null };
          const data: Row = {};
          for (const column of columns.split(",")) { assert.ok(Object.hasOwn(matched[0], column), column); data[column] = structuredClone(matched[0][column]); }
          return { data, error: null };
        },
      };
      return query;
    },
    rpc(name: string, args: unknown) {
      state.rpcCalls++; assert.equal(name, "touchline_fantasy_read_lineup_reminder");
      assert.deepEqual(args, { p_user_id: scope.userId, p_gameweek_id: scope.gameweekId });
      return { abortSignal(signal: AbortSignal) {
        state.signals.push(signal); state.onSource();
        if (state.pendingAt === "source") return pending;
        return Promise.resolve({ data: state.source, error: state.rpcError ? { message: "PRIVATE RPC" } : null });
      } };
    },
  };
  class ClockDate extends Date { static now() { return state.wall; } }
  const imports: Record<string, unknown> = {
    "server-only": {}, "node:util": { isDeepStrictEqual },
    "@/lib/supabase/admin": { createAdminClient() { state.admins++; if (state.factoryError) throw new Error("PRIVATE config"); return state.noAdmin ? null : admin; } },
    "./lineup-reminder-source.ts": sourceReader,
    "../touchlineArena/push-device-contract.ts": registration,
    "../touchlineArena/push-subscription-fingerprint.ts": fingerprint,
    "./lineup-reminder-delivery-policy.ts": policy,
    "../touchlineArena/notification-i18n.ts": notificationI18n,
  };
  function load(js: string) {
    const exports: Record<string, unknown> = {};
    vm.runInNewContext(js, { exports, Date: ClockDate, AbortController, structuredClone,
      performance: { now: () => state.elapsed },
      setTimeout: (callback: () => void, ms: number) => { timers.set(++timerId, { callback, ms }); return timerId; },
      clearTimeout: (key: number) => timers.delete(key),
      require: (name: string) => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; },
    });
    return exports;
  }
  imports["./lineup-reminder-source-server.ts"] = load(sourceJs);
  const loaded = load(claimedJs) as unknown as typeof claimedServer;
  const controller = new AbortController();
  return { db, state, source, controller, timers, resolveLate, rejectLate,
    read: (owned = claim, maximumAgeMs = 1_000) => loaded.readClaimedLineupReminderSource(owned, { maximumAgeMs, now: () => new Date(state.wall), signal: controller.signal }),
    timeout: () => { const timer = timers.values().next().value; assert.ok(timer); assert.equal(timer.ms, 5_000); state.elapsed = 5_000; timer.callback(); },
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("owned queued claim works before/after reservation through real source, registration and policy graph", async () => {
  for (const reserved of [false, true]) {
    const h = harness();
    if (reserved) Object.assign(h.db[tables.queue][0], { attempt_id: id(10), attempt_started_at: iso(nowMs) });
    const result = await h.read(); assert.ok(result);
    assert.equal(result.deviceId, id(5)); assert.equal(result.identityId, id(8)); assert.equal(result.policy.queued.generation, "9007199254740993");
    assert.equal(result.policy.queued.kind, "missing_xi");
    assert.equal(result.queuedSubscriptionFingerprint, fingerprint.touchlinePushSubscriptionFingerprint(result.registration));
    assert.equal(policy.lineupReminderDeliveryDecision({ ...result.policy, now: new Date(nowMs), leaseUntil: claim.leaseUntil, expiresAt: claim.expiresAt }), "ready");
    for (const table of Object.values(tables)) assert.equal(h.state.reads.filter(read => read.table === table).length, 2, table);
    for (const read of h.state.reads.filter(read => read.table === tables.queue)) assert.deepEqual(read.filters, { id: claim.id, lease_token: claim.leaseToken, state: "queued" });
    assert.equal(h.state.rpcCalls, 1); assert.equal(h.timers.size, 0);
  }
  const complete = harness(); complete.db[tables.identity][0].kind = "complete_unconfirmed";
  complete.source.read.selections = complete.source.read.formation.slotIds.map((slotId, i) => ({ slotId, playerId: id(100 + i) }));
  assert.equal((await complete.read())?.policy.queued.kind, "complete_unconfirmed");
});

test("account locale is selected twice under the owner filter and accepts exactly eight stored codes", async () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const h = harness(); h.db[tables.preferences][0].game_locale = locale;
    const result = await h.read(); assert.ok(result);
    assert.equal((result as unknown as { locale: unknown }).locale, locale);
    const reads = h.state.reads.filter(read => read.table === tables.preferences);
    assert.equal(reads.length, 2);
    for (const read of reads) {
      assert.ok(read.columns.split(",").includes("game_locale"));
      assert.deepEqual(read.filters, { user_id: scope.userId });
    }
  }
});

test("missing or noncanonical account locale fails closed without inferred default", async () => {
  for (const locale of [undefined, null, "", "en", "en-US", "pt-br", " ar-SA", "fr-FR ", "constructor", "__proto__", 1, {}, ["en-GB"]]) {
    const h = harness(); h.db[tables.preferences][0].game_locale = locale;
    assert.equal(await h.read(), null, String(locale));
    assert.equal(h.timers.size, 0);
  }
});

test("invalid claim/policy/aborted request cannot construct admin", async () => {
  for (const change of ["id", "lease", "expired", "age", "abort"]) {
    const h = harness(); if (change === "abort") h.controller.abort();
    const owned = { ...claim, ...(change === "id" ? { id: "bad" } : change === "lease" ? { leaseToken: "bad" } : change === "expired" ? { expiresAt: iso(nowMs) } : {}) };
    assert.equal(await h.read(owned, change === "age" ? 0 : 1_000), null);
    assert.equal(h.state.admins, 0); assert.equal(h.timers.size, 0);
  }
});

test("errors, absent rows and mismatched ownership are unavailable without private diagnostics", async () => {
  for (const table of Object.values(tables)) for (const missing of [false, true]) {
    const h = harness(); if (missing) h.db[table] = []; else h.state.failTable = table;
    assert.equal(await h.read(), null); assert.equal(h.timers.size, 0);
  }
  for (const mode of ["noAdmin", "factoryError", "rpcError"] as const) {
    const h = harness(); h.state[mode] = true; assert.equal(await h.read(), null); assert.equal(h.timers.size, 0);
  }
  const h = harness(); h.db[tables.device][0].user_id = id(999); assert.equal(await h.read(), null);
});

test("post-source changes to claim, identity, gameweek or parents invalidate the entire read", async () => {
  const changes: Array<(h: ReturnType<typeof harness>) => void> = [
    h => { h.db[tables.queue][0].lease_token = id(999); },
    h => { h.db[tables.queue][0].generation = "9007199254740994"; },
    h => { h.db[tables.queue][0].attempt_id = id(10); h.db[tables.queue][0].attempt_started_at = iso(nowMs); },
    h => { h.db[tables.identity][0].kind = "complete_unconfirmed"; },
    h => { h.db[tables.identity][0].user_id = id(999); },
    h => { h.db[tables.gameweek][0].season_id = id(999); },
    h => { h.db[tables.enrollment][0].generation = "9007199254740994"; },
    h => { h.db[tables.enrollment][0].needs_baseline = true; },
    h => { h.db[tables.device][0].installation_id = id(999); },
    h => { h.db[tables.device][0].user_id = id(999); },
    h => { h.db[tables.preferences][0].settings = { lineupReminders: false }; },
    h => { h.db[tables.preferences][0].game_locale = "ar-SA"; },
  ];
  for (const change of changes) { const h = harness(); h.state.onSource = () => change(h); assert.equal(await h.read(), null); }
});

test("duplicate rows at either read stage fail closed rather than picking an arbitrary owner", async () => {
  for (const table of Object.values(tables)) for (const afterSource of [false, true]) {
    const h = harness();
    const duplicate = () => h.db[table].push(structuredClone(h.db[table][0]));
    if (afterSource) h.state.onSource = duplicate; else duplicate();
    assert.equal(await h.read(), null, `${table}:${afterSource ? "final" : "initial"}`);
    assert.equal(h.timers.size, 0);
  }
});

test("real registration and policy reject malformed keys, substituted subscriptions and wrong readiness", async () => {
  for (const target of [tables.queue, tables.enrollment, tables.device]) {
    const h = harness(); h.db[target][0][target === tables.device ? "push_subscription" : "subscription"] = { endpoint: "https://push.example.test/wrong", keys: {} };
    assert.equal(await h.read(), null);
  }
  for (const change of ["confirmed", "deadline", "scope", "stale", "quiet", "generation", "suppressed"]) {
    const h = harness();
    if (change === "confirmed") h.source.read.userGameweek!.state = "CONFIRMED";
    if (change === "deadline") h.source.read.effectiveDeadlineMs++;
    if (change === "scope") h.source.seasonId = id(999);
    if (change === "stale") h.source.checkedAtMs = h.source.read.checkedAtMs = nowMs - 1_001;
    if (change === "quiet") h.db[tables.preferences][0].quiet_hours = { enabled: true, start: "11:00", end: "13:00", timezone: "UTC" };
    if (change === "generation") h.db[tables.enrollment][0].generation = Number.MAX_SAFE_INTEGER + 1;
    if (change === "suppressed") h.db[tables.enrollment][0].suppressed = true;
    assert.equal(await h.read(), null);
  }
});

test("abort during actual source RPC returns promptly and ignores late source success", async () => {
  const h = harness(); h.state.pendingAt = "source";
  const pending = h.read(); await flush(); assert.equal(h.state.rpcCalls, 1);
  const count = h.state.reads.length; h.controller.abort(); assert.equal(await pending, null);
  h.resolveLate({ data: h.source, error: null }); await flush();
  assert.equal(h.state.reads.length, count); assert.equal(h.timers.size, 0);
});

test("bounded deadline rejects ignored-abort query results and observes late rejection without retry", async () => {
  for (const reject of [false, true]) {
    const h = harness(); h.state.pendingAt = tables.queue;
    const pending = h.read(); h.timeout(); assert.equal(await pending, null);
    assert.equal(h.state.signals[0].aborted, true);
    if (reject) h.rejectLate(new Error("PRIVATE late failure")); else h.resolveLate({ data: h.db[tables.queue][0], error: null });
    await flush(); assert.equal(h.state.reads.length, 1); assert.equal(h.state.rpcCalls, 0); assert.equal(h.timers.size, 0);
  }
});

import assert from "node:assert/strict";
import { createECDH, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as dispatcher from "../lib/touchlineArena/match-push-dispatch.ts";
import * as transport from "../lib/touchlineArena/match-push-transport.ts";
import * as vapidParser from "../lib/touchlineArena/match-push-vapid-config.ts";
import * as fingerprints from "../lib/touchlineArena/push-subscription-fingerprint.ts";
import { parseTouchlineDeviceRegistration } from "../lib/touchlineArena/push-device-contract.ts";
import * as deliveryPolicy from "../lib/touchlineFantasy/lineup-reminder-delivery-policy.ts";
import * as notification from "../lib/touchlineFantasy/lineup-reminder-notification.ts";
import { getTouchlineNotificationCopy } from "../lib/touchlineArena/notification-i18n.ts";
import type { TouchLineLocale } from "../lib/touchlineArena/i18n.ts";
import { readLineupReminderSource } from "../lib/touchlineFantasy/lineup-reminder-source.ts";
import type * as sourceServer from "../lib/touchlineFantasy/lineup-reminder-claimed-source-server.ts";
import type * as singleServer from "../lib/touchlineFantasy/lineup-reminder-single-claim-server.ts";

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const root = new URL("../", import.meta.url);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { userId: id(1), gameweekId: id(14), competitionId: id(10), seasonId: id(11) };
type Claim = Parameters<typeof singleServer.dispatchClaimedLineupReminder>[0];
type Fresh = NonNullable<Awaited<ReturnType<typeof sourceServer.readClaimedLineupReminderSource>>>;
type Db = {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, args?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};
type Binding = {
  state: string; leaseToken: string; leaseUntil: string; expiresAt: string;
  identityId: string; deviceId: string; kind: "missing_xi";
  queuedGeneration: string; currentGeneration: string; deadlineMs: number;
  needsBaseline: boolean; suppressed: boolean; consentAt: string; explicitConsentAt: string;
  channels: { push: boolean }; settings: { lineupReminders: boolean }; frequency: string; quietHours: unknown;
  gameLocale: unknown;
  installationId: string; permission: string; subscription: unknown; queuedSubscription: unknown;
};
const curve = createECDH("prime256v1");
curve.setPrivateKey(Buffer.alloc(32, 1));
const vapid = { subject: "mailto:owner@example.test", publicKey: curve.getPublicKey().toString("base64url"), privateKey: Buffer.alloc(32, 1).toString("base64url") };
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-reminder", keys: { p256dh: vapid.publicKey, auth: Buffer.alloc(16, 2).toString("base64url") } };

// Explicit reduced parent schema, not a claim of full Supabase/PostgREST parity.
// The geometry validator and all four reminder migrations below are unmodified
// production SQL. Only the live/final fixture-status primitives are reduced.
async function seed(db: Db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key);
    create table public.users(id uuid primary key references auth.users(id) on delete cascade);
    create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create table football_rounds(id uuid primary key,competition_id uuid,season_id uuid,name text);
    create table football_fixtures(id uuid primary key,round_id uuid,starts_at timestamptz,status text,finalized_at timestamptz,competition_id uuid,season_id uuid);
    create table touchline_fantasy_configs(competition_id uuid,season_id uuid,status text);
    create table touchline_fantasy_gameweeks(id uuid primary key default gen_random_uuid(),competition_id uuid,season_id uuid,round_id uuid unique,gameweek_number integer,state text,market_opens_at timestamptz,locks_at timestamptz,first_fixture_at timestamptz,last_fixture_at timestamptz);
    create table touchline_fantasy_user_gameweeks(id uuid primary key,user_id uuid,gameweek_id uuid,state text,formation_code text,selected_coach_id text);
    create table touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid,player_id uuid,slot_id text,slot_index integer);
    create table touchline_formation_geometry_versions(id uuid primary key,formation_code text,status text,geometry jsonb,validation_report jsonb);
    create function touchline_fantasy_fixture_is_live(text) returns boolean language sql immutable as $$select $1='LIVE'$$;
    create function touchline_fantasy_fixture_is_final(text) returns boolean language sql immutable as $$select $1='FT'$$;
    grant usage on schema public to anon,authenticated,service_role;
    grant usage on schema auth to authenticated;
    create table notification_devices(id uuid primary key,user_id uuid,installation_id uuid,permission text,push_subscription jsonb);`);
  const registry = await readFile(new URL("supabase/qa/028_touchline_qa_formation_geometry_registry.sql", root), "utf8");
  const start = registry.indexOf("create or replace function public.touchline_formation_geometry_payload_is_valid(");
  const end = registry.indexOf("$$;", start);
  assert.ok(start >= 0 && end > start);
  await db.exec(registry.slice(start, end + 3));
  for (const name of [
    "017_touchline_notification_preferences.sql",
    "20261002031429_touchline_fantasy_shared_market_window_projection.sql",
    "20261002032250_touchline_fantasy_lineup_reminder_read.sql",
    "20261002033308_touchline_game_notification_ledger.sql",
    "20261002035727_touchline_game_notification_delivery_claims.sql",
    "20261002183141_touchline_notification_game_locale.sql",
  ]) await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), "utf8"));
  await db.exec(`insert into auth.users values('${id(1)}'); insert into public.users values('${id(1)}');
    insert into touchline_fantasy_configs values('${id(10)}','${id(11)}','active');
    insert into football_rounds values('${id(12)}','${id(10)}','${id(11)}','Round 1');
    insert into football_fixtures values('${id(13)}','${id(12)}',date_trunc('second',clock_timestamp())+interval '1 hour','NS',null,'${id(10)}','${id(11)}');
    insert into touchline_fantasy_gameweeks values('${id(14)}','${id(10)}','${id(11)}','${id(12)}',1,'MARKET_OPEN',clock_timestamp()-interval '6 days',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour');
    insert into notification_preferences(user_id,channels,settings,frequency,explicit_consent_at,quiet_hours,game_locale)
      values('${id(1)}','{"push":true}','{"lineupReminders":true}','realtime',clock_timestamp()-interval '2 days','{"enabled":false,"start":"22:00","end":"07:00","timezone":"UTC"}','en-GB');`);
  await db.query("insert into notification_devices values($1,$2,$3,'granted',$4::jsonb)", [id(30), id(1), id(31), JSON.stringify(subscription)]);
  const geometry = { schemaVersion: 1, formationCode: "4-3-3", slots: Array.from({ length: 11 }, (_, i) => ({ id: `S${i}`, x: 50, y: 50,
    role: i === 0 ? "goalkeeper" : i < 5 ? "defender" : i < 8 ? "midfielder" : "forward", priority: i + 1, allowedPositions: ["ST"] })) };
  await db.query("insert into touchline_formation_geometry_versions values($1,'4-3-3','published',$2::jsonb,$3::jsonb)",
    [id(15), JSON.stringify(geometry), JSON.stringify({ publishable: true, formationCode: "4-3-3", slotCount: 11 })]);
  // Already-admitted bookkeeping is synthetic. Claim/reserve subsequently invoke
  // the real readiness SQL; this does not substitute for admission/fanout tests.
  await db.exec(`insert into touchline_game_notification_enrollments
    select '${id(1)}','${id(30)}','${id(14)}',1,false,clock_timestamp()-interval '1 day',f.starts_at,7200,false,d.push_subscription,p.explicit_consent_at
    from football_fixtures f cross join notification_devices d cross join notification_preferences p;
    insert into touchline_game_notification_identities values('${id(40)}','${id(1)}','${id(14)}','missing_xi',clock_timestamp()-interval '1 minute');
    insert into touchline_game_notification_deliveries(id,identity_id,device_id,generation,subscription,created_at,expires_at,payload)
    select '${id(50)}','${id(40)}','${id(30)}',1,d.push_subscription,clock_timestamp()-interval '1 minute',f.starts_at,'{}'::jsonb
    from notification_devices d cross join football_fixtures f;`);
}

const rpcSql: Record<string, { sql: string; keys: string[] }> = {
  touchline_game_notification_claim: { sql: "select public.touchline_game_notification_claim($1::uuid,$2::integer) r", keys: ["p_id", "p_lease_seconds"] },
  touchline_game_notification_reserve: { sql: "select public.touchline_game_notification_reserve($1::uuid,$2::uuid,$3::uuid) r", keys: ["p_id", "p_lease_token", "p_attempt_id"] },
  touchline_game_notification_finish: { sql: "select public.touchline_game_notification_finish($1::uuid,$2::uuid,$3::uuid,$4::text) r", keys: ["p_id", "p_lease_token", "p_attempt_id", "p_state"] },
  touchline_fantasy_read_lineup_reminder: { sql: "select public.touchline_fantasy_read_lineup_reminder($1::uuid,$2::uuid) r", keys: ["p_user_id", "p_gameweek_id"] },
};
async function rpc(db: Db, name: string, args: Record<string, unknown>): Promise<unknown> {
  const definition = rpcSql[name]; assert.ok(definition, name);
  assert.deepEqual(Object.keys(args).sort(), [...definition.keys].sort());
  await db.exec("set role service_role");
  try { return (await db.query<{ r: unknown }>(definition.sql, definition.keys.map(key => args[key]))).rows[0].r; }
  finally { await db.exec("reset role"); }
}

// Deliberate claimed-source boundary double. Reads actual stored bindings and
// actual readiness RPC into the real source parser, fingerprint and policy.
// It does not claim to exercise the production multi-read Supabase adapter.
async function freshSource(db: Db, claim: Claim): Promise<Fresh | null> {
  const { rows } = await db.query<{ binding: Binding }>(`select jsonb_build_object(
    'state',q.state,'leaseToken',q.lease_token,'leaseUntil',q.lease_expires_at,'expiresAt',q.expires_at,
    'identityId',i.id,'deviceId',d.id,'kind',i.kind,'queuedGeneration',q.generation::text,'currentGeneration',e.generation::text,
    'deadlineMs',floor(extract(epoch from e.deadline)*1000),'needsBaseline',e.needs_baseline,'suppressed',e.suppressed,
    'consentAt',e.consent_at,'explicitConsentAt',p.explicit_consent_at,'channels',p.channels,'settings',p.settings,
    'frequency',p.frequency,'quietHours',p.quiet_hours,'gameLocale',p.game_locale,'installationId',d.installation_id,'permission',d.permission,
    'subscription',d.push_subscription,'queuedSubscription',q.subscription) binding
    from touchline_game_notification_deliveries q join touchline_game_notification_identities i on i.id=q.identity_id
    join notification_devices d on d.id=q.device_id and d.user_id=i.user_id
    join notification_preferences p on p.user_id=i.user_id
    join touchline_game_notification_enrollments e on e.user_id=i.user_id and e.device_id=d.id and e.gameweek_id=i.gameweek_id
    where q.id=$1 and i.user_id=$2 and i.gameweek_id=$3`, [claim.id, scope.userId, scope.gameweekId]);
  const b = rows[0]?.binding;
  if (!b || !getTouchlineNotificationCopy(b.gameLocale) || b.state !== "queued" || b.leaseToken !== claim.leaseToken
    || Date.parse(b.leaseUntil) !== Date.parse(claim.leaseUntil) || Date.parse(b.expiresAt) !== Date.parse(claim.expiresAt)) return null;
  const result = await readLineupReminderSource({ rpc: async (name, args) => ({ data: await rpc(db, name, args), error: null }) },
    { ...scope, maximumAgeMs: 30_000 }, Date.now);
  assert.equal(result.status, "INCOMPLETE"); assert.ok(result.source);
  const registration = parseTouchlineDeviceRegistration({ installationId: b.installationId, permission: b.permission, subscription: b.subscription });
  assert.ok(registration?.subscription);
  const queuedFingerprint = fingerprints.touchlinePushSubscriptionFingerprint({ installationId: b.installationId, permission: "granted", subscription: b.queuedSubscription });
  assert.ok(queuedFingerprint);
  return { identityId: b.identityId, deviceId: b.deviceId, registration, source: result.source, locale: b.gameLocale as TouchLineLocale, queuedSubscriptionFingerprint: queuedFingerprint,
    policy: { maximumAgeMs: 30_000, source: result.source,
      queued: { ...scope, deviceId: b.deviceId, kind: b.kind, generation: b.queuedGeneration, effectiveDeadlineMs: b.deadlineMs, subscriptionFingerprint: queuedFingerprint },
      current: { ...scope, deviceId: b.deviceId, checkedAtMs: Date.now(), generation: b.currentGeneration,
        needsBaseline: b.needsBaseline, suppressed: b.suppressed, permission: b.permission,
        subscriptionFingerprint: fingerprints.touchlinePushSubscriptionFingerprint(registration), enrollmentConsentAt: b.consentAt,
        explicitConsentAt: b.explicitConsentAt, channels: b.channels, settings: b.settings, frequency: b.frequency, quietHours: b.quietHours } } };
}

function harness(db: Db, js: string, claim: Claim, mode: "normal" | "second-locale" | "source-missing" | "finish-not-reached" | "finish-response-lost") {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const requests: RequestInit[] = [];
  const payloads: string[] = [];
  const freshLocales: TouchLineLocale[] = [];
  const imports: Record<string, unknown> = {
    "server-only": {}, "node:crypto": { randomUUID },
    "../touchlineArena/match-push-dispatch.ts": dispatcher,
    "../touchlineArena/match-push-vapid-config.ts": vapidParser,
    "../touchlineArena/push-subscription-fingerprint.ts": fingerprints,
    "./lineup-reminder-delivery-policy.ts": deliveryPolicy,
    "./lineup-reminder-notification.ts": notification,
    "./lineup-reminder-claimed-source-server.ts": { readClaimedLineupReminderSource: async (owned: Claim, options: { signal: AbortSignal }) => {
      assert.equal(options.signal.aborted, false); assert.deepEqual(owned, claim);
      const fresh = mode === "source-missing" ? null : await freshSource(db, owned);
      if (fresh) freshLocales.push(fresh.locale);
      return fresh;
    } },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: (name: string, args: Record<string, unknown>) => ({
      abortSignal: async (signal: AbortSignal) => {
        assert.equal(signal.aborted, false); calls.push({ name, args });
        assert.ok(name === "touchline_game_notification_reserve" || name === "touchline_game_notification_finish");
        // Explicit transport-loss injection, never a fabricated SQL boolean.
        if (name.endsWith("_finish") && mode === "finish-not-reached") throw new Error("Synthetic request lost before SQL");
        const data = await rpc(db, name, args);
        if (name.endsWith("_reserve") && data === true && mode === "second-locale") {
          await db.exec("set role authenticated");
          try {
            await db.query("select set_config('request.jwt.claim.sub',$1,false)", [scope.userId]);
            const saved = await db.query<{ game_locale: string }>("select * from public.touchline_set_game_locale('pt-BR')");
            assert.equal(saved.rows[0].game_locale, "pt-BR");
          } finally { await db.exec("reset role"); }
        }
        if (name.endsWith("_finish") && mode === "finish-response-lost") throw new Error("Synthetic response lost after SQL");
        return { data, error: null };
      },
    }) }) },
    "../touchlineArena/match-push-transport.ts": {
      isSupportedMatchPushEndpoint: transport.isSupportedMatchPushEndpoint,
      sendMatchWebPush: async (input: Parameters<typeof transport.sendMatchWebPush>[0]) => {
        payloads.push(input.payload);
        return transport.sendMatchWebPush(input, async (_url, init) => {
          const persisted = (await db.query<{ state: string; attempt_id: string | null }>(
            "select state,attempt_id from touchline_game_notification_deliveries where id=$1", [claim.id])).rows[0];
          assert.equal(persisted.state, "queued");
          assert.ok(persisted.attempt_id, "SQL reservation committed before transport is invoked");
          assert.equal(persisted.attempt_id, calls.find(call => call.name.endsWith("_reserve"))?.args.p_attempt_id);
          requests.push(init!); return new Response(null, { status: 201 });
        });
      },
    },
  };
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(js, { exports, Date, Buffer, AbortController, performance, setTimeout, clearTimeout,
    require: (name: string) => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } });
  const api = exports as unknown as typeof singleServer;
  return { calls, requests, payloads, freshLocales, run: () => api.dispatchClaimedLineupReminder(claim, { enabled: true, locale: "en-GB", maximumAgeMs: 30_000, vapid }) };
}

test("real reminder single-claim graph composes with durable SQL nonce/receipts", { skip: !modulePath, timeout: 120_000 }, async t => {
  const { PGlite } = await import(modulePath!);
  const db: Db = new PGlite();
  try {
    await seed(db);
    const js = ts.transpileModule(await readFile(new URL("lib/touchlineFantasy/lineup-reminder-single-claim-server.ts", root), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const claim = async () => await rpc(db, "touchline_game_notification_claim", { p_id: id(50), p_lease_seconds: 60 }) as Claim | null;
    const row = async () => (await db.query<{ state: string; attempt_id: string | null; attempt_started_at: Date | null }>(
      "select state,attempt_id,attempt_started_at from touchline_game_notification_deliveries where id=$1", [id(50)])).rows[0];
    for (const mode of ["source-missing", "normal", "second-locale", "finish-not-reached", "finish-response-lost"] as const) {
      await t.test(mode, async () => {
        // No outer transaction: reserve/finish each commit before the simulated
        // transport/response loss. Later RPCs observe the committed nonce.
        try {
          const owned = await claim(); assert.ok(owned);
          const h = harness(db, js, owned, mode);
          assert.equal(await h.run(), mode === "source-missing" ? "cancelled" : mode === "normal" || mode === "second-locale" ? "provider_accepted" : "receipt-unconfirmed");
          const persisted = await row();
          if (mode === "source-missing") {
            assert.equal(persisted.state, "cancelled"); assert.equal(persisted.attempt_id, null);
            assert.equal(persisted.attempt_started_at, null); assert.equal(h.requests.length, 0);
            assert.equal(h.calls.length, 1); assert.equal(h.calls[0].name, "touchline_game_notification_finish");
            assert.equal(h.calls[0].args.p_attempt_id, null); assert.equal(h.calls[0].args.p_state, "cancelled");
          } else {
            assert.equal(persisted.state, mode === "finish-not-reached" ? "queued" : "provider_accepted");
            assert.ok(persisted.attempt_id); assert.ok(persisted.attempt_started_at);
            assert.equal(h.calls.filter(call => call.name.endsWith("_reserve")).length, 1);
            assert.equal(h.calls.filter(call => call.name.endsWith("_finish")).length, 1);
            assert.equal(persisted.attempt_id, h.calls[0].args.p_attempt_id);
            assert.equal(h.calls[1].args.p_attempt_id, persisted.attempt_id);
            assert.equal(h.requests.length, 1);
            const expectedCopy = notification.buildLineupReminderNotification({ identityId: id(40), kind: "missing_xi", locale: mode === "second-locale" ? "pt-BR" : "en-GB" });
            assert.ok(expectedCopy);
            assert.deepEqual(JSON.parse(h.payloads[0]), expectedCopy);
            if (mode === "second-locale") {
              assert.deepEqual(h.freshLocales, ["en-GB", "pt-BR"]);
              assert.equal(expectedCopy.title, "Seu time está esperando");
              assert.equal(expectedCopy.body, "Monte sua escalação");
              assert.equal(expectedCopy.href, "/clubowner?lang=pt-BR");
              const epoch = (await db.query<{ generation: number; needs_baseline: boolean; suppressed: boolean }>(
                "select generation,needs_baseline,suppressed from touchline_game_notification_enrollments")).rows[0];
              assert.equal(Number(epoch.generation), 1);
              assert.equal(epoch.needs_baseline, false);
              assert.equal(epoch.suppressed, false);
            }
            assert.equal(h.requests[0].method, "POST"); assert.equal(h.requests[0].redirect, "error");
            assert.ok(h.requests[0].body instanceof Uint8Array);
            assert.equal(Buffer.from(h.requests[0].body as Uint8Array).includes(Buffer.from(expectedCopy.body)), false);
            assert.ok(Number(new Headers(h.requests[0].headers).get("TTL")) > 0);
          }
          assert.equal(await claim(), null, "terminal state or consumed nonce cannot be reclaimed");
          if (mode === "finish-not-reached") {
            assert.equal(await h.run(), "reservation-not-granted", "even the old lease cannot reserve another attempt");
            assert.equal(h.requests.length, 1); assert.deepEqual(await row(), persisted);
            // A later worker after lease expiry must still never get this item.
            await db.exec("update touchline_game_notification_deliveries set lease_expires_at=clock_timestamp()-interval '1 second'");
            assert.equal(await claim(), null, "expired worker lease does not clear consumed nonce");
            assert.equal((await row()).attempt_id, persisted.attempt_id);
          }
        } finally {
          // Owner-only synthetic fixture reset, never a production recovery path.
          await db.exec(`delete from touchline_game_notification_deliveries where id='${id(50)}';
            update notification_preferences set game_locale='en-GB' where user_id='${id(1)}';
            insert into touchline_game_notification_deliveries(id,identity_id,device_id,generation,subscription,created_at,expires_at,payload)
            select '${id(50)}','${id(40)}','${id(30)}',1,d.push_subscription,clock_timestamp()-interval '1 minute',f.starts_at,'{}'::jsonb
            from notification_devices d cross join football_fixtures f;`);
        }
      });
    }
  } finally { await db.close(); }
});

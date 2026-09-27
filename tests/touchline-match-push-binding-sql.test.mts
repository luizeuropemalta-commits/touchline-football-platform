import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createECDH } from 'node:crypto';
import { matchPushDeliveryDecision } from '../lib/touchlineArena/match-push-delivery-policy.ts';
import { touchlinePushSubscriptionFingerprint } from '../lib/touchlineArena/push-subscription-fingerprint.ts';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migration = readFileSync(new URL('../supabase/migrations/20260927005940_touchline_match_push_subscription_binding.sql', import.meta.url), 'utf8');
const outboxMigration = readFileSync(new URL('../supabase/migrations/20260924222644_touchline_match_push_outbox.sql', import.meta.url), 'utf8');
const kindMigration = readFileSync(new URL('../supabase/migrations/20260927023959_touchline_match_push_delivery_kind.sql', import.meta.url), 'utf8');

test('serialized enqueue is idempotent and uncertain or legacy history never grants another initial', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  const device = '00000000-0000-4000-8000-000000000002';
  const fixture = '00000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table notification_devices(id uuid primary key);
      create table football_fixtures(id uuid primary key);
      insert into notification_devices values('${device}'); insert into football_fixtures values('${fixture}');
      grant usage on schema public to service_role; grant select,update on notification_devices to service_role;`);
    await db.exec(`begin;${outboxMigration}${migration}${kindMigration}commit;set role service_role;`);
    const enqueue = (event: string, checksum: string, history: boolean | null = false) => db.query(`select public.touchline_enqueue_match_push($1,$2,$3,$4,now(),'{}',now()+interval '5 minutes',$5,$6) as id`, [device, fixture, event, 'sha256:' + checksum.repeat(64), 'sha256:' + 'f'.repeat(64), history]);
    await assert.rejects(enqueue('1', 'a'), /PUSH_HISTORY_UNVERIFIED/);
    await assert.rejects(enqueue('1', 'a', null), /PUSH_HISTORY_UNVERIFIED/);
    const initial = (await enqueue('1', 'a', true)).rows[0].id;
    assert.equal((await enqueue('1', 'a')).rows[0].id, initial);
    await db.query("update touchline_match_push_outbox set state='uncertain',completed_at=now() where id=$1", [initial]);
    const revision = (await enqueue('1', 'b')).rows[0].id;
    assert.notEqual(initial, revision);
    assert.equal((await db.query('select delivery_kind from touchline_match_push_outbox where id=$1', [revision])).rows[0].delivery_kind, 'revision');
    await db.query(`insert into touchline_match_push_outbox(device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,expires_at)
      values($1,$2,'2','sha256:'||repeat('a',64),now(),'{}',now()+interval '5 minutes')`, [device, fixture]);
    const legacyRevision = (await enqueue('2', 'b', true)).rows[0].id;
    assert.equal((await db.query('select delivery_kind from touchline_match_push_outbox where id=$1', [legacyRevision])).rows[0].delivery_kind, 'revision');
    await db.exec('begin;'); await enqueue('3', 'a', true); await db.exec('rollback;');
    assert.equal((await db.query("select count(*)::int as n from touchline_match_push_outbox where provider_event_id='3'")).rows[0].n, 0);
    await db.exec('reset role;set role authenticated;');
    await assert.rejects(enqueue('4', 'a', true), /permission denied/);
  } finally { await db.close(); }
});

test('pending outbox DDL stays inside runner transaction when history recording fails', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.notification_devices(id uuid primary key);
      create table public.football_fixtures(id uuid primary key);
      create table public.test_migration_history(version text check(false));`);
    await db.exec('begin;');
    await db.exec(outboxMigration);
    await assert.rejects(db.exec("insert into public.test_migration_history values('20260924222644')"), /check constraint/);
    await db.exec('rollback;');
    assert.equal((await db.query("select to_regclass('public.touchline_match_push_outbox') as relation")).rows[0].relation, null);
    assert.equal((await db.query("select count(*)::int as count from pg_proc where proname in ('touchline_claim_match_push_batch','touchline_finish_match_push')")).rows[0].count, 0);
    assert.equal((await db.query('select count(*)::int as count from test_migration_history')).rows[0].count, 0);
  } finally { await db.close(); }
});

test('outbox binding preserves legacy rows without inventing fingerprints and rejects malformed bindings', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    // Focused additive-column contract; complete outbox/claim integration is separate.
    await db.exec("create table public.touchline_match_push_outbox(id integer primary key, state text); insert into public.touchline_match_push_outbox values(1,'queued'),(2,'provider_accepted');");
    await db.exec(`begin;${migration}commit;`);
    assert.deepEqual((await db.query('select * from public.touchline_match_push_outbox order by id')).rows, [
      { id: 1, state: 'queued', subscription_fingerprint: null },
      { id: 2, state: 'provider_accepted', subscription_fingerprint: null },
    ]);
    for (const value of ['', 'sha256:abc', 'sha256:' + 'A'.repeat(64), 'https://push.example.test/private']) {
      await assert.rejects(db.query('insert into public.touchline_match_push_outbox values(3,\'queued\',$1)', [value]), /check constraint/);
    }
    const fingerprint = 'sha256:' + 'a'.repeat(64);
    await db.query('insert into public.touchline_match_push_outbox values(3,\'queued\',$1)', [fingerprint]);
    assert.equal((await db.query('select subscription_fingerprint from public.touchline_match_push_outbox where id=3')).rows[0].subscription_fingerprint, fingerprint);
    assert.equal((await db.query('select count(*)::int as count from public.touchline_match_push_outbox')).rows[0].count, 3);
  } finally { await db.close(); }
});

test('complete outbox claim preserves private binding and legacy NULL for final policy', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    // Synthetic prerequisites only; execute the actual queue and binding migrations.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.notification_devices(id uuid primary key, user_id uuid, permission text, push_subscription jsonb);
      create table public.football_fixtures(id uuid primary key);
      create table public.notification_preferences(user_id uuid primary key, channels jsonb, settings jsonb, frequency text, explicit_consent_at timestamptz);
      create table public.touchline_fixture_alert_subscriptions(fixture_id uuid, user_id uuid);
      grant usage on schema public to service_role;
      grant select on all tables in schema public to service_role;
      insert into football_fixtures values('00000000-0000-4000-8000-000000000001');
      insert into notification_devices values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','granted','{}');
      insert into notification_preferences values('00000000-0000-4000-8000-000000000003','{"push":true}','{"goalsAndEvents":true}','realtime',now()-interval '1 day');
      insert into touchline_fixture_alert_subscriptions values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003');`);
    await db.exec(`begin;${outboxMigration}commit;`);
    await db.exec(`begin;${migration}commit; begin;${kindMigration}commit; set role service_role;`);
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.alloc(32, 1));
    const registration = {
      installationId: '00000000-0000-4000-8000-000000000004', permission: 'granted',
      subscription: { endpoint: 'https://push.example.test/original', keys: {
        p256dh: key.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url'),
      } },
    };
    const binding = touchlinePushSubscriptionFingerprint(registration);
    assert.ok(binding);
    for (const [event, fingerprint] of [['1', null], ['2', binding]]) {
      await db.query(`insert into touchline_match_push_outbox(device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,expires_at,subscription_fingerprint,delivery_kind)
        values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',$1,'sha256:'||repeat('a',64),now(),'{}',now()+interval '5 minutes',$2,$3)`, [event, fingerprint, event === '1' ? null : 'initial']);
    }
    const { rows } = await db.query(`select id, lease_token, delivery_kind, provider_event_id, subscription_fingerprint, lease_until::text, expires_at::text from touchline_claim_match_push_batch(20) order by provider_event_id`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].subscription_fingerprint, null);
    assert.equal(rows[1].subscription_fingerprint, binding);
    assert.equal(rows[0].delivery_kind, null);
    assert.equal(rows[1].delivery_kind, 'initial');
    await assert.rejects(db.query("update touchline_match_push_outbox set delivery_kind='revision' where id=$1", [rows[1].id]), /PUSH_EVENT_IDENTITY_IMMUTABLE/);
    await assert.rejects(db.query('select public.touchline_guard_match_push_identity()'), /permission denied/);
    // Rotate persisted device subscription after enqueue; never rewrite queued history.
    const replacement = { ...registration.subscription, endpoint: 'https://push.example.test/replaced' };
    await db.exec('reset role;');
    await db.query('update notification_devices set push_subscription=$1', [JSON.stringify(replacement)]);
    await db.exec('set role service_role;');
    const currentDevice = (await db.query('select permission, push_subscription from notification_devices')).rows[0];
    const currentFingerprint = touchlinePushSubscriptionFingerprint({
      installationId: registration.installationId, permission: currentDevice.permission, subscription: currentDevice.push_subscription,
    });
    assert.ok(currentFingerprint);
    assert.notEqual(currentFingerprint, binding);
    for (const row of rows) {
      const context = {
        now: new Date(), leaseUntil: row.lease_until, expiresAt: row.expires_at,
        sourceChecksum: 'sha256:' + 'a'.repeat(64), currentSourceChecksum: 'sha256:' + 'a'.repeat(64), sourceVerified: true,
        fixtureOptedIn: true, permission: 'granted', subscriptionUnchanged: true,
        queuedSubscriptionFingerprint: row.subscription_fingerprint, currentSubscriptionFingerprint: binding,
        channels: { push: true }, settings: { goalsAndEvents: true }, frequency: 'realtime',
        explicitConsentAt: '2026-01-01T00:00:00Z', quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'Europe/London' },
      };
      assert.equal(matchPushDeliveryDecision(context), row.provider_event_id === '1' ? 'device-changed' : 'ready');
      assert.equal(matchPushDeliveryDecision({ ...context, currentSubscriptionFingerprint: currentFingerprint }), 'device-changed');
    }
    assert.equal((await db.query("select subscription_fingerprint from touchline_match_push_outbox where provider_event_id='2'")).rows[0].subscription_fingerprint, binding);
    assert.equal((await db.query('select count(*)::int as count from touchline_claim_match_push_batch(20)')).rows[0].count, 0);
    // Synthetic receipt only: no provider call or device delivery occurred.
    const receipt = await db.query("select touchline_finish_match_push($1,$2,'provider_accepted') as finished", [rows[1].id, rows[1].lease_token]);
    assert.equal(receipt.rows[0].finished, true);
    await db.query("update touchline_match_push_outbox set lease_until=clock_timestamp()-interval '1 second' where id=$1", [rows[0].id]);
    assert.equal((await db.query('select count(*)::int as count from touchline_claim_match_push_batch(20)')).rows[0].count, 0);
    const lifecycle = await db.query('select provider_event_id,state,delivery_kind,lease_token from touchline_match_push_outbox order by provider_event_id');
    assert.deepEqual(lifecycle.rows, [
      { provider_event_id: '1', state: 'uncertain', delivery_kind: null, lease_token: null },
      { provider_event_id: '2', state: 'provider_accepted', delivery_kind: 'initial', lease_token: null },
    ]);
    await db.exec('reset role; set role authenticated;');
    await assert.rejects(db.query('select subscription_fingerprint from touchline_match_push_outbox'), /permission denied/);
  } finally { await db.close(); }
});

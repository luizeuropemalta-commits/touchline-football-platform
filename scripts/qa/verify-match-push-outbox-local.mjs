import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

// Explicitly isolated, disposable local database only; never accepts a DB URL.
const container = process.argv[2];
assert.match(container ?? '', /^touchline-push-outbox-test-[0-9]{8}$/);
const inspect = spawnSync('docker', ['inspect', container], { encoding: 'utf8' });
assert.equal(inspect.status, 0, inspect.stderr);
const metadata = JSON.parse(inspect.stdout)[0];
assert.equal(metadata.HostConfig.NetworkMode, 'none');
assert.equal(metadata.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.158');
assert.deepEqual(metadata.HostConfig.PortBindings, {});
const command = ['exec', '-i', container, 'psql', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
function query(sql) {
  const result = spawnSync('docker', command, { input: sql, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function concurrentQuery(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', command);
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(sql);
  });
}
async function queryWithReadySignal(sql, keepOpen = false) {
  const child = spawn('docker', command);
  let output = '', error = '';
  const done = new Promise((resolve, reject) => {
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(error)));
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('local test handshake timed out')), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('TEST_READY')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', () => { if (error.includes('TEST_READY')) { clearTimeout(timer); resolve(); } });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', () => { clearTimeout(timer); if (!(output + error).includes('TEST_READY')) reject(new Error(error)); });
  });
  if (keepOpen) child.stdin.write(`${sql}\n`);
  else child.stdin.end(sql);
  await ready;
  return { done, release: () => child.stdin.end('commit;\n') };
}
// These must fail if a real schema already exists. No DROP/TRUNCATE/reset.
query(`create role anon; create role authenticated; create role service_role bypassrls;
  create table public.notification_devices(id uuid primary key, user_id uuid not null, permission text, push_subscription jsonb);
  create table public.football_fixtures(id uuid primary key);
  create table public.notification_preferences(user_id uuid primary key, channels jsonb, settings jsonb, frequency text, explicit_consent_at timestamptz);
  create table public.touchline_fixture_alert_subscriptions(fixture_id uuid, user_id uuid, primary key(fixture_id,user_id));
  grant usage on schema public to service_role;
  grant select on all tables in schema public to service_role;`);
query(readFileSync(new URL('../../supabase/migrations/20260924222644_touchline_match_push_outbox.sql', import.meta.url), 'utf8'));
const fixture = '00000000-0000-4000-8000-000000000001';
const device = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';
query(`insert into public.football_fixtures values('${fixture}');
  insert into public.notification_devices values('${device}','${user}','granted','{}');
  insert into public.notification_preferences values('${user}','{"push":true}','{"goalsAndEvents":true}','realtime',now());
  insert into public.touchline_fixture_alert_subscriptions values('${fixture}','${user}');`);
function enqueue(event) {
  return query(`set role service_role;
    insert into public.touchline_match_push_outbox(device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,expires_at)
    values('${device}','${fixture}','${event}','sha256:'||repeat('a',64),now(),'{}',now()+interval '5 minutes')
    on conflict(device_id,fixture_id,provider_event_id,source_checksum) do nothing;`);
}
enqueue(1); enqueue(1);
assert.equal(query('select count(*) from public.touchline_match_push_outbox'), '1', 'duplicate enqueue is idempotent');
enqueue(2);
const claims = await Promise.all([0, 1].map(() => concurrentQuery(`begin; set local role service_role;
  select provider_event_id from public.touchline_claim_match_push_batch(1); select pg_sleep(0.5); commit;`)));
const claimed = claims.map(output => output.split('\n').find(line => /^[12]$/.test(line)));
assert.equal(new Set(claimed).size, 2, 'concurrent consumers cannot claim the same event');
assert.ok(claimed.every(Boolean));
assert.equal(query(`set role service_role; select count(*) from public.touchline_claim_match_push_batch(20);`).split('\n').at(-1), '0');
assert.equal(query(`select public.touchline_finish_match_push(id,gen_random_uuid(),'provider_accepted') from public.touchline_match_push_outbox where provider_event_id='1'`), 'f');
assert.equal(query(`set role service_role; select public.touchline_finish_match_push(id,lease_token,'provider_accepted') from public.touchline_match_push_outbox where provider_event_id='1'`).split('\n').at(-1), 't');
assert.equal(query(`select public.touchline_finish_match_push(id,gen_random_uuid(),'provider_accepted') from public.touchline_match_push_outbox where provider_event_id='1'`), 'f', 'terminal receipt cannot be repeated');
query(`update public.touchline_match_push_outbox set lease_until=now()-interval '1 second' where provider_event_id='2'`);
query(`set role service_role; select count(*) from public.touchline_claim_match_push_batch(20)`);
assert.equal(query(`select state from public.touchline_match_push_outbox where provider_event_id='2'`), 'uncertain', 'expired lease never retries an uncertain send');
enqueue(3);
query(`delete from public.touchline_fixture_alert_subscriptions where fixture_id='${fixture}'`);
query(`set role service_role; select count(*) from public.touchline_claim_match_push_batch(20)`);
assert.equal(query(`select state from public.touchline_match_push_outbox where provider_event_id='3'`), 'cancelled', 'fixture opt-out cancels queued delivery');
query(`insert into public.touchline_fixture_alert_subscriptions values('${fixture}','${user}');`);
for (const [event, mutate, restore] of [
  [4, `update public.notification_preferences set channels='{"push":false}'`, `update public.notification_preferences set channels='{"push":true}'`],
  [5, `update public.notification_devices set permission='denied'`, `update public.notification_devices set permission='granted'`],
  [6, `update public.notification_preferences set explicit_consent_at=null`, `update public.notification_preferences set explicit_consent_at=now()`],
  [7, `update public.notification_preferences set frequency='paused'`, `update public.notification_preferences set frequency='realtime'`],
  [8, `update public.notification_preferences set settings='{"goalsAndEvents":false}'`, `update public.notification_preferences set settings='{"goalsAndEvents":true}'`],
  [10, `update public.notification_preferences set explicit_consent_at=now()+interval '1 day'`, `update public.notification_preferences set explicit_consent_at=now()`],
  [11, `update public.notification_devices set push_subscription=null`, `update public.notification_devices set push_subscription='{}'`],
]) {
  enqueue(event); query(mutate);
  query('set role service_role; select count(*) from public.touchline_claim_match_push_batch(20)');
  assert.equal(query(`select state from public.touchline_match_push_outbox where provider_event_id='${event}'`), 'cancelled');
  query(restore);
}
enqueue(9);
query(`update public.touchline_match_push_outbox set created_at=now()-interval '10 minutes', source_snapshot_at=now()-interval '10 minutes', expires_at=now()-interval '1 minute' where provider_event_id='9'`);
query('set role service_role; select count(*) from public.touchline_claim_match_push_batch(20)');
assert.equal(query(`select state from public.touchline_match_push_outbox where provider_event_id='9'`), 'cancelled', 'expired queued news never gets sent');
enqueue(12);
const claim = query(`set role service_role; select id||'|'||lease_token from public.touchline_claim_match_push_batch(1)`).split('\n').at(-1).split('|');
assert.equal(claim.length, 2);
query(`update public.touchline_match_push_outbox set lease_until=now()+interval '1 second' where id='${claim[0]}'`);
const locked = await queryWithReadySignal(`begin; select id from public.touchline_match_push_outbox where id='${claim[0]}' for update; select 'TEST_READY'; select pg_sleep(1.5); commit;`);
const completion = await concurrentQuery(`set role service_role; select public.touchline_finish_match_push('${claim[0]}','${claim[1]}','provider_accepted')`);
await locked.done;
assert.equal(completion.split('\n').at(-1), 'f', 'a completion waiting on a lock must check the clock after the wait');
// Force a producer insert between the cleanup snapshot and acquiring query.
// Only the isolated test schema gets this pause trigger; never the migration.
query(`create function public.push_test_pause_cancel() returns trigger language plpgsql as $$
  begin if old.provider_event_id='13' and new.state='cancelled' then
    raise notice 'TEST_READY'; perform pg_advisory_xact_lock(7319284); end if; return new; end; $$;
  create trigger push_test_pause before update on public.touchline_match_push_outbox
    for each row execute function public.push_test_pause_cancel();
  update public.notification_preferences set channels='{"push":false}';`);
enqueue(13);
const gate = await queryWithReadySignal("begin; select pg_advisory_xact_lock(7319284); select 'TEST_READY';", true);
const racing = await queryWithReadySignal('set role service_role; select count(*) from public.touchline_claim_match_push_batch(20)');
enqueue(14);
gate.release();
await gate.done;
await racing.done;
assert.equal(query(`select state from public.touchline_match_push_outbox where provider_event_id='14'`), 'queued', 'ineligible insertion between snapshots must not be claimed');
query('set role service_role; select count(*) from public.touchline_claim_match_push_batch(20)');
assert.equal(query(`select state from public.touchline_match_push_outbox where provider_event_id='14'`), 'cancelled');
for (const limit of ['0', '101', 'null']) {
  const rejected = spawnSync('docker', command, { input: `set role service_role; select count(*) from public.touchline_claim_match_push_batch(${limit});`, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /PUSH_BATCH_INVALID_LIMIT/);
}
assert.equal(query(`select relrowsecurity and relforcerowsecurity from pg_class where oid='public.touchline_match_push_outbox'::regclass`), 't');
for (const role of ['anon', 'authenticated']) {
  assert.equal(query(`select has_table_privilege('${role}','public.touchline_match_push_outbox','SELECT')`), 'f');
  assert.equal(query(`select has_function_privilege('${role}','public.touchline_claim_match_push_batch(integer)','EXECUTE')`), 'f');
  assert.equal(query(`select has_function_privilege('${role}','public.touchline_finish_match_push(uuid,uuid,text)','EXECUTE')`), 'f');
  const rejected = spawnSync('docker', command, { input: `set role ${role}; select count(*) from public.touchline_claim_match_push_batch(1);`, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /permission denied/);
}
assert.equal(query(`select count(*) from pg_proc where proname in ('touchline_claim_match_push_batch','touchline_finish_match_push') and prosecdef`), '0');
console.log('PASS: real PostgreSQL outbox migration, idempotency, concurrent claims, token fencing, uncertain lease, opt-outs, consent, frequency and role isolation. No transport or remote database used.');

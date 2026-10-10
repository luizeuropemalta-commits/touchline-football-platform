import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { SPORTMONKS_PREQUERY_ENDPOINTS } from '../lib/football-data/sportmonks-quota-observation.ts';

const nativeRuntime = process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME;
const runtime = nativeRuntime ?? process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
assert.ok(runtime, 'Real SQL runtime required; entity policy cannot skip.');
const sqlModule = await import(pathToFileURL(runtime).href);
const SQLDatabase = nativeRuntime ? sqlModule.NativeQuotaDatabase : sqlModule.PGlite;
assert.equal(typeof SQLDatabase, 'function', 'Explicit real SQL adapter required.');
const source = (path: string) => readFileSync(new URL(`../supabase/${path}`, import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('central entity policy reserves shared pools, one-shot bootstrap and known-reset measurement', async () => {
  const db = new SQLDatabase();
  try {
    // Exercise a non-UTC SQL session: a literal Z must follow an actual UTC conversion.
    await db.exec("set timezone='Europe/Malta'");
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const name of ['20261002152457_touchline_fixture_quota_authority.sql', '20261003233637_touchline_sportmonks_prequery_authority.sql', '20261008120529_touchline_squad_quota_prequery_authority.sql', '20261009110825_touchline_squad_quota_reserve_admission.sql'])
      await db.exec(source(`migrations/${name}`));
    await db.exec(source('qa/013_touchline_central_quota_ownership.sql'));
    const forward = source('qa/014_touchline_central_entity_policy.sql');
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('shared',true)");
    await assert.rejects(() => db.exec(forward), /requires disabled, drained/);
    await db.exec('rollback;');
    await db.exec("update public.touchline_fixture_quota_scopes set enabled=false");
    await assert.rejects(() => db.exec(forward.replace(/commit;\s*$/i, 'select missing_policy_probe(); commit;')));
    await db.exec('rollback;');
    assert.equal((await db.query("select to_regclass('touchline_quota_private.bootstrap_grants')::text v")).rows[0].v, null);
    await db.exec(forward);
    for (const [endpoint, expected] of Object.entries(SPORTMONKS_PREQUERY_ENDPOINTS)) {
      const actual = (await db.query('select * from touchline_quota_private.endpoint_policy($1)', [endpoint])).rows[0];
      assert.deepEqual(actual, expected, endpoint);
    }
    assert.equal((await db.query('select * from touchline_quota_private.endpoint_policy($1)', ['unknown'])).rows.length, 0);
    assert.equal((await db.query('select count(*)::int n from touchline_quota_private.bootstrap_grants')).rows[0].n, 0);
    await db.exec("update public.touchline_fixture_quota_scopes set enabled=true; insert into touchline_quota_private.workers values('qa-live','qa','shared',true),('prod-live','production','shared',true)");
    let serial = 1000;
    const admit = async (endpoint: string, n = ++serial, prod = false) => ({ n, value: (await db.query(
      'select public.touchline_central_quota_admit($1,$2,$3,$4,$5,1,60000) v',
      [prod ? 'prod-live' : 'qa-live', prod ? 'production' : 'qa', 'shared', id(n), endpoint])).rows[0].v });
    const grant = async (entity: string) => db.query("insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,expires_at) values('shared',$1,'synthetic-operator-approval',clock_timestamp()+interval '1 minute')", [entity]);
    const complete = async (endpoint: keyof typeof SPORTMONKS_PREQUERY_ENDPOINTS, lease: Awaited<ReturnType<typeof admit>>, remaining = 1000, override: Record<string, unknown> = {}, prod = false) => {
      const observation = { requestId: id(lease.n), attempt: 1, operation: SPORTMONKS_PREQUERY_ENDPOINTS[endpoint].operation,
        observedAt: new Date().toISOString(), status: 200, remaining,
        requestedEntity: SPORTMONKS_PREQUERY_ENDPOINTS[endpoint].entity,
        resetAt: new Date(Date.now() + 3600000).toISOString(), cooldownUntil: null, ...override };
      return (await db.query('select public.touchline_central_quota_complete($1,$2,$3,$4,$5,1,$6,$7::jsonb) v',
        [prod ? 'prod-live' : 'qa-live', prod ? 'production' : 'qa', 'shared', id(lease.n), endpoint, lease.value.token, JSON.stringify(observation)])).rows[0].v;
    };
    assert.equal((await admit('player')).value.allowed, false, 'empty history never invents capacity');
    for (const offset of ['future', 'expired'] as const) {
      await db.exec('begin;');
      try {
        await db.exec(offset === 'future'
          ? "insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,granted_at,expires_at) values('shared','Coach','future-probe',clock_timestamp()+interval '30 seconds',clock_timestamp()+interval '60 seconds')"
          : "insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,granted_at,expires_at) values('shared','Coach','expired-probe',clock_timestamp()-interval '120 seconds',clock_timestamp()-interval '60 seconds')");
        assert.equal((await admit('coach')).value.allowed, false, offset);
      } finally { await db.exec('rollback;'); }
    }
    await assert.rejects(() => db.exec("insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,expires_at) values('shared','Coach','ttl-probe',clock_timestamp()+interval '6 minutes')"), /check constraint/);
    // Do not roll back the expired grant before replacement: that would hide
    // the durable unique-index dead end this lifecycle must resolve.
    await db.exec('begin;');
    try {
      const expired = (await db.query("insert into touchline_quota_private.bootstrap_grants(account_scope,entity,evidence_ref,granted_at,expires_at) values('shared','Coach','expired-durable',clock_timestamp()-interval '120 seconds',clock_timestamp()-interval '60 seconds') returning id")).rows[0].id;
      assert.equal((await admit('coach')).value.allowed, false);
      await db.exec('savepoint replacement_probe;');
      await assert.rejects(() => grant('Coach'), /unique constraint/);
      await db.exec('rollback to savepoint replacement_probe;');
      const scopeBefore = JSON.stringify((await db.query("select row_to_json(s) v from public.touchline_fixture_quota_scopes s where account_scope='shared'")).rows);
      const retire = async (grantId: string, evidence: string | null) => (await db.query('select touchline_quota_private.retire_expired_bootstrap($1,$2) v', [grantId, evidence])).rows[0].v;
      for (const invalidEvidence of [null, '', '   ', 'x'.repeat(257)]) assert.equal(await retire(expired, invalidEvidence), false);
      assert.equal(await retire(expired, 'operator-review-expired-unused'), true);
      assert.equal(await retire(expired, 'cannot-overwrite-audit'), false);
      assert.equal(JSON.stringify((await db.query("select row_to_json(s) v from public.touchline_fixture_quota_scopes s where account_scope='shared'")).rows), scopeBefore);
      const preserved = (await db.query('select evidence_ref,cancellation_evidence_ref,cancelled_at is not null retired,consumed_at,request_id from touchline_quota_private.bootstrap_grants where id=$1', [expired])).rows[0];
      assert.deepEqual(preserved, { evidence_ref: 'expired-durable', cancellation_evidence_ref: 'operator-review-expired-unused', retired: true, consumed_at: null, request_id: null });
      assert.equal((await admit('coach')).value.allowed, false, 'retirement does not issue a replacement grant');
      await grant('Coach');
      const replacement = (await db.query("select id from touchline_quota_private.bootstrap_grants where entity='Coach' and cancelled_at is null")).rows[0].id;
      assert.equal(await retire(replacement, 'not-expired'), false);
      const lease = await admit('coach'); assert.equal(lease.value.allowed, true);
      assert.equal((await admit('coach', ++serial, true)).value.allowed, false);
      assert.deepEqual(await complete('coach', lease), { persisted: true });
      assert.equal(await retire(replacement, 'consumed-cannot-retire'), false);
      assert.equal((await db.query("select count(*)::int n from touchline_quota_private.bootstrap_grants where entity='Coach'")).rows[0].n, 2);
    } finally { await db.exec('rollback;'); }
    await db.exec('begin;');
    try {
      await grant('Coach');
      await db.exec("create function public.fail_grant_owner_probe() returns trigger language plpgsql as $$ begin raise exception 'owner probe'; end $$; create trigger grant_owner_probe before update of owner_worker_id on public.touchline_fixture_quota_attempts for each row execute function public.fail_grant_owner_probe();");
      // Savepoint lets us inspect the transaction after the statement failure.
      await db.exec('savepoint grant_probe;');
      const failureId = ++serial;
      await assert.rejects(() => admit('coach', failureId), /owner probe/);
      await db.exec('rollback to savepoint grant_probe;');
      assert.equal((await db.query("select consumed_at from touchline_quota_private.bootstrap_grants where entity='Coach'")).rows[0].consumed_at, null);
      assert.equal((await db.query("select active_token from public.touchline_fixture_quota_scopes where account_scope='shared'")).rows[0].active_token, null);
      assert.equal((await db.query('select count(*)::int n from public.touchline_fixture_quota_attempts where request_id=$1', [id(failureId)])).rows[0].n, 0);
    } finally { await db.exec('rollback;'); }
    await grant('Player');
    const first = await admit('player'); assert.equal(first.value.allowed, true);
    assert.equal((await admit('squadExtended', ++serial, true)).value.allowed, false, 'second environment cannot take outstanding lease');
    assert.equal((await db.query("select count(*)::int n from touchline_quota_private.bootstrap_grants where consumed_at is not null")).rows[0].n, 1);
    assert.deepEqual(await complete('player', first, 501), { persisted: true });
    const shared = await admit('squadExtended', ++serial, true); assert.equal(shared.value.allowed, true);
    assert.deepEqual(await complete('squadExtended', shared, 500, {}, true), { persisted: true });
    assert.equal((await admit('playerSearch')).value.allowed, false, 'shared Player floor protects all endpoint names');
    assert.equal((await admit('team')).value.allowed, false, 'Player receipt does not bootstrap Team');
    await grant('Team');
    const team = await admit('team'); assert.equal(team.value.allowed, true);
    assert.deepEqual(await complete('team', team), { persisted: true });

    // Test-only clock fixture: known provider window has elapsed; don't wait
    // an hour or fabricate a fresh budget. Same receipt retains 500 remaining.
    await db.query("update public.touchline_fixture_quota_attempts q set admitted_at=clock_timestamp()-interval '130 seconds', completed_at=clock_timestamp()-interval '120 seconds' where request_id<>$1 and (select entity from touchline_quota_private.endpoint_policy(q.endpoint))='Player'", [id(shared.n)]);
    await db.query("update public.touchline_fixture_quota_attempts set admitted_at=clock_timestamp()-interval '70 seconds', completed_at=clock_timestamp()-interval '60 seconds', observation=jsonb_set(jsonb_set(observation,'{observedAt}',to_jsonb(to_char((clock_timestamp()-interval '60 seconds') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))),'{resetAt}',to_jsonb(to_char((clock_timestamp()-interval '10 seconds') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) where request_id=$1", [id(shared.n)]);
    const selectedPlayer = (await db.query("select q.request_id,(q.observation->>'remaining')::int remaining from public.touchline_fixture_quota_attempts q cross join lateral touchline_quota_private.endpoint_policy(q.endpoint) p where q.account_scope='shared' and q.completed_at is not null and q.owner_worker_id is not null and p.entity='Player' order by q.completed_at desc,q.admitted_at desc,q.request_id desc limit 1")).rows[0];
    assert.deepEqual(selectedPlayer, { request_id: id(shared.n), remaining: 500 }, 'prove reset receipt is selected, not the older 501 balance');
    const measured = await admit('playerSearch'); assert.equal(measured.value.allowed, true);
    assert.equal((await admit('player', ++serial, true)).value.allowed, false, 'reset grants only one concurrent measurement');
    assert.deepEqual(await complete('playerSearch', measured, 1999), { persisted: true });

    // Exercise every tuple through real ownership wrappers, not only the map.
    const seeded = new Set(['Player', 'Team']);
    for (const [endpoint, spec] of Object.entries(SPORTMONKS_PREQUERY_ENDPOINTS)) {
      if (!seeded.has(spec.entity)) { await grant(spec.entity); seeded.add(spec.entity); }
      const lease = await admit(endpoint); assert.equal(lease.value.allowed, true, endpoint);
      assert.deepEqual(await complete(endpoint as keyof typeof SPORTMONKS_PREQUERY_ENDPOINTS, lease), { persisted: true });
    }

    for (const override of [
      { observedAt: new Date(Date.now() - 60000).toISOString() },
      { observedAt: new Date(Date.now() + 60000).toISOString() },
      { resetAt: new Date(Date.now() - 60000).toISOString() },
      { remaining: null },
    ]) {
      await db.exec('begin;');
      try {
        const lease = await admit('team'); assert.equal(lease.value.allowed, true);
        assert.deepEqual(await complete('team', lease, 1000, override), { persisted: true });
        assert.equal((await admit('player')).value.allowed, false, JSON.stringify(override));
      } finally { await db.exec('rollback;'); }
    }
    await db.exec('begin;');
    try {
      const failed = await admit('team'); assert.equal(failed.value.allowed, true);
      assert.deepEqual(await complete('team', failed, 999, { status: 503 }), { persisted: true });
      assert.equal((await admit('team')).value.allowed, false, 'new failure cannot fall back to older successful quota');
    } finally { await db.exec('rollback;'); }
    await db.exec('begin;');
    try {
      const throttled = await admit('team'); assert.equal(throttled.value.allowed, true);
      assert.deepEqual(await complete('team', throttled, 0, { status: 429, cooldownUntil: new Date(Date.now() + 3600000).toISOString() }), { persisted: true });
      assert.equal((await admit('team')).value.allowed, false);
      assert.equal((await admit('player')).value.allowed, false, 'active cooldown is not bypassed through another entity');
      // Test-only elapsed-window fixture, not an operational recovery recipe.
      await db.exec("update public.touchline_fixture_quota_scopes set cooldown_until=clock_timestamp()-interval '10 seconds'");
      await db.query("update public.touchline_fixture_quota_attempts q set admitted_at=clock_timestamp()-interval '130 seconds', completed_at=clock_timestamp()-interval '120 seconds' where request_id<>$1 and (select entity from touchline_quota_private.endpoint_policy(q.endpoint))='Team'", [id(throttled.n)]);
      await db.query("update public.touchline_fixture_quota_attempts set admitted_at=clock_timestamp()-interval '70 seconds', completed_at=clock_timestamp()-interval '60 seconds', observation=jsonb_set(jsonb_set(observation,'{observedAt}',to_jsonb(to_char((clock_timestamp()-interval '60 seconds') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))),'{resetAt}',to_jsonb(to_char((clock_timestamp()-interval '10 seconds') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) where request_id=$1", [id(throttled.n)]);
      const selectedTeam = (await db.query("select q.request_id,(q.observation->>'status')::int status,(q.observation->>'remaining')::int remaining from public.touchline_fixture_quota_attempts q cross join lateral touchline_quota_private.endpoint_policy(q.endpoint) p where q.account_scope='shared' and q.completed_at is not null and q.owner_worker_id is not null and p.entity='Team' order by q.completed_at desc,q.admitted_at desc,q.request_id desc limit 1")).rows[0];
      assert.deepEqual(selectedTeam, { request_id: id(throttled.n), status: 429, remaining: 0 }, 'prove reset branch cannot reuse an old successful balance');
      const measured = await admit('team'); assert.equal(measured.value.allowed, true);
      assert.equal((await admit('team', ++serial, true)).value.allowed, false);
      assert.deepEqual(await complete('team', measured, 501), { persisted: true });
      const last = await admit('team'); assert.equal(last.value.allowed, true);
      assert.deepEqual(await complete('team', last, 500), { persisted: true });
      assert.equal((await admit('team')).value.allowed, false);
    } finally { await db.exec('rollback;'); }

    const bad = await admit('player'); assert.equal(bad.value.allowed, true);
    assert.deepEqual(await complete('player', bad, 999, { requestedEntity: 'Unexpected' }), { persisted: true });
    assert.equal((await admit('team')).value.allowed, false, 'unknown quota cannot be bypassed with another entity');
    assert.equal((await db.query("select blocked_unknown from public.touchline_fixture_quota_scopes where account_scope='shared'")).rows[0].blocked_unknown, true);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => db.query('select * from touchline_quota_private.bootstrap_grants'), /permission denied/);
      await assert.rejects(() => db.query("select * from touchline_quota_private.endpoint_policy('team')"), /permission denied/);
      await assert.rejects(() => db.query('select touchline_quota_private.retire_expired_bootstrap($1,$2)', [id(999999), 'forbidden']), /permission denied/);
      await db.exec('reset role');
    }
    const diagnostic = source('qa/diagnose_central_quota_readonly.sql');
    await assert.rejects(() => db.exec(diagnostic), /Choose one existing approved central account scope/);
    await db.exec('rollback;');
    const snapshot = async () => JSON.stringify((await db.query("select row_to_json(s) v from public.touchline_fixture_quota_scopes s order by account_scope")).rows);
    const beforeDiagnostic = await snapshot();
    const reports = await db.exec(diagnostic.replace('REPLACE_WITH_APPROVED_SCOPE', 'shared'));
    const reportRows = reports.flatMap((report: { rows: Record<string, unknown>[] }) => report.rows);
    const scopeReport = reportRows.find((row: Record<string, unknown>) => Object.hasOwn(row, 'checked_at'));
    assert.equal(scopeReport?.blocked_unknown, true, 'operator can observe unknown state without clearing it');
    const playerReport = reportRows.find((row: Record<string, unknown>) => row.entity === 'Player' && Object.hasOwn(row, 'reported_entity'));
    assert.equal(playerReport?.request_id, id(bad.n));
    assert.equal(playerReport?.reported_entity, 'Unexpected', 'show actual mismatch, not a substituted expected entity');
    for (const row of reportRows) {
      for (const key of ['token', 'active_token', 'observation', 'service_key']) assert.equal(Object.hasOwn(row, key), false);
    }
    assert.equal(await snapshot(), beforeDiagnostic, 'read-only diagnosis cannot release quota');
  } finally { await db.close(); }
});

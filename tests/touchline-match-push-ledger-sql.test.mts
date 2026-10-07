import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const device = '22222222-2222-4222-8222-222222222222';
const fixture = '33333333-3333-4333-8333-333333333333';
test('durable receipts survive cleanup, preserve legacy history and remain private', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table notification_devices(id uuid primary key);
      create table football_fixtures(id uuid primary key);
      insert into notification_devices values('${device}'); insert into football_fixtures values('${fixture}');
      grant usage on schema public to service_role;
      grant select,update on notification_devices to service_role;`);
    for (const name of ['20260924222644_touchline_match_push_outbox.sql', '20260927005940_touchline_match_push_subscription_binding.sql', '20260927023959_touchline_match_push_delivery_kind.sql']) {
      await db.exec(`begin;${readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')}commit;`);
    }
    const states = ['queued', 'claimed', 'provider_accepted', 'cancelled', 'uncertain', 'failed'];
    for (const [index, state] of states.entries()) {
      await db.query(`insert into touchline_match_push_outbox(device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,state,expires_at,lease_token,lease_until,completed_at)
        values($1,$2,$3,'sha256:'||repeat('a',64),now(),'{}',$4,now()+interval '5 minutes',case when $4='claimed' then gen_random_uuid() end,case when $4='claimed' then now()+interval '1 minute' end,case when $4 not in ('queued','claimed') then now() end)`, [device, fixture, String(index + 1), state]);
    }
    const migration = readFileSync(new URL('../supabase/migrations/20261002003838_touchline_match_push_identity_ledger.sql', import.meta.url), 'utf8');
    await db.exec(`begin;${migration}rollback;`);
    assert.equal((await db.query("select to_regclass('public.touchline_match_push_identity_ledger') as name")).rows[0].name, null);
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_outbox')).rows[0].n, 6);
    await db.exec(`begin;${migration}commit;`);
    const enqueue = async (event: string, character: string, history = false) => (await db.query(`select touchline_enqueue_match_push($1,$2,$3,$4,now(),'{}',now()+interval '1 minute',$5,$6) as id`,
      [device, fixture, event, 'sha256:' + character.repeat(64), 'sha256:' + 'f'.repeat(64), history])).rows[0].id;
    await db.exec('set role service_role');
    const original = await enqueue('99', 'b', true);
    await db.exec('reset role; delete from touchline_match_push_outbox; set role service_role;');
    assert.equal(await enqueue('99', 'b', true), original, 'cleanup must not recreate the same version');
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_outbox')).rows[0].n, 0);
    const revision = await enqueue('99', 'c', true);
    assert.equal((await db.query('select delivery_kind from touchline_match_push_outbox where id=$1', [revision])).rows[0].delivery_kind, 'revision');
    await assert.rejects(db.query(`insert into touchline_match_push_outbox(device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,payload,expires_at,delivery_kind)
      values($1,$2,'99','sha256:'||repeat('e',64),now(),'{}',now()+interval '1 minute','initial')`, [device, fixture]), /duplicate key/);
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_outbox')).rows[0].n, 1, 'failed receipt must roll back queue insertion');
    for (let index = 1; index <= states.length; index++) {
      const id = await enqueue(String(index), 'd');
      assert.equal((await db.query('select delivery_kind from touchline_match_push_outbox where id=$1', [id])).rows[0].delivery_kind, 'revision');
    }
    await assert.rejects(enqueue('100', 'a'), /PUSH_HISTORY_UNVERIFIED/);
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_identity_ledger where delivery_kind is null')).rows[0].n, 6);
    await assert.rejects(db.exec('delete from touchline_match_push_identity_ledger'), /permission denied/);
    await assert.rejects(db.exec('update touchline_match_push_identity_ledger set delivery_kind=null'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.exec('select * from touchline_match_push_identity_ledger'), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.exec('select * from touchline_match_push_identity_ledger'), /permission denied/);
    await db.exec('reset role; begin; delete from football_fixtures;');
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_identity_ledger')).rows[0].n, 0);
    await db.exec('rollback; reset role; delete from notification_devices;');
    assert.equal((await db.query('select count(*)::int n from touchline_match_push_identity_ledger')).rows[0].n, 0);
  } finally { await db.close(); }
});

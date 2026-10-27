import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('normalized feed history preserves corrections, isolates access and rolls back together', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    const foundation = await readFile(new URL('../supabase/migrations/015_sportmonks_fantasy_data_foundation.sql', import.meta.url), 'utf8');
    await db.exec(foundation.slice(0, foundation.indexOf('create table if not exists public.football_provider_capabilities')));
    // Synthetic stored baseline, not a real provider response.
    await db.exec(`insert into public.football_fantasy_fixture_feeds(provider,provider_fixture_id,lineups_payload) values ('sportmonks','synthetic','[{"rating":7.19}]');`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261026121254_football_feed_revision_history.sql', import.meta.url), 'utf8'));
    await db.exec(`update public.football_fantasy_fixture_feeds set lineups_payload='[{"rating":7.02}]',last_synced_at=now();`);
    await db.exec(`update public.football_fantasy_fixture_feeds set last_synced_at=now();`);
    const rows = (await db.query('select origin,payload from public.football_feed_revisions order by id')).rows as {origin:string;payload:{lineups:{rating:number}[]}}[];
    assert.deepEqual(rows.map(r => r.origin), ['existing_baseline','observed_import']);
    assert.deepEqual(rows.map(r => r.payload.lineups[0].rating), [7.19,7.02]);
    // Returning to an earlier value is a new revision, not a duplicate hash.
    await db.exec(`update public.football_fantasy_fixture_feeds set lineups_payload='[{"rating":7.19}]';`);
    assert.equal((await db.query('select count(*)::int as n from public.football_feed_revisions')).rows[0].n, 3);
    for (const sql of ['delete from public.football_feed_revisions','update public.football_feed_revisions set origin=origin','truncate public.football_feed_revisions']) {
      await assert.rejects(db.exec(sql), /FEED_REVISION_IMMUTABLE/);
    }
    await assert.rejects(db.exec(`update public.football_fantasy_fixture_feeds set provider_fixture_id='changed';`), /FEED_IDENTITY_IMMUTABLE/);
    await db.exec(`alter table public.football_feed_revisions add constraint test_reject_revision check (payload->'lineups' != '[{"rating":6}]'::jsonb);`);
    await assert.rejects(db.exec(`update public.football_fantasy_fixture_feeds set lineups_payload='[{"rating":6}]';`), /test_reject_revision/);
    assert.deepEqual((await db.query('select lineups_payload from public.football_fantasy_fixture_feeds')).rows[0].lineups_payload, [{rating:7.19}]);
    for (const role of ['anon','authenticated','service_role']) {
      const access = (await db.query(`select has_table_privilege('${role}','public.football_feed_revisions','SELECT') as readable, has_table_privilege('${role}','public.football_feed_revisions','INSERT') as writable`)).rows[0];
      assert.equal(access.readable, role === 'service_role');
      assert.equal(access.writable, false);
    }
    // Provider support confirms events may be removed/reclassified after FT.
    // Preserve the exact latest snapshot, including missing ratings, not a merge.
    await db.exec(`update public.football_fantasy_fixture_feeds set events_payload='[{"id":"goal-1","type":"Goal"}]';`);
    await db.exec(`update public.football_fantasy_fixture_feeds set events_payload='[{"id":"goal-1","type":"Own goal"}]';`);
    await db.exec(`update public.football_fantasy_fixture_feeds set events_payload='[]',lineups_payload='[{"rating":null}]';`);
    const corrected = (await db.query(`select payload from public.football_feed_revisions where provider_fixture_id='synthetic' order by id desc limit 3`)).rows as {payload:{events:{id:string;type:string}[];lineups:{rating:number|null}[]}}[];
    assert.deepEqual(corrected.map(row=>row.payload.events),[[],[{id:'goal-1',type:'Own goal'}],[{id:'goal-1',type:'Goal'}]]);
    assert.equal(corrected[0].payload.lineups[0].rating,null);
    const countBeforeReplay=(await db.query('select count(*)::int as n from public.football_feed_revisions')).rows[0].n;
    await db.exec(`update public.football_fantasy_fixture_feeds set events_payload='[]',lineups_payload='[{"rating":null}]',last_synced_at=now();`);
    assert.equal((await db.query('select count(*)::int as n from public.football_feed_revisions')).rows[0].n,countBeforeReplay);
    await db.exec(`insert into public.football_fantasy_fixture_feeds(provider,provider_fixture_id) values ('sportmonks','new-synthetic');`);
    assert.equal((await db.query(`select origin from public.football_feed_revisions where provider_fixture_id='new-synthetic'`)).rows[0].origin, 'observed_import');
  } finally { await db.close(); }
});

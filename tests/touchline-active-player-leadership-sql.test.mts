import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const read = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const patch = read('20260923221024_touchline_active_player_leadership_atomic.sql');
const p1 = '00000000-0000-4000-8000-000000000001';
const p2 = '00000000-0000-4000-8000-000000000002';

test('real SQL publication creates atomic immutable leadership decisions', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.jwt() returns jsonb language sql as
      $$ select '{"role":"service_role"}'::jsonb $$;
      grant usage on schema public, auth to service_role;
      create table public.football_players(id uuid primary key);
      insert into public.football_players values ('${p1}'),('${p2}');`);
    await db.exec(read('020_touchline_card_ranking_snapshots.sql'));
    // Columns introduced by the ranking/scoring migrations; actual publication
    // and decision functions below are loaded unchanged, not simulated.
    await db.exec(`alter table public.touchline_card_ranking_snapshots
      add scoring_version text, add coverage_status text,
      add fixture_ids jsonb, add expected_fixture_ids jsonb, add total_score_points integer;`);
    const publisher = read('20260823192827_touchline_player_score_engine_v3.sql');
    await db.exec(publisher.slice(publisher.indexOf('create or replace function public.publish_touchline_card_ranking_snapshot('), publisher.indexOf('comment on table public.touchline_player_fixture_score_settlements')));
    await db.exec(read('20260910170851_touchline_player_published_leadership_decision.sql'));
    const seed = async (id: string, ratings: (number | null)[], bad = false) => {
      const players = ratings.map((rating, i) => ({ playerId: i ? p2 : p1, totalRating: rating, touchlinePoints: 7 }));
      await db.query(`insert into public.touchline_card_ranking_snapshots
        (snapshot_id,league_key,season_id,round_id,source,status,generated_at,audited_at,price_table_version,checksum,
        expected_player_count,actual_player_count,ranking_payload,selection_version,selection_payload,audit_report,
        scoring_version,coverage_status,fixture_ids,expected_fixture_ids,total_score_points)
        values ($1,'england','season','round','sportmonks-audited','audited','2026-09-20','2026-09-20','v',$1,
        $2,$2,$3,'v',$4,'{"passed":true}','player_scoring_v3','complete','[1]','[1]',$5)`,
        [id, players.length, JSON.stringify({ players }), JSON.stringify({ sourceSnapshotId: id, complete: true, players: Array(11).fill({}) }), bad ? 99 : players.length * 7]);
    };
    const publish = (id: string) => db.query(`select public.publish_touchline_card_ranking_snapshot($1,'england','2026-09-21')`, [id]);
    const decisions = (id: string) => db.query(`select * from public.touchline_player_ranking_leadership_decisions where snapshot_id=$1`, [id]);
    await seed('old-active', [9]); await publish('old-active');
    await seed('old-inactive', [8]);
    await db.exec(`update public.touchline_card_ranking_snapshots set status='published',published_at='2026-09-21' where snapshot_id='old-inactive'`);
    if (!process.env.TOUCHLINE_LEADERSHIP_BASELINE) await db.exec(patch);
    assert.equal((await decisions('old-active')).rows.length, 1, 'repair current missing decision');
    assert.equal((await decisions('old-inactive')).rows.length, 0, 'do not backfill inactive history');
    await db.exec('set role service_role');
    await seed('unique', [9, 8]); await publish('unique');
    assert.equal((await decisions('unique')).rows[0].leader_player_id, p1);
    await seed('tie', [9, 9]); await publish('tie');
    assert.equal((await decisions('tie')).rows[0].status, 'tied');
    assert.equal((await decisions('tie')).rows[0].leader_player_id, null);
    await seed('unavailable', [null]); await publish('unavailable');
    assert.equal((await decisions('unavailable')).rows[0].status, 'unavailable');
    const original = (await decisions('unique')).rows[0];
    await db.exec(`update public.touchline_card_ranking_active_snapshots set snapshot_id='unique' where league_key='england'`);
    assert.deepEqual((await decisions('unique')).rows[0], original);
    await assert.rejects(publish('unique'), /NOT_AUDITED/);
    await seed('invalid', [9], true);
    await assert.rejects(publish('invalid'), /PUBLICATION_BARRIER/);
    assert.equal((await db.query(`select status from public.touchline_card_ranking_snapshots where snapshot_id='invalid'`)).rows[0].status, 'audited');
    assert.equal((await db.query(`select snapshot_id from public.touchline_card_ranking_active_snapshots`)).rows[0].snapshot_id, 'unique');
    await assert.rejects(db.exec(`insert into public.touchline_card_ranking_active_snapshots values ('wrong','unique',now(),now())`), /SNAPSHOT_INVALID/);
    // A genuine FK failure inside the real decision writer must undo publication.
    await seed('missing-player', [9]);
    await db.exec(`update public.touchline_card_ranking_snapshots set ranking_payload=jsonb_set(ranking_payload,'{players,0,playerId}','"00000000-0000-4000-8000-000000000099"') where snapshot_id='missing-player'`);
    await assert.rejects(publish('missing-player'), /foreign key/);
    assert.equal((await db.query(`select status from public.touchline_card_ranking_snapshots where snapshot_id='missing-player'`)).rows[0].status, 'audited');
    assert.equal((await db.query(`select snapshot_id from public.touchline_card_ranking_active_snapshots`)).rows[0].snapshot_id, 'unique');
    await db.exec('reset role');
    await assert.rejects(db.exec(`update public.touchline_player_ranking_leadership_decisions set decided_at=now() where snapshot_id='unique'`), /immutable/);
    await assert.rejects(db.exec(`delete from public.touchline_player_ranking_leadership_decisions where snapshot_id='unique'`), /immutable/);
    await db.exec(patch.replace(/create trigger touchline_active_player_leadership[\s\S]*?execute function public.ensure_active_touchline_player_leadership\(\);/, ''));
    assert.deepEqual((await decisions('unique')).rows[0], original, 'repair is idempotent');
    const acl = await db.query(`select has_function_privilege('anon','public.ensure_active_touchline_player_leadership()','EXECUTE') allowed`);
    assert.equal(acl.rows[0].allowed, false);
    await db.exec('set role anon');
    await assert.rejects(publish('invalid'), /permission denied/);
  } finally { await db.close(); }
});

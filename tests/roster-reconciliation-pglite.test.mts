import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
assert.ok(runtime, 'PGlite is mandatory; no silent SQL skip.');
const { PGlite } = await import(pathToFileURL(runtime).href);
const root = new URL('../', import.meta.url), ids = ['19', '15', '52', '236', '78', '18', '117', '51', '13', '11', '22', '116', '71', '8', '9', '14', '20', '63', '3', '6'];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = `owner:${uuid(90000)}`;
const squads = () => ids.map((teamId, i) => ({ teamId, members: Array.from({ length: 11 }, (_, j) => ({ providerId: String(i * 11 + j + 1), name: `Synthetic player ${i * 11 + j + 1}`, shirtNumber: j + 1 })) }));
async function setup(options: {defaultAcl?: boolean} = {}) {
    const db = new PGlite();
    // Same minimal football schema used by the real legacy atomic-executor test.
    const existing = readFileSync(new URL('tests/touchline-qa-roster-atomic-pglite.test.mts', root), 'utf8');
    const schema = existing.slice(existing.indexOf('      create role anon;'), existing.indexOf('    `);')).replaceAll('${projectRef}', 'xgxbwqxjssxxuihuwmgy');
    await db.exec(schema);
    await db.exec(`create table public.football_competitions(id uuid primary key,provider text,provider_competition_id text); create table public.football_seasons(id uuid primary key,provider text,provider_season_id text,competition_id uuid,is_current boolean); insert into public.football_competitions values('${uuid(999)}','sportmonks','8'); insert into public.football_seasons values('${uuid(998)}','sportmonks','25583','${uuid(999)}',true);`);
    for (const [i, teamId] of ids.entries())
        await db.query("insert into public.football_clubs values($1,'sportmonks',$2,$3)", [uuid(i + 1), teamId, uuid(999)]);
    await db.exec(readFileSync(new URL('supabase/qa/010_touchline_qa_twenty_club_roster_backup.sql', root), 'utf8'));
    await db.exec(readFileSync(new URL('supabase/qa/011_touchline_qa_twenty_club_roster_atomic_apply.sql', root), 'utf8'));
    await db.query("select public.touchline_apply_qa_twenty_club_roster_atomic('xgxbwqxjssxxuihuwmgy',$1,$2::jsonb)", [uuid(99000), JSON.stringify(squads())]);
    if(options.defaultAcl) await db.exec('alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant execute on functions to service_role;');
    await db.exec(readFileSync(new URL('supabase/migrations/20261027210456_roster_reconciliation_workflow.sql', root), 'utf8'));
    const call = async (command: unknown, phase = 'command', source: unknown = null, who = actor) => (await db.query('select public.touchline_roster_action($1,$2::jsonb,$3,$4::jsonb) result', [who, JSON.stringify(command), phase, source === null ? null : JSON.stringify(source)])).rows[0].result;
    const capture = async (n: number, data = squads()) => { const cmd = { action: 'capture', requestId: uuid(n) }; await call(cmd, 'begin'); const at=new Date().toISOString(); return call(cmd, 'finish', { schemaVersion: 'roster-observation-v1', provider:'sportmonks', sourceRevision:'sportmonks-current-squads-v1', competitionId: '8', seasonId: '25583', protocol: 'documented-unpaginated-v1', fetchedAt: at, squads: data.map(s=>({...s,fetchedAt:at,cached:false})) }); };
    return { db, call, capture };
}
test('durable OFF gates, service ACL and replay conflict precede new provider work', async () => {
    const { db, call, capture } = await setup();
    try {
        const cmd = { action: 'capture', requestId: uuid(1000) };
        await assert.rejects(() => call(cmd, 'begin'), /ROSTER_PAUSED/);
        assert.equal((await db.query('select count(*)::int n from public.touchline_roster_jobs')).rows[0].n, 0);
        await db.exec('update public.touchline_roster_policy set enabled=true');
        const r = await capture(1000);
        assert.equal(r.status, 'review');
        await db.exec('update public.touchline_roster_policy set enabled=false');
        assert.deepEqual(await call(cmd, 'begin'), r, 'committed response recovers even after policy stops');
        await assert.rejects(() => call(cmd, 'lookup', null, `owner:${uuid(90001)}`), /ROSTER_REQUEST_CONFLICT/);
        await assert.rejects(() => call({ ...cmd, x: 'altered' }, 'lookup'), /ROSTER_REQUEST_CONFLICT/);
        const acl = await db.query("select has_function_privilege('authenticated','public.touchline_roster_action(text,jsonb,text,jsonb)','EXECUTE') allowed,has_table_privilege('authenticated','public.touchline_roster_snapshots','SELECT') readable");
        assert.deepEqual(acl.rows[0], { allowed: false, readable: false });
        await assert.rejects(() => db.exec("update public.touchline_roster_snapshots set source='{}'"), /ROSTER_AUDIT_IMMUTABLE/);
    }
    finally {
        await db.close();
    }
});
test('approved transfer/add are atomic; unseen/rejected stay, UUID/manual value preserved, lost response replay is immutable', async () => {
    const { db, call, capture } = await setup();
    try {
        await db.exec('update public.touchline_roster_policy set enabled=true,apply_enabled=true');
        await db.exec("update public.football_players set market_value=100,market_value_currency='GBP' where provider_player_id='1'");
        await db.exec("update public.football_players set name='Stored full name',display_name='Stored display name',position='ST' where provider_player_id='2';update public.football_squad_members set position='CF' where player_id in(select id from public.football_players where provider_player_id='2')");
        const beforeUnseen=(await db.query("select to_jsonb(p) player,to_jsonb(m) membership from public.football_players p join public.football_squad_members m on m.player_id=p.id where p.provider_player_id='2'")).rows[0];
        const identity = (await db.query("select id from public.football_players where provider_player_id='1'")).rows[0].id;
        const source = squads();
        source[0].members = source[0].members.filter(p => p.providerId !== '1');
        source[0].members.push({ providerId: '9001', name: 'New synthetic', shirtNumber: 99 });
        source[1].members.push({ providerId: '1', name: 'Moved synthetic', shirtNumber: 90 });
        // Player 2 is absent: retain him even after applying other changes.
        source[0].members = source[0].members.filter(p => p.providerId !== '2');
        source[0].members.push({ providerId: '9002', name: 'Rejected synthetic', shirtNumber: 98 });
        await capture(1001, source);
        await assert.rejects(()=>call({action:'decide',requestId:uuid(1999),snapshotId:uuid(1001),revision:0,providerId:'2',decision:'approve',reason:'Absence is not departure'}),/ROSTER_OPERATION_NOT_ACTIONABLE/);

        for (const [i, providerId] of ['1', '9001', '9002'].entries())
            await call({ action: 'decide', requestId: uuid(2000 + i), snapshotId: uuid(1001), revision: i, providerId, decision: providerId === '9002' ? 'reject' : 'approve', reason: 'Owner synthetic review' });
        const apply = { action: 'apply', requestId: uuid(3000), snapshotId: uuid(1001), revision: 3 };
        const result = await call(apply);
        assert.equal(result.status, 'applied');
        const status=(await db.query('select public.touchline_roster_status() state')).rows[0].state;
        assert.equal(status.snapshots[0].operations.find((op:{providerId:string})=>op.providerId==='9001').canonicalPlayerId,result.identities.find((op:{providerId:string})=>op.providerId==='9001').canonicalPlayerId,'refresh resolves new canonical UUID from committed receipt');
        assert.deepEqual((await db.query("select to_jsonb(p) player,to_jsonb(m) membership from public.football_players p join public.football_squad_members m on m.player_id=p.id where p.provider_player_id='2'")).rows[0],beforeUnseen,'unseen player/member football facts and source timestamps remain byte-equivalent');

        assert.deepEqual((await db.query("select id,market_value::text value,market_value_currency currency,current_club_id club from public.football_players where provider_player_id='1'")).rows[0], { id: identity, value: '100', currency: 'GBP', club: uuid(2) });
        assert.equal((await db.query("select count(*)::int n from public.football_squad_members m join public.football_players p on p.id=m.player_id where p.provider_player_id='2' and m.status='active'")).rows[0].n, 1);
        assert.equal((await db.query("select market_value from public.football_players where provider_player_id='9001'")).rows[0].market_value, null);
        assert.equal((await db.query("select count(*)::int n from public.football_players where provider_player_id='9002'")).rows[0].n, 0);
        await db.exec('update public.touchline_roster_policy set enabled=false');
        assert.deepEqual(await call(apply), result);
        assert.equal((await db.query('select count(*)::int n from public.touchline_roster_decisions')).rows[0].n, 3);
        assert.equal((await db.query("select count(*)::int n from public.football_squad_members where player_id=$1 and status='inactive'", [identity])).rows[0].n, 1);
    }
    finally {
        await db.close();
    }
});
test('CAS conflict, revision conflict, absence decision and final receipt failure never partially apply', async () => {
    const { db, call, capture } = await setup();
    try {
        await db.exec('update public.touchline_roster_policy set enabled=true,apply_enabled=true');
        const changed = squads();
        changed[0].members[0].name = 'New provider name';
        await capture(1002, changed);
        const decision = { action: 'decide', requestId: uuid(2100), snapshotId: uuid(1002), revision: 0, providerId: '1', decision: 'approve', reason: 'Reviewed' };
        await call(decision);
        await assert.rejects(() => call({ ...decision, requestId: uuid(2101) }), /ROSTER_REVISION_CONFLICT/);
        await db.exec("update public.football_players set display_name='Independent change' where provider_player_id='1'");
        await assert.rejects(() => call({ action: 'apply', requestId: uuid(3100), snapshotId: uuid(1002), revision: 1 }), /ROSTER_BASELINE_CHANGED/);
        await capture(1003);
        await call({ ...decision, requestId: uuid(2102), snapshotId: uuid(1003) });
        await db.exec(`create function public.reject_roster_receipt() returns trigger language plpgsql as $$begin if new.id='${uuid(3101)}' then raise exception 'TEST_FINAL_RECEIPT';end if;return new;end$$;create trigger reject_roster_receipt before insert on public.touchline_roster_receipts for each row execute function public.reject_roster_receipt();`);
        await assert.rejects(() => call({ action: 'apply', requestId: uuid(3101), snapshotId: uuid(1003), revision: 1 }), /TEST_FINAL_RECEIPT/);
        assert.equal((await db.query("select display_name from public.football_players where provider_player_id='1'")).rows[0].display_name, 'Independent change');
        assert.equal((await db.query('select count(*)::int n from public.touchline_qa_atomic_roster_runs where run_id=$1', [uuid(3101)])).rows[0].n, 0);
        assert.equal((await db.query('select status from public.touchline_roster_snapshots where id=$1', [uuid(1003)])).rows[0].status, 'review');
    }
    finally {
        await db.close();
    }
});
test('unchanged snapshot is empty; incomplete/stale source, missing revision and cron decisions fail closed with recovery', async () => {
    const { db, call, capture } = await setup();
    try {
        await db.exec('update public.touchline_roster_policy set enabled=true,apply_enabled=true');
        await capture(1004);
        assert.equal((await db.query('select jsonb_array_length(operations) n from public.touchline_roster_snapshots where id=$1', [uuid(1004)])).rows[0].n, 0);
        await assert.rejects(() => call({ action: 'apply', requestId: uuid(3200), snapshotId: uuid(1004), revision: 0 }), /ROSTER_NO_APPROVED_CHANGES/);
        const cmd = { action: 'capture', requestId: uuid(1005) };
        await call(cmd, 'begin');
        const source = { schemaVersion: 'roster-observation-v1', provider:'sportmonks', sourceRevision:'sportmonks-current-squads-v1', competitionId: '8', seasonId: '25583', protocol: 'documented-unpaginated-v1', fetchedAt: new Date(Date.now() - 7 * 3600000).toISOString(), squads: squads() };
        await assert.rejects(() => call(cmd, 'finish', source), /ROSTER_SOURCE_EXPIRED/);
        source.fetchedAt = new Date().toISOString();
        source.squads=source.squads.map(s=>({...s,fetchedAt:source.fetchedAt,cached:false}));
        source.squads[19].members = [];
        await assert.rejects(() => call(cmd, 'finish', source), /ROSTER_SOURCE_INCOMPLETE/);
        assert.equal((await db.query('select count(*)::int n from public.touchline_roster_snapshots where id=$1', [uuid(1005)])).rows[0].n, 0);
        const failed = await call(cmd, 'fail');
        assert.equal(failed.status, 'failed');
        assert.deepEqual(await call(cmd, 'begin'), failed);
        const changed = squads();
        changed[0].members[0].name = 'Provider revision';
        await capture(1006, changed);
        const decision = { action: 'decide', requestId: uuid(2200), snapshotId: uuid(1006), revision: 0, providerId: '1', decision: 'approve', reason: 'Reviewed' };
        await assert.rejects(() => call(decision, 'command', null, 'cron:roster-v1'), /ROSTER_OWNER_REQUIRED/);
        await assert.rejects(() => call({ ...decision, revision: null }), /ROSTER_COMMAND_INVALID/);
        const r = await call(decision);
        await db.exec("update public.football_seasons set provider_season_id='25584'");
        assert.deepEqual(await call(decision), r, 'receipt recovery precedes season/freshness');
        await assert.rejects(() => call({ ...decision, requestId: uuid(2201), revision: 1 }), /ROSTER_SOURCE_EXPIRED/);
    }
    finally {
        await db.close();
    }
});
test('capture lease serializes owners and expired lost-begin response has a receipt-only recovery path',async()=>{
 const {db,call}=await setup();try{
 await db.exec('update public.touchline_roster_policy set enabled=true');
 const command={action:'capture',requestId:uuid(1100)};
 assert.equal((await call(command,'begin')).capture,true);
 assert.equal((await call(command,'begin')).capture,undefined,'a repeated begin is not another provider permission');
 await assert.rejects(()=>call({action:'capture',requestId:uuid(1101)},'begin'),/ROSTER_CAPTURE_BUSY/);
 await db.query("update public.touchline_roster_jobs set created_at=clock_timestamp()-interval '16 minutes' where id=$1",[uuid(1100)]);
 const recovered=await call(command,'lookup');assert.equal(recovered.status,'failed');assert.equal(recovered.error,'CAPTURE_LEASE_EXPIRED');
 assert.deepEqual(await call(command,'finish',{}),recovered,'late completion cannot replace sealed failed receipt');
 assert.equal((await call({action:'capture',requestId:uuid(1101)},'begin')).capture,true,'new explicit request can recover after expired lease');
 }finally{await db.close();}
});

test('explicit least privilege overrides project default ACL including service_role inserts and TRUNCATE', async()=>{
 const {db,call}=await setup({defaultAcl:true});try{
 const tables=['touchline_roster_policy','touchline_roster_jobs','touchline_roster_snapshots','touchline_roster_decisions','touchline_roster_receipts'];
 for(const table of tables){
  for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
   assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['service_role',`public.${table}`,privilege])).rows[0].allowed,false,`${table} ${privilege} must not inherit default grants`);
  }
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['service_role',`public.${table}`,'SELECT'])).rows[0].allowed,true);
 }
 for(const functionName of ['touchline_roster_immutable()','touchline_roster_baseline(text[])'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed',['service_role',`public.${functionName}`,'EXECUTE'])).rows[0].allowed,false);
 await db.exec('set role service_role');
 for(const table of tables){
  await assert.rejects(()=>db.exec(`insert into public.${table} default values`),/permission denied/);
  await assert.rejects(()=>db.exec(`delete from public.${table}`),/permission denied/);
  await assert.rejects(()=>db.exec(`truncate public.${table} cascade`),/permission denied/);
 }
 await assert.rejects(()=>db.exec('update public.touchline_roster_policy set enabled=true'),/permission denied/);
 assert.equal((await db.query('select public.touchline_roster_status() state')).rows[0].state.enabled,false,'authorized status RPC remains readable');
 await assert.rejects(()=>call({action:'capture',requestId:uuid(1200)},'begin'),/ROSTER_PAUSED/,'authorized action RPC still runs the OFF gate');
 }finally{await db.close();}
});

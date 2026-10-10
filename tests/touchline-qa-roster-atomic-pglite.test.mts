import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
assert.ok(runtime, "A verified local PGlite runtime is required; atomicity proof must not skip silently.");
const { PGlite } = await import(pathToFileURL(runtime).href);
const projectRef = "xgxbwqxjssxxuihuwmgy";
const teamIds = ["19","15","52","236","78","18","117","51","13","11","22","116","71","8","9","14","20","63","3","6"];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function payload(failLate = false) {
  return teamIds.map((teamId, clubIndex) => ({
    teamId,
    members: Array.from({length: 11}, (_, memberIndex) => ({
      providerId: String(clubIndex * 11 + memberIndex + 1),
      name: failLate && clubIndex === 1 && memberIndex === 0 ? "FAIL_LATE" : `Player ${clubIndex * 11 + memberIndex + 1}`,
      shirtNumber: memberIndex + 1,
      marketValue: memberIndex === 0 ? 1_000_000 : null,
    })),
  }));
}

test("one QA roster RPC atomically rejects a late club failure and never replays a broad rollback", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create function public.touchline_assert_qa_fixture_target(p_project_ref text)
      returns void language plpgsql as $$
      begin if p_project_ref is distinct from '${projectRef}' then raise exception 'wrong QA project'; end if; end
      $$;
      create table public.football_clubs (
        id uuid primary key, provider text not null, provider_team_id text not null,
        competition_id uuid not null, unique(provider,provider_team_id)
      );
      create table public.football_players (
        id uuid primary key default gen_random_uuid(), provider text not null, provider_player_id text not null,
        current_club_id uuid, name text not null check(name <> 'FAIL_LATE'), display_name text not null,
        nationality text, country_id text, provider_position text, provider_position_id text,
        detailed_position text, detailed_position_id text, position text, position_id text,
        market_value numeric, market_value_currency text, source_updated_at timestamptz,
        unique(provider,provider_player_id)
      );
      create table public.football_squad_members (
        id uuid primary key default gen_random_uuid(), provider text not null, club_id uuid not null,
        player_id uuid not null, competition_id uuid, jersey_number integer,
        provider_position text, provider_position_id text, detailed_position text,
        detailed_position_id text, position text, position_id text,
        status text not null, source_updated_at timestamptz,
        unique(provider,club_id,player_id)
      );
    `);
    for (const [index, teamId] of teamIds.entries()) {
      await db.query(
        "insert into public.football_clubs(id,provider,provider_team_id,competition_id) values($1,'sportmonks',$2,$3)",
        [uuid(index + 1),teamId,uuid(999)],
      );
    }
    await db.query(
      "insert into public.football_players(id,provider,provider_player_id,current_club_id,name,display_name,market_value,source_updated_at) values($1,'sportmonks','9999',$2,'Independent','Independent edit',7,clock_timestamp()-interval '1 day')",
      [uuid(9999),uuid(1)],
    );
    await db.query(
      "insert into public.football_squad_members(id,provider,club_id,player_id,status,source_updated_at) values($1,'sportmonks',$2,$3,'active',clock_timestamp()-interval '1 day')",
      [uuid(8999),uuid(1),uuid(9999)],
    );
    await db.query(
      "insert into public.football_players(id,provider,provider_player_id,current_club_id,name,display_name,market_value,market_value_currency) values($1,'sportmonks','2',$2,'Previous','Previous',42,'EUR')",
      [uuid(2),uuid(998)],
    );
    await db.query(
      "insert into public.football_squad_members(id,provider,club_id,player_id,status,source_updated_at) values($1,'sportmonks',$2,$3,'active',clock_timestamp()-interval '1 day')",
      [uuid(8002),uuid(998),uuid(2)],
    );
    await db.exec(readFileSync(new URL("../supabase/qa/010_touchline_qa_twenty_club_roster_backup.sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../supabase/qa/011_touchline_qa_twenty_club_roster_atomic_apply.sql",import.meta.url),"utf8"));
    const apply = (run: number, data: unknown) => db.query(
      "select public.touchline_apply_qa_twenty_club_roster_atomic($1,$2,$3::jsonb) receipt",
      [projectRef,uuid(run),JSON.stringify(data)],
    );
    const missingMembers = payload().map((club, index) => ({
      ...club,
      members: [...club.members, { providerId: String(100000 + index), name: `Extra ${index}`, shirtNumber: 99, marketValue: null }],
    }));
    // The other 19 clubs still exceed the aggregate minimum of 220 players.
    // A missing list must never be interpreted as an empty authoritative squad.
    const clubWithoutMembers = { teamId: missingMembers[0].teamId };
    await assert.rejects(() => apply(1000,[clubWithoutMembers,...missingMembers.slice(1)]),/MEMBERS_INVALID/);
    await assert.rejects(() => apply(1001,payload(true)),/football_players_name_check/);
    const countsAfterFailure = (await db.query(`select
      (select count(*)::int from public.football_players) players,
      (select count(*)::int from public.football_squad_members) members,
      (select count(*)::int from public.touchline_qa_atomic_roster_runs) runs`)).rows[0];
    assert.deepEqual(countsAfterFailure,{players:2,members:2,runs:0},"a late SQL error must undo first-club writes and receipt");
    assert.equal((await db.query("select display_name from public.football_players where id=$1",[uuid(9999)])).rows[0].display_name,
      "Independent edit","a failed roster run must preserve unrelated provider data");
    assert.equal((await db.query("select status from public.football_squad_members where id=$1",[uuid(8002)])).rows[0].status,
      "active","a failed transfer must preserve the old membership");

    await db.exec(`create function public.fail_atomic_receipt_test() returns trigger language plpgsql as $$
      begin if new.run_id = '${uuid(1003)}'::uuid then raise exception 'RECEIPT_WRITE_FAILED'; end if;
      return new; end $$;
      create trigger reject_test_receipt before insert on public.touchline_qa_atomic_roster_runs
      for each row execute function public.fail_atomic_receipt_test();`);
    await assert.rejects(() => apply(1003,payload()),/RECEIPT_WRITE_FAILED/);
    assert.deepEqual((await db.query(`select
      (select count(*)::int from public.football_players) players,
      (select count(*)::int from public.football_squad_members) members,
      (select count(*)::int from public.touchline_qa_atomic_roster_runs) runs`)).rows[0],
      countsAfterFailure,"receipt failure after all twenty clubs must roll back every roster write");
    assert.equal((await db.query("select status from public.football_squad_members where id=$1",[uuid(8002)])).rows[0].status,
      "active","a failed final receipt must also undo the transfer");

    const receipt = (await apply(1002,payload())).rows[0].receipt;
    assert.deepEqual(receipt,{status:"applied",run_id:uuid(1002),clubs:20,provider_players:220});
    const countsAfterSuccess = (await db.query(`select
      (select count(*)::int from public.football_players) players,
      (select count(*)::int from public.football_squad_members where status='active') active,
      (select count(*)::int from public.touchline_qa_atomic_roster_runs where status='applied') runs`)).rows[0];
    assert.deepEqual(countsAfterSuccess,{players:221,active:220,runs:1});
    assert.equal((await db.query("select status from public.football_squad_members where id=$1",[uuid(8002)])).rows[0].status,
      "inactive","the successful transfer deactivates the previous club");
    assert.equal((await db.query("select market_value::text value from public.football_players where id=$1",[uuid(2)])).rows[0].value,
      "42","roster sync preserves the Admin-approved market value");
    assert.equal((await db.query("select market_value from public.football_players where provider_player_id='1'")).rows[0].market_value,
      null,"a provider value does not create an unapproved market value");
    await assert.rejects(() => apply(1002,payload()),/RUN_REUSED/);
    assert.equal((await db.query("select count(*)::int n from public.touchline_qa_atomic_roster_runs")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from public.touchline_qa_twenty_club_roster_runs")).rows[0].n,0,
      "the legacy blanket rollback must have no atomic run to target");
    assert.equal((await db.query("select display_name from public.football_players where id=$1",[uuid(9999)])).rows[0].display_name,
      "Independent edit");
    assert.equal((await db.query("select current_club_id from public.football_players where id=$1",[uuid(9999)])).rows[0].current_club_id,
      null,"a confirmed departure must not leave the old club on the player profile");
    const acl = (await db.query(
      "select has_function_privilege('anon','public.touchline_apply_qa_twenty_club_roster_atomic(text,uuid,jsonb)','execute') anon, has_function_privilege('service_role','public.touchline_apply_qa_twenty_club_roster_atomic(text,uuid,jsonb)','execute') service",
    )).rows[0];
    assert.deepEqual(acl,{anon:false,service:true});
    await db.query("update public.football_players set current_club_id=$1,source_updated_at=clock_timestamp()+interval '1 hour' where id=$2",[uuid(1),uuid(9999)]);
    await db.query("update public.football_squad_members set status='active',source_updated_at=clock_timestamp()-interval '1 day' where id=$1",[uuid(8999)]);
    await apply(1004,payload());
    assert.equal((await db.query("select current_club_id from public.football_players where id=$1",[uuid(9999)])).rows[0].current_club_id,
      uuid(1),"departure cleanup must preserve a newer player binding");
    await db.query("update public.football_players set current_club_id=$1,source_updated_at=clock_timestamp()-interval '1 day' where id=$2",[uuid(998),uuid(9999)]);
    await db.query("update public.football_squad_members set status='active',source_updated_at=clock_timestamp()-interval '1 day' where id=$1",[uuid(8999)]);
    await apply(1005,payload());
    assert.equal((await db.query("select current_club_id from public.football_players where id=$1",[uuid(9999)])).rows[0].current_club_id,
      uuid(998),"departure cleanup must preserve a pointer to another club");
    const digest = async () => (await db.query(`select
      (select md5(jsonb_agg(to_jsonb(p) order by p.id)::text) from public.football_players p) players,
      (select md5(jsonb_agg(to_jsonb(m) order by m.id)::text) from public.football_squad_members m) members,
      (select md5(jsonb_agg(to_jsonb(r) order by r.run_id)::text) from public.touchline_qa_atomic_roster_runs r) receipts`)).rows[0];
    await db.query("update public.football_players set current_club_id=$1,position='Protected defender',source_updated_at=clock_timestamp()+interval '1 hour' where id=$2",[uuid(998),uuid(2)]);
    let protectedState = await digest();
    await assert.rejects(() => apply(1006,payload()),/REVISION_CONFLICT/);
    assert.deepEqual(await digest(),protectedState,"included newer player must reject the complete run without rewriting rows or receipt");
    await db.query("update public.football_players set source_updated_at=clock_timestamp()-interval '1 day' where id=$1",[uuid(2)]);
    await db.query("update public.football_squad_members set status='inactive',source_updated_at=clock_timestamp()+interval '1 hour' where provider='sportmonks' and club_id=$1 and player_id=$2",[uuid(1),uuid(2)]);
    protectedState = await digest();
    await assert.rejects(() => apply(1007,payload()),/REVISION_CONFLICT/);
    assert.deepEqual(await digest(),protectedState,"newer inactive target membership cannot be silently reactivated; earlier club writes roll back too");
    await db.query("update public.football_squad_members set status='active',source_updated_at=clock_timestamp()-interval '1 day' where provider='sportmonks' and club_id=$1 and player_id=$2",[uuid(1),uuid(2)]);
    await db.query("update public.football_squad_members set status='active',source_updated_at=clock_timestamp()+interval '1 hour' where id=$1",[uuid(8002)]);
    protectedState = await digest();
    await assert.rejects(() => apply(1008,payload()),/REVISION_CONFLICT/);
    assert.deepEqual(await digest(),protectedState,"newer foreign membership must not produce two active clubs or a false applied receipt");
    await db.query("update public.football_squad_members set source_updated_at=clock_timestamp()-interval '1 day',status=case when club_id=$1 then 'active' else 'inactive' end where player_id=$2",[uuid(1),uuid(2)]);
    const internalTransfer = payload();
    const moved = internalTransfer[0].members.splice(2,1)[0];
    internalTransfer[0].members.push({ providerId: '999999', name: 'New entrant', shirtNumber: 99, marketValue: null });
    internalTransfer[1].members.push(moved);
    const internalReceipt = (await apply(1009,internalTransfer)).rows[0].receipt;
    assert.equal(internalReceipt.provider_players,221);
    assert.equal((await db.query("select current_club_id from public.football_players where provider_player_id='3'")).rows[0].current_club_id,uuid(2));
    assert.deepEqual((await db.query("select m.club_id,m.status from public.football_squad_members m join public.football_players p on p.id=m.player_id where p.provider_player_id='3' order by m.club_id")).rows,
      [{club_id:uuid(1),status:'inactive'},{club_id:uuid(2),status:'active'}],"an internal transfer from an earlier club to a later club must keep exactly one active membership");
  } finally { await db.close(); }
});

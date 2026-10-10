import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
assert.ok(runtime, "A verified local PGlite module is required; recovery proof must not skip silently.");
const { PGlite } = await import(pathToFileURL(runtime).href);
const projectRef = "xgxbwqxjssxxuihuwmgy";
const runId = "11111111-1111-4111-8111-111111111111";
const playerId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const memberId = (number: number) => `00000000-0000-4001-8000-${String(number).padStart(12, "0")}`;

function sqlFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

function functionDefinition(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `Missing real ${name} SQL`);
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `Missing terminator for ${name}`);
  return sql.slice(start, end + 3);
}

test("QA roster rollback restores a partial write but also reverts a concurrent provider edit", async () => {
  const db = new PGlite(); // In-memory only; never connects to hosted QA.
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create function public.touchline_assert_qa_fixture_target(p_project_ref text)
      returns void language plpgsql as $$
      begin if p_project_ref is distinct from '${projectRef}' then raise exception 'wrong QA project'; end if; end
      $$;
      create table public.football_players (
        id uuid primary key, provider text not null, current_club_id uuid,
        name text, display_name text, nationality text, country_id text,
        provider_position text, provider_position_id text, detailed_position text,
        detailed_position_id text, position text, position_id text,
        market_value numeric, market_value_currency text, source_updated_at timestamptz
      );
      create table public.football_squad_members (
        id uuid primary key, provider text not null, player_id uuid,
        club_id uuid, competition_id uuid, jersey_number integer,
        provider_position text, provider_position_id text, detailed_position text,
        detailed_position_id text, position text, position_id text,
        status text, source_updated_at timestamptz
      );
      insert into public.football_players(id,provider,name,display_name,market_value)
      select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        'sportmonks','Player ' || i,'Player ' || i,10
      from generate_series(1,220) i;
      insert into public.football_squad_members(id,provider,player_id,status)
      select ('00000000-0000-4001-8000-' || lpad(i::text,12,'0'))::uuid,
        'sportmonks',('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'active'
      from generate_series(1,220) i;
    `);

    const backupSql = sqlFile("../supabase/qa/010_touchline_qa_twenty_club_roster_backup.sql");
    const latestRollbackSql = sqlFile("../supabase/migrations/20260821162000_qa_exact_player_position_contract.sql");
    await db.exec(backupSql);
    await db.exec(functionDefinition(latestRollbackSql, "touchline_rollback_qa_twenty_club_roster"));

    const capture = await db.query(
      "select public.touchline_capture_qa_twenty_club_roster_backup($1,$2) receipt",
      [projectRef, runId],
    );
    assert.equal(capture.rows[0].receipt.status, "backed_up");
    assert.equal(capture.rows[0].receipt.players, 220);
    assert.equal(capture.rows[0].receipt.memberships, 220);

    // A failed first-club import and a different writer's later update are
    // deliberately distinguishable; both occur after the committed backup.
    await db.query("update public.football_players set market_value=99 where id=$1", [playerId(1)]);
    await db.query("update public.football_players set display_name='Concurrent edit' where id=$1", [playerId(2)]);
    await db.query("update public.football_squad_members set status='inactive' where id=$1", [memberId(1)]);
    await db.query(
      "insert into public.football_players(id,provider,name,display_name,market_value) values($1,'sportmonks','New player','New player',1)",
      [playerId(221)],
    );
    await db.query(
      "insert into public.football_squad_members(id,provider,player_id,status) values($1,'sportmonks',$2,'active')",
      [memberId(221), playerId(221)],
    );

    const rollback = await db.query(
      "select public.touchline_rollback_qa_twenty_club_roster($1,$2) receipt",
      [projectRef, runId],
    );
    assert.equal(rollback.rows[0].receipt.status, "rolled_back");
    const players = await db.query(
      "select id::text,display_name,market_value::text,current_club_id from public.football_players where id in ($1,$2,$3) order by id",
      [playerId(1), playerId(2), playerId(221)],
    );
    assert.equal(players.rows[0].market_value, "10", "partial import must be restored");
    assert.equal(players.rows[1].display_name, "Player 2", "current function also loses a concurrent edit");
    assert.equal(players.rows[2].current_club_id, null);
    const members = await db.query(
      "select id::text,status from public.football_squad_members where id in ($1,$2) order by id",
      [memberId(1), memberId(221)],
    );
    assert.deepEqual(members.rows.map((row: { status: string }) => row.status), ["active", "inactive"]);
  } finally {
    await db.close();
  }
});

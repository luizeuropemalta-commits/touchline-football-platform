import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = readFileSync(new URL("../supabase/qa/017_touchline_qa_score_points_engine_v2.sql", import.meta.url), "utf8");
function installed(name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end + 4);
}
const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("installed coach settlement retains old 20 plus new 15, excludes retroactivity and preserves final receipts", async () => {
  const db = new PGlite();
  try {
    // SQL settlement and snapshot are actual installed functions. Ranking rebuild
    // is a separate boundary and deliberately not certified by this test.
    await db.exec(`create schema auth;
      create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
      create table touchline_coach_contracts(id uuid primary key,club_id uuid,started_at timestamptz,ended_at timestamptz,scoring_version text);
      create table football_fixtures(id uuid primary key,home_club_id uuid,away_club_id uuid,starts_at timestamptz,status text,home_score int,away_score int,source_updated_at timestamptz);
      create table touchline_coach_fixture_points(contract_id uuid,fixture_id uuid,fixture_context text,outcome text,
        home_score int,away_score int,touchline_points int,settlement_status text,scoring_version text,
        provider_source_updated_at timestamptz,settled_at timestamptz,updated_at timestamptz,
        unique(contract_id,fixture_id,scoring_version));
      create function touchline_rebuild_coach_ranking_v2() returns jsonb language sql as $$select '{"separateBoundary":true}'::jsonb$$;
      set request.jwt.claim.role='service_role';
      insert into touchline_coach_contracts values
        ('${id(1)}','${id(10)}','2026-10-01Z','2026-10-10Z','coach_scoring_v2'),
        ('${id(2)}','${id(10)}','2026-10-10Z',null,'coach_scoring_v2');`);
    await db.exec(installed("touchline_coach_points_snapshot"));
    await db.exec(installed("touchline_reconcile_coach_fixture_points"));
    for (let i = 0; i < 13; i++) {
      const day = i < 8 ? i + 1 : i + 2;
      await db.query("insert into football_fixtures values($1,$2,$3,$4,'Full Time',$5,0,clock_timestamp())",
        [id(100 + i), id(10), id(11), `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`, i === 6 || i === 7 ? 0 : 1]);
    }
    // Before either contract: this result must never become a purchased bonus.
    await db.query("insert into football_fixtures values($1,$2,$3,'2026-09-30Z','Full Time',9,0,clock_timestamp())", [id(200), id(10), id(11)]);
    const reconcile = () => db.query<{ result: { reconciled: number } }>("select touchline_reconcile_coach_fixture_points() result");
    assert.equal((await reconcile()).rows[0].result.reconciled, 13);
    const scores = async () => (await db.query<{ points: number }>("select (touchline_coach_points_snapshot(id)->>'totalTouchlinePoints')::int points from touchline_coach_contracts order by id")).rows.map(row => row.points);
    assert.deepEqual(await scores(), [20, 15]);
    assert.equal((await scores()).reduce((a, b) => a + b), 35);
    const assignments = (await db.query<{ contract_id: string; fixture_id: string }>("select contract_id,fixture_id from touchline_coach_fixture_points where fixture_id=$1", [id(108)])).rows;
    assert.deepEqual(assignments, [{ contract_id: id(2), fixture_id: id(108) }]);
    assert.equal((await reconcile()).rows[0].result.reconciled, 0);
    await db.exec("update football_fixtures set home_score=0,away_score=8,source_updated_at=clock_timestamp()");
    assert.equal((await reconcile()).rows[0].result.reconciled, 0);
    assert.deepEqual(await scores(), [20, 15]);
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from touchline_coach_fixture_points")).rows[0].count, 13);
    await db.exec("set request.jwt.claim.role='authenticated'");
    await assert.rejects(reconcile(), /TL_COACH_ADMIN_REQUIRED/);
  } finally { await db.close(); }
});

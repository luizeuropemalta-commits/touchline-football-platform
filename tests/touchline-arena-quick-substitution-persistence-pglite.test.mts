import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20261011002000_touchline_arena_quick_substitution_persistence.sql",
  import.meta.url,
);
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const uuidArray = (values: readonly string[]) => `ARRAY[${values.map((value) => `'${value}'`).join(",")}]::uuid[]`;

test("Quick Sub freezes an exact 11+9 matchday roster before kickoff and survives replay/reload", async () => {
  let db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $$;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(auth.jwt() ->> 'sub', '')::uuid
      $$;
      create table public.users(id uuid primary key);
      create table public.football_fixtures(
        id uuid primary key,
        provider text not null,
        round_id uuid,
        status text,
        starts_at timestamptz,
        source_updated_at timestamptz
      );
      create table public.touchline_fantasy_gameweeks(
        id uuid primary key,
        round_id uuid not null unique,
        state text not null,
        locks_at timestamptz not null,
        first_fixture_at timestamptz not null,
        last_fixture_at timestamptz not null
      );
      create table public.touchline_fantasy_user_gameweeks(
        id uuid primary key, user_id uuid not null, gameweek_id uuid not null,
        state text not null, locked_at timestamptz
      );
      create table public.touchline_fantasy_locked_selections(
        user_gameweek_id uuid not null, player_id uuid not null, slot_index integer not null
      );
      create table public.touchline_card_inventory(id uuid primary key, player_id uuid);
      create table public.touchline_card_contracts(
        user_id uuid not null references public.users(id),
        card_id uuid not null references public.touchline_card_inventory(id),
        status text not null
      );
      create table public.touchline_user_arena_state(
        user_id uuid primary key references public.users(id),
        lineup jsonb not null default '[]'::jsonb
      );
    `);
    await db.exec(await readFile(fileURLToPath(migrationUrl), "utf8"));
    const savedXiGuardUrl = new URL(
      "../supabase/migrations/20261011005000_touchline_quick_sub_saved_xi_guard.sql",
      import.meta.url,
    );
    await db.exec(await readFile(fileURLToPath(savedXiGuardUrl), "utf8"));
    const liveFixtureGuardUrl = new URL(
      "../supabase/migrations/20261011006000_touchline_quick_sub_live_fixture_guard.sql",
      import.meta.url,
    );
    await db.exec(await readFile(fileURLToPath(liveFixtureGuardUrl), "utf8"));
    const activeGameweekBindingUrl = new URL(
      "../supabase/migrations/20261011007000_touchline_quick_sub_active_gameweek_binding.sql",
      import.meta.url,
    );
    await db.exec(await readFile(fileURLToPath(activeGameweekBindingUrl), "utf8"));
    const liveGameweekGuardUrl = new URL(
      "../supabase/migrations/20261011008000_touchline_quick_sub_live_gameweek_guard.sql",
      import.meta.url,
    );
    await db.exec(await readFile(fileURLToPath(liveGameweekGuardUrl), "utf8"));
    const commandAuditUrl = new URL(
      "../supabase/migrations/20261011009000_touchline_quick_sub_command_audit.sql",
      import.meta.url,
    );
    await db.exec(await readFile(fileURLToPath(commandAuditUrl), "utf8"));

    const owner = id(1);
    const fixture = id(2);
    const starters = Array.from({ length: 11 }, (_, index) => id(100 + index));
    const bench = Array.from({ length: 9 }, (_, index) => id(200 + index));
    const all = [...starters, ...bench];
    const lockedPlayerIds = starters.map((_, index) => id(400 + index));
    const userGameweekId = id(5);
    await db.query("insert into public.users(id) values ($1)", [owner]);
    await db.query(
      "insert into public.football_fixtures(id,provider,round_id,status,starts_at,source_updated_at) values ($1,'sportmonks',$2,'NS',now()+interval '30 minutes',now())",
      [fixture, id(3)],
    );
    await db.query(
      "insert into public.touchline_fantasy_gameweeks(id,round_id,state,locks_at,first_fixture_at,last_fixture_at) values ($1,$2,'LIVE',now()-interval '1 hour',now()-interval '30 minutes',now()+interval '3 hours')",
      [id(4), id(3)],
    );
    for (const [index, inventoryId] of all.entries()) {
      const playerId = index < starters.length ? lockedPlayerIds[index] : id(500 + index);
      await db.query("insert into public.touchline_card_inventory(id,player_id) values ($1,$2)", [inventoryId, playerId]);
      await db.query("insert into public.touchline_card_contracts(user_id,card_id,status) values ($1,$2,'active')", [owner, inventoryId]);
    }
    await db.query(
      "insert into public.touchline_fantasy_user_gameweeks(id,user_id,gameweek_id,state,locked_at) values ($1,$2,$3,'DRAFT',null)",
      [userGameweekId, owner, id(4)],
    );
    for (const [index, playerId] of lockedPlayerIds.entries()) {
      await db.query("insert into public.touchline_fantasy_locked_selections(user_gameweek_id,player_id,slot_index) values ($1,$2,$3)", [userGameweekId, playerId, index + 1]);
    }
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);

    const start = (startingIds: readonly string[] = starters, benchIds: readonly string[] = bench, revision = "roster-r1", fixtureId = fixture) => db.query<{ session: Record<string, unknown> }>(
      `select public.touchline_arena_quick_substitution_start(
        $1,$2,$3,${uuidArray(startingIds)},${uuidArray(benchIds)}
      ) as session`,
      [owner, fixtureId, revision],
    );
    await db.query(
      "insert into public.football_fixtures(id,provider,round_id,status,starts_at,source_updated_at) values ($1,'sportmonks',$2,'live',now()-interval '30 minutes',now())",
      [id(8), id(9)],
    );
    await assert.rejects(start(starters, bench, "roster-r1", id(8)), /TL_QUICK_SUB_MATCH_NOT_ACTIVE/);
    await assert.rejects(start(), /TL_QUICK_SUB_LOCKED_XI_UNAVAILABLE/);
    await db.query("update public.touchline_fantasy_user_gameweeks set state='LOCKED',locked_at=now() where id=$1", [userGameweekId]);
    await db.query(
      "insert into public.touchline_user_arena_state(user_id,lineup) values ($1,$2::jsonb)",
      [owner, JSON.stringify([...starters.slice(1), bench[0]].map((inventoryId) => ({ card: { inventoryId } })))],
    );
    await assert.rejects(start(starters.slice(1)), /TL_QUICK_SUB_INVALID_MATCHDAY/);
    await assert.rejects(start(starters, [...bench.slice(0, 8), id(999)]), /TL_QUICK_SUB_ROSTER_OWNERSHIP_INVALID/);
    const alternateOwnedXi = [...starters.slice(1), bench[0]];
    await assert.rejects(
      start(alternateOwnedXi, [starters[0], ...bench.slice(1)]),
      /TL_QUICK_SUB_LOCKED_XI_MISMATCH/,
      "the Fantasy locked XI is authoritative even when mutable Arena state and all alternate cards are owned",
    );

    const created = (await start()).rows[0].session;
    const sessionId = String(created.id);
    assert.equal(created.gameweek_id, id(4));
    assert.equal(created.revision, 0);
    assert.equal((created.starting_inventory_ids as string[]).length, 11);
    assert.equal((created.bench_inventory_ids as string[]).length, 9);
    assert.equal(String((await start()).rows[0].session.id), sessionId, "reinitializing the same immutable matchday returns the existing row");
    await assert.rejects(start(starters, bench, "roster-r2"), /TL_QUICK_SUB_MATCHDAY_CONFLICT/);

    await db.query("update public.football_fixtures set status='live',starts_at=now()-interval '1 minute',source_updated_at=now() where id=$1", [fixture]);
    assert.equal(String((await start()).rows[0].session.id), sessionId, "an identical retry after kickoff returns the pre-kickoff frozen roster");
    await assert.rejects(start(starters, [bench[1], ...bench.slice(2), bench[0]]), /TL_QUICK_SUB_MATCHDAY_CONFLICT/);

    const apply = (commandId: string, expectedRevision: number, outgoing: string, incoming: string, expectedRosterRevision = "roster-r1") => db.query<{ result: Record<string, unknown> }>(
      "select public.touchline_arena_quick_substitution_apply($1,$2,$3,$4,$5,$6,$7,$8,$9) as result",
      [owner, sessionId, commandId, expectedRevision, expectedRosterRevision, createHash("sha256").update(commandId).digest("hex"), "a".repeat(40), outgoing, incoming],
    );
    const command1 = id(301);
    await db.query("update public.touchline_fantasy_gameweeks set state='FINAL' where id=$1", [id(4)]);
    await assert.rejects(apply(id(300), 0, starters[0], bench[0]), /TL_QUICK_SUB_FIXTURE_NOT_LIVE_OR_STALE/);
    assert.equal((await db.query("select revision from public.touchline_arena_quick_substitution_sessions where id=$1", [sessionId])).rows[0].revision, 0);
    await db.query("update public.touchline_fantasy_gameweeks set state='LIVE' where id=$1", [id(4)]);
    const first = (await apply(command1, 0, starters[0], bench[0])).rows[0].result;
    assert.equal(first.status, "applied");
    assert.equal((first.session as Record<string, unknown>).revision, 1);
    assert.deepEqual((first.session as Record<string, unknown>).active_inventory_ids, [bench[0], ...starters.slice(1)]);
    assert.deepEqual((first.session as Record<string, unknown>).available_bench_inventory_ids, bench.slice(1));
    assert.deepEqual((first.session as Record<string, unknown>).substituted_out_inventory_ids, [starters[0]]);
    const firstEvent = first.event as Record<string, unknown>;
    assert.equal(firstEvent.actor_id, owner);
    assert.equal(firstEvent.expected_roster_revision, "roster-r1");
    assert.match(String(firstEvent.command_hash), /^[0-9a-f]{64}$/);
    assert.equal(firstEvent.release_sha, "a".repeat(40));
    assert.equal((firstEvent.before_state as Record<string, unknown>).revision, 0);
    assert.equal((firstEvent.after_state as Record<string, unknown>).revision, 1);

    const replay = (await apply(command1, 0, starters[0], bench[0])).rows[0].result;
    assert.equal(replay.status, "replayed");
    assert.equal((await db.query("select count(*)::int as count from public.touchline_arena_quick_substitution_events")).rows[0].count, 1);
    await assert.rejects(apply(command1, 0, starters[0], bench[1]), /TL_QUICK_SUB_COMMAND_ID_CONFLICT/);
    await assert.rejects(apply(id(302), 0, starters[1], bench[1]), /TL_QUICK_SUB_STALE_REVISION/);
    await assert.rejects(apply(id(312), 1, starters[1], bench[1], "different-roster"), /TL_QUICK_SUB_STALE_ROSTER_REVISION/);
    await assert.rejects(apply(id(303), 1, starters[0], bench[1]), /TL_QUICK_SUB_OUTGOING_NOT_ACTIVE/);

    await apply(id(304), 1, starters[1], bench[1]);
    await assert.rejects(apply(id(305), 2, starters[2], starters[0]), /TL_QUICK_SUB_PLAYER_CANNOT_REENTER/);

    await apply(id(306), 2, starters[2], bench[2]);
    await apply(id(307), 3, starters[3], bench[3]);
    await apply(id(308), 4, starters[4], bench[4]);
    const sixth = (await apply(id(309), 5, starters[5], bench[5])).rows[0].result;
    assert.equal(sixth.status, "applied", "the durable contract does not enforce an undocumented five-substitution cap");
    assert.equal((await db.query("select count(*)::int as count from public.touchline_arena_quick_substitution_events")).rows[0].count, 6);
    assert.equal((await db.query("select revision from public.touchline_arena_quick_substitution_sessions where id=$1", [sessionId])).rows[0].revision, 6);

    const persistedDataDir = await db.dumpDataDir("none");
    await db.close();
    db = new PGlite({ loadDataDir: persistedDataDir });
    await db.waitReady;
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);

    const restored = (await db.query(
      "select revision,active_inventory_ids,available_bench_inventory_ids,substituted_out_inventory_ids from public.touchline_arena_quick_substitution_sessions where id=$1",
      [sessionId],
    )).rows[0];
    assert.equal(restored.revision, 6);
    assert.ok((restored.substituted_out_inventory_ids as string[]).includes(starters[0]));
    await db.query("update public.football_fixtures set status='finished',source_updated_at=now() where id=$1", [fixture]);
    await assert.rejects(
      apply(id(310), 6, starters[6], bench[6]),
      /TL_QUICK_SUB_FIXTURE_NOT_LIVE_OR_STALE/,
    );
    assert.equal((await db.query("select revision from public.touchline_arena_quick_substitution_sessions where id=$1", [sessionId])).rows[0].revision, 6, "a rejected event insert rolls back the projection update");
    await db.query("update public.football_fixtures set status='live',source_updated_at=now()-interval '10 minutes' where id=$1", [fixture]);
    await assert.rejects(
      apply(id(311), 6, starters[6], bench[6]),
      /TL_QUICK_SUB_FIXTURE_NOT_LIVE_OR_STALE/,
    );
    assert.equal((await db.query("select count(*)::int as count from public.touchline_arena_quick_substitution_events")).rows[0].count, 6);
    await assert.rejects(db.exec(`update public.touchline_arena_quick_substitution_events set occurred_at=now()`), /TL_QUICK_SUB_EVENT_IMMUTABLE/);
    await assert.rejects(db.exec(`delete from public.touchline_arena_quick_substitution_events`), /TL_QUICK_SUB_EVENT_IMMUTABLE/);

    const auditedSignature = "public.touchline_arena_quick_substitution_apply(uuid,uuid,uuid,bigint,text,text,text,uuid,uuid)";
    assert.equal((await db.query("select has_function_privilege('anon',$1,'EXECUTE') as allowed", [auditedSignature])).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') as allowed", [auditedSignature])).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [auditedSignature])).rows[0].allowed, true);
  } finally {
    await db.close();
  }
});

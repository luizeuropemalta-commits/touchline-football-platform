import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migration = readFileSync(new URL("../supabase/migrations/20260924152802_touchline_player_social_reactions.sql", import.meta.url), "utf8");
const player = "00000000-0000-4000-8000-000000000001";
const otherPlayer = "00000000-0000-4000-8000-000000000002";
const userA = "00000000-0000-4000-8000-000000000011";
const userB = "00000000-0000-4000-8000-000000000012";
const missing = "00000000-0000-4000-8000-000000000099";

test("real SQL player reactions preserve desired-state idempotency, private actor state and privileges", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const directory = await mkdtemp(join(tmpdir(), "touchline-social-sql-"));
  let db = new PGlite(directory);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to service_role;
      create schema auth;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.football_players(id uuid primary key);
      create table auth.users(id uuid primary key);
      insert into public.football_players values ('${player}'), ('${otherPlayer}');
      insert into auth.users values ('${userA}'), ('${userB}');
    `);
    await db.exec(migration);
    const flags = await db.query(`select relrowsecurity from pg_class where oid='public.touchline_player_social_reactions'::regclass`);
    assert.equal(flags.rows[0].relrowsecurity, true);
    const privileges = await db.query(`select
      has_table_privilege('service_role','public.touchline_player_social_reactions','SELECT') as can_select,
      has_table_privilege('service_role','public.touchline_player_social_reactions','INSERT') as can_insert,
      has_table_privilege('service_role','public.touchline_player_social_reactions','DELETE') as can_delete,
      has_table_privilege('service_role','public.touchline_player_social_reactions','UPDATE') as can_update,
      has_table_privilege('service_role','public.touchline_player_social_reactions','TRUNCATE') as can_truncate
    `);
    assert.deepEqual(privileges.rows[0], {
      can_select: true, can_insert: true, can_delete: true, can_update: false, can_truncate: false,
    }, "minimal grants replace permissive deployment defaults rather than adding to them");
    const functions = await db.query(`select prosecdef from pg_proc where proname in ('touchline_player_social_summary','touchline_set_player_social_reaction')`);
    assert.equal(functions.rows.length, 2);
    assert.ok(functions.rows.every((row: { prosecdef: boolean }) => row.prosecdef === false));

    await db.exec("set role service_role");
    const summary = async (actor: string | null = userA, id = player) => (
      await db.query("select public.touchline_player_social_summary($1::uuid,$2::uuid) as value", [id, actor])
    ).rows[0].value;
    const set = async (actor: string | null, kind: string | null, active: boolean | null, id: string | null = player) => (
      await db.query("select public.touchline_set_player_social_reaction($1::uuid,$2::uuid,$3::text,$4::boolean) as value", [id, actor, kind, active])
    ).rows[0].value;
    const empty = { followerCount: 0, likeCount: 0, following: false, liked: false };
    assert.deepEqual(await summary(), empty);
    const followed = { ...empty, followerCount: 1, following: true };
    assert.deepEqual(await set(userA, "follow", true), followed);
    assert.deepEqual(await set(userA, "follow", true), followed);
    const originalCreatedAt = (await db.query("select created_at from public.touchline_player_social_reactions")).rows[0].created_at;
    await set(userA, "follow", true);
    assert.deepEqual((await db.query("select created_at from public.touchline_player_social_reactions")).rows[0].created_at, originalCreatedAt);
    assert.deepEqual(await summary(), followed, "fresh read after write returns persisted state");
    await set(userB, "follow", true);
    await set(userB, "like", true);
    assert.deepEqual(await summary(), { followerCount: 2, likeCount: 1, following: true, liked: false });
    assert.deepEqual(await summary(userB), { followerCount: 2, likeCount: 1, following: true, liked: true });
    assert.deepEqual(await summary(null), { followerCount: 2, likeCount: 1, following: false, liked: false });
    assert.deepEqual(await summary(userA, otherPlayer), empty);
    await set(userA, "follow", false);
    await set(userA, "follow", false);
    assert.deepEqual(await summary(userB), { followerCount: 1, likeCount: 1, following: true, liked: true });
    assert.deepEqual(await summary(), { followerCount: 1, likeCount: 1, following: false, liked: false });
    const before = await summary();
    for (const args of [[null,"follow",true], [userA,null,true], [userA,"share",true], [userA,"like",null]] as const) {
      await assert.rejects(set(args[0], args[1], args[2]), /PLAYER_SOCIAL_INVALID_INPUT/);
    }
    await assert.rejects(set(userA,"like",true,null), /PLAYER_SOCIAL_INVALID_INPUT/);
    await assert.rejects(set(missing,"like",true), /foreign key/);
    await assert.rejects(set(userA,"like",true,missing), /foreign key/);
    await assert.rejects(db.query("select public.touchline_player_social_summary(null,null)"), /PLAYER_SOCIAL_PLAYER_REQUIRED/);
    assert.deepEqual(await summary(), before, "failed mutations change no totals");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(summary(), /permission denied/);
      await assert.rejects(set(userA,"like",true), /permission denied/);
      await assert.rejects(db.query("select * from public.touchline_player_social_reactions"), /permission denied/);
      await assert.rejects(db.query("delete from public.touchline_player_social_reactions"), /permission denied/);
    }
    await db.close();
    db = new PGlite(directory);
    await db.exec("set role service_role");
    assert.deepEqual(await summary(), before, "database reopen retains the persisted totals and actor state");
    await db.exec("reset role");
    await db.exec(`delete from auth.users where id='${userB}'`);
    await db.exec("set role service_role");
    assert.deepEqual(await summary(), empty, "account deletion removes only associated reactions");
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

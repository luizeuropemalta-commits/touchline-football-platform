import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const alice = "11111111-1111-4111-8111-111111111111", bob = "22222222-2222-4222-8222-222222222222", denied = "33333333-3333-4333-8333-333333333333";
test("public discovery uses opt-in projections, authenticated identity and bounded grants", async t => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_anonymous boolean default false, banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
      ('${alice}','secret-alice@example.test','{"touchline_arena_access_v1":true}','{}'),
      ('${bob}','secret-bob@example.test','{"touchline_arena_access_v1":true}','{}'),
      ('${denied}','secret-denied@example.test','{}','{"touchline_arena_access_v1":true}');
      alter default privileges grant all on tables to anon, authenticated, service_role;
      alter default privileges grant all on functions to anon, authenticated, service_role;`);
    await db.exec(readFileSync(new URL("../supabase/migrations/20261027201704_touchline_clubowner_public_discovery.sql", import.meta.url), "utf8"));
    const login = async (id: string | null, role = "authenticated") => { await db.exec(`reset role;set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]); };
    const call = async <T = Record<string, unknown>>(fn: string, args: unknown[] = []) => (await db.query<{ result: T }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`, args)).rows[0].result;
    const own = () => call("touchline_people_own_profile");
    const save = (name: string, published: boolean) => call("touchline_people_save_profile", [name, published]);
    const search = (query: string) => call<Record<string, unknown>[]>("touchline_people_search", [query]);
    const profile = (id: string) => call("touchline_people_profile", [id]);
    const follow = (id: string, active: boolean) => call("touchline_people_set_follow", [id, active]);
    let publicId = "";
    await t.test("database gate defaults off for direct RPCs and only service may enable it", async () => {
      for (const role of ["anon", "authenticated"]) {
        await login(alice, role);
        await assert.rejects(search("Alice"), /PEOPLE_UNAVAILABLE/);
        await assert.rejects(db.exec("update touchline_people_private.configuration set enabled=true"), /permission denied/);
      }
      await login(alice); await assert.rejects(save("Alice Public", true), /PEOPLE_UNAVAILABLE/);
      await login(null, "service_role"); await db.exec("update touchline_people_private.configuration set enabled=true");
    });
    await t.test("no implicit migration publication or email fallback", async () => {
      await login(null, "anon"); assert.deepEqual(await search("Al"), []);
      await login(alice); assert.equal(await own(), null);
      const hidden = await save("Alice Public", false); publicId = String(hidden.publicId);
      assert.notEqual(publicId, alice); assert.equal(await profile(publicId), null); assert.deepEqual(await search("Al"), []);
    });
    await t.test("explicit publication, rename and opt-out retain one permanent public ID", async () => {
      assert.equal((await save("Alice Public", true)).publicId, publicId);
      assert.equal((await save("Alice Renamed", true)).publicId, publicId);
      await login(null, "anon");
      assert.deepEqual(await search("Alice"), [{ publicId, displayName: "Alice Renamed" }]);
      assert.deepEqual(await search(publicId.toUpperCase()), [{ publicId, displayName: "Alice Renamed" }]);
      const row = await profile(publicId); assert.equal(row.viewer, "guest"); assert.equal(row.followerCount, 0);
      assert.deepEqual(Object.keys(row).sort(), ["publicId", "displayName", "followerCount", "following", "viewer"].sort());
      assert.doesNotMatch(JSON.stringify(row), /secret-|account|11111111/);
    });
    await t.test("no direct table or private actor access, even with permissive defaults", async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        await login(bob, role);
        await assert.rejects(db.exec("select * from touchline_people_private.profiles"), /permission denied/);
        await assert.rejects(db.exec("select * from touchline_people_private.follows"), /permission denied/);
        await assert.rejects(db.exec("select touchline_people_private.actor()"), /permission denied/);
      }
      await login(null, "anon"); await assert.rejects(save("Attacker", true), /permission denied/);
    });
    await t.test("self-follow and forged user metadata fail closed", async () => {
      await login(alice); await assert.rejects(follow(publicId, true), /PEOPLE_SELF_FOLLOW/);
      await login(denied); await assert.rejects(save("Denied", true), /PEOPLE_FORBIDDEN/); await assert.rejects(follow(publicId, true), /PEOPLE_FORBIDDEN/);
      await login(null); await assert.rejects(own(), /PEOPLE_FORBIDDEN/);
    });
    await t.test("follow persists for the authenticated actor; retries are desired state", async () => {
      await login(bob); assert.equal((await follow(publicId, true)).followerCount, 1);
      assert.equal((await follow(publicId, true)).followerCount, 1);
      assert.equal((await profile(publicId)).following, true);
      await login(alice); assert.equal((await profile(publicId)).following, false); assert.equal((await own()).followerCount, 1);
      await login(bob); assert.equal((await profile(publicId)).following, true);
      assert.equal((await follow(publicId, false)).followerCount, 0);
      assert.equal((await follow(publicId, false)).followerCount, 0);
    });
    await t.test("unpublication hides search/profile and rejects new follows", async () => {
      await login(alice); await save("Alice Renamed", false);
      await login(bob); assert.equal(await profile(publicId), null); assert.deepEqual(await search("Alice"), []);
      await assert.rejects(follow(publicId, true), /PEOPLE_NOT_FOUND/);
      await login(alice); assert.equal((await save("Alice Renamed", true)).publicId, publicId);
    });
    await t.test("failed follow transaction returns no success and preserves the confirmed count", async () => {
      await db.exec(`reset role; create function touchline_people_private.fail_fixture_follow() returns trigger language plpgsql as $$begin raise exception 'FIXTURE_WRITE_FAILED'; end$$;
        create trigger fail_fixture_follow before insert on touchline_people_private.follows for each row execute function touchline_people_private.fail_fixture_follow();`);
      await login(bob); await assert.rejects(follow(publicId, true), /FIXTURE_WRITE_FAILED/); assert.equal((await profile(publicId)).followerCount, 0);
      await db.exec("reset role; drop trigger fail_fixture_follow on touchline_people_private.follows; drop function touchline_people_private.fail_fixture_follow()");
    });
    await t.test("equal names remain distinct; wildcard and private-email searches are not broad queries", async () => {
      await login(bob); const other = await save("Alice Renamed", true); assert.notEqual(other.publicId, publicId);
      assert.equal((await search("Alice")).length, 2);
      assert.deepEqual(await search("A%"), []); assert.deepEqual(await search("A_"), []);
      for (const query of ["", "A", "a".repeat(81), "secret-alice@example.test"]) await assert.rejects(search(query), /PEOPLE_INVALID_QUERY/);
      await assert.rejects(save("secret@example.test", true), /PEOPLE_INVALID_PROFILE/);
    });
    await t.test("access revocation is read from current trusted metadata, not stale JWT/user metadata", async () => {
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{}' where id='${bob}'`);
      await login(bob); await assert.rejects(follow(publicId, true), /PEOPLE_FORBIDDEN/); assert.equal((await profile(publicId)).viewer, "guest");
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{"touchline_arena_access_v1":true}',is_anonymous=true where id='${bob}'`);
      await login(bob); await assert.rejects(own(), /PEOPLE_FORBIDDEN/);
    });
    await t.test("search never returns more than 20 rows and cannot discover private UUIDs", async () => {
      await db.exec(`reset role; insert into auth.users(id) select gen_random_uuid() from generate_series(1,25);
        insert into touchline_people_private.profiles(account_id,display_name,published)
        select id,'Bounded Name',true from auth.users where email is null;`);
      await login(null, "anon"); assert.equal((await search("Bounded")).length, 20); assert.deepEqual(await search(alice), []);
    });
    await t.test("turning the database gate off closes existing profiles and writes", async () => {
      await login(null, "service_role"); await db.exec("update touchline_people_private.configuration set enabled=false");
      await login(alice); await assert.rejects(profile(publicId), /PEOPLE_UNAVAILABLE/);
      await assert.rejects(save("Changed", true), /PEOPLE_UNAVAILABLE/);
      await assert.rejects(search("Alice"), /PEOPLE_UNAVAILABLE/);
    });
  } finally { await db.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { parsePublicOwnerAvatars } from "../lib/touchlineArena/clubowner-public-avatar-handler.ts";

const alice = "11111111-1111-4111-8111-111111111111", bob = "22222222-2222-4222-8222-222222222222";
const operation = "33333333-3333-4333-8333-333333333333", nextOperation = "44444444-4444-4444-8444-444444444444";
test("forward photo consent reuses real current authority and preserves public identity, follows and private ACLs", async t => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
      create table auth.users(id uuid primary key,email text,deleted_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false,banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
      create table public.users(id uuid primary key references auth.users(id),avatar_url text);
      insert into auth.users(id,email,raw_app_meta_data) values('${alice}','alice@example.invalid','{"touchline_arena_access_v1":true}'),('${bob}','bob@example.invalid','{"touchline_arena_access_v1":true}');
      insert into public.users(id) values('${alice}'),('${bob}');
      alter default privileges grant all on tables to anon,authenticated,service_role;
      alter default privileges grant all on functions to anon,authenticated,service_role;`);
    for (const migration of ["20261003014410_touchline_club_owner_avatar_publication.sql", "20261027201704_touchline_clubowner_public_discovery.sql",
      "20261030133824_touchline_people_public_avatar_consent.sql"]) await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    const login = async (id: string | null, role = "authenticated") => { await db.exec(`reset role; set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]); };
    const call = async <T = Record<string, unknown>>(name: string, args: unknown[] = []) => (await db.query<{ value: T }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) value`, args)).rows[0].value;
    const save = (photo?: boolean, published = true) => photo === undefined ? call("touchline_people_save_profile", ["Alice Public", published]) : call("touchline_people_save_profile_v2", ["Alice Public", published, photo]);
    const read = (ids: string[]) => call<unknown[]>("touchline_people_read_public_avatars", [ids]);
    const publish = (actor: string, op: string, revision: string) => call("touchline_publish_club_owner_avatar", [actor, op, revision, "a".repeat(64), `${actor}/${op}/${"a".repeat(64)}.webp`]);
    await t.test("migration does not enable database or photo; existing profile and legacy writes remain private", async () => {
      await login(alice); await assert.rejects(save(true), /PEOPLE_UNAVAILABLE/);
      await login(null, "service_role"); await assert.rejects(read([alice]), /PEOPLE_UNAVAILABLE/);
      await db.exec("update touchline_people_private.configuration set enabled=true");
    });
    await login(alice); const initial = await save(); const publicId = String(initial.publicId);
    assert.notEqual(publicId, alice); assert.equal(initial.photoPublished, false);
    await login(null, "service_role"); await publish(alice, operation, "0"); assert.deepEqual(await read([publicId]), []);
    let firstVersion = "";
    await t.test("explicit consent exposes only normalized current photo to service, never private fields through public RPC", async () => {
      await login(alice); assert.equal((await save(true)).photoPublished, true);
      await login(null, "service_role"); const rows = await read([publicId]);
      const parsed = parsePublicOwnerAvatars(rows, [publicId], () => false); assert.equal(parsed.length, 1);
      assert.equal(parsed[0].current.actorId, alice); assert.equal(parsed[0].current.operationId, operation); firstVersion = parsed[0].version;
      await login(null, "anon");
      const profile = await call("touchline_people_profile", [publicId]); assert.doesNotMatch(JSON.stringify(profile), /email|photo|avatar|account|digest|11111111/);
      const search = await call("touchline_people_search", ["Alice"]); assert.doesNotMatch(JSON.stringify(search), /email|photo|avatar|account|digest|11111111/);
    });
    await t.test("new private projection is service-only under permissive defaults; no direct tables or forged actor", async () => {
      for (const role of ["anon", "authenticated"]) {
        await login(bob, role); await assert.rejects(read([publicId]), /permission denied/);
        await assert.rejects(db.query("select touchline_people_private.read_public_avatars($1)", [[publicId]]), /permission denied/);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        await login(null, role); await assert.rejects(db.exec("select * from touchline_people_private.profiles"), /permission denied/);
      }
      await login(null, "service_role"); await assert.rejects(save(true), /permission denied/);
      await login(bob, "service_role"); await assert.rejects(read([publicId]), /PEOPLE_FORBIDDEN/);
      await login(null, "service_role");
      for (const ids of [[], [publicId, publicId], Array(21).fill(publicId), [null]]) await assert.rejects(call("touchline_people_read_public_avatars", [ids]), /PEOPLE_INVALID_IDS/);
      assert.deepEqual(await read([alice]), []);
    });
    await t.test("replacement changes opaque version; revocation and legacy hiding remove access without changing ID/follows", async () => {
      await login(bob); await call("touchline_people_set_follow", [publicId, true]);
      await login(null, "service_role"); await publish(alice, nextOperation, "1");
      assert.notEqual(parsePublicOwnerAvatars(await read([publicId]), [publicId], () => false)[0].version, firstVersion);
      await login(alice); const revoked = await save(false); assert.equal(revoked.publicId, publicId); assert.equal(revoked.followerCount, 1);
      await login(null, "service_role"); assert.deepEqual(await read([publicId]), []);
      await login(alice); await save(true); await save(undefined, false);
      assert.equal((await call("touchline_people_own_profile")).photoPublished, false);
      await save(); assert.equal((await call("touchline_people_own_profile")).photoPublished, false);
      await login(null, "service_role"); assert.deepEqual(await read([publicId]), []);
    });
    await t.test("live trusted target status gates images; legacy zero, missing profile, bans and editable metadata grant nothing", async () => {
      await login(bob); await call("touchline_people_save_profile_v2", ["Bob Public", true, true]);
      const bobPublic = String((await call("touchline_people_own_profile")).publicId);
      await login(null, "service_role"); assert.deepEqual(await read([bobPublic]), []);
      await login(alice); await save(true);
      for (const change of ["raw_app_meta_data='{}',raw_user_meta_data='{\"touchline_arena_access_v1\":true}'", "is_anonymous=true", "banned_until=now()+interval '1 hour'", "deleted_at=now()"] ) {
        await db.exec(`reset role; update auth.users set ${change} where id='${alice}'`);
        await login(null, "service_role"); assert.deepEqual(await read([publicId]), []);
        await db.exec(`reset role; update auth.users set raw_app_meta_data='{\"touchline_arena_access_v1\":true}',is_anonymous=false,banned_until=null,deleted_at=null where id='${alice}'`);
      }
      await login(null, "service_role"); const rows = await read([publicId]);
      assert.deepEqual(parsePublicOwnerAvatars(rows, [publicId], email => email === "alice@example.invalid"), []);
      await db.exec("update touchline_people_private.configuration set enabled=false"); await assert.rejects(read([publicId]), /PEOPLE_UNAVAILABLE/);
    });
  } finally { await db.close(); }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261008085216_touchline_club_owner_avatar_private_bucket.sql", import.meta.url), "utf8");
const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const bootstrap = `
create role service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id bigint, bucket_id text);
alter table storage.objects enable row level security;
`;

async function database() {
  assert.ok(runtime, "PGlite module is required for executable migration proof");
  const { PGlite } = await import(pathToFileURL(runtime).href);
  const db = new PGlite();
  await db.exec(bootstrap);
  return db;
}

test("avatar bucket migration has exact private WebP limits and no client role policy", () => {
  assert.match(migration, /insert into storage\.buckets/);
  assert.match(migration, /5242880/);
  assert.match(migration, /array\['image\/webp'\]::text\[\]/);
  assert.match(migration, /on conflict \(id\) do nothing/);
  assert.doesNotMatch(migration, /\b(?:to|grant .* to)\s+(?:anon|authenticated)\b/i);
  assert.doesNotMatch(migration, /\b(?:update|delete)\s+storage\.(?:buckets|objects)\b/i);
});

test("avatar bucket migration creates only the private bucket and service policies", { skip: !runtime }, async () => {
  const db = await database();
  try {
    await db.exec(migration);
    const bucket = await db.query("select id,name,public,file_size_limit,allowed_mime_types from storage.buckets");
    assert.deepEqual(bucket.rows, [{ id: "touchline-club-owner-avatars", name: "touchline-club-owner-avatars",
      public: false, file_size_limit: 5242880, allowed_mime_types: ["image/webp"] }]);
    const policies = await db.query("select roles,cmd from pg_policies where schemaname='storage' and tablename='objects' order by cmd");
    assert.deepEqual(policies.rows, [{ roles: ["service_role"], cmd: "INSERT" }, { roles: ["service_role"], cmd: "SELECT" }]);
  } finally { await db.close(); }
});

test("an existing public bucket is not reconfigured and aborts atomically", { skip: !runtime }, async () => {
  const db = await database();
  try {
    await db.exec("insert into storage.buckets values ('touchline-club-owner-avatars','touchline-club-owner-avatars',true,5242880,array['image/webp']);");
    await assert.rejects(db.exec(migration), /avatar bucket metadata mismatch/);
    await db.exec("rollback");
    const bucket = await db.query("select public from storage.buckets where id='touchline-club-owner-avatars'");
    const policies = await db.query("select count(*)::int as n from pg_policies where policyname like 'touchline_avatar_service_%'");
    assert.deepEqual(bucket.rows, [{ public: true }]);
    assert.deepEqual(policies.rows, [{ n: 0 }]);
  } finally { await db.close(); }
});

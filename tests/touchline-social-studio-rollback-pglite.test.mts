import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modulePath = process.env.TOUCHLINE_STUDIO_PGLITE_MODULE;
const qaProjectRef = "xgxbwqxjssxxuihuwmgy";
const migrations = [
  "20260914212250_touchline_social_studio_review_plans.sql",
  "20260914222454_touchline_social_studio_review_desk.sql",
  "20260915110000_touchline_social_studio_server_review_evidence.sql",
];

async function prepare(PGlite: new () => {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}, allowQa = true) {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.rollback_unrelated_sentinel (id integer primary key);
    insert into public.rollback_unrelated_sentinel values (1);
    create function public.touchline_assert_qa_fixture_target(p_project_ref text)
    returns void language plpgsql as $$
    begin
      if ${allowQa ? "false" : "true"} or p_project_ref <> '${qaProjectRef}' then
        raise exception 'TL_QA_FIXTURE_TARGET_FORBIDDEN' using errcode = 'P0001';
      end if;
    end $$;
  `);
  for (const migration of migrations) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
  }
  return db;
}

async function rollbackSql() {
  return readFile(new URL("../supabase/qa/054_touchline_qa_social_studio_rollback.sql", import.meta.url), "utf8");
}

test("Social Studio rollback is pinned to QA and leaves the schema intact when the target rejects it", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = await prepare(PGlite, false);
  try {
    await assert.rejects(db.exec(await rollbackSql()), /TL_QA_FIXTURE_TARGET_FORBIDDEN/);
    await db.exec("rollback");
    assert.equal((await db.query("select public.touchline_social_studio_capabilities() result")).rows[0].result.outbound, "DISABLED");
    assert.equal((await db.query("select count(*)::integer count from public.touchline_social_studio_records")).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("Social Studio rollback fails closed rather than deleting any persisted review evidence", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = await prepare(PGlite);
  try {
    await db.query(`insert into public.touchline_social_studio_records(record_key, document)
      values ('MATCH_PREVIEW:INSTAGRAM:FEED',
        '{"outbound":"DISABLED","permission":"PAUSED","selected":false,"schedule":null,"reviews":{}}'::jsonb)`);
    await assert.rejects(db.exec(await rollbackSql()), /TL_SOCIAL_STUDIO_054_NONEMPTY/);
    await db.exec("rollback");
    assert.equal((await db.query("select count(*)::integer count from public.touchline_social_studio_records")).rows[0].count, 1);
    assert.equal((await db.query("select public.touchline_social_studio_capabilities() result")).rows[0].result.outbound, "DISABLED");
  } finally {
    await db.close();
  }
});

test("empty QA Studio surface rolls back transactionally without touching unrelated structures", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = await prepare(PGlite);
  try {
    await db.exec(await rollbackSql());
    const studioObjects = await db.query(`
      select relname as name from pg_class
      where relnamespace = 'public'::regnamespace
        and relname like 'touchline_social_studio%'
      union all
      select proname as name from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname like 'touchline_social_studio%'
    `);
    assert.deepEqual(studioObjects.rows, []);
    assert.equal((await db.query("select count(*)::integer count from public.rollback_unrelated_sentinel")).rows[0].count, 1);
    assert.equal(
      (await db.query("select count(*)::integer count from pg_proc where proname='touchline_assert_qa_fixture_target'")).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("an unexpected dependent structure aborts the entire rollback", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = await prepare(PGlite);
  try {
    await db.exec(`create table public.rollback_external_dependency (
      record_key text references public.touchline_social_studio_records(record_key)
    )`);
    await assert.rejects(db.exec(await rollbackSql()), /dependent objects still exist|cannot drop table/i);
    await db.exec("rollback");
    assert.equal((await db.query("select public.touchline_social_studio_capabilities() result")).rows[0].result.outbound, "DISABLED");
    assert.equal((await db.query("select count(*)::integer count from pg_tables where tablename='rollback_external_dependency'")).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::integer count from pg_tables where tablename like 'touchline_social_studio%'")).rows[0].count, 4);
  } finally {
    await db.close();
  }
});

test("column, constraint, index and trigger drift each fail closed before rollback", { skip: !modulePath }, async (t) => {
  const { PGlite } = await import(modulePath!);
  const driftCases = [
    {
      name: "column",
      sql: "alter table public.touchline_social_studio_records add column later_extension text",
      verificationSql: "select count(*)::integer count from information_schema.columns where table_schema='public' and table_name='touchline_social_studio_records' and column_name='later_extension'",
    },
    {
      name: "constraint",
      sql: "alter table public.touchline_social_studio_records add constraint later_extension_check check (revision < 1000)",
      verificationSql: "select count(*)::integer count from pg_constraint where conname='later_extension_check'",
    },
    {
      name: "index",
      sql: "create index later_extension_idx on public.touchline_social_studio_records(updated_at)",
      verificationSql: "select count(*)::integer count from pg_indexes where schemaname='public' and indexname='later_extension_idx'",
    },
    {
      name: "trigger",
      sql: `
        create function public.later_extension_trigger() returns trigger language plpgsql as $$
        begin return new; end $$;
        create trigger later_extension_trigger before update on public.touchline_social_studio_records
        for each row execute function public.later_extension_trigger();
      `,
      verificationSql: "select count(*)::integer count from pg_trigger where tgname='later_extension_trigger'",
    },
  ];

  for (const drift of driftCases) {
    await t.test(drift.name, async () => {
      const db = await prepare(PGlite);
      try {
        await db.exec(drift.sql);
        await assert.rejects(db.exec(await rollbackSql()), /TL_SOCIAL_STUDIO_054_SCHEMA_MISMATCH/);
        await db.exec("rollback");
        assert.equal(
          (await db.query("select count(*)::integer count from pg_tables where tablename like 'touchline_social_studio%'")).rows[0].count,
          4,
        );
        assert.equal((await db.query(drift.verificationSql)).rows[0].count, 1);
        assert.equal((await db.query("select public.touchline_social_studio_capabilities() result")).rows[0].result.outbound, "DISABLED");
      } finally {
        await db.close();
      }
    });
  }
});

test("rollback source keeps outbound disabled and avoids broad destructive operations", async () => {
  const source = await rollbackSql();
  assert.match(source, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(source, /v_capabilities->>'outbound'[\s\S]*?'DISABLED'/);
  assert.match(source, /TL_SOCIAL_STUDIO_054_NONEMPTY/);
  assert.match(source, /in access exclusive mode/);
  assert.doesNotMatch(source, /\bcascade\b/i);
  assert.doesNotMatch(source, /delete\s+from|truncate\s+/i);
  assert.doesNotMatch(source, /outbound[^\n]*enabled/i);
});

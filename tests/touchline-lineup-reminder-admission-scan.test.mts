import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type * as admissionAdapter from "../lib/touchlineFantasy/lineup-reminder-admission-server.ts";

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const root = new URL("../", import.meta.url);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("actual scan/admit SQL persists pages, retries, baselines and rollback without transport", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  try {
    // Standalone reduced schema, not extraction of another executable test.
    // Source projection, geometry validator, reader and admission remain real.
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create table public.users(id uuid primary key references auth.users(id) on delete cascade);
      create table football_rounds(id uuid primary key,competition_id uuid,season_id uuid,name text);
      create table football_fixtures(id uuid primary key,round_id uuid,competition_id uuid,season_id uuid,starts_at timestamptz,status text,finalized_at timestamptz);
      create table touchline_fantasy_configs(competition_id uuid,season_id uuid,status text);
      create table touchline_fantasy_gameweeks(id uuid primary key default gen_random_uuid(),competition_id uuid,season_id uuid,round_id uuid unique,gameweek_number integer,state text,market_opens_at timestamptz,locks_at timestamptz,first_fixture_at timestamptz,last_fixture_at timestamptz);
      create table touchline_fantasy_user_gameweeks(id uuid primary key,user_id uuid,gameweek_id uuid,state text,formation_code text,selected_coach_id text);
      create table touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid,player_id uuid,slot_id text,slot_index integer);
      create table touchline_formation_geometry_versions(id uuid primary key,formation_code text,status text,geometry jsonb,validation_report jsonb);
      create table notification_preferences(user_id uuid primary key references public.users(id) on delete cascade,channels jsonb,settings jsonb,frequency text,explicit_consent_at timestamptz,quiet_hours jsonb);
      create table notification_devices(id uuid primary key,user_id uuid references public.users(id) on delete cascade,installation_id uuid,permission text,push_subscription jsonb);
      create function touchline_fantasy_fixture_is_live(text) returns boolean language sql immutable as $$select $1='LIVE'$$;
      create function touchline_fantasy_fixture_is_final(text) returns boolean language sql immutable as $$select $1='FT'$$;
      grant usage on schema public to anon,authenticated,service_role;`);
    const registry = await readFile(new URL("supabase/qa/028_touchline_qa_formation_geometry_registry.sql", root), "utf8");
    const start = registry.indexOf("create or replace function public.touchline_formation_geometry_payload_is_valid(");
    const end = registry.indexOf("$$;", start);
    assert.ok(start >= 0 && end > start);
    await db.exec(registry.slice(start, end + 3));
    for (const migration of [
      "20261002031429_touchline_fantasy_shared_market_window_projection.sql",
      "20261002032250_touchline_fantasy_lineup_reminder_read.sql",
      "20261002033308_touchline_game_notification_ledger.sql",
      "20261002045327_touchline_lineup_reminder_admission_scan.sql",
    ]) await db.exec(await readFile(new URL(`supabase/migrations/${migration}`, root), "utf8"));
    await db.exec(`insert into touchline_fantasy_configs values('${id(1)}','${id(2)}','active');
      insert into football_rounds values('${id(3)}','${id(1)}','${id(2)}','Round 1');
      insert into football_fixtures values('${id(4)}','${id(3)}','${id(1)}','${id(2)}',date_trunc('milliseconds',clock_timestamp())+interval '1 day','NS',null);
      insert into touchline_fantasy_gameweeks
      select '${id(5)}','${id(1)}','${id(2)}','${id(3)}',1,'MARKET_OPEN',starts_at-interval '7 days',starts_at,starts_at,starts_at from football_fixtures;`);
    const geometry = { schemaVersion: 1, formationCode: "4-3-3", slots: Array.from({ length: 11 }, (_, i) => ({
      id: `S${i}`, x: 50, y: 50, role: i === 0 ? "goalkeeper" : i < 5 ? "defender" : i < 8 ? "midfielder" : "forward",
      priority: i + 1, allowedPositions: ["ST"],
    })) };
    await db.query("insert into touchline_formation_geometry_versions values($1,'4-3-3','published',$2,$3)", [id(6), JSON.stringify(geometry), JSON.stringify({ publishable: true, formationCode: "4-3-3", slotCount: 11 })]);
    const addUser = async (n: number) => db.exec(`insert into auth.users values('${id(n)}');insert into public.users values('${id(n)}');
      insert into notification_preferences values('${id(n)}','{"push":true}','{"lineupReminders":true}','realtime',clock_timestamp()-interval '2 days','{"enabled":false}');
      insert into notification_devices values('${id(n + 100)}','${id(n)}','${id(n + 200)}','granted','{"endpoint":"https://synthetic.invalid/no-send"}');`);
    const scan = async (page = 1, lead = 3600, retry = 3600, competition = id(1)) =>
      (await db.query("select touchline_lineup_reminder_admission_scan($1,$2,$3,$4,$5) r", [competition, id(2), lead, page, retry])).rows[0].r;
    const count = async (table: string) => (await db.query(`select count(*) n from ${table}`)).rows[0].n;
    const cursor = async () => (await db.query("select * from touchline_lineup_reminder_scan_state")).rows[0];
    const work = async (user: number) => (await db.query("select * from touchline_lineup_reminder_admission_work where user_id=$1", [id(user)])).rows[0];
    const forceDue = async (user: number) => db.query("update touchline_lineup_reminder_admission_work set next_attempt_at=clock_timestamp()-interval '1 second' where user_id=$1", [id(user)]);

    for (const args of [[0, 3600, 3600], [51, 3600, 3600], [1, 0, 3600], [1, 86401, 3600], [1, 3600, 0], [1, 3600, 3601]]) {
      assert.equal((await scan(...args as [number, number, number])).status, "unconfigured");
    }
    assert.equal(await count("touchline_lineup_reminder_scan_state"), 0);
    assert.equal((await scan(1, 3600, 3600, id(999))).status, "unavailable");
    await addUser(20); await addUser(40);
    let result = await scan();
    assert.deepEqual([result.scanned, result.inserted, result.processed], [1, 1, 1]);
    assert.equal((await cursor()).last_user_id, id(20));
    assert.equal((await work(20)).last_result, "baselined-or-suppressed");
    assert.equal(await count("touchline_game_notification_enrollments"), 1);
    assert.equal(await count("touchline_game_notification_deliveries"), 0, "pre-window first visit is baseline only");
    result = await scan(); assert.deepEqual([result.scanned, result.inserted, result.processed], [1, 1, 1]);
    assert.equal((await cursor()).last_user_id, id(40));
    result = await scan(); assert.equal(result.sweepCompleted, true); assert.equal(result.sweep, "2");
    assert.equal((await cursor()).last_user_id, null);
    await addUser(10);
    result = await scan(); assert.equal(result.inserted, 1); assert.equal((await cursor()).last_user_id, id(10));
    assert.equal((await work(10)).last_result, "baselined-or-suppressed", "new user behind prior cursor appears in next sweep");
    assert.equal(await count("touchline_game_notification_deliveries"), 0);
    assert.equal((await scan(1, 1800)).status, "policy-mismatch", "changing lead cannot silently reset round baselines");

    // Actual unavailable source, not a canned admission result. It is retained
    // for retry while the next due pair can progress on the following call.
    await forceDue(10);
    await db.exec("update touchline_formation_geometry_versions set status='superseded'");
    result = await scan(); assert.equal(result.status, "partial"); assert.equal(result.deferred, 1);
    assert.equal((await work(10)).last_result, "unavailable");
    assert.equal((await work(10)).closed, false);
    await db.exec("update touchline_formation_geometry_versions set status='published'");
    await forceDue(20);
    result = await scan(); assert.equal(result.processed, 1);
    assert.equal((await work(20)).last_result, "baselined-or-suppressed");
    assert.equal((await work(10)).last_result, "unavailable", "unavailable pair does not monopolize the next invocation");
    await forceDue(10); await scan(); assert.equal((await work(10)).last_result, "baselined-or-suppressed");

    const durableTables = ["touchline_lineup_reminder_scan_state", "touchline_lineup_reminder_admission_work", "touchline_game_notification_enrollments", "touchline_game_notification_identities", "touchline_game_notification_deliveries"];
    const snapshot = async () => Promise.all(durableTables.map(async table => (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) r from ${table} t`)).rows[0].r));
    const before = await snapshot();
    await db.exec("begin"); await forceDue(40); await scan(50); await db.exec("rollback");
    assert.deepEqual(await snapshot(), before, "cursor/work/admission share transaction rollback");

    // Synthetic later-window preimage: test owner shifts fixture+existing
    // baseline deadline together. This is not production clock advancement or
    // permission for runtime restamping; it deterministically exercises the
    // real admit RPC with a previously established pre-window enrollment.
    await db.exec("begin;update football_fixtures set starts_at=date_trunc('milliseconds',clock_timestamp())+interval '30 minutes';update touchline_game_notification_enrollments set deadline=(select starts_at from football_fixtures),baseline_at=clock_timestamp()-interval '2 hours'");
    await forceDue(20); result = await scan(50);
    assert.equal(result.stored, 1);
    assert.equal(await count("touchline_game_notification_identities"), 1);
    await forceDue(20); await scan(50);
    assert.equal(await count("touchline_game_notification_identities"), 1, "repeated work does not repeat identity");
    await db.exec("rollback");

    await db.exec(`begin;insert into touchline_fantasy_user_gameweeks values('${id(300)}','${id(40)}','${id(5)}','CONFIRMED','4-3-3','307')`);
    for (let i = 0; i < 11; i++) await db.query("insert into touchline_fantasy_user_gameweek_selections values($1,$2,$3,$4)", [id(300), id(400 + i), `S${i}`, i + 1]);
    await forceDue(40); await scan(50);
    assert.equal((await work(40)).last_result, "closed");
    assert.equal((await work(40)).closed, false, "confirmed team remains revisitable while market is editable");
    await db.exec("update touchline_fantasy_user_gameweeks set state='DRAFT'");
    await forceDue(40); await scan(50); assert.equal((await work(40)).last_result, "baselined-or-suppressed");
    await db.exec("rollback");

    // A genuinely new first visit after the lead window starts is suppressed.
    await db.exec("begin;update football_fixtures set starts_at=date_trunc('milliseconds',clock_timestamp())+interval '30 minutes'");
    await addUser(50);
    for (let i = 0; i < 3 && !(await work(50)); i++) await scan(50);
    assert.ok(await work(50));
    assert.equal((await db.query("select suppressed from touchline_game_notification_enrollments where user_id=$1", [id(50)])).rows[0].suppressed, true);
    assert.equal(await count("touchline_game_notification_deliveries"), 0, "no old-window replay for new enrollment");
    await db.exec("rollback");

    await db.exec(`update notification_preferences set settings='{"lineupReminders":false}' where user_id='${id(20)}';update notification_preferences set settings='{"lineupReminders":true}' where user_id='${id(20)}'`);
    await forceDue(20); await scan(50);
    assert.equal((await db.query("select suppressed from touchline_game_notification_enrollments where user_id=$1", [id(20)])).rows[0].suppressed, true, "scan must not undo consent ABA suppression");
    await db.exec("begin;update touchline_fantasy_gameweeks set state='SETTLED'");
    await forceDue(40); await scan(50); assert.equal((await work(40)).closed, true); await db.exec("rollback");

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`); await assert.rejects(scan(), /permission denied/); await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.ok((await scan()).status);
    // Actual adapter validates the actual SQL receipt. Only the SDK transport
    // is replaced; it runs parameterized SQL under the service role above.
    const adapterSource = await readFile(new URL("lib/touchlineFantasy/lineup-reminder-admission-server.ts", root), "utf8");
    const adapterJs = ts.transpileModule(adapterSource, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const adapterExports: Record<string, unknown> = {};
    let calls = 0, sqlReceipt: unknown;
    const imports: Record<string, unknown> = {
      "server-only": {},
      "@/lib/supabase/admin": { createAdminClient: () => ({
        rpc(name: string, args: Record<string, unknown>) {
          assert.equal(name, "touchline_lineup_reminder_admission_scan"); calls++;
          return { async abortSignal(signal: AbortSignal) {
            assert.equal(signal.aborted, false);
            const response = await db.query("select touchline_lineup_reminder_admission_scan($1,$2,$3,$4,$5) r",
              [args.p_competition_id, args.p_season_id, args.p_lead_seconds, args.p_page_size, args.p_retry_seconds]);
            sqlReceipt = response.rows[0].r;
            return { data: sqlReceipt, error: null };
          } };
        },
      }) },
    };
    vm.runInNewContext(adapterJs, { exports: adapterExports, AbortController, performance, setTimeout, clearTimeout,
      require(name: string) { assert.ok(Object.hasOwn(imports, name)); return imports[name]; } });
    const run = (adapterExports as unknown as typeof admissionAdapter).runLineupReminderAdmission;
    const adapterOptions = { enabled: true, competitionId: id(1), seasonId: id(2), leadSeconds: 3600, pageSize: 1, retrySeconds: 3600 };
    for (const patch of [{}, { leadSeconds: 1800 }, { competitionId: id(999) }]) {
      const beforeCalls = calls;
      const result = await run({ ...adapterOptions, ...patch });
      assert.notEqual(result.status, "unconfirmed", "valid actual SQL receipt is accepted by production adapter");
      assert.deepEqual(JSON.parse(JSON.stringify(result)), sqlReceipt);
      assert.equal(calls, beforeCalls + 1, "one RPC, no admission replay");
    }
    for (const table of ["touchline_lineup_reminder_scan_state", "touchline_lineup_reminder_admission_work"]) {
      await assert.rejects(db.exec(`delete from ${table}`), /permission denied/);
      await assert.rejects(db.exec(`update ${table} set ${table.endsWith("state") ? "lead_seconds=1" : "attempts=0"}`), /permission denied/);
    }
    await db.exec("reset role");
    await db.exec(`delete from auth.users where id='${id(10)}'`);
    assert.equal(await work(10), undefined, "account deletion removes private work, not a new permanent user tombstone");
  } finally { await db.close(); }
});

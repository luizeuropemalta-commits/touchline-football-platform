import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {buildQaAvatarInstallation, QA_PROJECT_REF} from "../scripts/build-qa-avatar-installation.mjs";

// Reference created through the official Supabase CLI during local integration.
const read = (name:string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const sql = read("20261104034736_avatar_production_retention");
const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const {PGlite} = runtime ? await import(pathToFileURL(runtime).href) : {PGlite:null};
const id = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const profile = "synthetic-avatar-v1", project = "abcdefghijklmnopqrst";
const actor = id(1), digest = "a".repeat(64);
const key = (n:number, owner=actor) => `${owner}/${id(n)}/${digest}.webp`;
const names = {
  register: "touchline_register_avatar_retention_candidate",
  begin: "touchline_begin_avatar_retention_attempt",
  record: "touchline_record_avatar_retention_attempt",
  list: "touchline_list_due_avatar_retention_candidates",
  claim: "touchline_claim_avatar_retention_discovery",
  ack: "touchline_ack_avatar_retention_discovery",
} as const;
type Operation = keyof typeof names;
const qaNames = Object.fromEntries(Object.entries(names).map(([operation,name]) => [operation,name.replace("_avatar_","_qa_avatar_")])) as Record<Operation,string>;
const denied = {
  register: {version:1,allowed:false}, begin:{version:1,allowed:false},
  record:{version:1,recorded:false}, list:{version:1,candidates:[]},
  claim:{version:1,allowed:false,scans:[]}, ack:{version:1,acknowledged:false},
};
const bodies = ["authorize_retention_candidate", "register_retention_candidate", "begin_retention_attempt",
  "record_retention_attempt", "list_due_retention_candidates", "claim_retention_discovery", "ack_retention_discovery"];

test("Production retention draft contains no activation, scheduler, credential or Storage operation", () => {
  assert.doesNotMatch(sql, /insert\s+into\s+touchline_avatar_private\.production_retention_policy|\bcron\.|\bnet\.|\bvault\.|\bstorage\.|create\s+role|alter\s+role/i);
  assert.doesNotMatch(sql, /sb_secret_|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./);
});

test("real avatar chain: Production policy, inaccessible shared cores, QA preservation and recurring retention", {skip:!runtime}, async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role qa_executor login nosuperuser createrole createdb bypassrls;
      create role anon; create role authenticated; create role service_role bypassrls;
      grant create on database postgres to qa_executor; grant create on schema public to qa_executor;
      set session authorization qa_executor;
      create schema auth; create table auth.users(id uuid primary key,deleted_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.users(id uuid primary key references auth.users(id),avatar_url text,full_name text);
      alter table public.users enable row level security;
      create table public.touchline_qa_fixture_runs(id uuid primary key);
      create table public.touchline_qa_owner_scenarios(run_id uuid,user_id uuid);
      create table public.touchline_user_arena_state(user_id uuid);
      create function public.touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
        if $1 is distinct from '${QA_PROJECT_REF}' then raise exception 'TARGET'; end if; end$$;
      create function public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function public.touchline_rollback_qa_owner_scenario(text,uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;`);
    // Exact installed business bodies, real writer role/trigger and constraints.
    // The synthetic QA bootstrap satisfies prerequisites; it is not a Production provisioning recipe.
    await db.exec(buildQaAvatarInstallation({projectRef:QA_PROJECT_REF,executorRole:"qa_executor"}).sql.replace(/rollback;\n$/, "commit;\n"));
    await db.exec("set session authorization postgres");
    for (const migration of ["20261008184109_touchline_qa_avatar_retention_authority", "20261008185454_touchline_qa_avatar_retention_journal", "20261008190028_touchline_qa_avatar_retention_discovery"]) await db.exec(read(migration));
    await db.exec(`insert into auth.users values('${actor}',null),('${id(2)}',null),('${id(3)}',clock_timestamp());
      insert into public.users(id) values('${actor}'),('${id(2)}'),('${id(3)}');
      insert into touchline_avatar_private.account_operations(actor_id,generation,fenced_through_generation,active_operation_id)
        values('${actor}',9,7,null),('${id(2)}',2,1,null),('${id(3)}',2,1,null);
      insert into touchline_avatar_private.receipts(actor_id,operation_id,expected_revision,revision,digest,object_key,avatar_url) values
        ('${actor}','${id(11)}',0,1,'${digest}','${key(11)}','/api/account/avatar?version=${id(11)}'),
        ('${actor}','${id(12)}',1,2,'${digest}','${key(12)}','/api/account/avatar?version=${id(12)}');
      insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state,receipt_operation_id,terminal_at) values
        ('${actor}','${id(11)}',0,0,1,'committed','${id(11)}',clock_timestamp()-interval '10 minutes'),
        ('${actor}','${id(12)}',1,2,3,'committed','${id(12)}',clock_timestamp()-interval '9 minutes'),
        ('${actor}','${id(13)}',2,4,5,'fenced',null,clock_timestamp()-interval '6 minutes'),
        ('${actor}','${id(14)}',2,6,7,'fenced',null,clock_timestamp()-interval '4 minutes'),
        ('${actor}','${id(15)}',2,8,9,'pending',null,null),
        ('${id(2)}','${id(21)}',0,0,1,'fenced',null,clock_timestamp()-interval '6 minutes'),
        ('${id(3)}','${id(31)}',0,0,1,'fenced',null,clock_timestamp()-interval '6 minutes');
      update touchline_avatar_private.account_operations set active_operation_id='${id(15)}' where actor_id='${actor}';
      set role touchline_avatar_writer;
      update public.users set avatar_revision=1,avatar_url='/api/account/avatar?version=${id(11)}' where id='${actor}';
      update public.users set avatar_revision=2,avatar_url='/api/account/avatar?version=${id(12)}' where id='${actor}';
      reset role;`);
    const rpc = async (name:string,args:unknown[]) => (await db.query(`select public.${name}(${args.map((_,i) => `$${i+1}`).join(",")}) r`,args)).rows[0].r;
    const production = (operation:Operation,args:unknown[],context:unknown[]=[profile,project]) => rpc(names[operation],[...context,...args]);
    const qa = (operation:Operation,args:unknown[],ref=QA_PROJECT_REF) => rpc(qaNames[operation],[ref,...args]);
    const journal = async () => (await db.query(`select jsonb_build_object(
      'candidates',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from touchline_avatar_private.retention_candidates r),
      'attempts',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from touchline_avatar_private.retention_attempts r),
      'claims',(select coalesce(jsonb_agg(to_jsonb(r) order by attempt_id),'[]') from touchline_avatar_private.retention_discovery_claims r),
      'scans',(select coalesce(jsonb_agg(to_jsonb(r) order by actor_id,operation_id),'[]') from touchline_avatar_private.retention_discovery_scans r)) j`)).rows[0].j;
    const writers = async () => (await db.query(`select jsonb_build_object(
      'users',(select jsonb_agg(to_jsonb(r) order by id) from public.users r),
      'auth',(select jsonb_agg(to_jsonb(r) order by id) from auth.users r),
      'operations',(select jsonb_agg(to_jsonb(r) order by actor_id,operation_id) from touchline_avatar_private.operations r),
      'accounts',(select jsonb_agg(to_jsonb(r) order by actor_id) from touchline_avatar_private.account_operations r),
      'receipts',(select jsonb_agg(to_jsonb(r) order by actor_id,revision) from touchline_avatar_private.receipts r)) j`)).rows[0].j;
    const catalogue = async () => (await db.query(`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
      p.prosrc,p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='touchline_avatar_private' or (n.nspname='public' and p.proname like '%avatar%') order by n.nspname,p.proname,args`)).rows;
    const tableMetadata = async () => (await db.query(`select c.relname,c.relowner::regrole::text owner,c.relacl::text acl,c.relrowsecurity,
      (select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) order by conname) from pg_constraint where conrelid=c.oid) constraints
      from pg_class c where c.relnamespace='touchline_avatar_private'::regnamespace and c.relkind='r' order by c.relname`)).rows;
    const beforeCatalogue = await catalogue(), beforeTables = await tableMetadata(), beforeWriters = await writers(), beforeJournal = await journal();
    const allDenied = async (context:unknown[]=[profile,project],legacy=false) => {
      const args:Record<Operation,unknown[]> = {
        register:[actor,id(11),digest,key(11)], begin:[id(900),id(901)], record:[id(901),"accepted"],
        list:[5], claim:[id(902),1], ack:[actor,id(11),id(902),0,0,true],
      };
      for (const operation of Object.keys(names) as Operation[]) {
        assert.deepEqual(await (legacy ? qa(operation,args[operation]) : production(operation,args[operation],context)),denied[operation],operation);
      }
    };
    const qaSmoke = async () => {
      await db.exec("begin; set local role service_role");
      try {
        const registered = await qa("register",[actor,id(11),digest,key(11)]);
        assert.equal(registered.allowed,true);
        assert.deepEqual(await qa("register",[actor,id(11),digest,key(11)]),registered);
        assert.equal((await qa("list",[25])).candidates.length,1);
        const attempt = await qa("begin",[registered.candidateId,id(100)]);
        assert.equal(attempt.allowed,true); assert.equal(attempt.kind,"superseded_committed");
        for (const [field,value] of Object.entries({actorId:actor,operationId:id(11),digest,objectKey:key(11)})) assert.equal(attempt[field],value);
        assert.deepEqual(await qa("record",[id(100),"accepted"]),{version:1,recorded:true,reconciliationRequired:true});
        const discovery = await qa("claim",[id(101),1]);
        assert.equal(discovery.allowed,true); assert.equal(discovery.scans.length,1);
        const scan = discovery.scans[0]; assert.equal(scan.operationId,id(11));
        assert.deepEqual(await qa("ack",[scan.actorId,scan.operationId,id(101),0,0,true]),{version:1,acknowledged:true,reconciliationRequired:true});
        const authority = await rpc("touchline_authorize_qa_avatar_retention_candidate",[QA_PROJECT_REF,actor,id(13),digest,key(13)]);
        assert.equal(authority.allowed,true); assert.equal(authority.kind,"fenced_without_receipt");
        assert.deepEqual(await qa("register",[actor,id(11),digest,key(11)],project),denied.register);
      } finally { await db.exec("rollback"); }
    };

    await t.test("unmodified QA seven-RPC behavior is captured before extraction",qaSmoke);
    await t.test("forward DDL rollback restores all functions, tables and data",async () => {
      await db.exec(sql.replace(/commit;\s*$/, "rollback;"));
      assert.deepEqual(await catalogue(),beforeCatalogue);
      assert.deepEqual(await tableMetadata(),beforeTables);
      assert.deepEqual(await writers(),beforeWriters); assert.deepEqual(await journal(),beforeJournal);
    });
    await t.test("late source drift aborts all earlier extraction and policy DDL",async () => {
      const signature = "touchline_avatar_private.ack_retention_discovery(text,uuid,uuid,uuid,integer,integer,boolean)";
      const definition = (await db.query("select pg_get_functiondef($1::regprocedure) d",[signature])).rows[0].d;
      assert.equal(definition.split("declare v_scan").length,2);
      await db.exec(definition.replace("declare v_scan","-- synthetic review drift\ndeclare v_scan"));
      await assert.rejects(db.exec(sql),/AVATAR_RETENTION_SOURCE_DRIFT: ack_retention_discovery/);
      await db.exec("rollback");
      await db.exec(definition);
      assert.deepEqual(await catalogue(),beforeCatalogue); assert.deepEqual(await tableMetadata(),beforeTables);
    });
    await db.exec(sql);
    await t.test("installation is empty OFF, preserving writer bodies, QA public ABI and existing metadata",async () => {
      assert.deepEqual((await db.query("select * from touchline_avatar_private.production_retention_policy")).rows,[]);
      const after = await catalogue();
      for (const old of beforeCatalogue) {
        const current = after.find((r:{nspname:string;proname:string;args:string}) => r.nspname===old.nspname && r.proname===old.proname && r.args===old.args);
        assert.ok(current,old.proname);
        if (old.nspname==="touchline_avatar_private" && bodies.includes(old.proname)) {
          const {prosrc:_oldBody,...oldMetadata} = old;
          const {prosrc:_newBody,...newMetadata} = current;
          assert.deepEqual(newMetadata,oldMetadata,old.proname);
        } else assert.deepEqual(current,old,old.proname);
      }
      assert.deepEqual((await tableMetadata()).filter((r:{relname:string}) => r.relname!=="production_retention_policy"),beforeTables);
      assert.deepEqual(await writers(),beforeWriters); assert.deepEqual(await journal(),beforeJournal);
    });
    await t.test("QA seven-RPC behavior survives extraction with no Production policy",qaSmoke);
    await t.test("new RPC named arguments and six private gates are exact; cores are not service capabilities",async () => {
      const expected:Record<string,string[]> = {
        [names.register]:["p_profile_id","p_project_ref","p_actor","p_operation","p_digest","p_object_key"],
        [names.begin]:["p_profile_id","p_project_ref","p_candidate","p_attempt"],
        [names.record]:["p_profile_id","p_project_ref","p_attempt","p_outcome"],
        [names.list]:["p_profile_id","p_project_ref","p_limit"],
        [names.claim]:["p_profile_id","p_project_ref","p_attempt","p_limit"],
        [names.ack]:["p_profile_id","p_project_ref","p_actor","p_operation","p_attempt","p_expected_offset","p_next_offset","p_complete"],
      };
      const publicRows = (await db.query("select proname,proargnames,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname=any($1::text[])",[Object.keys(expected)])).rows;
      assert.equal(publicRows.length,6);
      for (const row of publicRows) { assert.deepEqual(row.proargnames,expected[row.proname]); assert.equal(row.prosecdef,false); }
      const coreRows = (await db.query(`select p.proname,p.prosecdef,has_function_privilege('service_role',p.oid,'EXECUTE') service,
        has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated
        from pg_proc p where p.pronamespace='touchline_avatar_private'::regnamespace and p.proname like '%_core_v2'`)).rows;
      assert.equal(coreRows.length,7);
      for (const row of coreRows) assert.deepEqual([row.prosecdef,row.service,row.anon,row.authenticated],[false,false,false,false]);
      const policy = (await db.query("select relrowsecurity,relacl from pg_class where oid='touchline_avatar_private.production_retention_policy'::regclass")).rows[0];
      assert.equal(policy.relrowsecurity,true);
      await db.exec("set role service_role");
      await assert.rejects(db.query("select touchline_avatar_private.list_due_retention_candidates_core_v2($1,5)",[project]),/permission denied/);
      await assert.rejects(db.query("select touchline_avatar_private.production_retention_admitted($1,$2)",[profile,project]),/permission denied/);
      await db.exec("reset role");
    });
    await t.test("absent policy denies all Production calls without journal or discovery writes",async () => {
      await db.exec("set role service_role"); await allDenied(); await db.exec("reset role");
      assert.deepEqual(await journal(),beforeJournal);
    });
    await t.test("browser roles cannot execute; service cannot read or mutate policy or journal",async () => {
      for (const role of ["anon","authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(production("list",[5]),/permission denied/);
        await assert.rejects(qa("list",[5]),/permission denied/);
        await db.exec("reset role");
      }
      await db.exec("set role service_role");
      for (const statement of ["select * from touchline_avatar_private.production_retention_policy",
        `insert into touchline_avatar_private.production_retention_policy(profile_id,project_ref) values('${profile}','${project}')`,
        "update touchline_avatar_private.production_retention_policy set execution_enabled=true",
        "delete from touchline_avatar_private.production_retention_policy", "truncate touchline_avatar_private.production_retention_policy",
        "select * from touchline_avatar_private.retention_candidates"]) await assert.rejects(db.query(statement),/permission denied/);
      await db.exec("reset role");
    });
    await t.test("policy initialization rejects QA, malformed refs/slugs and initial ON",async () => {
      for (const [slug,ref] of [[profile,QA_PROJECT_REF],[profile,project+"\n"],[profile,project+" "],[profile+"\n",project],["bad_slug",project],["x",project]]) {
        await assert.rejects(db.query("insert into touchline_avatar_private.production_retention_policy(profile_id,project_ref) values($1,$2)",[slug,ref]),/check constraint/);
      }
      await assert.rejects(db.query("insert into touchline_avatar_private.production_retention_policy(profile_id,project_ref,execution_enabled) values($1,$2,true)",[profile,project]),/INITIAL_OFF_REQUIRED/);
      await db.query("insert into touchline_avatar_private.production_retention_policy(profile_id,project_ref) values($1,$2)",[profile,project]);
      assert.equal((await db.query("select execution_enabled from touchline_avatar_private.production_retention_policy")).rows[0].execution_enabled,false);
    });
    await t.test("OFF Production also denies legacy QA bypass, preserving both journals",async () => {
      await db.exec("set role service_role"); await allDenied(); await allDenied(undefined,true);
      assert.deepEqual(await rpc("touchline_authorize_qa_avatar_retention_candidate",[QA_PROJECT_REF,actor,id(11),digest,key(11)]),denied.register);
      await db.exec("reset role"); assert.deepEqual(await journal(),beforeJournal);
    });
    await t.test("policy is singleton and cannot retarget, change identity, delete or truncate",async () => {
      await assert.rejects(db.query("insert into touchline_avatar_private.production_retention_policy(profile_id,project_ref) values($1,$2)",["another-avatar-v1",project]),/unique constraint/);
      for (const assignment of ["profile_id='another-avatar-v1'","project_ref='bcdefghijklmnopqrstuva'","mode='qa'","singleton=false","created_at=clock_timestamp()"]) {
        await assert.rejects(db.query(`update touchline_avatar_private.production_retention_policy set ${assignment}`),/IDENTITY_IMMUTABLE/);
      }
      await assert.rejects(db.query("delete from touchline_avatar_private.production_retention_policy"),/REMOVAL_FORBIDDEN/);
      await assert.rejects(db.query("truncate touchline_avatar_private.production_retention_policy"),/REMOVAL_FORBIDDEN/);
      await db.exec("update touchline_avatar_private.production_retention_policy set execution_enabled=true");
    });
    await t.test("ON requires exact profile/project and no browser subject before any side effect",async () => {
      await db.exec("set role service_role");
      for (const context of [[null,project],[profile,null],[profile,QA_PROJECT_REF],[profile+"\n",project],[profile,project+"\n"],["other-avatar-v1",project],[profile,"bcdefghijklmnopqrstuv"]]) await allDenied(context);
      await db.exec(`set request.jwt.claim.sub='${actor}'`); await allDenied();
      await db.exec("reset request.jwt.claim.sub"); await allDenied(undefined,true);
      await db.exec("reset role"); assert.deepEqual(await journal(),beforeJournal);
    });
    let candidate = "";
    await t.test("only superseded committed and fenced exact keys are registered; current, active, recent and deleted deny",async () => {
      await db.exec("set role service_role");
      for (const number of [12,14,15,99]) assert.deepEqual(await production("register",[actor,id(number),digest,key(number)]),denied.register);
      assert.deepEqual(await production("register",[id(3),id(31),digest,key(31,id(3))]),denied.register);
      assert.deepEqual(await production("register",[id(2),id(11),digest,key(11)]),denied.register);
      assert.deepEqual(await production("register",[actor,id(11),digest,key(11)+"?x"]),denied.register);
      const registered = await production("register",[actor,id(11),digest,key(11)]);
      assert.equal(registered.allowed,true); candidate=registered.candidateId;
      assert.deepEqual(await production("register",[actor,id(11),digest,key(11)]),registered);
      assert.equal((await production("register",[actor,id(13),digest,key(13)])).allowed,true);
      assert.equal((await production("list",[25])).candidates.length,2);
      assert.deepEqual(await production("list",[26]),denied.list);
      await db.exec("reset role");
    });
    await t.test("begin persists one exact 30-second authority and excludes retry/concurrent lease",async () => {
      await db.exec("set role service_role");
      const attempt = await production("begin",[candidate,id(200)]);
      assert.equal(attempt.allowed,true); assert.equal(attempt.kind,"superseded_committed");
      for (const [field,value] of Object.entries({actorId:actor,operationId:id(11),digest,objectKey:key(11),candidateId:candidate,attemptId:id(200)})) assert.equal(attempt[field],value);
      assert.equal(Date.parse(attempt.expiresAt)-Date.parse(attempt.checkedAt),30_000);
      assert.deepEqual(await production("begin",[candidate,id(200)]),denied.begin);
      assert.deepEqual(await production("begin",[candidate,id(201)]),denied.begin);
      await db.exec("reset role");
      const saved = (await db.query("select authority,outcome from touchline_avatar_private.retention_attempts where id=$1",[id(200)])).rows[0];
      assert.equal(saved.authority.authorizationId,attempt.authorizationId); assert.equal(saved.outcome,null);
    });
    await t.test("accepted and not_found remain observations, idempotent without a clean/final state",async () => {
      await db.exec("set role service_role");
      const result = {version:1,recorded:true,reconciliationRequired:true};
      assert.deepEqual(await production("record",[id(200),"accepted"]),result);
      assert.deepEqual(await production("record",[id(200),"accepted"]),result);
      assert.equal((await production("record",[id(200),"not_found"])).recorded,false);
      assert.deepEqual(await production("record",[id(200),"clean"]),denied.record);
      assert.equal((await production("list",[5])).candidates.some((row:{candidateId:string}) => row.candidateId===candidate),false);
      await db.exec("reset role");
      assert.equal((await db.query("select count(*)::int n from touchline_avatar_private.retention_candidates where id=$1",[candidate])).rows[0].n,1);
    });
    await t.test("late result cannot release a newer lease and every outcome still recurs",async () => {
      await db.query("update touchline_avatar_private.retention_candidates set next_check_at=clock_timestamp()-interval '1 second' where id=$1",[candidate]);
      await db.exec("set role service_role"); assert.equal((await production("begin",[candidate,id(201)])).allowed,true);
      await db.exec("reset role");
      await db.query("update touchline_avatar_private.retention_candidates set lease_until=clock_timestamp()-interval '1 second' where id=$1",[candidate]);
      await db.exec("set role service_role"); assert.equal((await production("begin",[candidate,id(202)])).allowed,true);
      assert.equal((await production("record",[id(201),"unknown"])).recorded,true);
      assert.deepEqual(await production("begin",[candidate,id(203)]),denied.begin);
      await db.exec("reset role");
      assert.equal((await db.query("select active_attempt_id from touchline_avatar_private.retention_candidates where id=$1",[candidate])).rows[0].active_attempt_id,id(202));
      await db.exec("set role service_role"); assert.equal((await production("record",[id(202),"not_found"])).reconciliationRequired,true);
      await db.exec("reset role");
    });
    await t.test("fresh begin rechecks account deletion after successful registration",async () => {
      await db.exec("begin; set local role service_role");
      try {
        const registered = await production("register",[id(2),id(21),digest,key(21,id(2))]);
        assert.equal(registered.allowed,true);
        await db.exec(`reset role; update auth.users set deleted_at=clock_timestamp() where id='${id(2)}'; set local role service_role`);
        assert.deepEqual(await production("begin",[registered.candidateId,id(204)]),denied.begin);
      } finally { await db.exec("rollback"); }
    });
    await t.test("discovery bounds, single-use claims, exact paging and stale ACK are unchanged",async () => {
      await db.exec("set role service_role");
      assert.deepEqual(await production("claim",[id(300),6]),denied.claim);
      const first = await production("claim",[id(300),1]);
      assert.equal(first.allowed,true); assert.equal(first.scans.length,1);
      assert.equal(first.scans[0].actorId,actor); assert.equal(first.scans[0].operationId,id(11));
      assert.equal(first.scans[0].prefix,`${actor}/${id(11)}/`); assert.equal(first.scans[0].offset,0); assert.equal(first.scans[0].limit,25);
      assert.deepEqual(await production("claim",[id(300),1]),denied.claim);
      assert.deepEqual(await production("ack",[actor,id(11),id(300),0,50,false]),denied.ack);
      assert.equal((await production("ack",[actor,id(11),id(300),0,25,false])).acknowledged,true);
      assert.deepEqual(await production("ack",[actor,id(11),id(300),0,25,false]),denied.ack);
      const next = await production("claim",[id(301),5]);
      const page = next.scans.find((scan:{operationId:string}) => scan.operationId===id(11));
      assert.ok(page); assert.equal(page.offset,25);
      assert.deepEqual(await production("ack",[actor,id(11),id(300),25,0,true]),denied.ack);
      assert.deepEqual(await production("ack",[actor,id(11),id(301),25,0,true]),{version:1,acknowledged:true,reconciliationRequired:true});
      assert.ok(next.scans.every((scan:{operationId:string}) => ![id(12),id(14),id(15),id(31)].includes(scan.operationId)));
      await db.exec("reset role");
      const scan = (await db.query("select object_offset,attempt_id,lease_until,next_check_at>clock_timestamp() later from touchline_avatar_private.retention_discovery_scans where actor_id=$1 and operation_id=$2",[actor,id(11)])).rows[0];
      assert.deepEqual(scan,{object_offset:0,attempt_id:null,lease_until:null,later:true});
    });
    await t.test("disabling is a non-destructive rollback; same immutable target can resume reconciliation",async () => {
      const saved = await journal();
      await db.exec("update touchline_avatar_private.production_retention_policy set execution_enabled=false; set role service_role");
      await allDenied(); await allDenied(undefined,true);
      await db.exec("reset role"); assert.deepEqual(await journal(),saved);
      await db.exec("update touchline_avatar_private.production_retention_policy set execution_enabled=true; set role service_role");
      assert.equal((await production("record",[id(202),"not_found"])).recorded,true);
      await db.exec("reset role"); assert.deepEqual(await journal(),saved);
    });
    await t.test("no publication, recovery, account generation, receipt or current avatar was rewritten",async () => {
      assert.deepEqual(await writers(),beforeWriters);
      const after = await catalogue();
      for (const old of beforeCatalogue.filter((row:{nspname:string;proname:string}) => row.nspname!=="touchline_avatar_private" || !bodies.includes(row.proname))) {
        assert.deepEqual(after.find((row:{nspname:string;proname:string;args:string}) => row.nspname===old.nspname && row.proname===old.proname && row.args===old.args),old);
      }
    });
  } finally { await db.close(); }
});

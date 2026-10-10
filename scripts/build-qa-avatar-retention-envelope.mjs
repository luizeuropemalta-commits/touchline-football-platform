// SQL-only generator: never connects, executes, retries or obtains credentials.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
export const QA="xgxbwqxjssxxuihuwmgy";
export const PREDECESSOR_VERSION="20261008183200";
export const PREDECESSOR_SHA256="c690f30ee423affe8774c876f4e1e5566e04dc83f911b5c2bb557b696d33576e";
export const SOURCES=Object.freeze([
  ["20261008184109","touchline_qa_avatar_retention_authority","009b7b99b4f57fab4022cb0c2005007c98c5e181b44ee1d6517f626a2014528a"],
  ["20261008185454","touchline_qa_avatar_retention_journal","2a3b8928aa5027ad99e384939a437c7c2f0bc7f6e6beb50c44ae9080180bfb68"],
  ["20261008190028","touchline_qa_avatar_retention_discovery","e398fa289846ca9f77b7277b3bbb9ff77d562aa98b30228c98d8c6d13c802847"],
].map(Object.freeze));
const hash=value=>createHash("sha256").update(value).digest("hex");
const q=value=>`'${value.replaceAll("'","''")}'`;
const tables=["retention_candidates","retention_attempts","retention_discovery_claims","retention_discovery_scans"];
const functions=[
 ["authorize_retention_candidate","touchline_authorize_qa_avatar_retention_candidate","text,uuid,uuid,text,text"],
 ["register_retention_candidate","touchline_register_qa_avatar_retention_candidate","text,uuid,uuid,text,text"],
 ["begin_retention_attempt","touchline_begin_qa_avatar_retention_attempt","text,uuid,uuid"],
 ["record_retention_attempt","touchline_record_qa_avatar_retention_attempt","text,uuid,text"],
 ["list_due_retention_candidates","touchline_list_due_qa_avatar_retention_candidates","text,integer"],
 ["claim_retention_discovery","touchline_claim_qa_avatar_retention_discovery","text,uuid,integer"],
 ["ack_retention_discovery","touchline_ack_qa_avatar_retention_discovery","text,uuid,uuid,uuid,integer,integer,boolean"],
];
const unchangedTables=["public.users","public.touchline_qa_owner_scenarios","touchline_avatar_private.account_operations","touchline_avatar_private.operations","touchline_avatar_private.receipts"];
const rowFingerprint=table=>`select ${q(table)} resource,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) digest from ${table} t`;
const helpers=`select p.oid,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proowner,p.proacl::text acl
 from pg_proc p where p.pronamespace='touchline_avatar_private'::regnamespace and p.proowner='touchline_avatar_writer'::regrole`;
export function buildQaAvatarRetentionEnvelope({projectRef,commit=false,readSource=(version,name)=>readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`,import.meta.url),"utf8")}={}) {
 assert.equal(projectRef,QA,"Exact QA target required; pin connection separately"); assert.equal(typeof commit,"boolean");
 const payloads=SOURCES.map(([version,name,sourceSha256])=>{
   const source=readSource(version,name); assert.equal(hash(source),sourceSha256,"Retention source drift");
   assert.equal((source.match(/^begin;$/gm)??[]).length,1); assert.equal((source.match(/^commit;$/gm)??[]).length,1);
   assert.ok(source.endsWith("commit;\n"));
   const payload=source.replace(/^begin;\n/m,"").slice(0,-"commit;\n".length);
   return {version,name,sourceSha256,payload,payloadSha256:hash(payload)};
 });
 const resourceGuards=[...tables.map(name=>`to_regclass(${q(`touchline_avatar_private.${name}`)}) is not null`),
   ...functions.flatMap(([privateName,publicName])=>[
     `exists(select 1 from pg_proc where pronamespace='touchline_avatar_private'::regnamespace and proname=${q(privateName)})`,
     `exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=${q(publicName)})`])].join("\n or ");
 const aclGuards=functions.flatMap(([privateName,publicName,args])=>[[`touchline_avatar_private.${privateName}(${args})`,true],[`public.${publicName}(${args})`,false]]).map(([signature,definer])=>
 `if not exists(select 1 from pg_proc where oid=to_regprocedure(${q(signature)}) and proowner='postgres'::regrole
   and prosecdef=${definer} and proconfig @> array['search_path=""']::text[])
   or has_function_privilege('anon',${q(signature)},'EXECUTE') or has_function_privilege('authenticated',${q(signature)},'EXECUTE')
   or not has_function_privilege('service_role',${q(signature)},'EXECUTE') then raise exception 'AVATAR_RETENTION_RPC_ACL'; end if;`).join("\n");
 const tableGuards=tables.map(name=>`if not exists(select 1 from pg_class where oid='touchline_avatar_private.${name}'::regclass and relrowsecurity and relowner='postgres'::regrole)
   or exists(select 1 from pg_policies where schemaname='touchline_avatar_private' and tablename=${q(name)})
   or has_table_privilege('anon','touchline_avatar_private.${name}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_table_privilege('authenticated','touchline_avatar_private.${name}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_table_privilege('service_role','touchline_avatar_private.${name}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or exists(select 1 from touchline_avatar_private.${name}) then raise exception 'AVATAR_RETENTION_TABLE_ACL'; end if;`).join("\n");
 const sql=`begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table supabase_migrations.schema_migrations in exclusive mode;
lock table ${unchangedTables.join(",")} in access exclusive mode;
select public.touchline_assert_qa_fixture_target('${QA}');
do $retention_guard$ begin
 if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'AVATAR_RETENTION_EXECUTOR'; end if;
 if exists(select 1 from cron.job where active) then raise exception 'AVATAR_RETENTION_CRON_ACTIVE'; end if;
 if exists(select 1 from public.football_data_sync_runs where status='running' and started_at>now()-interval '30 minutes') then raise exception 'AVATAR_RETENTION_SYNC_ACTIVE'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version in (${payloads.map(p=>q(p.version)).join(",")})) then raise exception 'AVATAR_RETENTION_ALREADY_APPLIED_RECONCILE'; end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${PREDECESSOR_VERSION}'
   and name='touchline_qa_avatar_atomic_install' and cardinality(statements)=1
   and encode(sha256(convert_to(statements[1],'UTF8')),'hex')='${PREDECESSOR_SHA256}') then raise exception 'AVATAR_RETENTION_PREDECESSOR_DRIFT'; end if;
 if ${resourceGuards} then raise exception 'AVATAR_RETENTION_EXISTING_RESOURCE'; end if;
 if (select count(*) from (${helpers}) h)<>13 then raise exception 'AVATAR_RETENTION_HELPER_BASELINE'; end if;
 if exists(select 1 from pg_auth_members where roleid='touchline_avatar_writer'::regrole or member='touchline_avatar_writer'::regrole) then raise exception 'AVATAR_RETENTION_WRITER_MEMBERSHIP'; end if;
end $retention_guard$;
-- Private data never leaves the transaction or appears in stdout.
create temporary table retention_preimages on commit drop as ${unchangedTables.map(rowFingerprint).join(" union all ")};
create temporary table retention_helpers on commit drop as ${helpers};
${payloads.map(p=>p.payload).join("\n")}
create temporary table retention_postimages on commit drop as ${unchangedTables.map(rowFingerprint).join(" union all ")};
do $retention_postflight$ begin
 if exists((select * from pg_temp.retention_preimages except select * from pg_temp.retention_postimages)
   union all (select * from pg_temp.retention_postimages except select * from pg_temp.retention_preimages))
 then raise exception 'AVATAR_RETENTION_EXISTING_DATA_CHANGED'; end if;
 if exists((select * from pg_temp.retention_helpers except ${helpers}) union all ((${helpers}) except select * from pg_temp.retention_helpers))
 then raise exception 'AVATAR_RETENTION_HELPERS_CHANGED'; end if;
 if exists(select 1 from pg_auth_members where roleid='touchline_avatar_writer'::regrole or member='touchline_avatar_writer'::regrole) then raise exception 'AVATAR_RETENTION_WRITER_MEMBERSHIP'; end if;
 ${aclGuards}
 ${tableGuards}
end $retention_postflight$;
${payloads.map(p=>`insert into supabase_migrations.schema_migrations(version,name,statements) values(${q(p.version)},${q(p.name)},array[${q(p.payload)}]);`).join("\n")}
do $retention_history$ begin
 ${payloads.map(p=>`if not exists(select 1 from supabase_migrations.schema_migrations where version=${q(p.version)} and name=${q(p.name)}
 and statements=array[${q(p.payload)}] and encode(sha256(convert_to(statements[1],'UTF8')),'hex')=${q(p.payloadSha256)}) then raise exception 'AVATAR_RETENTION_HISTORY_MISMATCH'; end if;`).join("\n")}
end $retention_history$;
${commit?"commit":"rollback"};
`;
 return {sql,payloads,metadata:{projectRef,transactionEnd:commit?"commit":"rollback",executes:false,retries:false,
   predecessorVersion:PREDECESSOR_VERSION,predecessorPayloadSha256:PREDECESSOR_SHA256,envelopeSha256:hash(sql),
   migrations:payloads.map(({payload:_payload,...metadata})=>metadata)}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2); assert.ok(args.every(arg=>["--sql","--commit"].includes(arg))&&new Set(args).size===args.length);
 const result=buildQaAvatarRetentionEnvelope({projectRef:QA,commit:args.includes("--commit")});
 process.stdout.write(args.includes("--sql")?result.sql:JSON.stringify(result.metadata,null,2)+"\n");
}

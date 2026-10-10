// SQL generator only: no credentials, connection, application or retry behavior.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const QA = "xgxbwqxjssxxuihuwmgy";
export const VERSION = "20261008085216";
export const NAME = "touchline_club_owner_avatar_private_bucket";
export const SOURCE_SHA256 = "1a5a7c9609c9d5cb5a0636ad01e0885799c5ce574a12850497521a18348bc7a0";
export const PREDECESSOR_VERSION = "20261008183200";
export const PREDECESSOR_SHA256 = "c690f30ee423affe8774c876f4e1e5566e04dc83f911b5c2bb557b696d33576e";
const hash = value => createHash("sha256").update(value).digest("hex");
const quote = value => `'${value.replaceAll("'","''")}'`;
export function buildQaAvatarBucketEnvelope({projectRef,commit=false,
  readSource=()=>readFileSync(new URL(`../supabase/migrations/${VERSION}_${NAME}.sql`,import.meta.url),"utf8")}={}) {
  assert.equal(projectRef,QA,"Exact QA project required; independently pin the connection");
  assert.equal(typeof commit,"boolean");
  const source = readSource();
  assert.equal(hash(source),SOURCE_SHA256,"Bucket migration source drift");
  assert.equal((source.match(/^begin;$/gm) ?? []).length,1);
  assert.equal((source.match(/^commit;$/gm) ?? []).length,1);
  assert.ok(source.endsWith("commit;\n"));
  const payload = source.replace(/^begin;\n/m,"").slice(0,-"commit;\n".length);
  const payloadSha256 = hash(payload);
  const sql = `begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table supabase_migrations.schema_migrations in exclusive mode;
lock table storage.buckets,storage.objects in share row exclusive mode;
do $avatar_bucket_guard$ begin
  if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'AVATAR_BUCKET_EXECUTOR_MISMATCH'; end if;
  if exists(select 1 from cron.job where active) then raise exception 'AVATAR_BUCKET_SCHEDULER_ACTIVE'; end if;
  if exists(select 1 from public.football_data_sync_runs where status='running' and started_at>now()-interval '30 minutes') then raise exception 'AVATAR_BUCKET_LIVE_RUN_ACTIVE'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version='${VERSION}') then raise exception 'AVATAR_BUCKET_ALREADY_APPLIED_RECONCILE'; end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where version='${PREDECESSOR_VERSION}'
    and name='touchline_qa_avatar_atomic_install' and cardinality(statements)=1
    and encode(sha256(convert_to(statements[1],'UTF8')),'hex')='${PREDECESSOR_SHA256}')
  then raise exception 'AVATAR_BUCKET_PREDECESSOR_DRIFT'; end if;
  if exists(select 1 from storage.buckets where id='touchline-club-owner-avatars' or name='touchline-club-owner-avatars')
    or exists(select 1 from storage.objects where bucket_id='touchline-club-owner-avatars')
    or exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and (policyname in ('touchline_avatar_service_create','touchline_avatar_service_read')
        or coalesce(qual,'') like '%touchline-club-owner-avatars%' or coalesce(with_check,'') like '%touchline-club-owner-avatars%'))
  then raise exception 'AVATAR_BUCKET_EXISTING_RESOURCE'; end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity)
  then raise exception 'AVATAR_BUCKET_STORAGE_RLS_REQUIRED'; end if;
end $avatar_bucket_guard$;
${payload}
insert into supabase_migrations.schema_migrations(version,name,statements)
values('${VERSION}','${NAME}',array[${quote(payload)}]);
do $avatar_bucket_postflight$ begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='${VERSION}'
    and name='${NAME}' and statements=array[${quote(payload)}]
    and encode(sha256(convert_to(statements[1],'UTF8')),'hex')='${payloadSha256}')
  then raise exception 'AVATAR_BUCKET_HISTORY_MISMATCH'; end if;
  if (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in ('touchline_avatar_service_create','touchline_avatar_service_read')
    and roles=array['service_role']::name[] and permissive='PERMISSIVE'
    and ((policyname='touchline_avatar_service_create' and cmd='INSERT' and qual is null and with_check is not null)
      or (policyname='touchline_avatar_service_read' and cmd='SELECT' and qual is not null and with_check is null))) <> 2
  then raise exception 'AVATAR_BUCKET_POLICY_DRIFT'; end if;
end $avatar_bucket_postflight$;
${commit ? "commit" : "rollback"};
`;
  return {sql,payload,metadata:{projectRef,version:VERSION,name:NAME,sourceSha256:SOURCE_SHA256,payloadSha256,
    predecessorVersion:PREDECESSOR_VERSION,predecessorPayloadSha256:PREDECESSOR_SHA256,
    envelopeSha256:hash(sql),transactionEnd:commit?"commit":"rollback",executes:false,retries:false}};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  assert.ok(args.every(arg=>["--sql","--commit"].includes(arg)) && new Set(args).size===args.length,"Only --sql/--commit; never executes");
  const result=buildQaAvatarBucketEnvelope({projectRef:QA,commit:args.includes("--commit")});
  process.stdout.write(args.includes("--sql")?result.sql:JSON.stringify(result.metadata,null,2)+"\n");
}

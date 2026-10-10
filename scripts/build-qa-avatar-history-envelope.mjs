// Generates SQL only. Never connects, applies, retries, reads credentials or edits history.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildQaAvatarInstallation, QA_PROJECT_REF, sha256 } from "./build-qa-avatar-installation.mjs";

export const BUILDER_SHA256 = "396ff7fd55595e1018d282c3021e769827d01f834145c7826c54729f9e65cc13";
export const REHEARSED_SHA256 = "aef084b5afba235d4df15ebf5215c574a4dd4c197519cc21e20af6a20b97b4eb";
// Fresh hosted baseline recorded in qa-avatar-chain-rehearsal-20261008.md.
export const PREDECESSORS = Object.freeze({
  "public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text)": "87c394d2aab5fab5245afbabe395d880",
  "public.touchline_rollback_qa_owner_scenario(text,uuid,uuid)": "220269105527672ca229726640809e04",
});
export const HISTORY_NAME = "touchline_qa_avatar_atomic_install";
const quote = value => `'${value.replaceAll("'", "''")}'`;
export function unwrapAvatarTransaction(sql) {
  assert.equal((sql.match(/^begin;$/gm) ?? []).length,1,"Exactly one outer BEGIN required");
  assert.equal((sql.match(/^rollback;$/gm) ?? []).length,1,"Exactly one outer ROLLBACK required");
  assert.ok(sql.endsWith("rollback;\n"),"Outer ROLLBACK must be final");
  assert.doesNotMatch(sql,/^commit;$/m);
  return sql.replace(/^begin;\n/m,"").slice(0,-"rollback;\n".length);
}
export function buildQaAvatarHistoryEnvelope({ projectRef, version, commit = false, executorRole = "postgres" } = {}) {
  assert.equal(projectRef,QA_PROJECT_REF,"Exact QA target required; pin CLI connection independently");
  assert.match(version ?? "",/^[0-9]{14}$/,"Explicit 14-digit migration version required");
  assert.equal(typeof commit,"boolean");
  assert.ok(["postgres","qa_executor"].includes(executorRole),"Only hosted or disposable-test executor allowed");
  const builderBytes = readFileSync(new URL("./build-qa-avatar-installation.mjs",import.meta.url));
  assert.equal(sha256(builderBytes),BUILDER_SHA256,"Builder changed: repeat independent review");
  const rehearsed = buildQaAvatarInstallation({projectRef});
  assert.equal(rehearsed.sha256,REHEARSED_SHA256,"Hosted-rehearsed chain changed");
  const generated = executorRole === "postgres" ? rehearsed : buildQaAvatarInstallation({projectRef,executorRole});
  const payload = unwrapAvatarTransaction(generated.sql);
  const payloadSha256 = sha256(payload);
  const predecessorGuards = Object.entries(PREDECESSORS).map(([signature,hash]) =>
    `if (select md5(prosrc) from pg_proc where oid=to_regprocedure(${quote(signature)})) is distinct from ${quote(hash)} then raise exception 'AVATAR_PREDECESSOR_DRIFT'; end if;`).join("\n  ");
  const sql = `begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table supabase_migrations.schema_migrations in exclusive mode;
lock table public.users,public.touchline_qa_owner_scenarios in access exclusive mode;
do $avatar_history_guard$ begin
  if current_database()<>'postgres' or current_user<>${quote(executorRole)} then raise exception 'AVATAR_HISTORY_EXECUTOR_MISMATCH'; end if;
  if exists(select 1 from cron.job where active) then raise exception 'AVATAR_QA_SCHEDULER_ACTIVE'; end if;
  if exists(select 1 from public.football_data_sync_runs where status='running' and started_at>now()-interval '30 minutes') then raise exception 'AVATAR_QA_LIVE_RUN_ACTIVE'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(version)}) then raise exception 'AVATAR_HISTORY_ALREADY_APPLIED_RECONCILE'; end if;
  ${predecessorGuards}
end $avatar_history_guard$;
-- Digests stay inside this transaction; no user/scenario row is returned.
create temporary table avatar_installation_preimages on commit drop as
select
  (select count(*) from public.users) users_count,
  (select md5(coalesce(string_agg(to_jsonb(u)::text,'' order by to_jsonb(u)::text),'')) from public.users u) users_hash,
  (select count(*) from public.touchline_qa_owner_scenarios) scenarios_count,
  (select md5(coalesce(string_agg(to_jsonb(s)::text,'' order by to_jsonb(s)::text),'')) from public.touchline_qa_owner_scenarios s) scenarios_hash;
${payload}
do $avatar_data_postflight$ begin
  if (select count(*) from pg_temp.avatar_installation_preimages) <> 1
    or exists(select 1 from public.users where avatar_revision is distinct from 0::bigint)
    or not exists(select 1 from pg_temp.avatar_installation_preimages p where
      p.users_count=(select count(*) from public.users)
      and p.users_hash=(select md5(coalesce(string_agg((to_jsonb(u)-'avatar_revision')::text,'' order by (to_jsonb(u)-'avatar_revision')::text),'')) from public.users u)
      and p.scenarios_count=(select count(*) from public.touchline_qa_owner_scenarios)
      and p.scenarios_hash=(select md5(coalesce(string_agg((to_jsonb(s)-'avatar_apply_outcome'-'avatar_rollback_outcome')::text,'' order by (to_jsonb(s)-'avatar_apply_outcome'-'avatar_rollback_outcome')::text),'')) from public.touchline_qa_owner_scenarios s))
  then raise exception 'AVATAR_EXISTING_DATA_CHANGED'; end if;
end $avatar_data_postflight$;
insert into supabase_migrations.schema_migrations(version,name,statements)
values(${quote(version)},${quote(HISTORY_NAME)},array[${quote(payload)}]);
do $avatar_history_postflight$ begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version=${quote(version)}
    and name=${quote(HISTORY_NAME)} and statements=array[${quote(payload)}]
    and encode(sha256(convert_to(statements[1],'UTF8')),'hex')=${quote(payloadSha256)})
  then raise exception 'AVATAR_HISTORY_PAYLOAD_MISMATCH'; end if;
end $avatar_history_postflight$;
${commit ? "commit" : "rollback"};
`;
  return {sql,payload,metadata:{projectRef,version,name:HISTORY_NAME,transactionEnd:commit ? "commit" : "rollback",
    executes:false,retries:false,generatedChainSha256:generated.sha256,payloadSha256,envelopeSha256:sha256(sql),sources:generated.sources}};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length >= 2 && args[0] === "--version","Use --version <14 digits> [--sql] [--commit]; no execution supported");
  assert.ok(args.slice(2).every(arg => ["--sql","--commit"].includes(arg)) && new Set(args.slice(2)).size===args.slice(2).length);
  const result = buildQaAvatarHistoryEnvelope({projectRef:QA_PROJECT_REF,version:args[1],commit:args.includes("--commit")});
  process.stdout.write(args.includes("--sql") ? result.sql : JSON.stringify(result.metadata,null,2)+"\n");
}

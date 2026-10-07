// Exact QA release only. Default is read-only metadata; no credentials are read here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadPayloads } from './check-qa-release-migration-payloads-20261007.mjs';

const qa = 'xgxbwqxjssxxuihuwmgy';
const items = loadPayloads();
const args = process.argv.slice(2);
const quote = s => `'${s.replaceAll("'", "''")}'`;
assert(args.length === 0 || (args.length === 2 && args[0] === '--apply' && items.some(x => x.metadata.id === args[1])), 'Use no arguments for metadata, or --apply L1|L2|Q1|Q2|R');
if (!args.length) {
  console.log(JSON.stringify({ target: qa, mode: 'NO_EXECUTION', migrations: items.map(x => x.metadata) }, null, 2));
} else {
  const item = items.find(x => x.metadata.id === args[1]);
  const index = items.indexOf(item);
  const version = item.metadata.file.split('_')[0];
  const name = item.metadata.file.slice(version.length + 1, -4);
  const sql = item.payload.toString();
  const predecessors = items.slice(0,index).map(x => quote(x.metadata.file.split('_')[0]));
  const required = predecessors.length ? `if (select count(*) from supabase_migrations.schema_migrations where version in (${predecessors.join(',')})) <> ${predecessors.length} then raise exception 'QA_PREDECESSOR_MISSING'; end if;` : '';
  const envelope = `begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
lock table supabase_migrations.schema_migrations in exclusive mode;
lock table public.notification_preferences, public.touchline_fixture_recovery in access exclusive mode;
do $guard$ begin
  if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'QA_EXECUTOR_MISMATCH'; end if;
  if exists(select 1 from cron.job where active) then raise exception 'QA_SCHEDULER_ACTIVE'; end if;
  if exists(select 1 from public.football_data_sync_runs where status='running' and started_at>now()-interval '30 minutes') then raise exception 'QA_LIVE_RUN_ACTIVE'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(version)}) then raise exception 'QA_ALREADY_APPLIED_RECONCILE'; end if;
  ${required}
  if (select md5(coalesce(string_agg((to_jsonb(p)-'game_locale'-'game_locale_revision')::text,'' order by user_id),'')) from public.notification_preferences p) <> '4adb7d40b2c8dfedd203dc4942110b7f' then raise exception 'QA_PREFERENCES_PREIMAGE_CHANGED'; end if;
  if (select md5(coalesce(string_agg((to_jsonb(r)-'reservation_id'-'reservation_resolution')::text,'' order by fixture_id),'')) from public.touchline_fixture_recovery r) <> 'c491125aed0a2d3a7e9b88a8c3bcb7e6' then raise exception 'QA_RECOVERY_PREIMAGE_CHANGED'; end if;
end $guard$;
${sql}
insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(version)},${quote(name)},array[${quote(sql)}]);
commit;
select version,name,statements=array[${quote(sql)}] as exact_payload from supabase_migrations.schema_migrations where version=${quote(version)};`;
  // One request, explicit transaction includes history. Never retry automatically.
  // This is NOT passed to apply_migration, which would append its own history.
  const result = execFileSync('supabase', ['db','query','--linked','--project-ref',qa,envelope,'--output','json'], { encoding:'utf8', maxBuffer:1024*1024, stdio:['ignore','pipe','pipe'] });
  const parsed = JSON.parse(result);
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  assert.equal(rows?.length,1,'Unknown commit outcome: reconcile before retry');
  assert.equal(rows[0].version,version);
  assert.equal(rows[0].exact_payload,true,'History differs: stop and reconcile');
  console.log(JSON.stringify({target:qa,id:item.metadata.id,version,payloadSha256:item.metadata.payloadSha256,historyVerified:true,providerEnabled:false}));
}

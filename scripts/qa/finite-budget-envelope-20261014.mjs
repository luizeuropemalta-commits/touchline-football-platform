// Pure, exact-source transaction builder. No network, credentials or automatic apply.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const finiteBudgetTarget = 'xgxbwqxjssxxuihuwmgy';
export const finiteBudgetVersion = '20261013173813';
export const finiteBudgetSourceHash = 'f174b413d931701c8e8be6af4acdffc7a4520cb6b3533dc5ec0ebd84ab50e936';
const quote = value => `'${value.replaceAll("'", "''")}'`;
const expected = [
  ['public.touchline_fantasy_lock_gameweek(uuid)', 'dad617ec72139c768ff6d2a424db40ef', 'e63a0fb2efeb360a9b7d5b9572fa66f2'],
  ['public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)', '3a5e10185c4ade11ad1a614a7c3c9219', 'd5bd059e6700ddf7b7e1908e664f6f9e'],
  ['public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)', '79e40d81cab2590596d0ce2bd1eca94e', 'da7d8159b37aa60d948d76db8201a6ff'],
];

export function finiteBudgetEnvelope(source, projectRef) {
  assert.equal(projectRef, finiteBudgetTarget, 'QA_TARGET_REQUIRED');
  assert.equal(createHash('sha256').update(source).digest('hex'), finiteBudgetSourceHash, 'FINITE_SOURCE_CHANGED');
  const lines = source.split('\n');
  assert.equal(lines[2], 'begin;');
  assert.equal(lines.at(-2), 'commit;');
  const payload = lines.filter((_, index) => index !== 2 && index !== lines.length - 2).join('\n');
  assert(!/^\s*(?:begin|commit|rollback)\s*;/im.test(payload), 'NESTED_TRANSACTION');
  const guard = index => expected.map(item => `if md5(pg_get_functiondef(${quote(item[0])}::regprocedure)) <> ${quote(item[index])} then raise exception 'FINITE_FUNCTION_MISMATCH: %', ${quote(item[0])}; end if;`).join('\n');
  const sql = `begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table supabase_migrations.schema_migrations in exclusive mode;
lock table public.touchline_fantasy_user_gameweeks in share row exclusive mode;
do $preflight$ begin
  if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'QA_EXECUTOR_MISMATCH'; end if;
  if exists(select 1 from cron.job where active) then raise exception 'QA_SCHEDULER_ACTIVE'; end if;
  if exists(select 1 from public.football_data_sync_runs where status='running' and started_at>now()-interval '30 minutes') then raise exception 'QA_SYNC_ACTIVE'; end if;
  if (select max(version) from supabase_migrations.schema_migrations) is distinct from '20261011015000' then raise exception 'QA_HISTORY_CHANGED'; end if;
  ${guard(1)}
end $preflight$;
create temporary table finite_before on commit drop as
select p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef from pg_proc p
where p.oid in (${expected.map(item => `${quote(item[0])}::regprocedure`).join(',')});
create temporary table finite_rows_before on commit drop as
select id,to_jsonb(g) as row from public.touchline_fantasy_user_gameweeks g;
${payload}
do $postflight$ begin
  ${guard(2)}
  if exists(select 1 from finite_before b join pg_proc p on p.oid=b.oid where
    (p.proowner,p.proacl,p.proconfig,p.prosecdef) is distinct from (b.proowner,b.proacl,b.proconfig,b.prosecdef)) then raise exception 'FINITE_SECURITY_CHANGED'; end if;
  if exists((select id,row from finite_rows_before except select id,to_jsonb(g) from public.touchline_fantasy_user_gameweeks g)
    union all (select id,to_jsonb(g) from public.touchline_fantasy_user_gameweeks g except select id,row from finite_rows_before)) then raise exception 'FINITE_ROWS_CHANGED'; end if;
end $postflight$;
insert into supabase_migrations.schema_migrations(version,name,statements)
values (${quote(finiteBudgetVersion)},'touchline_fantasy_finite_plan_budgets',array[${quote(payload)}]);
commit;
select version,name,statements=array[${quote(payload)}] as exact_payload
from supabase_migrations.schema_migrations where version=${quote(finiteBudgetVersion)};`;
  return { sql, payload, sourceSha256: finiteBudgetSourceHash, projectRef, version: finiteBudgetVersion };
}

// Allocate version with `supabase migration new` ONLY if compensation is needed.
// Never remove the original applied history. Valid only before resuming writers.
export function finiteBudgetCompensation(source, projectRef, version, rowsHash) {
  assert.equal(projectRef, finiteBudgetTarget, 'QA_TARGET_REQUIRED');
  assert.match(version, /^\d{14}$/);
  assert(version > finiteBudgetVersion, 'FORWARD_COMPENSATION_REQUIRED');
  assert.match(rowsHash, /^[a-f0-9]{32}$/);
  assert.equal(createHash('sha256').update(source).digest('hex'), '28d2f822001b920e6caf150b35da85f7553a824b0665d59f5efc9c5a69d1c3d2', 'COMPENSATION_SOURCE_CHANGED');
  const lines=source.split('\n');
  assert.equal(lines[2], 'begin;');
  const commit=lines.lastIndexOf('commit;');
  assert(commit>2 && lines.slice(commit+1).every(line=>line===''));
  const payload=lines.filter((_,index)=>index!==2 && index!==commit).join('\n');
  assert(!/^\s*(?:begin|commit|rollback)\s*;/im.test(payload), 'NESTED_TRANSACTION');
  const sql=`begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
lock table supabase_migrations.schema_migrations in exclusive mode;
lock table public.touchline_fantasy_user_gameweeks in share row exclusive mode;
do $compensation$ begin
 if current_database()<>'postgres' or current_user<>'postgres' then raise exception 'QA_EXECUTOR_MISMATCH'; end if;
 if (select max(version) from supabase_migrations.schema_migrations) is distinct from ${quote(finiteBudgetVersion)} then raise exception 'COMPENSATION_HISTORY_CHANGED'; end if;
 if exists(select 1 from cron.job where active) then raise exception 'QA_SCHEDULER_ACTIVE'; end if;
 if (select md5(coalesce(string_agg(to_jsonb(g)::text,'' order by id),'')) from public.touchline_fantasy_user_gameweeks g) <> ${quote(rowsHash)} then raise exception 'COMPENSATION_ROWS_CHANGED'; end if;
end $compensation$;
${payload}
insert into supabase_migrations.schema_migrations(version,name,statements)
values(${quote(version)},'touchline_finite_budget_emergency_compensation',array[${quote(payload)}]);
commit;`;
  return { sql, payload, projectRef, version };
}

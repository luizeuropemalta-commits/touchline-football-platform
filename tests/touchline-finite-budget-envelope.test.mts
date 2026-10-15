import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { finiteBudgetEnvelope, finiteBudgetCompensation, finiteBudgetTarget } from '../scripts/qa/finite-budget-envelope-20261014.mjs';

const source = await readFile(new URL('../supabase/migrations/20261013173813_touchline_fantasy_finite_plan_budgets.sql', import.meta.url), 'utf8');

test('finite budget envelope accepts only the exact reviewed migration and QA target', () => {
  assert.throws(() => finiteBudgetEnvelope(source, 'vxireiswggllwhbsmdcj'), /QA_TARGET_REQUIRED/);
  assert.throws(() => finiteBudgetEnvelope(source + '\n', finiteBudgetTarget), /FINITE_SOURCE_CHANGED/);
  const {sql, payload, version} = finiteBudgetEnvelope(source, finiteBudgetTarget);
  assert.equal(version, '20261013173813');
  assert(!/^\s*(?:begin|commit|rollback)\s*;/im.test(payload));
  const mutation = sql.indexOf('do $migration$');
  const history = sql.indexOf('insert into supabase_migrations.schema_migrations');
  const commit = sql.indexOf('\ncommit;');
  assert(mutation > sql.indexOf('lock table public.touchline_fantasy_user_gameweeks'));
  assert(history > mutation && commit > history);
  for (const guard of ['QA_HISTORY_CHANGED','QA_SCHEDULER_ACTIVE','QA_SYNC_ACTIVE','FINITE_SECURITY_CHANGED','FINITE_ROWS_CHANGED']) assert(sql.includes(guard));
  assert(!/delete from supabase_migrations/i.test(sql));
});

test('compensation refuses wrong target, non-forward history, invalid fingerprint and changed source', () => {
  assert.throws(() => finiteBudgetCompensation('', 'production', '20261015000000', 'a'.repeat(32)), /QA_TARGET_REQUIRED/);
  assert.throws(() => finiteBudgetCompensation('', finiteBudgetTarget, '20261013173813', 'a'.repeat(32)), /FORWARD_COMPENSATION_REQUIRED/);
  assert.throws(() => finiteBudgetCompensation('', finiteBudgetTarget, '20261015000000', 'invalid'));
  assert.throws(() => finiteBudgetCompensation('', finiteBudgetTarget, '20261015000000', 'a'.repeat(32)), /COMPENSATION_SOURCE_CHANGED/);
});

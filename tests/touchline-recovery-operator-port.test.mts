import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecoveryOperatorPort } from '../tools/quota-recovery/operator-port.mjs';
const config = { accountScope: 'central', expectedRole: 'postgres', database: 'postgres', timeoutMs: 300 };
const args = { caseId: '11111111-1111-4111-8111-111111111111', workerId: 'qa-recovery',
  requestId: '22222222-2222-4222-8222-222222222222', endpoint: 'team', budgetMs: 18000 };
const token = '33333333-3333-4333-8333-333333333333';
function harness(mode = 'ok') {
  const events: string[] = []; let count = 0;
  const make = () => {
    const id = ++count;
    return {
      on() {}, async connect() { events.push(`${id}:connect`); }, async end() { events.push(`${id}:end`); },
      async query(sql: string, values?: unknown[]) {
        events.push(`${id}:${sql === 'COMMIT' ? 'commit' : sql === 'BEGIN' ? 'begin' : sql.includes('pg_backend_pid') ? 'identity' : sql.includes('valid_lease') ? 'observe' : sql.includes('admit_recovery') ? 'admit' : sql.includes('complete_recovery') ? 'complete' : 'check'}`);
        if (sql.includes('pg_backend_pid')) return { rows: [{ database: 'postgres', role: mode === 'role' ? 'service_role' : 'postgres', session_role: 'postgres', fsync: mode === 'fsync' ? 'off' : 'on', pid: mode === 'same-backend' ? 1 : id }] };
        if (sql.includes("current_setting('synchronous_commit')")) return { rows: [{ sync: 'on' }] };
        if (sql.includes('select c.account_scope')) return { rows: [{ account_scope: mode === 'scope' ? 'other' : 'central' }] };
        if (sql.includes('admit_recovery')) { assert.deepEqual(values, [args.caseId, args.workerId, args.requestId, args.endpoint, args.budgetMs]); return { rows: [{ result: mode === 'denied' ? { allowed: false } : { allowed: true, token } }] }; }
        if (sql.includes('complete_recovery')) return { rows: [{ result: { persisted: true } }] };
        if (sql === 'COMMIT') {
          if (mode === 'lost-commit') throw Error('secret');
          if (mode === 'hanging-commit') return new Promise(() => {});
          return { command: mode === 'rollback' ? 'ROLLBACK' : 'COMMIT', rows: [] };
        }
        if (sql.includes('valid_lease')) {
          assert.ok(events.indexOf('1:commit') < events.indexOf('2:observe'));
          return { rows: [{ request_id: args.requestId, owner_worker_id: args.workerId, endpoint: args.endpoint,
            token, case_id: args.caseId, account_scope: 'central', enabled: false, blocked_unknown: true,
            workers_off: true, valid_lease: mode !== 'expired', expected_state: true }] };
        }
        return { rows: [], command: 'SET' };
      },
    };
  };
  return { events, make, count: () => count };
}
test('admission waits COMMIT then independent committed lease observation; closes both clients', async () => {
  const h = harness(), port = createRecoveryOperatorPort(config, h.make);
  assert.deepEqual(await port.admit(args), { allowed: true, token });
  assert.equal(h.count(), 2); assert.ok(h.events.indexOf('1:commit') < h.events.indexOf('2:connect'));
  assert.ok(h.events.includes('1:end')); assert.ok(h.events.includes('2:end'));
});
test('uncertain COMMIT, wrong identity/scope, stale lease and same backend never return permission or retry', async () => {
  for (const mode of ['lost-commit', 'rollback', 'role', 'fsync', 'scope', 'expired', 'same-backend']) {
    const h = harness(mode);
    await assert.rejects(createRecoveryOperatorPort(config, h.make).admit(args), { message: 'Recovery operator unavailable.' });
    assert.ok(h.events.filter(e => e === '1:admit').length <= 1);
    if (mode === 'lost-commit' || mode === 'rollback') assert.equal(h.count(), 1);
    assert.ok(h.events.includes('1:end'));
  }
});
test('denial commits without observer; completion also waits commit and never exposes observation', async () => {
  const h = harness('denied');
  assert.deepEqual(await createRecoveryOperatorPort(config, h.make).admit(args), { allowed: false }); assert.equal(h.count(), 1);
  const completionArgs = { caseId: args.caseId, workerId: args.workerId, requestId: args.requestId, endpoint: args.endpoint };
  for (const mode of ['ok', 'lost-commit']) {
    const c = harness(mode), work = createRecoveryOperatorPort(config, c.make).complete({ ...completionArgs, token, observation: { private: 'secret' } });
    if (mode === 'ok') assert.deepEqual(await work, { persisted: true });
    else await assert.rejects(work, { message: 'Recovery operator unavailable.' });
    assert.equal(c.count(), 1); assert.ok(c.events.includes('1:commit')); assert.ok(c.events.includes('1:end'));
  }
});
test('abort and deadline fence hanging COMMIT and close dedicated connection without another query', async () => {
  for (const abort of [false, true]) {
    const h = harness('hanging-commit'), controller = new AbortController();
    const work = createRecoveryOperatorPort({ ...config, timeoutMs: 100 }, h.make).admit(args, controller.signal);
    if (abort) { await new Promise(resolve => setTimeout(resolve, 5)); controller.abort(); }
    await assert.rejects(work, { message: 'Recovery operator unavailable.' });
    assert.equal(h.count(), 1); assert.equal(h.events.at(-1), '1:end');
    assert.equal(h.events.filter(e => e === '1:commit').length, 1);
  }
});
test('invalid configuration/input and pre-abort create no connection', async () => {
  const h = harness();
  for (const delta of [{ expectedRole: 'service_role' }, { accountScope: '../bad' }, { database: 'postgres;select' }, { timeoutMs: 5001 }, { sql: 'free SQL' }]) {
    assert.throws(() => createRecoveryOperatorPort({ ...config, ...delta }, h.make), /Recovery operator unavailable/);
  }
  const port = createRecoveryOperatorPort(config, h.make);
  await assert.rejects(port.admit({ ...args, endpoint: 'team;drop' }));
  const controller = new AbortController(); controller.abort(); await assert.rejects(port.admit(args, controller.signal));
  assert.equal(h.count(), 0);
});

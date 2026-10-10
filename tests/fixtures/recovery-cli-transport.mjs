// Subprocess-only driver/HTTP fixture. Business code and CLI remain real.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const mode = process.env.RECOVERY_TEST_MODE;
const events = [];
let clients = 0, admission;
const token = '33333333-3333-4333-8333-333333333333';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'pg') return { url: import.meta.url, shortCircuit: true };
  return next(specifier, context);
} });
export class Client {
  constructor(config) {
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.host, 'db.abcdefghijklmnopqrst.supabase.co');
    assert.equal(config.options, '-c timezone=UTC');
    this.id = ++clients;
  }
  on() {}
  async connect() { events.push(`${this.id}:connect`); }
  async end() { events.push(`${this.id}:end`); }
  async query(sql, values) {
    if (sql.includes('pg_backend_pid')) return { rows: [{ database: 'postgres', role: 'postgres', session_role: 'postgres', fsync: 'on', pid: this.id }] };
    if (sql.includes("current_setting('synchronous_commit')")) return { rows: [{ sync: 'on' }] };
    if (sql.includes('select c.account_scope')) return { rows: [{ account_scope: 'shared-account' }] };
    if (sql.includes('admit_recovery_measurement')) {
      events.push('admit'); admission = values;
      return { rows: [{ result: mode === 'deny' ? { allowed: false } : { allowed: true, token } }] };
    }
    if (sql.includes('complete_recovery_measurement')) {
      events.push('complete');
      assert.deepEqual(values.slice(0, 4), admission.slice(0, 4));
      assert.equal(values[4], token);
      assert.equal(JSON.parse(values[5]).remaining, 1500);
      return { rows: [{ result: { persisted: true } }] };
    }
    if (sql === 'COMMIT') {
      events.push(`${this.id}:commit`);
      if (mode === 'lost-admission' && this.id === 1 || mode === 'lost-completion' && this.id === 3) {
        throw Error('synthetic-db-password synthetic-provider-token');
      }
      return { command: 'COMMIT', rows: [] };
    }
    if (sql.includes('valid_lease')) {
      events.push('observe');
      assert.ok(events.includes('1:commit'));
      return { rows: [{ request_id: admission[2], owner_worker_id: admission[1], endpoint: admission[3], token,
        case_id: admission[0], account_scope: 'shared-account', enabled: false, blocked_unknown: true,
        workers_off: true, valid_lease: mode !== 'expired', expected_state: true }] };
    }
    assert.ok(sql === 'BEGIN' || sql.startsWith('SET LOCAL'));
    return { rows: [], command: 'SET' };
  }
}
globalThis.fetch = async (input, init) => {
  events.push('http');
  assert.ok(events.includes('observe'));
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.sportmonks.com');
  assert.equal(url.pathname, '/v3/football/teams/19');
  assert.equal(init.redirect, 'error');
  return Response.json({ data: { private: 'football-payload-must-not-escape' },
    rate_limit: { requested_entity: 'Team', remaining: 1500, resets_in_seconds: 120 } });
};
process.once('beforeExit', () => process.stderr.write(`TEST_EVENTS:${JSON.stringify(events)}\n`));

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const env = { TOUCHLINE_RECOVERY_OPERATOR_ENABLED: 'true', TOUCHLINE_RECOVERY_CENTRAL_PROJECT_REF: 'abcdefghijklmnopqrst',
  TOUCHLINE_RECOVERY_DB_HOST: 'db.abcdefghijklmnopqrst.supabase.co', TOUCHLINE_RECOVERY_DB_USER: 'postgres',
  TOUCHLINE_RECOVERY_DB_MODE: 'direct', TOUCHLINE_RECOVERY_DB_PASSWORD: 'synthetic-db-password',
  TOUCHLINE_RECOVERY_DB_PORT: '5432', TOUCHLINE_RECOVERY_ACCOUNT_SCOPE: 'shared-account',
  TOUCHLINE_RECOVERY_SPORTMONKS_TOKEN: 'synthetic-provider-token' };
for (const mode of ['success', 'deny', 'lost-admission', 'expired', 'lost-completion']) {
  test(`actual recovery CLI through operator and measurement with transport fixture: ${mode}`, () => {
    const child = spawnSync(process.execPath, ['--conditions=react-server', '--experimental-strip-types',
      '--import', './tests/fixtures/recovery-cli-transport.mjs', 'tools/quota-recovery/measure.mjs',
      '--measure-single', '--case', '11111111-1111-4111-8111-111111111111', '--worker', 'qa-recovery', '--path', '/teams/19'], {
      cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'test', NODE_OPTIONS: '--max-old-space-size=128', ...env, RECOVERY_TEST_MODE: mode },
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(child.error, undefined); assert.equal(child.signal, null);
    assert.equal(child.status, mode === 'success' ? 0 : 1, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.state, mode === 'success' ? 'recorded' : mode === 'deny' ? 'denied' : 'unavailable');
    const events: string[] = JSON.parse(child.stderr.trim().replace(/^TEST_EVENTS:/, ''));
    assert.equal(events.filter(e => e === 'admit').length, 1);
    const sent = ['success', 'lost-completion'].includes(mode);
    assert.equal(events.filter(e => e === 'http').length, sent ? 1 : 0);
    assert.equal(events.filter(e => e === 'complete').length, sent ? 1 : 0);
    if (sent) {
      assert.ok(events.indexOf('1:commit') < events.indexOf('observe'));
      assert.ok(events.indexOf('observe') < events.indexOf('http'));
      assert.ok(events.indexOf('http') < events.indexOf('3:commit'));
      assert.ok(events.includes('3:end'));
    }
    assert.ok(events.includes('1:end'));
    assert.doesNotMatch(child.stdout + child.stderr, /synthetic-db-password|synthetic-provider-token|football-payload-must-not-escape/);
    assert.equal(Object.hasOwn(result, 'observation'), mode === 'success');
  });
}

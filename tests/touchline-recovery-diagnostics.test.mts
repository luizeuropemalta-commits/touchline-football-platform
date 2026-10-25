import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { diagnoseRecoveryOperatorConfig, readRecoveryArguments } from '../tools/quota-recovery/config.mjs';

const environment = {
  TOUCHLINE_RECOVERY_OPERATOR_ENABLED: 'true',
  TOUCHLINE_RECOVERY_CENTRAL_PROJECT_REF: 'abcdefghijklmnopqrst',
  TOUCHLINE_RECOVERY_DB_MODE: 'direct',
  TOUCHLINE_RECOVERY_DB_HOST: 'db.abcdefghijklmnopqrst.supabase.co',
  TOUCHLINE_RECOVERY_DB_PORT: '5432', TOUCHLINE_RECOVERY_DB_USER: 'postgres',
  TOUCHLINE_RECOVERY_DB_PASSWORD: 'test-database-secret',
  TOUCHLINE_RECOVERY_ACCOUNT_SCOPE: 'test-scope',
  TOUCHLINE_RECOVERY_SPORTMONKS_TOKEN: 'test-provider-secret',
};

test('diagnosis never treats site credentials as a configured operator or missing hosted secrets', () => {
  const result = diagnoseRecoveryOperatorConfig({ SPORTMONKS_API_TOKEN: 'test-site-token', SUPABASE_SERVICE_ROLE_KEY: 'test-site-key' });
  assert.equal(result.scope, 'current-process-only');
  assert.equal(result.hostedConfiguration, 'not-inspected');
  assert.equal(result.configured, false);
  assert.equal(result.reason, 'operator-environment-incomplete');
  assert.equal(result.missing.length, 9);
  assert.deepEqual(result.siteBindingsPresent, { sportmonksApiToken: true, supabaseServiceRoleKey: true });
  assert.equal(result.siteCredentialsUsedAsFallback, false);
  assert.doesNotMatch(JSON.stringify(result), /test-site-token|test-site-key/);
});

test('diagnosis separates configuration from connection and validation from absence', () => {
  const valid = diagnoseRecoveryOperatorConfig(environment);
  assert.equal(valid.configured, true); assert.deepEqual(valid.missing, []);
  assert.equal(valid.connected, false); assert.equal(valid.measured, false);
  for (const delta of [{ TOUCHLINE_RECOVERY_OPERATOR_ENABLED: 'false' }, { TOUCHLINE_RECOVERY_DB_PORT: '6543' },
    { TOUCHLINE_RECOVERY_DB_PASSWORD: 'short' }, { TOUCHLINE_RECOVERY_DB_CA_PEM: 'bad-private-ca' }]) {
    const invalid = diagnoseRecoveryOperatorConfig({ ...environment, ...delta });
    assert.equal(invalid.configured, false); assert.deepEqual(invalid.missing, []);
    assert.equal(invalid.reason, 'operator-configuration-rejected');
    assert.doesNotMatch(JSON.stringify(invalid), /test-database-secret|test-provider-secret|bad-private-ca/);
  }
});

test('diagnose flag cannot be combined with measurement or SQL', () => {
  assert.deepEqual(readRecoveryArguments(['--diagnose']), { mode: 'diagnose' });
  for (const args of [['--diagnose', '--check'], ['--diagnose', '--measure-single'], ['--diagnose', '--sql']]) {
    assert.throws(() => readRecoveryArguments(args));
  }
});

test('actual diagnostic CLI only prints presence and performs no connection', () => {
  for (const configured of [false, true]) {
    const child = spawnSync(process.execPath, ['tools/quota-recovery/measure.mjs', '--diagnose'], {
      cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH,
        SPORTMONKS_API_TOKEN: 'test-site-token', SUPABASE_SERVICE_ROLE_KEY: 'test-site-key',
        ...(configured ? environment : {}) }, encoding: 'utf8', timeout: 3000,
    });
    assert.equal(child.error, undefined); assert.equal(child.status, configured ? 0 : 1);
    assert.equal(child.stderr, '');
    const result = JSON.parse(child.stdout);
    assert.equal(result.configured, configured); assert.equal(result.connected, false);
    assert.equal(result.measured, false);
    assert.doesNotMatch(child.stdout, /test-site-token|test-site-key|test-database-secret|test-provider-secret/);
  }
});

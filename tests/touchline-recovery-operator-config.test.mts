import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readRecoveryOperatorConfig, readRecoveryArguments } from '../tools/quota-recovery/config.mjs';
const ref = 'abcdefghijklmnopqrst';
const env = { TOUCHLINE_RECOVERY_OPERATOR_ENABLED: 'true', TOUCHLINE_RECOVERY_CENTRAL_PROJECT_REF: ref,
  TOUCHLINE_RECOVERY_DB_HOST: `db.${ref}.supabase.co`, TOUCHLINE_RECOVERY_DB_USER: 'postgres',
  TOUCHLINE_RECOVERY_DB_MODE: 'direct', TOUCHLINE_RECOVERY_DB_PASSWORD: 'synthetic-db-password',
  TOUCHLINE_RECOVERY_DB_PORT: '5432', TOUCHLINE_RECOVERY_ACCOUNT_SCOPE: 'shared-account',
  TOUCHLINE_RECOVERY_SPORTMONKS_TOKEN: 'synthetic-provider-token' };
test('operator explicitly binds direct or session connection, TLS and database without ambient PG fallback', () => {
  const result = readRecoveryOperatorConfig({ ...env, PGHOST: 'evil.invalid', PGPASSWORD: 'evil', PGSSLMODE: 'disable', PGOPTIONS: '-c role=other' });
  assert.equal(result.database.host, env.TOUCHLINE_RECOVERY_DB_HOST);
  assert.equal(result.database.password, env.TOUCHLINE_RECOVERY_DB_PASSWORD);
  assert.equal(result.database.database, 'postgres'); assert.equal(result.database.ssl.rejectUnauthorized, true);
  assert.equal(result.database.ssl.servername, result.database.host);
  assert.equal(result.database.options, '-c timezone=UTC');
  assert.equal(Object.isFrozen(result.database.ssl), true);
  const session = readRecoveryOperatorConfig({ ...env, TOUCHLINE_RECOVERY_DB_MODE: 'session',
    TOUCHLINE_RECOVERY_DB_HOST: 'aws-0-eu-west-1.pooler.supabase.com', TOUCHLINE_RECOVERY_DB_USER: `postgres.${ref}` });
  assert.equal(session.database.port, 5432); assert.equal(session.database.user, `postgres.${ref}`);
});
test('OFF, wrong scope/project/port/user/host/mode/CA and token reuse fail closed', () => {
  for (const change of [ { TOUCHLINE_RECOVERY_OPERATOR_ENABLED: 'false' }, { TOUCHLINE_RECOVERY_DB_PORT: '6543' },
    { TOUCHLINE_RECOVERY_DB_USER: 'service_role' }, { TOUCHLINE_RECOVERY_DB_HOST: 'localhost' },
    { TOUCHLINE_RECOVERY_CENTRAL_PROJECT_REF: 'other' }, { TOUCHLINE_RECOVERY_ACCOUNT_SCOPE: '../x' },
    { TOUCHLINE_RECOVERY_DB_MODE: 'transaction' }, { TOUCHLINE_RECOVERY_DB_CA_PEM: 'bad-ca' },
    { TOUCHLINE_RECOVERY_DB_PASSWORD: env.TOUCHLINE_RECOVERY_SPORTMONKS_TOKEN },
    { TOUCHLINE_RECOVERY_DB_HOST: `db.${ref}.supabase.co.evil.invalid` } ]) {
    assert.throws(() => readRecoveryOperatorConfig({ ...env, ...change }), /configuration unavailable/);
  }
  assert.throws(() => readRecoveryOperatorConfig({ PGHOST: 'localhost' }), /configuration unavailable/);
});
test('CLI only accepts offline check or a single explicit case/worker/path; no SQL/activation/retry flags', () => {
  assert.deepEqual(readRecoveryArguments(['--check']), { mode: 'check' });
  const args = ['--measure-single', '--case', '12345678-1234-4234-8234-123456789abc', '--worker', 'qa-recovery', '--path', '/teams/19'];
  assert.equal(readRecoveryArguments(args).mode, 'measure');
  for (const bad of [[], ['--activate'], ['--check', '--sql', 'select 1'], [...args, '--retry'],
    [...args.slice(0, 6), 'https://evil.invalid'], [...args.slice(0, 6), '/teams/19?api_token=x']]) {
    assert.throws(() => readRecoveryArguments(bad), /configuration unavailable/);
  }
});
test('offline check runs without pg installed or remote connection and never prints credentials', () => {
  const child = spawnSync(process.execPath, ['tools/quota-recovery/measure.mjs', '--check'], {
    cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env }, encoding: 'utf8', timeout: 3000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { configured: true, connected: false, measured: false });
  assert.equal(child.stderr, '');
  const off = spawnSync(process.execPath, ['tools/quota-recovery/measure.mjs', '--check'], {
    cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 3000 });
  assert.equal(off.status, 1); assert.equal(off.stdout, ''); assert.match(off.stderr, /no automatic retry/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createLocalRehearsalRuntime } from './helpers/local-rehearsal-runtime.ts';

test('missing native override selects the injected in-memory factory exactly once', () => {
  let calls = 0;
  const fake = Object.freeze({ kind: 'synthetic-memory-only' });
  assert.equal(createLocalRehearsalRuntime(undefined, () => { calls++; return fake; }), fake);
  assert.equal(calls, 1);
});

test('any defined override fails before invoking a runtime factory and does not expose its value', () => {
  for (const override of ['', ' ', 'postgres://localhost/disposable', 'postgres://user:synthetic-secret@remote.invalid/real', 'not-a-url']) {
    let calls = 0;
    assert.throws(() => createLocalRehearsalRuntime(override, () => { calls++; return {}; }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^TOUCHLINE_NATIVE_REHEARSAL_DISABLED:/);
      assert.doesNotMatch(error.message, /synthetic-secret|remote\.invalid|postgres:\/\//);
      return true;
    });
    assert.equal(calls, 0);
  }
});

test('SQL test delegates only to guarded PGlite factory, without loading its SQL module', () => {
  const source = readFileSync(new URL('./touchline-qa-atomic-rehearsal-pglite.test.mts', import.meta.url), 'utf8');
  assert.match(source, /createLocalRehearsalRuntime\(process\.env\.TOUCHLINE_QA_NATIVE_REHEARSAL_URL, \(\) => new PGlite\(\)\)/);
  assert.doesNotMatch(source, /createRequire|require\(["']pg["']\)|new Client\(|client\.connect\(/);
});

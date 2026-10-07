import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import { hasTouchLineArenaAccess } from '../lib/touchlineArena/auth-access.ts';

const accountId = '11111111-1111-4111-8111-111111111111';
const eligibleUser = { id: accountId, app_metadata: { touchline_arena_access_v1: true } };
const isolatedHeader = 'x-touchline-isolated-preview';
type Context = { mode: 'demo' | 'guest' | 'unavailable' } | { mode: 'account'; accountId: string };
type Module = { loadAccountLocaleContext(options?: { demonstration?: boolean }): Promise<Context> };
type Options = {
  dataSource?: 'direct' | 'qa-mirror' | 'invalid';
  isolated?: boolean;
  user?: unknown;
  error?: unknown;
  authResult?: unknown;
  clientMissing?: boolean;
  clientThrows?: boolean;
  authThrows?: boolean;
  headersThrow?: boolean;
  sourceThrows?: boolean;
  authPromise?: Promise<unknown>;
};

async function harness(options: Options = {}) {
  const calls: string[] = [];
  const forbidden: string[] = [];
  let timerSequence = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const deadlineSource = await readFile(new URL('../lib/touchlineArena/server-read-deadline.ts', import.meta.url), 'utf8');
  const deadlineExports: Record<string, unknown> = {};
  vm.runInNewContext(ts.transpileModule(deadlineSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: deadlineExports,
    setTimeout(callback: () => void, delay: number) { const id = ++timerSequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  const imports: Record<string, unknown> = {
    'server-only': {},
    'next/headers': { headers: async () => {
      calls.push('headers');
      if (options.headersThrow) throw new Error('synthetic header failure');
      return { get: (name: string) => {
        calls.push(`header:${name}`);
        assert.equal(name, isolatedHeader, 'do not infer account identity or language from headers');
        return options.isolated ? 'isolated-test-marker' : null;
      } };
    } },
    '@/lib/touchlineMirror/runtime': { resolveTouchlineDataSource: () => {
      calls.push('data-source');
      if (options.sourceThrows) throw new Error('synthetic source failure');
      return options.dataSource ?? 'direct';
    } },
    '@/lib/touchlinePreview/isolation': {
      TOUCHLINE_ISOLATED_PREVIEW_HEADER: isolatedHeader,
      isTouchlineIsolatedPreviewRequest: (value: unknown) => {
        calls.push('isolation');
        assert.equal(value, options.isolated ? 'isolated-test-marker' : null);
        return options.isolated === true;
      },
    },
    '@/lib/touchlineArena/auth-access': { hasTouchLineArenaAccess },
    '@/lib/supabase/server': { createClient: async () => {
      calls.push('create-client');
      if (options.clientThrows) throw new Error('synthetic client failure');
      if (options.clientMissing) return null;
      return {
        auth: {
          getUser: async () => {
            calls.push('get-user');
            if (options.authThrows) throw new Error('synthetic auth failure');
            if (options.authPromise) return await options.authPromise;
            return Object.hasOwn(options, 'authResult') ? options.authResult : {
              data: { user: Object.hasOwn(options, 'user') ? options.user : eligibleUser },
              error: options.error ?? null,
            };
          },
          getSession: () => { forbidden.push('get-session'); throw new Error('session is not authoritative'); },
        },
        from: () => { forbidden.push('table'); throw new Error('no preference reads or writes'); },
        rpc: () => { forbidden.push('rpc'); throw new Error('no preference RPC'); },
      };
    } },
    '@supabase/supabase-js': { AuthSessionMissingError },
    '@/lib/touchlineArena/server-read-deadline': deadlineExports,
  };
  const source = await readFile(new URL('../lib/touchlineArena/account-locale-context-server.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name: string) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  } });
  const loaded = exports as Module;
  assert.equal(typeof loaded.loadAccountLocaleContext, 'function');
  assert.deepEqual(calls, [], 'module loading has no authentication or header side effects');
  return { calls, timers, expire() {
    for (const [id, timer] of timers) { timers.delete(id); timer.callback(); }
  }, run: async (input?: { demonstration?: boolean }) => {
    const result = await loaded.loadAccountLocaleContext(input);
    assert.deepEqual(forbidden, [], 'context loading must not access sessions, preferences or RPCs');
    return JSON.parse(JSON.stringify(result)) as Context;
  } };
}

test('explicit demonstration context returns demo before headers, data-source or authentication work', async () => {
  const h = await harness({ headersThrow: true, clientThrows: true });
  assert.deepEqual(await h.run({ demonstration: true }), { mode: 'demo' });
  assert.deepEqual(h.calls, []);
});

async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('never-settling auth reaches the finite deadline and returns unavailable, never guest', async () => {
  const h = await harness({ authPromise: new Promise(() => {}) });
  let result: Context | undefined;
  const reading = h.run().then(value => { result = value; }); await flush();
  assert.equal(result, undefined);
  assert.equal(h.timers.size, 1, 'a stalled getUser must have one application deadline');
  assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [8000]);
  h.expire(); await reading;
  assert.deepEqual(result, { mode: 'unavailable' }); assert.equal(h.timers.size, 0);
  assert.equal(h.calls.filter(call => call === 'get-user').length, 1);
});

test('a late valid or guest auth receipt cannot change a timed-out unavailable result', async () => {
  for (const user of [eligibleUser, null]) {
    const pending = deferred<unknown>();
    const h = await harness({ authPromise: pending.promise });
    let completions = 0;
    const reading = h.run().then(value => { completions++; return value; }); await flush();
    assert.equal(h.timers.size, 1); h.expire();
    const result = await reading;
    pending.resolve({ data: { user }, error: null }); await flush();
    assert.deepEqual(result, { mode: 'unavailable' }); assert.equal(completions, 1);
    assert.equal(h.timers.size, 0); assert.equal(h.calls.filter(call => call === 'get-user').length, 1);
  }
});

test('successful and rejected auth clear their deadline; demo never creates one', async () => {
  for (const options of [{}, { authThrows: true }]) {
    const h = await harness(options); const result = await h.run(); await flush();
    assert.deepEqual(result, options.authThrows ? { mode: 'unavailable' } : { mode: 'account', accountId });
    assert.equal(h.timers.size, 0);
  }
  const demo = await harness({ authPromise: new Promise(() => {}) });
  assert.deepEqual(await demo.run({ demonstration: true }), { mode: 'demo' });
  assert.deepEqual(demo.calls, []); assert.equal(demo.timers.size, 0);
});

test('QA mirror is demo and invalid data-source is unavailable without headers or authentication', async () => {
  for (const dataSource of ['qa-mirror', 'invalid'] as const) {
    const h = await harness({ dataSource, headersThrow: true, clientThrows: true });
    assert.deepEqual(await h.run(), { mode: dataSource === 'qa-mirror' ? 'demo' : 'unavailable' });
    assert.deepEqual(h.calls, ['data-source']);
  }
});

test('direct isolated preview returns demo after isolation check without authenticating', async () => {
  const h = await harness({ isolated: true, clientThrows: true });
  assert.deepEqual(await h.run(), { mode: 'demo' });
  assert.deepEqual(h.calls, ['data-source', 'headers', `header:${isolatedHeader}`, 'isolation']);
});

test('direct eligible authenticated UUID owner returns only account context and canonical account identity', async () => {
  const h = await harness();
  assert.deepEqual(await h.run({ demonstration: false }), { mode: 'account', accountId });
  assert.deepEqual(h.calls, ['data-source', 'headers', `header:${isolatedHeader}`, 'isolation', 'create-client', 'get-user']);
});

test('authoritative null user with no error is guest, without account or inferred locale', async () => {
  const h = await harness({ user: null });
  assert.deepEqual(await h.run(), { mode: 'guest' });
  assert.equal(h.calls.filter(call => call === 'get-user').length, 1);
});

test('explicit AuthSessionMissingError is guest only when there is no user', async () => {
  const missing = await harness({ user: null, error: new AuthSessionMissingError() });
  assert.deepEqual(await missing.run(), { mode: 'guest' });
  const contradictory = await harness({ user: eligibleUser, error: new AuthSessionMissingError() });
  assert.deepEqual(await contradictory.run(), { mode: 'unavailable' });
});

test('auth errors and throws are unavailable, never guest fallback even if a user was returned', async () => {
  for (const user of [null, eligibleUser]) {
    for (const error of [new Error('transport failed'), { name: 'AuthApiError', status: 401, message: 'expired token' },
      { name: 'AuthRetryableFetchError', message: 'upstream unavailable' }, { message: 'Auth session missing!' }]) {
      const h = await harness({ user, error });
      assert.deepEqual(await h.run(), { mode: 'unavailable' });
    }
  }
  const thrown = await harness({ authThrows: true });
  assert.deepEqual(await thrown.run(), { mode: 'unavailable' });
});

test('missing or failing client and request context remain unavailable without guessing guest', async () => {
  for (const options of [{ clientMissing: true }, { clientThrows: true }, { headersThrow: true }, { sourceThrows: true }]) {
    const h = await harness(options);
    assert.deepEqual(await h.run(), { mode: 'unavailable' });
    assert.equal(h.calls.includes('get-user'), false);
  }
});

test('ineligible users and malformed account IDs cannot become account or guest contexts', async () => {
  const users: unknown[] = [{ id: accountId }, { id: accountId, app_metadata: { touchline_arena_access_v1: false } },
    { id: accountId, app_metadata: { touchline_arena_access_v1: 'true' } },
    ...[undefined, null, '', 'owner', '11111111-1111-4111-8111-11111111111',
      ' ' + accountId, accountId + ' ', 1, [], {}].map(id => ({ ...eligibleUser, id }))];
  for (const user of users) {
    const h = await harness({ user });
    assert.deepEqual(await h.run(), { mode: 'unavailable' });
  }
});

test('malformed getUser envelopes are unavailable rather than an anonymous-session assertion', async () => {
  for (const authResult of [undefined, null, {}, [], { data: null, error: null },
    { data: {}, error: null }, { data: { user: undefined }, error: null }]) {
    const h = await harness({ authResult });
    assert.deepEqual(await h.run(), { mode: 'unavailable' });
  }
});

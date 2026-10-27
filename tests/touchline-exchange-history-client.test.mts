import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readExchangeHistory } from '../lib/touchlineFantasy/exchange-history-client.ts';
import { requestClubCollection } from '../lib/touchlineFantasy/club-collection-request.ts';

const accountId = '10000000-0000-4000-8000-000000000001';
const seasonId = '10000000-0000-4000-8000-000000000002';
const scope = { ready: true, accountId, seasonId, collectionRevision: 7 };
const history = { version: 1, status: 'confirmed', accountId, seasonId, collectionRevision: 7,
  coverage: 'complete', seasonNegotiationIncomeTc: 0, receipts: [] };
const response = (payload: unknown, status = 200) => ({ response: new Response(null, { status }), payload });

test('history uses only authenticated no-store GET and requires the exact expected context', async () => {
  let count = 0;
  const result = await readExchangeHistory(scope, undefined, async (path, options, timeout) => {
    count++;
    assert.equal(path, `/api/touchline-fantasy/exchange/history?expectedSeasonId=${seasonId}`);
    assert.equal(options?.method, 'GET'); assert.equal(options?.credentials, 'same-origin');
    assert.equal(options?.cache, 'no-store'); assert.equal(options?.body, undefined);
    assert.deepEqual(options?.headers, { 'X-Touchline-Account': accountId });
    assert.equal(timeout, 20_000);
    return response({ ok: true, history });
  });
  assert.equal(count, 1); assert.deepEqual(result, history);
  for (const invalid of [{ ...scope, ready: false }, { ...scope, accountId: undefined },
    { ...scope, seasonId: 'unknown' }, { ...scope, collectionRevision: -1 }]) {
    assert.equal(await readExchangeHistory(invalid, undefined, async () => { throw new Error('must not fetch'); }), null);
  }
});

test('errors, absent ledger and mismatched account/season/revision never become zero income', async () => {
  for (const status of [401, 403, 409, 503]) {
    assert.equal(await readExchangeHistory(scope, undefined, async () => response({ ok: true, history }, status)), null);
  }
  for (const payload of [{}, { ok: false, history }, { ok: true, history: null },
    { ok: true, history: { ...history, accountId: seasonId } },
    { ok: true, history: { ...history, seasonId: accountId } },
    { ok: true, history: { ...history, collectionRevision: 8 } }]) {
    assert.equal(await readExchangeHistory(scope, undefined, async () => response(payload)), null);
  }
});

test('closing a read before its response or body arrives discards it without retries', async () => {
  const controller = new AbortController();
  let resolve!: (value: ReturnType<typeof response>) => void;
  const pending = readExchangeHistory(scope, controller.signal, () => new Promise(done => { resolve = done; }));
  controller.abort(); resolve(response({ ok: true, history }));
  assert.equal(await pending, null);
});

test('the shared deadline covers a hanging JSON body as well as fetch', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return { status: 200, ok: true, json: () => new Promise(() => {}) } as unknown as Response;
  }) as typeof fetch;
  try {
    assert.equal(await readExchangeHistory(scope, undefined, (path, options) => requestClubCollection(path, options, 10)), null);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('mounted history hides the previous account immediately and ignores late/unmounted responses', async () => {
  const source = readFileSync(new URL('../components/touchline/market/useExchangeHistory.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let state: unknown = null;
  let effect: (() => (() => void) | undefined) | undefined;
  const requests: { signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
  const exports: { useExchangeHistory?: (enabled: boolean, value: typeof scope) => unknown } = {};
  runInNewContext(js, { exports, AbortController, require: (name: string) => {
    if (name === 'react') return {
      useState: () => [state, (next: unknown) => { state = next; }],
      useEffect: (next: typeof effect) => { effect = next; },
    };
    if (name === '@/lib/touchlineFantasy/exchange-history-client') return {
      readExchangeHistory: (_scope: unknown, signal: AbortSignal) => new Promise(resolve => requests.push({ signal, resolve })),
    };
    throw new Error(name);
  } });
  const render = exports.useExchangeHistory!;
  assert.equal(render(true, scope), null);
  const cleanup = effect!()!;
  requests[0].resolve(history); await Promise.resolve();
  assert.equal(render(true, scope), history);
  const next = { ...scope, accountId: seasonId };
  assert.equal(render(true, next), null, 'old account must not render while effect cleanup waits');
  cleanup();
  const cleanupNext = effect!()!;
  assert.equal(requests[0].signal.aborted, true);
  cleanupNext(); requests[1].resolve({ ...history, accountId: seasonId }); await Promise.resolve();
  assert.equal(render(true, next), null);
  assert.equal(render(false, scope), null);
});

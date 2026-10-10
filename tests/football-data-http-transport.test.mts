import assert from 'node:assert/strict';
import test from 'node:test';
import { footballDataFetchJson } from '../lib/football-data/http.ts';

test('server transport override stays private and absence preserves global fetch', async () => {
  const original = globalThis.fetch;
  let ambient = 0, injected = 0;
  globalThis.fetch = async () => { ambient++; return Response.json({ source: 'ambient' }); };
  const fetchImpl: typeof fetch = async (_input, init) => {
    injected++;
    assert.equal(Object.hasOwn(init!, 'fetchImpl'), false);
    assert.equal(Object.hasOwn(init!, 'provider'), false);
    assert.equal(init?.method, 'GET');
    return Response.json({ source: 'injected' });
  };
  try {
    const base = { provider: 'sportmonks' as const, method: 'GET', retry: { maxAttempts: 1, totalBudgetMs: 1000 } };
    const overridden = await footballDataFetchJson<{ source: string }>('https://synthetic.invalid', { ...base, fetchImpl });
    assert.equal(overridden.ok, true); assert.equal(overridden.data?.source, 'injected');
    assert.equal(injected, 1); assert.equal(ambient, 0);
    const fallback = await footballDataFetchJson<{ source: string }>('https://synthetic.invalid', base);
    assert.equal(fallback.ok, true); assert.equal(fallback.data?.source, 'ambient');
    assert.equal(injected, 1); assert.equal(ambient, 1);
  } finally { globalThis.fetch = original; }
});

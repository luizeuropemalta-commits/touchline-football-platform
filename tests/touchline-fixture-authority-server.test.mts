import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Load the actual server-only graph, replacing only HTTP with an explicit fake.
const cache = new Map<string, Record<string, unknown>>();
function load(url: URL): Record<string, unknown> {
  const key = url.href;
  if (cache.has(key)) return cache.get(key)!;
  const exports: Record<string, unknown> = {};
  cache.set(key, exports);
  runInNewContext(ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name: string) {
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return crypto;
    assert.match(name, /^\.\/[a-z-]+\.ts$/);
    return load(new URL(name, url));
  }, Request, Response, Headers, URL, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  fetch() { throw Error('Real network forbidden'); } });
  return exports;
}
const create = load(new URL('../lib/football-data/fixture-authority-server.ts', import.meta.url))
  .createFixtureAuthorityServer as typeof import('../lib/football-data/fixture-authority-server.ts').createFixtureAuthorityServer;
const config = { enabled: true as const, projectRef: 'a'.repeat(20), serviceKey: 'centralSecret'.repeat(4), accountScope: 'shared',
  workers: [{ workerId: 'qa-live', environment: 'qa' as const, token: 'q'.repeat(40) },
    { workerId: 'prod-live', environment: 'production' as const, token: 'p'.repeat(40) }] };
const id = '12345678-1234-4234-8234-123456789abc';
const args = { p_account_scope: 'shared', p_request_id: id, p_endpoint: 'latest', p_attempt: 1, p_budget_ms: 1000 };
const request = (token = config.workers[0].token, payload: unknown = { operation: 'admit', args }) => new Request(
  'https://authority.example/api/internal/football-data/quota', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('default OFF needs no secret and makes no HTTP call', async () => {
  let calls = 0;
  const handler = create({}, async () => { calls++; return json({ allowed: true, token: id }); });
  const response = await handler(request());
  assert.equal(response.status, 503); assert.equal(calls, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('QA and production use one destination and scope, server-authenticated identities', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const handler = create(config, async (url, init) => {
    const headers = new Headers(init!.headers);
    assert.equal(headers.get('authorization'), `Bearer ${config.serviceKey}`);
    assert.equal(headers.get('apikey'), config.serviceKey);
    assert.equal(init!.redirect, 'error');
    calls.push({ url: String(url), body: JSON.parse(String(init!.body)) });
    return json({ allowed: true, token: id });
  });
  for (const worker of config.workers) {
    const response = await handler(request(worker.token));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { allowed: true, token: id });
  }
  assert.equal(calls.length, 2); assert.equal(calls[0].url, calls[1].url);
  assert.equal(calls[0].url, `https://${config.projectRef}.supabase.co/rest/v1/rpc/touchline_central_quota_admit`);
  for (const [i, call] of calls.entries()) {
    assert.equal(call.body.p_worker_id, config.workers[i].workerId);
    assert.equal(call.body.p_environment, config.workers[i].environment);
    assert.equal(call.body.p_account_scope, 'shared');
    assert.ok(!JSON.stringify(call.body).includes(config.serviceKey));
    assert.ok(!JSON.stringify(call.body).includes(config.workers[i].token));
  }
});

test('unauthenticated and forged identity/scope requests reach no database', async () => {
  let calls = 0;
  const handler = create(config, async () => { calls++; return json({ allowed: false }); });
  assert.equal((await handler(request('x'.repeat(40)))).status, 401);
  for (const extra of [{ p_worker_id: 'prod-live' }, { p_environment: 'production' }, { p_account_scope: 'other' }]) {
    assert.equal((await handler(request(undefined, { operation: 'admit', args: { ...args, ...extra } }))).status, 400);
  }
  assert.equal(calls, 0);
});

test('central denial and ambiguous errors never grant or retry', async () => {
  for (const value of [{ allowed: false }, { allowed: true, token: id, secret: config.serviceKey }]) {
    let calls = 0;
    const response = await create(config, async () => { calls++; return json(value); })(request());
    assert.equal(response.status, 'secret' in value ? 503 : 200);
    assert.ok(!(await response.text()).includes(config.serviceKey)); assert.equal(calls, 1);
  }
  let calls = 0;
  const response = await create(config, async () => { calls++; throw Error(config.serviceKey); })(request());
  assert.equal(response.status, 503); assert.equal(calls, 1);
  assert.ok(!(await response.text()).includes(config.serviceKey));
});

test('completion carries the authenticated owner and preserves a refused persistence receipt', async () => {
  const observation = { requestId: id, attempt: 1, operation: 'fixture', observedAt: '2026-10-10T16:00:00.000Z',
    status: 200, requestedEntity: 'Fixture', remaining: 900, resetAt: '2026-10-10T17:00:00.000Z', cooldownUntil: null };
  let calls = 0;
  const handler = create(config, async (url, init) => {
    calls++; assert.ok(String(url).endsWith('/touchline_central_quota_complete'));
    const body = JSON.parse(String(init!.body));
    assert.equal(body.p_worker_id, 'prod-live'); assert.equal(body.p_environment, 'production');
    assert.equal(body.p_token, id); assert.deepEqual(body.p_observation, observation);
    return json({ persisted: false });
  });
  const response = await handler(request(config.workers[1].token, { operation: 'complete', args: {
    p_account_scope: 'shared', p_request_id: id, p_endpoint: 'latest', p_attempt: 1, p_token: id, p_observation: observation,
  } }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { persisted: false }); assert.equal(calls, 1);
});

test('request cancellation propagates through the complete graph and never retries an ambiguous admission', async () => {
  let ready: () => void = () => {};
  const started = new Promise<void>(resolve => { ready = resolve; });
  let observed: AbortSignal | null | undefined; let calls = 0;
  const handler = create(config, async (_url, init) => {
    calls++; observed = init!.signal; ready();
    return new Promise<Response>(() => {});
  });
  const controller = new AbortController();
  const pending = handler(new Request(request(), { signal: controller.signal }));
  await started; controller.abort();
  const response = await pending;
  assert.equal(response.status, 503); assert.equal(observed?.aborted, true); assert.equal(calls, 1);
});

test('invalid enabled configuration rejects before serving; later config mutations cannot change identity', async () => {
  assert.throws(() => create({ ...config, workers: [config.workers[0], config.workers[0]] }));
  assert.throws(() => create({ ...config, projectRef: 'untrusted.example' }));
  const mutable = { ...config, workers: config.workers.map(worker => ({ ...worker })) };
  const handler = create(mutable, async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    assert.equal(body.p_worker_id, 'qa-live'); assert.equal(body.p_account_scope, 'shared');
    return json({ allowed: false });
  });
  mutable.accountScope = 'other'; mutable.workers[0].workerId = 'forged'; mutable.workers[0].token = 'z'.repeat(40);
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request('z'.repeat(40)))).status, 401);
});

test('central database secret cannot be reused as any worker bearer', () => {
  let calls = 0;
  for (const index of [0, 1]) {
    assert.throws(() => create({ ...config, workers: config.workers.map((worker, i) =>
      ({ ...worker, token: i === index ? config.serviceKey : worker.token })) }, async () => {
      calls++; return json({ allowed: false });
    }), (error: Error) => error.message === 'Fixture authority configuration unavailable.');
  }
  assert.equal(calls, 0);
});

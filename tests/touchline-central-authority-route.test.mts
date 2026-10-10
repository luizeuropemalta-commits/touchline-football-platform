import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('./fixtures/server-only.mts', import.meta.url).href, context);
  return next(specifier.startsWith('@/') ? new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });
const { serveConfiguredFixtureAuthority } = await import('../lib/football-data/configured-fixture-authority-server.ts');
const { POST } = await import('../app/api/internal/football-data/quota/route.ts');
const token = 'q'.repeat(40), centralKey = 'central'.repeat(8);
const environment = {
  TOUCHLINE_QUOTA_AUTHORITY_ENABLED: 'true', TOUCHLINE_QUOTA_AUTHORITY_PROJECT_REF: 'a'.repeat(20),
  TOUCHLINE_QUOTA_AUTHORITY_SERVICE_KEY: centralKey, TOUCHLINE_QUOTA_AUTHORITY_ACCOUNT_SCOPE: 'shared',
  TOUCHLINE_QUOTA_AUTHORITY_WORKERS_JSON: JSON.stringify([{ workerId: 'qa-live', environment: 'qa', token }]),
};
const request = (bearer = token) => new Request('https://authority.invalid/api/internal/football-data/quota', {
  method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
  body: JSON.stringify({ operation: 'admit', args: { p_account_scope: 'shared', p_request_id: '12345678-1234-4234-8234-123456789abc',
    p_endpoint: 'fixture', p_attempt: 1, p_budget_ms: 1000 } }),
});
let forbiddenCalls = 0;
const noHttp: typeof fetch = async () => { forbiddenCalls++; throw Error('Unexpected HTTP'); };

test('missing/OFF/malformed authority config is closed, even with content DB secrets', async () => {
  forbiddenCalls = 0;
  for (const value of [undefined, '', 'false', '1', 'TRUE']) {
    const response = await serveConfiguredFixtureAuthority(request(), { ...environment, TOUCHLINE_QUOTA_AUTHORITY_ENABLED: value,
      SUPABASE_SERVICE_ROLE_KEY: 'never-use-content-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://wrong.invalid' }, noHttp);
    assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const key of Object.keys(environment).slice(1)) {
    const env: Record<string, string | undefined> = { ...environment, [key]: undefined, SUPABASE_SERVICE_ROLE_KEY: centralKey };
    const response = await serveConfiguredFixtureAuthority(request(), env, noHttp);
    assert.equal(response.status, 503); assert.ok(!(await response.text()).includes(centralKey));
  }
  assert.equal(forbiddenCalls, 0);
});

test('invalid worker JSON and unknown fields cannot become an authority binding', async () => {
  forbiddenCalls = 0;
  for (const workers of ['not-json', 'null', '{}', '[]', 'x'.repeat(16385),
    JSON.stringify([{ workerId: 'qa-live', environment: 'qa', token, accountScope: 'forged' }]),
    JSON.stringify(Array.from({ length: 33 }, (_, index) => ({ workerId: `worker-${index}`, environment: 'qa', token: `${token}${index}` }))),
    JSON.stringify([{ workerId: 'qa-live', environment: 'qa', token }, { workerId: 'qa-live', environment: 'qa', token: 'r'.repeat(40) }]),
    JSON.stringify([{ workerId: 'qa-live', environment: 'qa', token }, { workerId: 'qa-other', environment: 'qa', token }]),
    JSON.stringify([{ workerId: 123, environment: 'qa', token }]),
    JSON.stringify([{ workerId: 'qa-live', environment: 'qa', token: null }]),
    JSON.stringify([{ workerId: 'qa-live', environment: 'preview', token }]),
    JSON.stringify([{ workerId: 'qa-live', environment: 'qa', token: centralKey }])]) {
    assert.equal((await serveConfiguredFixtureAuthority(request(), { ...environment, TOUCHLINE_QUOTA_AUTHORITY_WORKERS_JSON: workers }, noHttp)).status, 503);
  }
  assert.equal(forbiddenCalls, 0);
});

test('authorized route uses explicit central project and server-owned worker identity only', async () => {
  forbiddenCalls = 0;
  let calls = 0;
  const response = await serveConfiguredFixtureAuthority(request(), environment, async (url, init) => {
    calls++;
    assert.equal(String(url), `https://${'a'.repeat(20)}.supabase.co/rest/v1/rpc/touchline_central_quota_admit`);
    assert.equal(new Headers(init?.headers).get('apikey'), centralKey);
    const args = JSON.parse(String(init?.body));
    assert.equal(args.p_worker_id, 'qa-live'); assert.equal(args.p_environment, 'qa'); assert.equal(args.p_account_scope, 'shared');
    return Response.json({ allowed: false });
  });
  assert.equal(calls, 1); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { allowed: false });
  assert.equal((await serveConfiguredFixtureAuthority(request('x'.repeat(40)), environment, noHttp)).status, 401);
  assert.equal(forbiddenCalls, 0);
});

test('actual Next POST observes worker rotation and OFF on subsequent requests', async () => {
  const saved = Object.fromEntries(Object.keys(environment).map(k => [k, process.env[k]]));
  const original = globalThis.fetch; let calls = 0;
  try {
    Object.assign(process.env, environment);
    globalThis.fetch = async () => { calls++; return Response.json({ allowed: false }); };
    assert.equal((await POST(request())).status, 200); assert.equal(calls, 1);
    process.env.TOUCHLINE_QUOTA_AUTHORITY_WORKERS_JSON = JSON.stringify([{ workerId: 'qa-live', environment: 'qa', token: 'r'.repeat(40) }]);
    assert.equal((await POST(request())).status, 401); assert.equal(calls, 1);
    assert.equal((await POST(request('r'.repeat(40)))).status, 200); assert.equal(calls, 2);
    process.env.TOUCHLINE_QUOTA_AUTHORITY_ENABLED = 'false';
    assert.equal((await POST(request('r'.repeat(40)))).status, 503); assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

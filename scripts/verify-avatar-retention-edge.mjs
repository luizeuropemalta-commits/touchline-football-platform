// Run with Deno: --no-config --no-npm --allow-net=127.0.0.1 --allow-read=<repo>.
// No secrets, real database, external network or Storage writes.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

const nativeDeno = globalThis.Deno;
const nativeFetch = globalThis.fetch;
assert.ok(nativeDeno?.serve, 'Deno runtime required');
const nativeServe = nativeDeno.serve;
const nativeEnvGet = nativeDeno.env.get;
const origin = 'https://xgxbwqxjssxxuihuwmgy.supabase.co';
const key = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ref: 'xgxbwqxjssxxuihuwmgy', role: 'service_role' })).toString('base64url')}.synthetic_signature`;
let index = 0;
for (const mode of ['missing', 'off', 'foreign', 'invalid-key', 'enabled']) {
  const env = mode === 'missing' ? {} : {
    SUPABASE_URL: mode === 'foreign' ? 'https://foreign.supabase.co' : origin,
    SUPABASE_SERVICE_ROLE_KEY: mode === 'invalid-key' ? 'invalid' : key,
    TOUCHLINE_QA_AVATAR_RETENTION_ENABLED: mode === 'off' ? 'false' : 'true',
  };
  let server, outbound = 0;
  const methods = [];
  globalThis.fetch = async (input, init) => {
    outbound++;
    const url = new URL(String(input));
    assert.equal(url.origin, origin);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.authorization, `Bearer ${key}`);
    const method = url.pathname.split('/').at(-1);
    assert.ok(['touchline_claim_qa_avatar_retention_discovery', 'touchline_list_due_qa_avatar_retention_candidates'].includes(method));
    methods.push(method);
    return Response.json(method.includes('claim') ? { version: 1, allowed: true, scans: [] } : { version: 1, candidates: [] });
  };
  nativeDeno.env.get = name => env[name];
  nativeDeno.serve = handler => {
    server = nativeServe({ hostname: '127.0.0.1', port: 0, onListen() {} }, handler);
    return server;
  };
  try {
    await import(new URL(`../supabase/functions/touchline-avatar-retention/index.ts?probe=${index++}`, import.meta.url).href);
    assert.ok(server);
    const url = `http://127.0.0.1:${server.addr.port}/functions/v1/touchline-avatar-retention`;
    const send = headers => nativeFetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(3000) });
    const unauthorized = await send({});
    assert.equal(unauthorized.status, mode === 'enabled' ? 401 : 503);
    await unauthorized.text();
    assert.equal(outbound, 0);
    const response = await send({ authorization: `Bearer ${key}` });
    assert.equal(response.status, mode === 'enabled' ? 200 : 503);
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes(key), false);
    if (mode === 'enabled') {
      assert.deepEqual(body, { status: 'processed', discovery: { listed: 0, registered: 0, denied: 0, skipped: 0 }, cleanup: { inspected: 0, accepted: 0, denied: 0, unknown: 0 } });
      assert.deepEqual(methods, ['touchline_claim_qa_avatar_retention_discovery', 'touchline_list_due_qa_avatar_retention_candidates']);
      env.TOUCHLINE_QA_AVATAR_RETENTION_ENABLED = 'false';
      const drift = await send({ authorization: `Bearer ${key}` });
      assert.equal(drift.status, 503); await drift.text();
      assert.equal(outbound, 2);
    } else assert.equal(outbound, 0);
    console.log(JSON.stringify({ mode, status: response.status, fixtureRpcCalls: outbound, externalNetwork: 0 }));
  } finally {
    if (server) await server.shutdown();
    nativeDeno.serve = nativeServe;
    nativeDeno.env.get = nativeEnvGet;
    globalThis.fetch = nativeFetch;
  }
}

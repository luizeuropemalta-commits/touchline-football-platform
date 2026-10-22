import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Read source only; never import the route's server/Supabase module.
const routeSource = readFileSync(new URL('../app/api/admin/social-publications/studio/review/route.ts', import.meta.url), 'utf8');
const contractSource = readFileSync(new URL('../lib/touchlineArena/social-studio-contract.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('contract.ts', contractSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declarations = ast.statements.filter(s => ts.isFunctionDeclaration(s) && s.name?.text === 'studioSameOrigin');
assert.equal(declarations.length, 1, 'exact current origin helper required');
const originSource = declarations[0]!.getText(ast);
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const originExports: Record<string, unknown> = {};
runInNewContext(compile(originSource), { exports: originExports, URL }, { timeout: 1000 });
assert.equal(typeof originExports.studioSameOrigin, 'function');

const sessionId = 'b2c1fa0d-ab0c-4fb1-887a-a5ec75165430';
const owner = 'synthetic-owner';
const start = { action: 'start', sessionId, artId: 'MATCH_PREVIEW', platform: 'INSTAGRAM', placement: 'FEED', mediaIdentity: 'synthetic-media', expectedRevision: 0 };
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
function harness(options: { authorized?: boolean; fail?: 'auth'|'start'|'tick'|'invalidate'; readError?: boolean } = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const adapters = {
    authorizeStudio: async () => {
      calls.push({ name: 'auth', args: [] });
      if (options.fail === 'auth') throw Error('synthetic auth error');
      return options.authorized === false ? null : owner;
    },
    startStudioReviewEvidence: async (...args: unknown[]) => invoke('start', args),
    tickStudioReviewEvidence: async (...args: unknown[]) => invoke('tick', args),
    invalidateStudioReviewEvidence: async (...args: unknown[]) => { invoke('invalidate', args); },
  };
  function invoke(name: 'start'|'tick'|'invalidate', args: unknown[]) {
    calls.push({ name, args: plain(args) });
    if (options.fail === name) throw Error('synthetic adapter failure');
    return { completed_loops: 2 };
  }
  const exported: Record<string, unknown> = {};
  const dependencies = (name: string) => {
    if (name === '@/lib/touchlineArena/social-studio-contract') return originExports;
    if (name === '@/lib/touchlineArena/social-studio-server') return adapters;
    throw Error(`Unexpected route dependency: ${name}`);
  };
  runInNewContext(compile(routeSource), { exports: exported, require: dependencies, Response }, { timeout: 1000 });
  assert.equal(typeof exported.POST, 'function');
  const post = exported.POST as (request: unknown) => Promise<Response>;
  const send = (body: unknown = start, config: { origin?: string|null; type?: string; raw?: string } = {}) => post({
    url: 'https://studio-fixture.invalid/api/admin/social-publications/studio/review',
    headers: new Headers({ ...(config.origin === null ? {} : { origin: config.origin ?? 'https://studio-fixture.invalid' }), 'content-type': config.type ?? 'application/json' }),
    text: async () => {
      calls.push({ name: 'read', args: [] });
      if (options.readError) throw Error('synthetic body read failure');
      return config.raw ?? JSON.stringify(body);
    },
  });
  return { calls, send };
}
async function result(response: Response, status: number, body: unknown, privateResponse = false) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), body);
  assert.equal(response.headers.get('cache-control'), privateResponse ? 'private, no-store' : null);
}
test('review POST enforces origin then owner before reading a body', async () => {
  for (const origin of [null, 'https://foreign.invalid', 'malformed']) {
    const h = harness();
    await result(await h.send(start, { origin }), 403, { ok: false, error: 'INVALID_ORIGIN' });
    assert.deepEqual(h.calls, []);
  }
  const denied = harness({ authorized: false });
  await result(await denied.send(null, { raw: 'not-json' }), 403, { ok: false, error: 'FORBIDDEN' });
  assert.deepEqual(denied.calls.map(c => c.name), ['auth']);
});
test('review POST delegates start tick invalidate with exact actor and receipt', async () => {
  for (const action of ['start', 'tick', 'invalidate'] as const) {
    const h = harness();
    await result(await h.send({ ...start, action }), 200, { ok: true, completedLoops: action === 'invalidate' ? 0 : 2 }, true);
    assert.deepEqual(h.calls.map(c => c.name), ['auth', 'read', action]);
    const { action: _action, ...input } = start;
    assert.deepEqual(h.calls[2]!.args, action === 'start' ? [input, owner] : [sessionId, owner]);
  }
});
test('review POST format and size gates do not invoke persistence', async () => {
  const format = harness();
  await result(await format.send(start, { type: 'text/plain' }), 415, { ok: false, error: 'INVALID_FORMAT' });
  assert.deepEqual(format.calls.map(c => c.name), ['auth']);
  const size = harness();
  await result(await size.send(start, { raw: 'x'.repeat(4097) }), 413, { ok: false, error: 'REQUEST_TOO_LARGE' });
  assert.deepEqual(size.calls.map(c => c.name), ['auth', 'read']);
});
test('review POST rejects malformed JSON identity action and start revision without adapters', async () => {
  const cases: unknown[] = [null, [], {}, { ...start, sessionId: 'bad' }, { ...start, sessionId: 'b2c1fa0d-ab0c-1fb1-887a-a5ec75165430' },
    { ...start, action: 'publish' }, ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null].map(expectedRevision => ({ ...start, expectedRevision })),
    ...['artId', 'platform', 'placement', 'mediaIdentity'].map(key => ({ ...start, [key]: null }))];
  for (const body of cases) {
    const h = harness();
    await result(await h.send(body), 409, { ok: false, error: 'REVIEW_SESSION_UNAVAILABLE' }, true);
    assert.deepEqual(h.calls.map(c => c.name), ['auth', 'read']);
  }
  const broken = harness();
  await result(await broken.send(start, { raw: '{' }), 409, { ok: false, error: 'REVIEW_SESSION_UNAVAILABLE' }, true);
  assert.deepEqual(broken.calls.map(c => c.name), ['auth', 'read']);
});
test('review POST reports adapter/body errors without pretending success', async () => {
  for (const action of ['start', 'tick', 'invalidate'] as const) {
    const h = harness({ fail: action });
    await result(await h.send({ ...start, action }), 409, { ok: false, error: 'REVIEW_SESSION_UNAVAILABLE' }, true);
    assert.deepEqual(h.calls.map(c => c.name), ['auth', 'read', action]);
  }
  const h = harness({ readError: true });
  await result(await h.send(), 409, { ok: false, error: 'REVIEW_SESSION_UNAVAILABLE' }, true);
  assert.deepEqual(h.calls.map(c => c.name), ['auth', 'read']);
});
test('current auth rejection propagates before parsing and is not a mutation receipt', async () => {
  const h = harness({ fail: 'auth' });
  await assert.rejects(h.send(), /synthetic auth error/);
  assert.deepEqual(h.calls.map(c => c.name), ['auth']);
});

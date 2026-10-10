import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

test('score polls only when visible, never overlaps, and ignores results after unmount', async () => {
  const source = readFileSync(new URL('../components/touchline/ClubHubLiveFixtureScore.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('score.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect = '';
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(effect);
  let tick: () => Promise<void> = async () => {};
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  let resolve: (value: unknown) => void = () => {};
  let requests = 0, refreshes = 0, updates = 0, disconnected = 0, cleared = 0;
  const document = { hidden: false };
  const code = ts.transpileModule(`const run=${effect}; run();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const cleanup = vm.runInNewContext(code, {
    fixtureId: 'fixture', surface: { current: {} }, document,
    fetch: () => { requests++; return new Promise(r => { resolve = r; }); },
    parseTouchlinePublicFixtures: () => [{ providerId: 'fixture' }],
    setFixture: () => { updates++; }, router: { refresh: () => { refreshes++; } },
    IntersectionObserver: class { constructor(cb: typeof intersect) { intersect = cb; } observe() {} disconnect() { disconnected++; } },
    window: { setInterval: (cb: typeof tick, ms: number) => { assert.equal(ms, 45_000); tick = cb; return 1; }, clearInterval: () => { cleared++; } },
  });
  await tick(); assert.equal(requests, 0);
  intersect([{ isIntersecting: true }]); document.hidden = true;
  await tick(); assert.equal(requests, 0);
  document.hidden = false;
  const first = tick(); await tick(); assert.equal(requests, 1);
  resolve({ ok: true, json: async () => ({ data: [] }) }); await first;
  assert.equal(updates, 1); assert.equal(refreshes, 1);
  intersect([{ isIntersecting: false }]); await tick(); assert.equal(requests, 1);
  intersect([{ isIntersecting: true }]); const second = tick();
  assert.equal(requests, 2); cleanup();
  resolve({ ok: true, json: async () => ({ data: [] }) }); await second;
  assert.equal(updates, 1); assert.equal(refreshes, 1);
  assert.equal(disconnected, 1); assert.equal(cleared, 1);
});

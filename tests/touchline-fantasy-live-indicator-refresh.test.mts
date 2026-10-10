import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect: ts.CallExpression | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.getText(ast).includes('/api/touchline-fantasy/state')) effect = node;
  ts.forEachChild(node, visit);
}
visit(ast); assert.ok(effect);
const script = ts.transpileModule(`(${effect.arguments[0].getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(load: (...args: unknown[]) => unknown) {
  let live: Record<string, unknown> = { gameweekScore: 42, selections: ['preserved'], matchCardIndicators: ['old'], playerAvailabilityIndicators: ['old'] };
  let tick!: () => Promise<void>, expire!: () => void, writes = 0;
  const timers = new Set<number>();
  const context = {
    snapshot: { entitlementActive: true }, activeGameweek: { id: 'current' }, AbortController,
    window: { setInterval: (work: () => Promise<void>) => { tick = work; timers.add(1); return 1; }, clearInterval(id: number) { timers.delete(id); },
      setTimeout: (work: () => void) => { expire = work; timers.add(2); return 2; }, clearTimeout(id: number) { timers.delete(id); } },
    fetch: load,
    setLive: (update: Record<string, unknown> | ((value: Record<string, unknown>) => Record<string, unknown>)) => { writes++; live = typeof update === 'function' ? update(live) : update; },
    setSelectedCoachId() {}, setFormationCode() {}, setSelections() {}, setVisibleStep() {},
  };
  const cleanup = runInNewContext(script, context)();
  return { tick: () => tick(), expire: () => expire(), cleanup, live: () => live, writes: () => writes, timers };
}

test('failed HTTP, payload or network reads clear only stale indicators and preserve XI/points; next poll recovers', async () => {
  for (const failure of ['http', 'payload', 'network']) {
    let count = 0;
    const fresh = { ok: true, activeGameweek: { id: 'current' }, matchCardIndicators: ['new'], playerAvailabilityIndicators: [] };
    const h = harness(async () => {
      if (++count > 1) return { ok: true, json: async () => fresh };
      if (failure === 'network') throw Error('synthetic');
      return { ok: failure !== 'http', json: async () => ({ ok: false }) };
    });
    await h.tick();
    assert.equal(h.live().matchCardIndicators, null); assert.equal(h.live().playerAvailabilityIndicators, null);
    assert.equal(h.live().gameweekScore, 42); assert.deepEqual(h.live().selections, ['preserved']);
    await h.tick(); assert.equal(h.live(), fresh); assert.equal(count, 2); h.cleanup();
  }
});

test('cleanup releases interval and request deadline immediately even if transport never settles', async () => {
  let signal: AbortSignal | undefined;
  const h = harness((_url, options) => {
    signal = (options as { signal: AbortSignal }).signal;
    return new Promise(() => {});
  });
  void h.tick();
  assert.deepEqual([...h.timers], [1, 2]);
  h.cleanup();
  assert.equal(signal?.aborted, true);
  assert.equal(h.timers.size, 0);
  await h.tick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.writes(), 0);
});

test('invalid response JSON clears indicators without losing XI and releases the deadline', async () => {
  const h = harness(async () => ({ ok: true, json: async () => { throw new SyntaxError('synthetic invalid JSON'); } }));
  await h.tick();
  assert.equal(h.live().matchCardIndicators, null);
  assert.equal(h.live().playerAvailabilityIndicators, null);
  assert.deepEqual(h.live().selections, ['preserved']);
  assert.equal(h.live().gameweekScore, 42);
  assert.deepEqual([...h.timers], [1]);
  h.cleanup();
  assert.equal(h.timers.size, 0);
});

test('pending state request cannot overlap; timed-out or unmounted responses never restore stale indicators', async () => {
  for (const unmount of [false, true]) {
    let release!: (response: unknown) => void, calls = 0, signal: AbortSignal | undefined;
    const h = harness((_url, options) => {
      calls++; signal = (options as { signal: AbortSignal }).signal;
      return new Promise(resolve => { release = resolve; });
    });
    const first = h.tick(); await h.tick(); assert.equal(calls, 1);
    if (unmount) h.cleanup(); else h.expire();
    assert.equal(signal?.aborted, true);
    release({ ok: true, json: async () => ({ ok: true, activeGameweek: { id: 'current' }, matchCardIndicators: ['late'] }) });
    await first;
    if (unmount) assert.equal(h.writes(), 0);
    else { assert.equal(h.live().matchCardIndicators, null); assert.equal(h.live().gameweekScore, 42); h.cleanup(); }
  }
});

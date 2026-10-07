import assert from 'node:assert/strict';
import test from 'node:test';

type Locale = 'en-GB' | 'pt-BR';
type State = 'loading' | 'ready' | 'saving' | 'blocked';
type Result = 'saved' | 'local' | 'busy' | 'unconfirmed' | 'invalid';
type Context = { mode: 'account'; accountId: string } | { mode: 'guest' | 'demo' | 'unavailable' };
type Request = (input: string, init: RequestInit) => Promise<Response>;
type Observer = (callback: (accountId: string | null) => void) => () => void;
type Adapter = { load(): Promise<void>; select(locale: unknown): Promise<Result>; invalidate(): void;
  dispose(): void; cleanup(): void; getState(): State };
type Options = { context: Context; request: Request; apply(locale: Locale): void; restore?(locale: Locale): void; onChange(state: State): void;
  observeIdentity: Observer; onIdentityChange(): void; timeoutMs?: number;
  setTimer?(callback: () => void, delayMs: number): unknown; clearTimer?(handle: unknown): void };
type Start = (options: Options) => Adapter;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const account: Context = { mode: 'account', accountId: owner };
const readReceipt = { ok: true, data: { accountId: owner, gameLocale: 'ar-SA', gameLocaleRevision: '7' } };
const writeReceipt = { ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: '8', updatedAt: '2026-10-02T22:30:00.000Z' } };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
// Drain finite promise chains only. No wall-clock timers, network or browser.
async function settle() { for (let count = 0; count < 30; count++) await Promise.resolve(); }
function manualTimers() {
  let serial = 0;
  const active = new Map<number, () => void>();
  const delays: number[] = [];
  return { active, delays,
    setTimer: (callback: () => void, delay: number): unknown => { delays.push(delay); active.set(++serial, callback); return serial; },
    clearTimer: (handle: unknown) => { assert.equal(typeof handle, 'number'); active.delete(handle as number); },
    expire: () => {
      assert.equal(active.size, 1, 'one deadline spans fetch and its JSON body');
      const [handle, callback] = [...active][0]; active.delete(handle); callback();
    },
  };
}
async function startFactory(): Promise<Start> {
  // The real adapter imports the real host and selection controller. No mocks
  // replace those layers. This is not React, browser or auth-SDK verification.
  const loaded = await import(new URL('../lib/touchlineArena/account-locale-browser.ts', import.meta.url).href);
  assert.equal(typeof loaded.startAccountLocaleBrowser, 'function');
  return loaded.startAccountLocaleBrowser as Start;
}
async function harness(options: { context?: Context; request?: Request; observer?: Observer; timeoutMs?: number; restore?: (locale: Locale) => void } = {}) {
  const start = await startFactory();
  const events: string[] = [];
  const applied: Locale[] = [];
  const changes: State[] = [];
  const requests: Array<{ input: string; init: RequestInit }> = [];
  const timers = manualTimers();
  let observer!: (accountId: string | null) => void;
  let subscriptions = 0, unsubscribes = 0, identityChanges = 0;
  const adapter = start({ context: options.context ?? account,
    request: async (input, init) => {
      events.push(`request:${init.method}`); requests.push({ input, init });
      return options.request ? options.request(input, init) : json(init.method === 'GET' ? readReceipt : writeReceipt);
    },
    apply: locale => { applied.push(locale); events.push('apply'); },
    restore: options.restore,
    onChange: state => { changes.push(state); events.push(`state:${state}`); },
    observeIdentity: callback => {
      subscriptions++; events.push('subscribe'); observer = callback;
      const unsubscribe = options.observer?.(callback);
      return () => { unsubscribes++; events.push('unsubscribe'); unsubscribe?.(); };
    },
    onIdentityChange: () => { identityChanges++; events.push('identity-changed'); },
    timeoutMs: options.timeoutMs, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
  });
  return { adapter, events, requests, applied, changes, timers,
    emit: (identity: string | null) => observer(identity),
    counts: () => ({ subscriptions, unsubscribes, identityChanges }) };
}

test('account subscribes before exactly one automatic GET and never writes or applies on read', async () => {
  const h = await harness();
  await settle(); await h.adapter.load(); await h.adapter.load();
  assert.equal(h.adapter.getState(), 'ready');
  assert.equal(h.counts().subscriptions, 1);
  assert.ok(h.events.indexOf('subscribe') < h.events.indexOf('request:GET'));
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].input, '/api/notifications/preferences');
  assert.equal(h.requests[0].init.credentials, 'same-origin'); assert.equal(h.requests[0].init.cache, 'no-store');
  assert.deepEqual(h.applied, []); assert.deepEqual(h.timers.delays, [15_000]); assert.equal(h.timers.active.size, 0);
  h.emit(owner); assert.equal(h.adapter.getState(), 'ready'); assert.equal(h.counts().identityChanges, 0);
  h.adapter.cleanup();
});

test('guest observes null identity and remains local; demo and unavailable never subscribe', async () => {
  for (const mode of ['guest', 'demo', 'unavailable'] as const) {
    const h = await harness({ context: { mode } }); await settle(); await h.adapter.load();
    assert.equal(h.counts().subscriptions, mode === 'guest' ? 1 : 0);
    assert.equal(h.requests.length, 0);
    if (mode === 'guest') { h.emit(null); assert.equal(h.counts().identityChanges, 0); }
    assert.equal(await h.adapter.select('pt-BR'), mode === 'unavailable' ? 'unconfirmed' : 'local');
    assert.deepEqual(h.applied, mode === 'unavailable' ? [] : ['pt-BR']);
    assert.equal(h.requests.length, 0); h.adapter.cleanup();
    assert.equal(h.counts().unsubscribes, mode === 'guest' ? 1 : 0);
  }
});

test('changed account or guest identity invalidates synchronously before one notification, without fallback', async () => {
  for (const [context, changed] of [[account, null], [account, other], [{ mode: 'guest' }, owner]] as Array<[Context, string | null]>) {
    const h = await harness({ context }); await settle();
    const requestsBefore = h.requests.length;
    h.emit(changed);
    assert.equal(h.adapter.getState(), 'blocked', 'invalidation is synchronous');
    assert.equal(h.counts().identityChanges, 1);
    assert.ok(h.events.indexOf('state:blocked') < h.events.indexOf('identity-changed'));
    h.emit(changed); h.emit(null); h.emit(other);
    assert.equal(h.counts().identityChanges, 1);
    assert.equal(await h.adapter.select('pt-BR'), 'unconfirmed'); await h.adapter.load();
    assert.equal(h.requests.length, requestsBefore); assert.deepEqual(h.applied, []); h.adapter.cleanup();
  }
});

test('synchronous identity change during subscription prevents GET and still preserves unsubscribe cleanup', async () => {
  let stopped = 0;
  const h = await harness({ observer: callback => { callback(other); return () => { stopped++; }; } });
  await settle();
  assert.equal(h.adapter.getState(), 'blocked'); assert.equal(h.requests.length, 0);
  assert.equal(h.counts().identityChanges, 1);
  h.adapter.cleanup(); h.adapter.cleanup();
  assert.equal(stopped, 1); assert.equal(h.counts().unsubscribes, 1);
});

test('subscription failure blocks without GET or guest fallback', async () => {
  for (const context of [account, { mode: 'guest' } as const]) {
    const h = await harness({ context, observer: () => { throw new Error('observer unavailable'); } });
    await settle(); await h.adapter.load();
    assert.equal(h.adapter.getState(), 'blocked'); assert.equal(h.requests.length, 0);
    assert.equal(await h.adapter.select('pt-BR'), 'unconfirmed'); assert.deepEqual(h.applied, []);
    h.adapter.cleanup();
  }
});

test('explicit selections use real shared host and controller revision and account fences', async () => {
  const pending = deferred<Response>();
  const h = await harness({ request: async (_input, init) => init.method === 'GET' ? json(readReceipt) : pending.promise });
  await settle();
  const first = h.adapter.select('pt-BR');
  assert.equal(await h.adapter.select('en-GB'), 'busy'); assert.equal(h.requests.length, 2);
  assert.deepEqual(h.applied, []);
  const put = h.requests[1];
  assert.equal(put.init.method, 'PUT');
  assert.equal(new Headers(put.init.headers).get('X-Touchline-Expected-Account'), owner);
  assert.deepEqual(JSON.parse(put.init.body as string), { action: 'set_game_locale', locale: 'pt-BR', expectedRevision: '7' });
  pending.resolve(json(writeReceipt));
  assert.equal(await first, 'saved'); assert.deepEqual(h.applied, ['pt-BR']);
  assert.equal(h.adapter.getState(), 'ready'); assert.equal(h.timers.active.size, 0); h.adapter.cleanup();
});

test('cleanup unsubscribes once, disposes host, and ignores late identity callbacks and GET', async () => {
  const pending = deferred<Response>();
  const h = await harness({ request: async () => pending.promise });
  h.adapter.cleanup(); h.adapter.cleanup();
  assert.equal(h.requests[0].init.signal?.aborted, true);
  const changes = [...h.changes];
  h.emit(other); h.emit(null); pending.resolve(json(readReceipt)); await settle();
  assert.equal(h.counts().unsubscribes, 1); assert.equal(h.counts().identityChanges, 0);
  assert.equal(h.adapter.getState(), 'blocked'); assert.deepEqual(h.changes, changes);
  assert.deepEqual(h.applied, []); await h.adapter.load();
  assert.equal(h.requests.length, 1); assert.equal(await h.adapter.select('pt-BR'), 'unconfirmed');
});

test('identity change or cleanup fences a late matching PUT receipt without cancelling its possible server commit', async () => {
  for (const end of ['identity', 'cleanup'] as const) {
    const pending = deferred<Response>();
    const h = await harness({ request: async (_input, init) => init.method === 'GET' ? json(readReceipt) : pending.promise });
    await settle(); const saving = h.adapter.select('pt-BR');
    if (end === 'identity') h.emit(other); else h.adapter.cleanup();
    assert.equal(h.requests[1].init.signal?.aborted, true);
    const changes = [...h.changes];
    pending.resolve(json(writeReceipt)); assert.equal(await saving, 'unconfirmed');
    assert.equal(h.adapter.getState(), 'blocked'); assert.deepEqual(h.changes, changes); assert.deepEqual(h.applied, []);
    assert.equal(await h.adapter.select('en-GB'), 'unconfirmed'); assert.equal(h.requests.length, 2); h.adapter.cleanup();
  }
});

test('GET timeout covers a stalled fetch and blocks permanently despite late resolve or rejection', async () => {
  for (const late of ['resolve', 'reject'] as const) {
    const pending = deferred<Response>();
    const h = await harness({ timeoutMs: 250, request: async () => pending.promise });
    assert.deepEqual(h.timers.delays, [250]); h.timers.expire(); await settle();
    assert.equal(h.requests[0].init.signal?.aborted, true);
    assert.equal(h.adapter.getState(), 'blocked');
    if (late === 'resolve') pending.resolve(json(readReceipt)); else pending.reject(new Error('late GET failure'));
    await settle(); await h.adapter.load();
    assert.equal(h.adapter.getState(), 'blocked'); assert.equal(await h.adapter.select('pt-BR'), 'unconfirmed');
    assert.equal(h.requests.length, 1); assert.deepEqual(h.applied, []); h.adapter.cleanup();
  }
});

test('one GET timer survives response headers and expires stalled JSON without retry or late ready', async () => {
  for (const late of ['resolve', 'reject'] as const) {
    const body = deferred<unknown>();
    const response = Object.assign(new Response(null), { json: () => body.promise });
    const h = await harness({ request: async () => response }); await settle();
    assert.equal(h.adapter.getState(), 'loading'); assert.deepEqual(h.timers.delays, [15_000]);
    h.timers.expire(); await settle(); assert.equal(h.adapter.getState(), 'blocked');
    assert.equal(h.requests[0].init.signal?.aborted, true);
    const changes = [...h.changes];
    if (late === 'resolve') body.resolve(readReceipt); else body.reject(new Error('late JSON failure'));
    await settle(); await h.adapter.load();
    assert.deepEqual(h.changes, changes); assert.equal(h.requests.length, 1); assert.deepEqual(h.applied, []); h.adapter.cleanup();
  }
});

test('PUT timeout includes stalled fetch, then latches shared host and ignores late matching receipt or rejection', async () => {
  for (const late of ['resolve', 'reject'] as const) {
    const pending = deferred<Response>();
    const h = await harness({ timeoutMs: 300, request: async (_input, init) => init.method === 'GET' ? json(readReceipt) : pending.promise });
    await settle(); const saving = h.adapter.select('pt-BR');
    assert.deepEqual(h.timers.delays, [300, 300]); h.timers.expire();
    assert.equal(h.requests[1].init.signal?.aborted, true);
    assert.equal(await saving, 'unconfirmed'); assert.equal(h.adapter.getState(), 'blocked');
    if (late === 'resolve') pending.resolve(json(writeReceipt)); else pending.reject(new Error('late PUT failure'));
    await settle();
    assert.equal(await h.adapter.select('en-GB'), 'unconfirmed'); await h.adapter.load();
    assert.equal(h.requests.length, 2); assert.deepEqual(h.applied, []); h.adapter.cleanup();
  }
});

test('one PUT timer covers JSON consumption and a late decoded success cannot apply after timeout', async () => {
  for (const late of ['resolve', 'reject'] as const) {
    const body = deferred<unknown>();
    const response = Object.assign(new Response(null), { json: () => body.promise });
    const h = await harness({ request: async (_input, init) => init.method === 'GET' ? json(readReceipt) : response });
    await settle(); const saving = h.adapter.select('pt-BR'); await settle();
    assert.equal(h.adapter.getState(), 'saving'); assert.deepEqual(h.timers.delays, [15_000, 15_000]);
    h.timers.expire(); assert.equal(await saving, 'unconfirmed'); assert.equal(h.adapter.getState(), 'blocked');
    assert.equal(h.requests[1].init.signal?.aborted, true);
    if (late === 'resolve') body.resolve(writeReceipt); else body.reject(new Error('late write JSON failure'));
    await settle();
    assert.deepEqual(h.applied, []); assert.equal(await h.adapter.select('en-GB'), 'unconfirmed');
    assert.equal(h.requests.length, 2); h.adapter.cleanup();
  }
});

test('browser restores a complete same-account preference once through the read-only callback', async () => {
  const restored: Locale[] = [];
  const h = await harness({ restore: locale => restored.push(locale),
    request: async () => json({ ok: true, data: { ...readReceipt.data, gameLocale: 'pt-BR' } }) });
  await settle(); await h.adapter.load(); await h.adapter.load();
  assert.deepEqual(restored, ['pt-BR']); assert.deepEqual(h.applied, []);
  assert.deepEqual(h.requests.map(call => call.init.method), ['GET']);
  assert.equal(h.adapter.getState(), 'ready'); h.adapter.cleanup();
});

test('browser identity change, disposal and read timeout fence pending preference restoration', async () => {
  for (const action of ['identity', 'cleanup', 'timeout'] as const) {
    const pending = deferred<Response>(), restored: Locale[] = [];
    const h = await harness({ restore: locale => restored.push(locale), request: async () => pending.promise });
    if (action === 'identity') h.emit(other);
    else if (action === 'cleanup') h.adapter.cleanup();
    else h.timers.expire();
    pending.resolve(json({ ok: true, data: { ...readReceipt.data, gameLocale: 'pt-BR' } }));
    await settle();
    assert.deepEqual(restored, []); assert.deepEqual(h.applied, []);
    assert.equal(h.adapter.getState(), 'blocked');
    assert.deepEqual(h.requests.map(call => call.init.method), ['GET']); h.adapter.cleanup();
  }
});

test('browser does not replace or apply the six draft preferences during restoration', async () => {
  for (const gameLocale of ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE', null]) {
    const restored: Locale[] = [];
    const h = await harness({ restore: locale => restored.push(locale),
      request: async () => json({ ok: true, data: { ...readReceipt.data, gameLocale } }) });
    await settle(); assert.deepEqual(restored, []); assert.deepEqual(h.applied, []);
    assert.equal(h.adapter.getState(), 'ready');
    assert.deepEqual(h.requests.map(call => call.init.method), ['GET']); h.adapter.cleanup();
  }
});

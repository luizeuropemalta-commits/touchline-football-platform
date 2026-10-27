import assert from 'node:assert/strict';
import test from 'node:test';

type Locale = 'en-GB' | 'pt-BR';
type State = 'loading' | 'ready' | 'saving' | 'blocked';
type Result = 'saved' | 'local' | 'busy' | 'unconfirmed' | 'invalid';
type Context = { mode: 'account'; accountId: string } | { mode: 'guest' | 'demo' | 'unavailable' };
type Request = (input: string, init: RequestInit) => Promise<Response>;
type Observer = (callback: (accountId: string | null | undefined) => void) => () => void;
type Adapter = { load(): Promise<void>; select(locale: unknown): Promise<Result>; invalidate(): void;
  dispose(): void; cleanup(): void; getState(): State };
type Options = { context: Context; request: Request; apply(locale: Locale): void; restore?(locale: Locale): void; onChange(state: State): void;
  observeIdentity: Observer; onIdentityChange(): void; timeoutMs?: number;
  observeReadRecovery?(callback: () => void): () => void; now?(): number;
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
      assert.equal(active.size, 1, 'only one request deadline or recovery delay is active');
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
  let observer!: (accountId: string | null | undefined) => void;
  let subscriptions = 0, unsubscribes = 0, identityChanges = 0;
  let recoveryCallback: (() => void) | undefined;
  let recoverySubscriptions = 0, recoveryUnsubscribes = 0, clock = 0;
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
    observeReadRecovery: callback => {
      recoveryCallback = callback; recoverySubscriptions++;
      return () => { recoveryUnsubscribes++; };
    },
    now: () => clock,
    timeoutMs: options.timeoutMs, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
  });
  return { adapter, events, requests, applied, changes, timers,
    emit: (identity: string | null | undefined) => observer(identity),
    recover: () => recoveryCallback?.(),
    advanceClock: (milliseconds: number) => { clock += milliseconds; },
    recoveryCounts: () => ({ subscriptions: recoverySubscriptions, unsubscribes: recoveryUnsubscribes }),
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

test('unknown identity fences pending read and only resolved same account re-reads authority', async () => {
  const pending = deferred<Response>();
  let reads = 0;
  const h = await harness({ request: async () => ++reads === 1 ? pending.promise : json(readReceipt) });
  h.emit(undefined);
  assert.equal(h.adapter.getState(), 'blocked'); assert.equal(h.counts().identityChanges, 0);
  assert.equal(h.requests[0].init.signal?.aborted, true);
  h.emit(owner); await settle();
  assert.equal(h.adapter.getState(), 'ready');
  assert.deepEqual(h.requests.map(entry => entry.init.method), ['GET', 'GET']);
  pending.resolve(json({ ...readReceipt, data: { ...readReceipt.data, accountId: other } })); await settle();
  assert.equal(h.adapter.getState(), 'ready'); assert.deepEqual(h.applied, []); h.adapter.cleanup();
});

test('unknown then confirmed changed identity refreshes once and never resumes previous host', async () => {
  const h = await harness(); await settle(); h.emit(undefined); h.emit(other); h.emit(owner);
  assert.equal(h.adapter.getState(), 'blocked'); assert.equal(h.counts().identityChanges, 1);
  assert.equal(h.requests.length, 1); h.adapter.cleanup();
});

test('explicit invalidation remains terminal even after unknown identity is resolved', async () => {
  const h = await harness(); await settle(); h.emit(undefined); h.adapter.invalidate(); h.emit(owner);
  assert.equal(h.adapter.getState(), 'blocked'); assert.equal(h.requests.length, 1);
  assert.equal(await h.adapter.select('pt-BR'), 'unconfirmed'); h.adapter.cleanup();
});

test('unknown identity during PUT never automatically reconciles or replays the write', async () => {
  const pending = deferred<Response>();
  const h = await harness({ request: async (_input, init) => init.method === 'GET' ? json(readReceipt) : pending.promise });
  await settle(); const result = h.adapter.select('pt-BR'); h.emit(undefined); h.emit(owner);
  pending.resolve(json(writeReceipt)); assert.equal(await result, 'unconfirmed'); await settle();
  assert.equal(h.adapter.getState(), 'blocked'); assert.deepEqual(h.applied, []);
  assert.deepEqual(h.requests.map(entry => entry.init.method), ['GET', 'PUT']); h.adapter.cleanup();
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

test('GET timeout exhausts three bounded attempts and ignores late resolve or rejection', async () => {
  for (const late of ['resolve', 'reject'] as const) {
    const pending = deferred<Response>();
    const h = await harness({ timeoutMs: 250, request: async () => pending.promise });
    assert.deepEqual(h.timers.delays, [250]);
    for (let step = 0; step < 5; step++) { h.timers.expire(); await settle(); }
    assert.equal(h.requests[0].init.signal?.aborted, true);
    assert.equal(h.adapter.getState(), 'blocked');
    if (late === 'resolve') pending.resolve(json(readReceipt)); else pending.reject(new Error('late GET failure'));
    await settle(); await h.adapter.load();
    assert.equal(h.adapter.getState(), 'blocked'); assert.equal(await h.adapter.select('pt-BR'), 'unconfirmed');
    assert.equal(h.requests.length, 3); assert.deepEqual(h.applied, []); h.adapter.cleanup();
  }
});

test('GET deadlines cover stalled JSON and exhaust bounded recovery without late ready', async () => {
  for (const late of ['resolve', 'reject'] as const) {
    const body = deferred<unknown>();
    const response = Object.assign(new Response(null), { json: () => body.promise });
    const h = await harness({ request: async () => response }); await settle();
    assert.equal(h.adapter.getState(), 'loading'); assert.deepEqual(h.timers.delays, [15_000]);
    for (let step = 0; step < 5; step++) { h.timers.expire(); await settle(); }
    assert.equal(h.adapter.getState(), 'blocked');
    assert.equal(h.requests[0].init.signal?.aborted, true);
    const changes = [...h.changes];
    if (late === 'resolve') body.resolve(readReceipt); else body.reject(new Error('late JSON failure'));
    await settle(); await h.adapter.load();
    assert.deepEqual(h.changes, changes); assert.equal(h.requests.length, 3); assert.deepEqual(h.applied, []); h.adapter.cleanup();
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
    assert.equal(h.adapter.getState(), action === 'timeout' ? 'loading' : 'blocked');
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


test('temporary GET failures retry finitely and recover with authenticated account authority', async () => {
  for (const failure of ['timeout', 'network', '502', '503', '504']) {
    let reads = 0;
    const restored: Locale[] = [];
    const h = await harness({ restore: locale => restored.push(locale), request: async () => {
      if (++reads > 1) return json({ ok: true, data: { ...readReceipt.data, gameLocale: 'pt-BR' } });
      if (failure === 'timeout') return new Promise<Response>(() => {});
      if (failure === 'network') throw new TypeError('offline');
      return new Response('{}', { status: Number(failure) });
    } });
    await settle();
    if (failure === 'timeout') { h.timers.expire(); await settle(); }
    assert.equal(h.adapter.getState(), 'loading');
    assert.equal(h.requests.length, 1);
    h.timers.expire(); await settle();
    assert.equal(h.adapter.getState(), 'ready');
    assert.deepEqual(h.requests.map(entry => entry.init.method), ['GET', 'GET']);
    assert.deepEqual(restored, ['pt-BR']); assert.deepEqual(h.applied, []);
    assert.equal(h.timers.active.size, 0); h.adapter.cleanup();
  }
});

test('terminal permission, quota and malformed authority never schedule recovery', async () => {
  for (const response of [new Response('{}', { status: 401 }), new Response('{}', { status: 403 }),
    new Response('{}', { status: 429 }), new Response('not-json'), json({ ok: false }),
    json({ ok: true, data: { ...readReceipt.data, accountId: other } })]) {
    const h = await harness({ request: async () => response }); await settle();
    assert.equal(h.adapter.getState(), 'blocked');
    assert.equal(h.requests.length, 1); assert.equal(h.timers.active.size, 0);
    assert.deepEqual(h.applied, []); h.adapter.cleanup();
  }
});

test('GET server failures stop after three attempts without a refresh or successful write', async () => {
  const h = await harness({ request: async () => new Response('{}', { status: 503 }) });
  await settle();
  for (let retry = 0; retry < 2; retry++) { h.timers.expire(); await settle(); }
  assert.equal(h.adapter.getState(), 'blocked'); assert.equal(h.requests.length, 3);
  assert.deepEqual(h.timers.delays, [15000, 1000, 15000, 3000, 15000]);
  assert.equal(h.timers.active.size, 0); assert.equal(h.counts().identityChanges, 0);
  assert.deepEqual(h.applied, []); h.adapter.cleanup();
});

test('identity invalidation, unknown observation and cleanup cancel queued GET recovery', async () => {
  for (const end of ['identity', 'unknown', 'cleanup', 'invalidate']) {
    const h = await harness({ request: async () => new Response('{}', { status: 503 }) });
    await settle(); assert.equal(h.timers.active.size, 1);
    const staleTimer = [...h.timers.active.values()][0];
    if (end === 'identity') h.emit(other);
    else if (end === 'unknown') h.emit(undefined);
    else if (end === 'invalidate') h.adapter.invalidate();
    else h.adapter.cleanup();
    staleTimer(); await settle();
    assert.equal(h.requests.length, 1); assert.equal(h.timers.active.size, 0);
    assert.equal(h.adapter.getState(), 'blocked'); assert.deepEqual(h.applied, []);
    h.adapter.cleanup();
  }
});


test('synchronous unknown INITIAL_SESSION prevents GET until independent same-account resolution', async () => {
  const h = await harness({ observer: callback => { callback(undefined); return () => {}; } });
  await settle(); assert.equal(h.requests.length, 0); assert.equal(h.adapter.getState(), 'blocked');
  h.emit(owner); await settle();
  assert.equal(h.requests.length, 1); assert.equal(h.adapter.getState(), 'ready');
  assert.equal(h.counts().identityChanges, 0); assert.deepEqual(h.applied, []); h.adapter.cleanup();
});


test('resolved recovery timer cannot restart a fenced host after same-account identity recovery', async () => {
  let reads = 0;
  const h = await harness({ request: async () => ++reads === 1 ? new Response('{}', { status: 503 }) : json(readReceipt) });
  await settle();
  h.timers.expire(); // Timer resolved; old retry continuation is queued, not yet resumed.
  h.emit(undefined);
  h.emit(owner); // New host is legitimate, but the old loop must remain fenced.
  await settle();
  assert.equal(h.adapter.getState(), 'ready');
  assert.deepEqual(h.requests.map(entry => entry.init.method), ['GET', 'GET']);
  assert.equal(h.timers.active.size, 0); assert.deepEqual(h.applied, []);
  h.adapter.cleanup();
});


async function exhaustTemporaryReads(h: Awaited<ReturnType<typeof harness>>) {
  await settle();
  for (let retry = 0; retry < 2; retry++) { h.timers.expire(); await settle(); }
  assert.equal(h.adapter.getState(), 'blocked');
  assert.equal(h.timers.active.size, 0);
}

test('focus or online after exhausted reads recovers once with a fresh authenticated receipt', async () => {
  let reads = 0;
  const pending = deferred<Response>(), restored: Locale[] = [];
  const h = await harness({ restore: locale => restored.push(locale), request: async () =>
    ++reads <= 3 ? new Response('{}', { status: 503 }) : pending.promise });
  await exhaustTemporaryReads(h);
  assert.equal(h.requests.length, 3);
  h.recover(); h.recover(); h.recover(); await settle();
  assert.equal(h.requests.length, 4, 'overlapping focus/online events cannot duplicate an in-flight read');
  assert.equal(h.adapter.getState(), 'loading');
  pending.resolve(json({ ok: true, data: { ...readReceipt.data, gameLocale: 'pt-BR' } }));
  await settle(); h.recover();
  assert.equal(h.adapter.getState(), 'ready'); assert.equal(h.requests.length, 4);
  assert.deepEqual(restored, ['pt-BR']); assert.deepEqual(h.applied, []);
  assert.equal(h.counts().identityChanges, 0);
  h.adapter.cleanup(); h.adapter.cleanup(); h.recover();
  assert.deepEqual(h.recoveryCounts(), { subscriptions: 1, unsubscribes: 1 });
  assert.equal(h.requests.length, 4);
});

test('event recovery has a thirty-second cooldown and no scheduled polling', async () => {
  const h = await harness({ request: async () => new Response('{}', { status: 503 }) });
  await exhaustTemporaryReads(h);
  h.recover(); await exhaustTemporaryReads(h);
  assert.equal(h.requests.length, 6);
  for (let count = 0; count < 20; count++) h.recover();
  h.advanceClock(29_999); h.recover(); await settle();
  assert.equal(h.requests.length, 6); assert.equal(h.timers.active.size, 0);
  h.advanceClock(1); await settle();
  assert.equal(h.requests.length, 6, 'elapsed cooldown alone never causes a request');
  h.recover(); h.recover(); await settle();
  assert.equal(h.requests.length, 7); h.adapter.cleanup();
});

test('recovery events cannot cross identity, unknown, explicit invalidation or cleanup fences', async () => {
  for (const end of ['identity', 'unknown', 'invalidate', 'cleanup']) {
    const h = await harness({ request: async () => new Response('{}', { status: 503 }) });
    await exhaustTemporaryReads(h);
    if (end === 'identity') h.emit(other);
    else if (end === 'unknown') h.emit(undefined);
    else if (end === 'invalidate') h.adapter.invalidate();
    else h.adapter.cleanup();
    h.advanceClock(60_000); h.recover(); await settle();
    assert.equal(h.requests.length, 3); assert.equal(h.adapter.getState(), 'blocked');
    h.adapter.cleanup();
  }
});

test('identity change during event recovery fences its late receipt', async () => {
  let reads = 0;
  const pending = deferred<Response>(), restored: Locale[] = [];
  const h = await harness({ restore: locale => restored.push(locale), request: async () =>
    ++reads <= 3 ? new Response('{}', { status: 503 }) : pending.promise });
  await exhaustTemporaryReads(h); h.recover(); h.emit(other);
  pending.resolve(json(readReceipt)); await settle(); h.recover();
  assert.equal(h.requests.length, 4); assert.equal(h.requests[3].init.signal?.aborted, true);
  assert.equal(h.adapter.getState(), 'blocked'); assert.deepEqual(restored, []);
  assert.equal(h.counts().identityChanges, 1); h.adapter.cleanup();
});

test('authority failures never qualify for event recovery, even after a prior transient cycle', async () => {
  for (const response of [() => new Response('{}', { status: 401 }), () => new Response('{}', { status: 429 }),
    () => json({ ...readReceipt, data: { ...readReceipt.data, accountId: other } })]) {
    let reads = 0;
    const h = await harness({ request: async () => ++reads <= 3 ? new Response('{}', { status: 503 }) : response() });
    await exhaustTemporaryReads(h); h.recover(); await settle();
    assert.equal(h.adapter.getState(), 'blocked');
    h.advanceClock(60_000); h.recover(); await settle();
    assert.equal(h.requests.length, 4); h.adapter.cleanup();
  }
});

test('failed or ambiguous writes never trigger event recovery or replay', async () => {
  for (const failure of ['503', 'timeout']) {
    const h = await harness({ request: async (_input, init) => init.method === 'GET' ? json(readReceipt)
      : failure === '503' ? new Response('{}', { status: 503 }) : new Promise<Response>(() => {}) });
    await settle(); const saving = h.adapter.select('pt-BR'); await settle();
    if (failure === 'timeout') h.timers.expire();
    assert.equal(await saving, 'unconfirmed');
    h.advanceClock(60_000); h.recover(); h.recover(); await settle();
    assert.deepEqual(h.requests.map(entry => entry.init.method), ['GET', 'PUT']);
    assert.equal(h.adapter.getState(), 'blocked'); assert.deepEqual(h.applied, []); h.adapter.cleanup();
  }
});

test('guest, demo and unavailable contexts never subscribe to server read recovery', async () => {
  for (const mode of ['guest', 'demo', 'unavailable'] as const) {
    const h = await harness({ context: { mode } }); await settle(); h.recover();
    assert.equal(h.recoveryCounts().subscriptions, 0); assert.equal(h.requests.length, 0);
    h.adapter.cleanup();
  }
});

test('three read deadlines can recover on a later event without accepting their late responses', async () => {
  const stale = deferred<Response>(); let reads = 0;
  const h = await harness({ request: async () => ++reads <= 3 ? stale.promise : json(readReceipt) });
  await settle();
  for (let step = 0; step < 5; step++) { h.timers.expire(); await settle(); }
  assert.equal(h.adapter.getState(), 'blocked'); assert.equal(h.requests.length, 3);
  h.recover(); await settle();
  assert.equal(h.adapter.getState(), 'ready'); assert.equal(h.requests.length, 4);
  stale.resolve(json({ ...readReceipt, data: { ...readReceipt.data, accountId: other } }));
  await settle(); assert.equal(h.adapter.getState(), 'ready'); h.adapter.cleanup();
});

test('default browser recovery observes focus, online and visible document and removes all on cleanup', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const documentListeners = new Map<string, () => void>();
  let visibilityState = 'hidden';
  const documentRemoved: string[] = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    get visibilityState() { return visibilityState; },
    addEventListener: (event: string, callback: () => void) => documentListeners.set(event, callback),
    removeEventListener: (event: string, callback: () => void) => {
      assert.equal(documentListeners.get(event), callback); documentListeners.delete(event); documentRemoved.push(event);
    },
  } });
  const listeners = new Map<string, () => void>();
  const removed: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (event: string, callback: () => void) => listeners.set(event, callback),
    removeEventListener: (event: string, callback: () => void) => {
      assert.equal(listeners.get(event), callback); listeners.delete(event); removed.push(event);
    },
  } });
  let adapter: Adapter | undefined;
  try {
    const start = await startFactory(), timers = manualTimers();
    let reads = 0;
    adapter = start({ context: account, request: async () => ++reads <= 3
      ? new Response('{}', { status: 503 }) : json(readReceipt),
      apply: () => assert.fail('recovery must not apply a write'), onChange: () => {},
      observeIdentity: () => () => {}, onIdentityChange: () => assert.fail('same account'),
      setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    });
    assert.deepEqual([...listeners.keys()], ['focus', 'online']);
    assert.deepEqual([...documentListeners.keys()], ['visibilitychange']);
    await settle(); timers.expire(); await settle(); timers.expire(); await settle();
    assert.equal(adapter.getState(), 'blocked');
    const visibleCallback = documentListeners.get('visibilitychange')!;
    visibleCallback(); await settle();
    assert.equal(reads, 3, 'hidden document must not start recovery');
    visibilityState = 'visible'; visibleCallback();
    listeners.get('online')!(); listeners.get('focus')!(); await settle();
    assert.equal(reads, 4); assert.equal(adapter.getState(), 'ready');
    adapter.cleanup(); assert.equal(listeners.size, 0); assert.deepEqual(removed, ['focus', 'online']);
    assert.equal(documentListeners.size, 0); assert.deepEqual(documentRemoved, ['visibilitychange']);
    visibleCallback(); await settle(); assert.equal(reads, 4, 'retained callback cannot revive disposed host');
  } finally {
    adapter?.cleanup();
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

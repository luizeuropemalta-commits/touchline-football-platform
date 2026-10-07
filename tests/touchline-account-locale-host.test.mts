import assert from 'node:assert/strict';
import test from 'node:test';

type Locale = 'en-GB' | 'pt-BR';
type State = 'loading' | 'ready' | 'saving' | 'blocked';
type Result = 'saved' | 'local' | 'busy' | 'unconfirmed' | 'invalid';
type Context = { mode: 'account'; accountId: string } | { mode: 'guest' | 'demo' | 'unavailable' };
type Request = (input: string, init: RequestInit) => Promise<Response>;
type Host = { load(): Promise<void>; select(locale: unknown): Promise<Result>; invalidate(): void; dispose(): void; getState(): State };
type Factory = (options: { context: Context; request: Request; apply(locale: Locale): void; restore?(locale: Locale): void; onChange(state: State): void }) => Host;
const accountId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const context: Context = { mode: 'account', accountId };
const stamp = '2026-10-02T22:00:00.000Z';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const accountRead = (gameLocale: unknown = 'en-GB', gameLocaleRevision: unknown = '0') => ({
  ok: true, data: { accountId, gameLocale, gameLocaleRevision },
});
const saved = (gameLocale: Locale, gameLocaleRevision: string) => ({ ok: true, data: { gameLocale, gameLocaleRevision, updatedAt: stamp } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function harness(request: Request, hostContext: Context = context, restore?: (locale: Locale) => void) {
  // Load the real host and its real account-locale-selection dependency. Only
  // request/consumer callbacks are doubles; no controller logic is replicated.
  const loaded = await import(new URL('../lib/touchlineArena/account-locale-host.ts', import.meta.url).href);
  assert.equal(typeof loaded.createAccountLocaleHost, 'function');
  const create = loaded.createAccountLocaleHost as Factory;
  const calls: Array<{ input: string; init: RequestInit }> = [];
  const applied: Locale[] = [];
  const changes: State[] = [];
  const host = create({ context: hostContext,
    request: (input, init) => { calls.push({ input, init }); return request(input, init); },
    apply: locale => applied.push(locale), restore, onChange: state => changes.push(state) });
  return { host, calls, applied, changes };
}

test('host construction has zero I/O or callbacks and exposes initial state from trusted context', async () => {
  for (const mode of ['account', 'guest', 'demo', 'unavailable'] as const) {
    const h = await harness(async () => { throw new Error('construction must not request'); }, mode === 'account' ? context : { mode });
    assert.equal(h.host.getState(), mode === 'account' ? 'loading' : mode === 'unavailable' ? 'blocked' : 'ready');
    await Promise.resolve();
    assert.deepEqual(h.calls, []); assert.deepEqual(h.applied, []); assert.deepEqual(h.changes, []);
  }
});

test('guest and demo loads stay local and both public selections apply without account requests', async () => {
  for (const mode of ['guest', 'demo'] as const) {
    const h = await harness(async () => { throw new Error('local mode must not request'); }, { mode });
    await h.host.load(); await h.host.load();
    assert.equal(await h.host.select('pt-BR'), 'local');
    assert.equal(await h.host.select('en-GB'), 'local');
    assert.equal(h.host.getState(), 'ready');
    assert.deepEqual(h.applied, ['pt-BR', 'en-GB']); assert.deepEqual(h.calls, []);
  }
});

test('unavailable context stays blocked without account or guest fallback', async () => {
  const h = await harness(async () => { throw new Error('unavailable must not request'); }, { mode: 'unavailable' });
  await h.host.load();
  assert.equal(await h.host.select('pt-BR'), 'unconfirmed');
  assert.equal(h.host.getState(), 'blocked');
  assert.deepEqual(h.calls, []); assert.deepEqual(h.applied, []);
});

test('account loads exactly once using same-origin uncached GET and pending load cannot write', async () => {
  const pending = deferred<Response>();
  const h = await harness(async () => pending.promise);
  assert.equal(await h.host.select('pt-BR'), 'busy');
  assert.equal(h.calls.length, 0, 'selection must not implicitly load');
  const first = h.host.load(), second = h.host.load();
  assert.equal(await h.host.select('en-GB'), 'busy');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].input, '/api/notifications/preferences');
  assert.equal(h.calls[0].init.method, 'GET');
  assert.equal(h.calls[0].init.credentials, 'same-origin');
  assert.equal(h.calls[0].init.cache, 'no-store');
  assert.equal(h.calls[0].init.body, undefined);
  pending.resolve(json(accountRead()));
  await Promise.all([first, second]); await h.host.load();
  assert.equal(h.calls.length, 1); assert.equal(h.host.getState(), 'ready');
  assert.deepEqual(h.applied, []);
});

test('account read accepts all eight exact stored locales or null without applying or falling back', async () => {
  for (const locale of ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE', null]) {
    for (const revision of ['0', '9007199254740993', '9223372036854775806']) {
      const h = await harness(async () => json(accountRead(locale, revision)));
      await h.host.load();
      assert.equal(h.host.getState(), 'ready', String(locale));
      assert.equal(h.calls.length, 1);
      assert.deepEqual(h.applied, [], 'read is not a navigation or preference write');
    }
  }
});

test('one shared host serializes controls and delegates exact revision and identity to the real selection controller', async () => {
  const pending = deferred<Response>();
  let writes = 0;
  const h = await harness(async (_input, init) => {
    if (init.method === 'GET') return json(accountRead('ar-SA', '9007199254740993'));
    writes++;
    return writes === 1 ? pending.promise : json(saved('en-GB', '9007199254740995'));
  });
  await h.host.load();
  const desktopControl = (locale: unknown) => h.host.select(locale);
  const mobileControl = (locale: unknown) => h.host.select(locale);
  const first = desktopControl('pt-BR');
  assert.equal(h.host.getState(), 'saving');
  assert.equal(await mobileControl('en-GB'), 'busy');
  assert.equal(await desktopControl('pt-BR'), 'busy');
  assert.equal(writes, 1); assert.deepEqual(h.applied, []);
  const put = h.calls[1];
  assert.equal(put.input, '/api/notifications/preferences');
  assert.equal(put.init.method, 'PUT'); assert.equal(put.init.credentials, 'same-origin'); assert.equal(put.init.cache, 'no-store');
  assert.equal(new Headers(put.init.headers).get('X-Touchline-Expected-Account'), accountId);
  assert.equal(new Headers(put.init.headers).get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(put.init.body as string), { action: 'set_game_locale', locale: 'pt-BR', expectedRevision: '9007199254740993' });
  pending.resolve(json(saved('pt-BR', '9007199254740994')));
  assert.equal(await first, 'saved'); assert.equal(h.host.getState(), 'ready');
  assert.deepEqual(h.applied, ['pt-BR']);
  assert.equal(await mobileControl('en-GB'), 'saved');
  assert.deepEqual(JSON.parse(h.calls[2].init.body as string), { action: 'set_game_locale', locale: 'en-GB', expectedRevision: '9007199254740994' });
  assert.deepEqual(h.applied, ['pt-BR', 'en-GB']);
  assert.ok(h.changes.includes('saving')); assert.equal(h.changes.at(-1), 'ready');
});

test('failed or malformed account reads permanently block without retries or local application', async () => {
  const badBodies: unknown[] = [null, [], {}, { ok: false, data: accountRead().data },
    { ok: 'true', data: accountRead().data }, { ok: true }, { ok: true, data: null },
    { ok: true, data: { ...accountRead().data, accountId: otherId } },
    { ok: true, data: { gameLocale: 'en-GB', gameLocaleRevision: '0' } },
    ...[undefined, 'en', 'en-US', '__proto__', ' ar-SA', 1, false, {}].map(gameLocale => ({
      ok: true, data: { accountId, gameLocale, gameLocaleRevision: '0' },
    })),
    ...[undefined, null, 0, 1, '', '-1', '01', ' 0', '1e3', '9223372036854775807', '9223372036854775808'].map(revision => ({
      ok: true, data: { accountId, gameLocale: 'en-GB', gameLocaleRevision: revision },
    }))];
  const outcomes: Array<() => Promise<Response>> = [
    ...badBodies.map(body => async () => json(body)),
    ...[401, 403, 500].map(status => async () => json(accountRead(), status)),
    async () => new Response('{broken'), async () => { throw new Error('read lost'); },
  ];
  for (const outcome of outcomes) {
    const h = await harness(outcome);
    await h.host.load();
    assert.equal(h.host.getState(), 'blocked');
    assert.equal(await h.host.select('pt-BR'), 'unconfirmed');
    await h.host.load();
    assert.equal(h.calls.length, 1); assert.deepEqual(h.applied, []);
  }
});

test('only matching PUT receipts apply and any uncertainty blocks the shared host permanently', async () => {
  const badReceipts = [saved('en-GB', '1'), saved('pt-BR', '2'),
    { ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: 1, updatedAt: stamp } },
    { ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: '1', updatedAt: 'invalid' } }, { ok: false }];
  const failures: Array<() => Promise<Response>> = [...badReceipts.map(body => async () => json(body)),
    async () => json(saved('pt-BR', '1'), 401), async () => json({ ok: false }, 409),
    async () => { throw new Error('PUT response lost'); }];
  for (const failure of failures) {
    const h = await harness(async (_input, init) => init.method === 'GET' ? json(accountRead()) : failure());
    await h.host.load();
    assert.equal(await h.host.select('pt-BR'), 'unconfirmed');
    assert.equal(h.host.getState(), 'blocked');
    assert.equal(await h.host.select('en-GB'), 'unconfirmed');
    await h.host.load();
    assert.equal(h.calls.length, 2); assert.deepEqual(h.applied, []);
  }
});

test('public selection gate remains EN/PT even after reading a valid Arabic account preference', async () => {
  const h = await harness(async () => json(accountRead('ar-SA')));
  await h.host.load();
  for (const locale of ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE', null, undefined, {}, 'en']) {
    assert.equal(await h.host.select(locale), 'invalid');
  }
  assert.equal(h.host.getState(), 'ready'); assert.equal(h.calls.length, 1); assert.deepEqual(h.applied, []);
});

test('invalidate and dispose before load are permanent and perform no request', async () => {
  for (const method of ['invalidate', 'dispose'] as const) {
    const h = await harness(async () => json(accountRead()));
    h.host[method](); h.host[method]();
    await h.host.load();
    assert.equal(h.host.getState(), 'blocked');
    assert.equal(await h.host.select('pt-BR'), 'unconfirmed');
    assert.equal(h.calls.length, 0); assert.deepEqual(h.applied, []);
  }
});

test('invalidation and disposal fence late successful GET without reviving the host', async () => {
  for (const method of ['invalidate', 'dispose'] as const) {
    const pending = deferred<Response>();
    const h = await harness(async () => pending.promise);
    const loading = h.host.load();
    h.host[method]();
    const changesAfterInvalidation = [...h.changes];
    pending.resolve(json(accountRead()));
    await loading; await h.host.load();
    assert.equal(h.host.getState(), 'blocked');
    assert.equal(await h.host.select('pt-BR'), 'unconfirmed');
    assert.equal(h.calls.length, 1); assert.deepEqual(h.applied, []);
    assert.deepEqual(h.changes, changesAfterInvalidation, 'late read must not emit ready');
  }
});

test('invalidation and disposal fence late matching PUT receipts without implying the server write was cancelled', async () => {
  for (const method of ['invalidate', 'dispose'] as const) {
    const pending = deferred<Response>();
    const h = await harness(async (_input, init) => init.method === 'GET' ? json(accountRead()) : pending.promise);
    await h.host.load();
    const saving = h.host.select('pt-BR');
    assert.equal(h.host.getState(), 'saving');
    h.host[method]();
    const changesAfterInvalidation = [...h.changes];
    // The server may have committed. Lifecycle invalidation fences UI effects,
    // not server persistence, and must never reuse the old revision to retry.
    pending.resolve(json(saved('pt-BR', '1')));
    assert.equal(await saving, 'unconfirmed');
    assert.equal(h.host.getState(), 'blocked');
    assert.equal(await h.host.select('en-GB'), 'unconfirmed');
    await h.host.load();
    assert.equal(h.calls.length, 2); assert.deepEqual(h.applied, []);
    assert.deepEqual(h.changes, changesAfterInvalidation, 'late write must not emit ready or apply');
  }
});

test('confirmed same-account complete preference restores once without a PUT or selection callback', async () => {
  for (const locale of ['en-GB', 'pt-BR'] as const) {
    const restored: Locale[] = [];
    const h = await harness(async () => json(accountRead(locale, '41')), context, value => restored.push(value));
    await Promise.all([h.host.load(), h.host.load()]); await h.host.load();
    assert.deepEqual(restored, [locale]);
    assert.deepEqual(h.applied, []);
    assert.equal(h.host.getState(), 'ready');
    assert.deepEqual(h.calls.map(call => call.init.method), ['GET']);
  }
});

test('restoration leaves draft and absent account preferences untouched without guessing a replacement', async () => {
  for (const locale of ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE', null]) {
    const restored: Locale[] = [];
    const h = await harness(async () => json(accountRead(locale)), context, value => restored.push(value));
    await h.host.load();
    assert.deepEqual(restored, []); assert.deepEqual(h.applied, []);
    assert.equal(h.host.getState(), 'ready');
    assert.deepEqual(h.calls.map(call => call.init.method), ['GET']);
  }
});

test('restoration refuses invalid or mismatched identities and late disposed reads', async () => {
  for (const invalidId of ['', 'not-an-account', '__proto__']) {
    const restored: Locale[] = [];
    const h = await harness(async () => json({ ok: true, data: { accountId: invalidId, gameLocale: 'pt-BR', gameLocaleRevision: '0' } }), { mode: 'account', accountId: invalidId }, value => restored.push(value));
    await h.host.load();
    assert.equal(h.host.getState(), 'blocked'); assert.deepEqual(restored, []);
    assert.deepEqual(h.calls, []);
  }
  const mismatched: Locale[] = [];
  const wrong = await harness(async () => json({ ok: true, data: { accountId: otherId, gameLocale: 'pt-BR', gameLocaleRevision: '0' } }), context, value => mismatched.push(value));
  await wrong.host.load();
  assert.equal(wrong.host.getState(), 'blocked'); assert.deepEqual(mismatched, []);
  for (const method of ['dispose', 'invalidate'] as const) {
    const pending = deferred<Response>(), restored: Locale[] = [];
    const h = await harness(async () => pending.promise, context, value => restored.push(value));
    const loading = h.host.load(); h.host[method]();
    pending.resolve(json(accountRead('pt-BR'))); await loading;
    assert.deepEqual(restored, []); assert.equal(h.host.getState(), 'blocked');
  }
});

test('restoration preserves revision CAS and callback invalidation cannot revive the host', async () => {
  const restored: Locale[] = [];
  const h = await harness(async (_url, init) => init.method === 'GET'
    ? json(accountRead('pt-BR', '41')) : json(saved('en-GB', '42')), context, value => restored.push(value));
  await h.host.load();
  assert.equal(await h.host.select('en-GB'), 'saved');
  assert.deepEqual(JSON.parse(h.calls[1].init.body as string), { action: 'set_game_locale', locale: 'en-GB', expectedRevision: '41' });
  assert.deepEqual(restored, ['pt-BR']); assert.deepEqual(h.applied, ['en-GB']);
  let invalidate = () => {};
  const fenced = await harness(async () => json(accountRead('pt-BR')), context, () => invalidate());
  invalidate = () => fenced.host.invalidate();
  await fenced.host.load();
  assert.equal(fenced.host.getState(), 'blocked');
  assert.equal(fenced.changes.includes('ready'), false);
});

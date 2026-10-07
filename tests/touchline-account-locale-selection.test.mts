import assert from 'node:assert/strict';
import test from 'node:test';

type Locale = 'en-GB' | 'pt-BR';
type SelectionResult = 'saved' | 'local' | 'busy' | 'unconfirmed' | 'invalid';
type Options = {
  mode: 'account' | 'guest' | 'demo';
  initialRevision?: unknown;
  accountId?: unknown;
  request: (input: string, init: RequestInit) => Promise<Response>;
  apply: (locale: Locale) => void;
};
type Factory = (options: Options) => { select(locale: unknown): Promise<SelectionResult>; dispose(): void };
const moduleUrl = new URL('../lib/touchlineArena/account-locale-selection.ts', import.meta.url);
const updatedAt = '2026-10-02T19:30:00.000Z';
const receipt = (locale: Locale, gameLocaleRevision = '1') => ({ ok: true, data: { gameLocale: locale, gameLocaleRevision, updatedAt } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

async function factory(): Promise<Factory> {
  const loaded = await import(moduleUrl.href);
  assert.equal(typeof loaded.createAccountLocaleSelection, 'function');
  // Existing scenarios start from an explicitly supplied account read at revision0.
  return options => loaded.createAccountLocaleSelection({ initialRevision: '0', accountId: '11111111-1111-4111-8111-111111111111', ...options });
}

test('account locale selection construction has no requests or UI effects', async () => {
  const create = await factory();
  for (const mode of ['account', 'guest', 'demo'] as const) {
    let requests = 0;
    const applied: Locale[] = [];
    const selection = create({ mode, request: async () => { requests++; return response(receipt('en-GB')); },
      apply: locale => applied.push(locale) });
    assert.equal(typeof selection.select, 'function');
    await Promise.resolve();
    assert.equal(requests, 0);
    assert.deepEqual(applied, []);
  }
});

test('guest and demo apply both public locales locally without contacting the account', async () => {
  const create = await factory();
  for (const mode of ['guest', 'demo'] as const) {
    let requests = 0;
    const applied: Locale[] = [];
    const selection = create({ mode, request: async () => { requests++; throw new Error('must remain local'); },
      apply: locale => applied.push(locale) });
    assert.equal(await selection.select('pt-BR'), 'local');
    assert.equal(await selection.select('en-GB'), 'local');
    assert.deepEqual(applied, ['pt-BR', 'en-GB']);
    assert.equal(requests, 0);
  }
});

test('all modes reject nonpublic and malformed locales without requests or application', async () => {
  const create = await factory();
  const invalid: unknown[] = ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE',
    'en', 'en-US', 'pt-PT', 'EN-GB', ' en-GB', 'pt-BR ', '', '__proto__', 'constructor',
    null, undefined, 1, false, [], {}, Object('en-GB')];
  for (const mode of ['account', 'guest', 'demo'] as const) {
    let requests = 0;
    const applied: Locale[] = [];
    const selection = create({ mode, request: async () => { requests++; return response(receipt('en-GB')); },
      apply: locale => applied.push(locale) });
    for (const locale of invalid) assert.equal(await selection.select(locale), 'invalid');
    assert.equal(requests, 0);
    assert.deepEqual(applied, []);
  }
});

test('account sends only action, locale and expected revision to the same-origin endpoint', async () => {
  const create = await factory();
  for (const locale of ['en-GB', 'pt-BR'] as const) {
    const calls: Array<{ input: string; init: RequestInit }> = [];
    const applied: Locale[] = [];
    const selection = create({ mode: 'account', request: async (input, init) => {
      calls.push({ input, init });
      assert.deepEqual(applied, [], 'no optimistic language application');
      return response(receipt(locale));
    }, apply: value => applied.push(value) });
    assert.equal(await selection.select(locale), 'saved');
    assert.equal(calls.length, 1);
    const { input, init } = calls[0];
    assert.equal(input, '/api/notifications/preferences');
    assert.equal(init.method, 'PUT');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    assert.equal(new Headers(init.headers).get('content-type'), 'application/json');
    assert.equal(new Headers(init.headers).get('X-Touchline-Expected-Account'), '11111111-1111-4111-8111-111111111111');
    assert.equal(typeof init.body, 'string');
    assert.deepEqual(JSON.parse(init.body as string), { action: 'set_game_locale', locale, expectedRevision: '0' });
    assert.deepEqual(applied, [locale]);
  }
});

test('a pending account selection returns busy for another selection and does not apply before receipt', async () => {
  const create = await factory();
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  let requests = 0;
  const applied: Locale[] = [];
  const selection = create({ mode: 'account', request: async () => { requests++; return pending; },
    apply: locale => applied.push(locale) });
  const first = selection.select('pt-BR');
  assert.equal(await selection.select('en-GB'), 'busy');
  assert.equal(await selection.select('pt-BR'), 'busy', 'same locale must not duplicate the pending save');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
  release(response(receipt('pt-BR')));
  assert.equal(await first, 'saved');
  assert.deepEqual(applied, ['pt-BR']);
});

test('HTTP failures never apply a locale even when their body claims success', async () => {
  const create = await factory();
  for (const status of [400, 401, 403, 409, 500]) {
    const applied: Locale[] = [];
    let requests = 0;
    const selection = create({ mode: 'account', request: async () => {
      requests++; return response(receipt('pt-BR'), status);
    }, apply: locale => applied.push(locale) });
    assert.equal(await selection.select('pt-BR'), 'unconfirmed', String(status));
    assert.equal(await selection.select('en-GB'), 'unconfirmed', 'uncertain account state remains latched');
    assert.equal(await selection.select('pt-BR'), 'unconfirmed');
    assert.equal(requests, 1, 'neither implicit nor explicit retry is allowed on this instance');
    assert.deepEqual(applied, []);
  }
});

test('malformed, mismatched and incomplete receipts do not announce saved or apply', async () => {
  const create = await factory();
  const badBodies: unknown[] = [null, [], {}, { ok: false, data: receipt('pt-BR').data },
    { ok: 'true', data: receipt('pt-BR').data }, { ok: true }, { ok: true, data: null },
    { ok: true, data: [] }, receipt('en-GB'),
    { ok: true, data: { gameLocale: 'ar-SA', updatedAt } },
    { ok: true, data: { locale: 'pt-BR', updatedAt } },
    ...[undefined, null, '', 'not-a-date', 1790969400000, '2026-02-30T12:00:00.000Z'].map(value => ({
      ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: '1', updatedAt: value },
    }))];
  for (const body of badBodies) {
    const applied: Locale[] = [];
    let requests = 0;
    const selection = create({ mode: 'account', request: async () => { requests++; return response(body); }, apply: locale => applied.push(locale) });
    assert.equal(await selection.select('pt-BR'), 'unconfirmed', JSON.stringify(body));
    assert.equal(await selection.select('en-GB'), 'unconfirmed');
    assert.equal(requests, 1, 'unconfirmed receipt latches the instance');
    assert.deepEqual(applied, []);
  }
  const applied: Locale[] = [];
  let requests = 0;
  const selection = create({ mode: 'account', request: async () => { requests++; return new Response('{broken'); }, apply: locale => applied.push(locale) });
  assert.equal(await selection.select('pt-BR'), 'unconfirmed');
  assert.equal(await selection.select('en-GB'), 'unconfirmed');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
});

test('request exceptions latch the instance against every later account selection', async () => {
  const create = await factory();
  let requests = 0;
  const applied: Locale[] = [];
  const selection = create({ mode: 'account', request: async () => {
    requests++;
    if (requests === 1) throw new Error('synthetic network failure');
    return response(receipt('pt-BR'));
  }, apply: locale => applied.push(locale) });
  assert.equal(await selection.select('pt-BR'), 'unconfirmed');
  await Promise.resolve();
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
  assert.equal(await selection.select('pt-BR'), 'unconfirmed');
  assert.equal(await selection.select('en-GB'), 'unconfirmed');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
});

test('unconfirmed receipts latch the instance even when a later request would succeed', async () => {
  const create = await factory();
  let requests = 0;
  const applied: Locale[] = [];
  const selection = create({ mode: 'account', request: async (_input, init) => {
    requests++;
    const { locale } = JSON.parse(init.body as string) as { locale: Locale };
    return requests === 1 ? response({ ok: true, data: {} }) : response(receipt(locale));
  }, apply: locale => applied.push(locale) });
  assert.equal(await selection.select('pt-BR'), 'unconfirmed');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
  assert.equal(await selection.select('pt-BR'), 'unconfirmed');
  assert.equal(await selection.select('en-GB'), 'unconfirmed');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
});

test('confirmed successful account choices remain sequentially selectable', async () => {
  const create = await factory();
  let requests = 0;
  const applied: Locale[] = [];
  const selection = create({ mode: 'account', request: async (_input, init) => {
    requests++;
    const { locale, expectedRevision } = JSON.parse(init.body as string) as { locale: Locale; expectedRevision: string };
    assert.equal(expectedRevision, String(requests - 1));
    return response(receipt(locale, String(requests)));
  }, apply: locale => applied.push(locale) });
  assert.equal(await selection.select('pt-BR'), 'saved');
  assert.equal(await selection.select('en-GB'), 'saved');
  assert.equal(requests, 2);
  assert.deepEqual(applied, ['pt-BR', 'en-GB']);
});

test('account requires a canonical explicit initial revision and never infers zero', async () => {
  const create = await factory();
  for (const initialRevision of [undefined, null, 0, 1, '', '-1', '01', '1e3', '9223372036854775807', '9223372036854775808']) {
    let requests = 0;
    const applied: Locale[] = [];
    const selection = create({ mode: 'account', initialRevision,
      request: async () => { requests++; return response(receipt('pt-BR')); },
      apply: locale => applied.push(locale) });
    assert.equal(await selection.select('pt-BR'), 'unconfirmed');
    assert.equal(requests, 0);
    assert.deepEqual(applied, []);
  }
});

test('account identity must be explicit before any selection request', async () => {
  const create = await factory();
  for (const accountId of [undefined,null,'','bad',42]) {
    let requests=0;
    const applied: Locale[]=[];
    const selection=create({mode:'account',accountId,request:async()=>{requests++;return response(receipt('pt-BR'));},apply:locale=>applied.push(locale)});
    assert.equal(await selection.select('pt-BR'),'unconfirmed');
    assert.equal(requests,0); assert.deepEqual(applied,[]);
  }
});

test('revision receipts must be canonical exact next strings; large revisions remain exact', async () => {
  const create = await factory();
  for (const next of [undefined, null, 1, '0', '2', '01']) {
    let requests = 0;
    const applied: Locale[] = [];
    const selection = create({ mode: 'account', request: async () => {
      requests++; return response({ ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: next, updatedAt } });
    }, apply: locale => applied.push(locale) });
    assert.equal(await selection.select('pt-BR'), 'unconfirmed');
    assert.equal(await selection.select('en-GB'), 'unconfirmed');
    assert.equal(requests, 1);
    assert.deepEqual(applied, []);
  }
  const expected: string[] = [];
  const applied: Locale[] = [];
  const selection = create({ mode: 'account', initialRevision: '9007199254740993', request: async (_url, init) => {
    const body = JSON.parse(init.body as string);
    expected.push(body.expectedRevision);
    return response(receipt(body.locale, (BigInt(body.expectedRevision) + 1n).toString()));
  }, apply: locale => applied.push(locale) });
  assert.equal(await selection.select('pt-BR'), 'saved');
  assert.equal(await selection.select('en-GB'), 'saved');
  assert.deepEqual(expected, ['9007199254740993', '9007199254740994']);
  assert.deepEqual(applied, ['pt-BR', 'en-GB']);
});

test('disposing an old account controller fences its late receipt and later selections', async () => {
  const create = await factory();
  let release!: (value: Response) => void;
  let requests = 0;
  const applied: Locale[] = [];
  const selection = create({ mode: 'account', request: async () => {
    requests++; return new Promise<Response>(resolve => { release = resolve; });
  }, apply: locale => applied.push(locale) });
  const pending = selection.select('pt-BR');
  selection.dispose();
  release(response(receipt('pt-BR')));
  assert.equal(await pending, 'unconfirmed');
  assert.equal(await selection.select('en-GB'), 'unconfirmed');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
});

test('lost response followed by a late server commit cannot race a second language request', async () => {
  const create = await factory();
  let requests = 0;
  let serverLocale: Locale = 'en-GB';
  let commitLate: (() => void) | undefined;
  const applied: Locale[] = [];
  const selection = create({ mode: 'account', request: async (_input, init) => {
    requests++;
    const { locale } = JSON.parse(init.body as string) as { locale: Locale };
    if (requests === 1) {
      // The server may still commit after the client stops receiving a response.
      // This callback explicitly models that uncertainty; no network is used.
      commitLate = () => { serverLocale = locale; };
      throw new Error('response lost while server write remains pending');
    }
    serverLocale = locale;
    return response(receipt(locale));
  }, apply: locale => applied.push(locale) });
  assert.equal(await selection.select('pt-BR'), 'unconfirmed');
  assert.equal(serverLocale, 'en-GB');
  assert.equal(await selection.select('en-GB'), 'unconfirmed', 'do not create a newer write that the old commit could overwrite');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
  assert.ok(commitLate);
  commitLate();
  assert.equal(serverLocale, 'pt-BR');
  assert.equal(await selection.select('en-GB'), 'unconfirmed', 'late commit does not restore known ordering on this instance');
  assert.equal(requests, 1);
  assert.deepEqual(applied, []);
});

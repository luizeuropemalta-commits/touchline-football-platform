import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { startAccountLocaleBrowser } from '../lib/touchlineArena/account-locale-browser.ts';
import * as i18n from '../lib/touchlineArena/i18n.ts';
import * as menuCopy from '../lib/touchlineArena/account-locale-menu-i18n.ts';
import * as publicErrorCopy from '../lib/touchlineArena/public-error-i18n.ts';
import { startAccountLocaleIdentityObserver } from '../lib/touchlineArena/account-locale-identity-observer.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const context = { mode: 'account', accountId: owner };
const json = (body: unknown) => new Response(JSON.stringify(body));
const receipt = { ok: true, data: { accountId: owner, gameLocale: null, gameLocaleRevision: '3' } };
const saved = { ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: '4', updatedAt: '2026-10-02T21:00:00Z' } };
async function settle() { for (let i = 0; i < 50; i++) await Promise.resolve(); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

// Component wiring harness, not a React scheduler or real browser proof.
function harness(mode = context, request = async (_url: string, init: RequestInit) => json(init.method === 'GET' ? receipt : saved), variant = 'menu', initialHref = 'https://example.test/touchline-clubs?club=42&lang=en-GB#players') {
  const source = readFileSync(new URL('../components/touchline/AccountLocaleMenu.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let cursor = 0, effect: (() => (() => void)) | undefined, mounted = false, phase = '';
  const slots: unknown[] = [], calls: RequestInit[] = [], navigations: string[] = [], storageWrites: Array<[string, string]> = [];
  let authCalls = 0, unsubscribes = 0, refreshes = 0;
  let timerSerial = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let identity: (_event: string, session: { user: { id: string } } | null) => void;
  const window = { location: { href: initialHref, assign: (url: string) => navigations.push(url) }, localStorage: { setItem(key: string, value: string) { storageWrites.push([key, value]); } } };
  const document = { cookie: '' };
  const modules: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => { const n = cursor++; if (!(n in slots)) slots[n] = typeof initial === 'function' ? initial() : initial; return [slots[n], (next: unknown) => { slots[n] = typeof next === 'function' ? next(slots[n]) : next; }]; },
      useRef: (initial: unknown) => { const n = cursor++; if (!(n in slots)) slots[n] = { current: initial }; return slots[n]; },
      useEffect: (callback: () => (() => void)) => { if (!mounted) { effect = callback; phase = 'passive'; } },
      useLayoutEffect: (callback: () => (() => void)) => { if (!mounted) { effect = callback; phase = 'layout'; } },
    },
    'react/jsx-runtime': jsx,
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    'lucide-react': { Check: () => null, ChevronDown: () => null, Languages: () => null },
    '@/lib/touchlineArena/account-locale-browser': { startAccountLocaleBrowser },
    '@/lib/touchlineArena/account-locale-identity-observer': { startAccountLocaleIdentityObserver: (options: Parameters<typeof startAccountLocaleIdentityObserver>[0]) => startAccountLocaleIdentityObserver({ ...options,
      setTimer: (callback, delay) => { timers.set(++timerSerial, { callback, delay }); return timerSerial; },
      clearTimer: handle => { timers.delete(handle as number); },
    }) },
    '@/lib/touchlineArena/public-error-i18n': publicErrorCopy,
    './TouchlineGlobalNavigation.module.css': { default: { link: 'shared-control' } },
    '@/lib/touchlineArena/presentation-locale-intent': { readTouchlinePresentationLocaleIntent: () => null, rememberTouchlinePresentationLocaleIntent: () => false },
    '@/lib/touchlineArena/i18n': i18n,
    '@/lib/touchlineArena/account-locale-menu-i18n': menuCopy,
    '@/lib/supabase/client': { createClient: () => { authCalls++; return { auth: {
      getUser: async () => ({ data: { user: { id: owner } }, error: null }),
      onAuthStateChange: (callback: typeof identity) => { identity = callback; return { data: { subscription: { unsubscribe: () => { unsubscribes++; } } } }; },
    } }; } },
  };
  const exports: { default?: (props: unknown) => unknown } = {};
  runInNewContext(output, { exports, URL, document, window, queueMicrotask,
    fetch: async (url: string, init: RequestInit) => { calls.push(init); return request(url, init); },
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  function render() { cursor = 0; return exports.default!({ context: mode, locale: new URL(initialHref).searchParams.get('lang') ?? 'en-GB', menuClassName: 'menu', panelClassName: 'panel', variant }); }
  render();
  let cleanup = effect!(); mounted = true;
  return { render, cleanup: () => cleanup(), calls, navigations, document, storageWrites,
    runIdentityRead() {
      const entry = [...timers].find(([, timer]) => timer.delay === 0); assert.ok(entry);
      timers.delete(entry[0]); entry[1].callback();
    },
    commitRecovery() { mounted = false; render(); mounted = true; cleanup(); cleanup = effect!(); },
    changeContextBeforePassive(next: typeof mode) {
      mode = next; mounted = false; render(); mounted = true;
      // Model commit layout phase only: passive cleanup has not run yet.
      if (phase === 'layout') { cleanup(); cleanup = effect!(); }
    },
    emitSession: (session: { user: { id: string } } | null) => identity!('INITIAL_SESSION', session),
    emit: (id: string | null) => identity!('SIGNED_IN', id === null ? null : { user: { id } }), counts: () => ({ authCalls, unsubscribes, refreshes }) };
}
type Element = { type: unknown; props: Record<string, unknown> };
test('blocked language copy offers retry in eight locales without requiring a page reload', () => {
  const expected = {
    'en-GB': 'Language could not be confirmed. Try again.',
    'pt-BR': 'Não foi possível confirmar o idioma. Tente novamente.',
    'es-ES': 'No se pudo confirmar el idioma. Vuelve a intentarlo.',
    'it-IT': 'Impossibile confermare la lingua. Riprova.',
    'fr-FR': 'La langue n’a pas pu être confirmée. Réessayez.',
    'ar-SA': 'تعذّر تأكيد اللغة. حاول مرة أخرى.',
    'tr-TR': 'Dil doğrulanamadı. Tekrar deneyin.',
    'de-DE': 'Die Sprache konnte nicht bestätigt werden. Versuche es erneut.',
  };
  assert.deepEqual(Object.keys(expected), i18n.TOUCHLINE_APPROVED_LOCALES.map(entry => entry.code));
  for (const [locale, message] of Object.entries(expected)) {
    assert.equal(menuCopy.getTouchlineAccountLocaleMenuCopy(locale, true).blocked, message);
    assert.equal(menuCopy.getTouchlineAccountLocaleMenuCopy(locale).blocked,
      locale === 'pt-BR' ? expected['pt-BR'] : expected['en-GB']);
  }
});
test('locale loading and blocked feedback stay accessible without visible header notices', async () => {
  for (const variant of ['select', 'menu']) {
    const pending = deferred<Response>();
    const h = harness(context, async () => pending.promise, variant);
    const loading = elements(h.render(), 'p')[0];
    assert.equal(loading.props.className, 'sr-only');
    assert.equal(loading.props.role, 'status');
    assert.equal(loading.props['aria-live'], 'polite');
    assert.ok(loading.props.children);
    pending.resolve(new Response('{}', { status: 503 }));
    await settle();
    const blocked = elements(h.render(), 'p')[0];
    assert.equal(blocked.props.className, 'sr-only');
    assert.equal(blocked.props.role, 'status');
    assert.equal(blocked.props['aria-live'], 'polite');
    assert.equal(blocked.props.children, 'Language could not be confirmed. Try again.');
    const retry = elements(h.render(), 'button')[0];
    assert.equal(retry.props.children, 'Try again');
    assert.equal(retry.props.className, 'shared-control');
    assert.deepEqual(h.navigations, []);
    h.cleanup();
  }
});
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(n => elements(n, type));
  if (!tree || typeof tree !== 'object' || !('props' in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...elements(node.props.children, type)];
}
function click(anchor: Element, modified = false) {
  let prevented = false;
  const event = { button: 0, metaKey: modified, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false,
    currentTarget: { href: anchor.props.href }, preventDefault: () => { prevented = true; } };
  (anchor.props.onClick as (event: unknown) => void)(event);
  return { event, prevented };
}
test('menu keeps two language anchors and blocks account choice until read then saves before navigation', async () => {
  const pending = deferred<Response>();
  const h = harness(context, async (_url, init) => init.method === 'GET' ? json(receipt) : pending.promise);
  let links = elements(h.render(), 'a'); assert.equal(links.length, 2);
  assert.equal(links[1].props['aria-disabled'], true);
  assert.equal(click(links[1]).prevented, true); assert.equal(h.calls.length, 1);
  await settle(); links = elements(h.render(), 'a');
  assert.notEqual(links[1].props['aria-disabled'], true);
  click(links[1]); click(links[0]); assert.equal(h.calls.length, 2); assert.deepEqual(h.navigations, []);
  pending.resolve(json(saved)); await settle();
  assert.deepEqual(h.navigations, ['https://example.test/touchline-clubs?club=42&lang=pt-BR#players']);
  assert.match(h.document.cookie, /pt-BR/); h.cleanup();
});
test('modified link click only navigates and never saves preference', async () => {
  const h = harness(); await settle();
  const result = click(elements(h.render(), 'a')[1], true);
  assert.equal(result.prevented, false); assert.equal(h.calls.length, 1);
  assert.equal(result.event.currentTarget.href, 'https://example.test/touchline-clubs?club=42&lang=pt-BR#players');
  assert.deepEqual(h.navigations, []); h.cleanup();
});
test('unconfirmed save shows failure without navigation or browser preference write', async () => {
  const h = harness(context, async (_url, init) => init.method === 'GET' ? json(receipt) : json({ ok: false }));
  await settle(); click(elements(h.render(), 'a')[1]); await settle();
  assert.deepEqual(h.navigations, []); assert.equal(h.document.cookie, '');
  assert.equal(elements(h.render(), 'a')[1].props['aria-disabled'], true);
  assert.ok(elements(h.render(), 'p').some(n => n.props.role === 'status'));
  h.cleanup();
});
test('identity switch and cleanup fence late save and unsubscribe', async () => {
  const pending = deferred<Response>();
  const h = harness(context, async (_url, init) => init.method === 'GET' ? json(receipt) : pending.promise);
  await settle(); click(elements(h.render(), 'a')[1]); h.emit(null); await settle();
  assert.equal(h.counts().refreshes, 1); pending.resolve(json(saved)); await settle();
  assert.deepEqual(h.navigations, []); h.cleanup(); assert.equal(h.counts().unsubscribes, 1);
});
test('unavailable session user blocks until separate same-account verification and fresh receipt', async () => {
  for (const variant of ['menu', 'select']) {
    const h = harness(context, undefined, variant);
    await settle();
    // SDK-compatible failure input, not a real auth session or SDK instance.
    const user = new Proxy({ id: owner }, {
      get(_target, property) {
        if (property === 'id') throw new Error('User unavailable in separate userStorage');
        return undefined;
      },
    });
    assert.doesNotThrow(() => h.emitSession({ user }));
    const blocked = h.render();
    if (variant === 'menu') {
      const anchors = elements(blocked, 'a');
      assert.ok(anchors.every(anchor => anchor.props['aria-disabled'] === true));
      click(anchors[1]);
    } else {
      assert.equal(elements(blocked, 'select')[0].props.disabled, true);
    }
    await settle();
    assert.equal(h.counts().refreshes, 0, 'unknown is not signed out');
    h.runIdentityRead(); await settle();
    assert.equal(h.counts().refreshes, 0, 'same verified identity needs no route refresh');
    if (variant === 'menu') assert.ok(elements(h.render(), 'a').every(anchor => anchor.props['aria-disabled'] === false));
    else assert.equal(elements(h.render(), 'select')[0].props.disabled, false);
    assert.deepEqual(h.calls.map(call => call.method), ['GET', 'GET']);
    assert.deepEqual(h.navigations, []);
    assert.deepEqual(h.storageWrites, []);
    assert.equal(h.document.cookie, '');
    h.cleanup();
    assert.equal(h.counts().unsubscribes, 1);
  }
});
test('null and different account sessions remain blocked without preference writes', async () => {
  for (const session of [null, { user: { id: '22222222-2222-4222-8222-222222222222' } }]) {
    const h = harness();
    await settle();
    assert.doesNotThrow(() => h.emitSession(session));
    const anchors = elements(h.render(), 'a');
    assert.ok(anchors.every(anchor => anchor.props['aria-disabled'] === true));
    click(anchors[1]);
    await settle();
    assert.equal(h.counts().refreshes, 1);
    assert.deepEqual(h.calls.map(call => call.method), ['GET']);
    assert.deepEqual(h.navigations, []);
    assert.deepEqual(h.storageWrites, []);
    assert.equal(h.document.cookie, '');
    h.cleanup();
  }
});
test('unavailable user in guest context is blocked until identity is resolved', async () => {
  const h = harness({ mode: 'guest', accountId: '' });
  await settle();
  const user = new Proxy({ id: owner }, {
    get() { throw new Error('User unavailable in separate userStorage'); },
  });
  assert.doesNotThrow(() => h.emitSession({ user }));
  await settle();
  assert.ok(elements(h.render(), 'a').every(anchor => anchor.props['aria-disabled'] === true));
  assert.equal(h.counts().refreshes, 0);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.navigations, []);
  assert.deepEqual(h.storageWrites, []);
  assert.equal(h.document.cookie, '');
  h.cleanup();
});

test('explicit retry creates one fresh authenticated read and never replays a failed selection', async () => {
  let reads = 0;
  const h = harness(context, async (_url, init) => {
    if (init.method === 'PUT') return new Response('{}', { status: 503 });
    reads++; return reads === 1 ? new Response('{}', { status: 503 }) : json(receipt);
  });
  await settle(); assert.equal(reads, 1);
  const retry = elements(h.render(), 'button')[0];
  assert.equal(retry.props.children, 'Try again'); assert.equal(retry.props.className, 'shared-control');
  (retry.props.onClick as () => void)(); h.commitRecovery(); await settle();
  assert.equal(reads, 2); assert.equal(elements(h.render(), 'a')[0].props['aria-disabled'], false);
  click(elements(h.render(), 'a')[1]); await settle();
  (elements(h.render(), 'button')[0].props.onClick as () => void)(); h.commitRecovery(); await settle();
  assert.deepEqual(h.calls.map(call => call.method), ['GET', 'GET', 'PUT', 'GET']);
  assert.deepEqual(h.navigations, []); assert.deepEqual(h.storageWrites, []);
  assert.equal(h.document.cookie, ''); h.cleanup();
});
test('demo and unavailable instantiate no browser auth client or account request', async () => {
  for (const mode of ['demo', 'unavailable']) {
    const h = harness({ mode, accountId: '' }); await settle();
    click(elements(h.render(), 'a')[1]); await settle();
    assert.equal(h.counts().authCalls, 0); assert.equal(h.calls.length, 0);
    assert.equal(h.navigations.length, mode === 'demo' ? 1 : 0); h.cleanup();
  }
});
test('new context commit fences previous account receipt before passive effect cleanup', async () => {
  const pending = deferred<Response>();
  const h = harness(context, async (_url, init) => init.method === 'GET' ? json(receipt) : pending.promise);
  await settle(); click(elements(h.render(), 'a')[1]);
  h.changeContextBeforePassive({ mode: 'account', accountId: '22222222-2222-4222-8222-222222222222' });
  pending.resolve(json(saved)); await settle();
  assert.deepEqual(h.navigations, []); assert.equal(h.document.cookie, '');
  assert.equal(h.calls[1].signal?.aborted, true); h.cleanup();
});
test('auth select variant uses the same pending and confirmed account contract', async () => {
  const pending = deferred<Response>();
  const h = harness(context, async (_url, init) => init.method === 'GET' ? json(receipt) : pending.promise, 'select');
  assert.equal(elements(h.render(), 'select')[0].props.disabled, true);
  await settle();
  const select = elements(h.render(), 'select')[0];
  assert.equal(select.props.disabled, false);
  (select.props.onChange as (e: unknown) => void)({ target: { value: 'pt-BR' } });
  assert.equal(elements(h.render(), 'select')[0].props.disabled, true);
  assert.deepEqual(h.navigations, []); pending.resolve(json(saved)); await settle();
  assert.equal(h.navigations.length, 1); h.cleanup();
});
test('auth select demo choice stays local without auth or account requests', async () => {
  const h = harness({ mode: 'demo', accountId: '' }, undefined, 'select'); await settle();
  const select = elements(h.render(), 'select')[0];
  (select.props.onChange as (e: unknown) => void)({ target: { value: 'pt-BR' } }); await settle();
  assert.equal(h.calls.length, 0); assert.equal(h.counts().authCalls, 0); assert.equal(h.navigations.length, 1); h.cleanup();
});
test('auth select verified guest stays local and retains query, hash, cookie and two-language options', async () => {
  const h = harness({ mode: 'guest', accountId: '' }, undefined, 'select'); await settle();
  const select = elements(h.render(), 'select')[0]; assert.equal(select.props.disabled, false);
  (select.props.onChange as (e: unknown) => void)({ target: { value: 'pt-BR' } }); await settle();
  assert.equal(h.calls.length, 0);
  // A guest observes sign-in so a stale local-only control cannot survive it.
  assert.equal(h.counts().authCalls, 1);
  assert.deepEqual(h.navigations, ['https://example.test/touchline-clubs?club=42&lang=pt-BR#players']);
  assert.match(h.document.cookie, /pt-BR/);
  h.emit(owner); await settle();
  assert.equal(elements(h.render(), 'select')[0].props.disabled, true);
  (select.props.onChange as (e: unknown) => void)({ target: { value: 'en-GB' } }); await settle();
  assert.equal(h.calls.length, 0); assert.equal(h.navigations.length, 1);
  h.cleanup(); assert.equal(h.counts().unsubscribes, 1);
});
test('auth select retains the public two-language gate and ignores unsupported input', async () => {
  const h = harness(context, undefined, 'select'); await settle();
  const tree = h.render();
  assert.deepEqual(elements(tree, 'option').map(node => node.props.value), ['pt-BR', 'en-GB']);
  assert.deepEqual(elements(tree, 'option').map(node => node.props.children), ['🇧🇷 Português', '🇬🇧 English']);
  assert.equal(elements(tree, 'select')[0].props['aria-label'], 'Select language');
  (elements(tree, 'select')[0].props.onChange as (e: unknown) => void)({ target: { value: 'es-ES' } }); await settle();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.navigations, []);
  assert.equal(elements(h.render(), 'select')[0].props.disabled, false); h.cleanup();
});
test('auth select blocks unconfirmed save and unavailable context without local success', async () => {
  const h = harness(context, async (_url, init) => init.method === 'GET' ? json(receipt) : json({ ok: false }), 'select');
  await settle();
  (elements(h.render(), 'select')[0].props.onChange as (e: unknown) => void)({ target: { value: 'pt-BR' } }); await settle();
  assert.equal(elements(h.render(), 'select')[0].props.disabled, true);
  assert.ok(elements(h.render(), 'p').some(node => node.props.role === 'status'));
  assert.deepEqual(h.navigations, []); assert.equal(h.document.cookie, ''); h.cleanup();
  const unavailable = harness({ mode: 'unavailable', accountId: '' }, undefined, 'select'); await settle();
  const select = elements(unavailable.render(), 'select')[0]; assert.equal(select.props.disabled, true);
  (select.props.onChange as (e: unknown) => void)({ target: { value: 'pt-BR' } }); await settle();
  assert.equal(unavailable.calls.length, 0); assert.equal(unavailable.counts().authCalls, 0);
  assert.deepEqual(unavailable.navigations, []); unavailable.cleanup();
});
test('auth select new identity commit fences the old account save before passive cleanup', async () => {
  const pending = deferred<Response>();
  const h = harness(context, async (_url, init) => init.method === 'GET' ? json(receipt) : pending.promise, 'select');
  await settle();
  (elements(h.render(), 'select')[0].props.onChange as (e: unknown) => void)({ target: { value: 'pt-BR' } });
  h.changeContextBeforePassive({ mode: 'account', accountId: '22222222-2222-4222-8222-222222222222' });
  pending.resolve(json(saved)); await settle();
  assert.deepEqual(h.navigations, []); assert.equal(h.document.cookie, '');
  assert.equal(h.calls[1].signal?.aborted, true); h.cleanup();
});

test('menu restores confirmed account preference with one GET, retaining route parameters and fragment', async () => {
  const h = harness(context, async () => json({ ok: true, data: { ...receipt.data, gameLocale: 'pt-BR' } }));
  await settle(); h.render(); await settle();
  assert.deepEqual(h.calls.map(call => call.method), ['GET']);
  assert.deepEqual(h.navigations, ['https://example.test/touchline-clubs?club=42&lang=pt-BR#players']);
  assert.deepEqual(h.storageWrites, [['touchline:locale:v1', 'pt-BR']]);
  assert.match(h.document.cookie, /touchline:locale:v1=pt-BR/);
  h.cleanup();
});

test('restoring an already displayed locale refreshes browser preference without a navigation loop', async () => {
  for (const locale of ['en-GB', 'pt-BR']) {
    const href = `https://example.test/touchline-clubs?club=42&lang=${locale}#players`;
    for (let mount = 0; mount < 2; mount++) {
      const h = harness(context, async () => json({ ok: true, data: { ...receipt.data, gameLocale: locale } }), 'select', href);
      await settle(); h.render(); await settle();
      assert.deepEqual(h.calls.map(call => call.method), ['GET']);
      assert.deepEqual(h.navigations, []);
      assert.deepEqual(h.storageWrites, [['touchline:locale:v1', locale]]);
      assert.ok(h.document.cookie.includes(`=${locale};`));
      h.cleanup();
    }
  }
});

test('saved draft and null preferences do not rewrite browser storage or trigger navigation', async () => {
  for (const gameLocale of ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE', null]) {
    const h = harness(context, async () => json({ ok: true, data: { ...receipt.data, gameLocale } }));
    await settle();
    assert.deepEqual(h.calls.map(call => call.method), ['GET']);
    assert.deepEqual(h.navigations, []); assert.deepEqual(h.storageWrites, []);
    assert.equal(h.document.cookie, ''); h.cleanup();
  }
});

test('identity invalidation and unmount prevent late GET restoration and browser writes', async () => {
  for (const end of ['identity', 'cleanup', 'context'] as const) {
    const pending = deferred<Response>();
    const h = harness(context, async () => pending.promise);
    if (end === 'identity') h.emit(null);
    else if (end === 'cleanup') h.cleanup();
    else h.changeContextBeforePassive({ mode: 'account', accountId: '22222222-2222-4222-8222-222222222222' });
    pending.resolve(json({ ok: true, data: { ...receipt.data, gameLocale: 'pt-BR' } }));
    await settle();
    assert.deepEqual(h.navigations, []); assert.deepEqual(h.storageWrites, []);
    assert.equal(h.document.cookie, '');
    assert.ok(h.calls.every(call => call.method === 'GET'));
    if (end !== 'cleanup') h.cleanup();
  }
});

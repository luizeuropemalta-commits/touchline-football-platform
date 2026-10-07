import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { createPushRehearsalAttempt } from '../lib/touchlineArena/push-rehearsal-attempt.ts';
import * as rehearsalCopy from '../lib/touchlineArena/push-rehearsal-i18n.ts';

const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const installation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requestId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
type Element = { type: unknown; props: Record<string, unknown> };
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(value => elements(value, type));
  if (!tree || typeof tree !== 'object' || !('props' in tree)) return [];
  const node = tree as Element; return [...(node.type === type ? [node] : []), ...elements(node.props.children, type)];
}
function text(tree: unknown): string {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (tree && typeof tree === 'object' && 'props' in tree) return text((tree as Element).props.children);
  return '';
}
type Options = { configuredInstallationId?: string | null; locale?: string; permission?: NotificationPermission;
  permissionWait?: Promise<NotificationPermission>; registrationWait?: Promise<Response>; sendWait?: Promise<Response>;
  acknowledgement?: unknown; missingStorage?: boolean; missingAuth?: boolean; storedAttempt?: boolean; delayedIdentity?: boolean };

// Component wiring harness with real registration + attempt modules. Not a
// React scheduler, native permission UI, Supabase SDK or browser rendering proof.
function harness(options: Options = {}) {
  let props = { accountId: account, configuredInstallationId: Object.hasOwn(options, 'configuredInstallationId') ? options.configuredInstallationId : installation, locale: options.locale ?? 'en-GB' };
  let cursor = 0, mounted = false, effect: (() => (() => void)) | undefined;
  const slots: unknown[] = [], calls: string[] = [], requests: { url: string; init: RequestInit }[] = [];
  const observers = new Set<(event: string, session: { user: { id: string } } | null) => void>();
  const store = new Map<string, string>([['touchline:push-installation-id:v1', installation]]);
  if (options.storedAttempt) store.set(`touchline:push-rehearsal-attempt:v1:${account}:${installation}`, 'unknown');
  const timers = new Map<number, () => void>(); let timerId = 0;
  const notification = { permission: options.permission ?? 'granted', requestPermission() {
    calls.push('permission'); return (options.permissionWait ?? Promise.resolve('granted' as const)).then(value => { notification.permission = value; return value; });
  } };
  const subscription = { options: { applicationServerKey: new Uint8Array(65).buffer }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/synthetic', keys: {} }) };
  const worker = { pushManager: { getSubscription: async () => { calls.push('subscription'); return subscription; }, subscribe: async () => { throw Error('must reuse binding'); } } };
  const globals = { URL, Response, AbortController, atob, crypto: { randomUUID: () => requestId },
    setTimeout: (callback: () => void, _delay: number) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    process: { env: { NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: 'A'.repeat(87) } },
    Notification: notification,
    navigator: { serviceWorker: { register: async () => { calls.push('worker'); return worker; }, ready: Promise.resolve() } },
    window: { Notification: notification, PushManager: {}, localStorage: options.missingStorage ? undefined : { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } } },
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url === '/api/notifications/devices') return options.registrationWait ?? Response.json(Object.hasOwn(options, 'acknowledgement') ? options.acknowledgement : { ok: true, delivery: 'not-sent', accountId: account, installationId: installation });
      assert.equal(url, '/api/notifications/rehearsal');
      return options.sendWait ?? Response.json({ ok: true, status: 'provider_accepted' }, { status: 202 });
    },
  };
  const compile = (path: string, dependencies: Record<string, unknown>) => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const exports: Record<string, unknown> = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { ...globals, exports, require(name: string) { assert.ok(name in dependencies, name); return dependencies[name]; } });
    return exports;
  };
  const registration = compile('lib/touchlineArena/push-device-registration.ts', {});
  const component = compile('components/touchline/notifications/TouchlinePushRehearsal.tsx', {
    react: {
      useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], (next: unknown) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useId: () => 'rehearsal-test',
      useLayoutEffect(callback: () => (() => void)) { if (!mounted) effect = callback; },
    },
    'react/jsx-runtime': jsx,
    '@/lib/touchlineArena/push-rehearsal-i18n': rehearsalCopy,
    '@/lib/supabase/client': { createClient() { calls.push('auth-client'); return options.missingAuth ? null : { auth: { onAuthStateChange(callback: typeof observers extends Set<infer T> ? T : never) {
      observers.add(callback); if (!options.delayedIdentity) callback('INITIAL_SESSION', { user: { id: props.accountId } });
      return { data: { subscription: { unsubscribe() { observers.delete(callback); } } } };
    } } }; } },
    '@/lib/touchlineArena/push-device-registration': registration,
    '@/lib/touchlineArena/push-rehearsal-attempt': { createPushRehearsalAttempt },
    '@/components/touchline/TouchlineGlobalNavigation.module.css': { default: { link: 'canonical-link' } },
  }).default as (props: unknown) => Element;
  function render() { cursor = 0; return component(props); }
  render(); let cleanup = effect!(); mounted = true;
  const button = (name: RegExp) => { const node = elements(render(), 'button').find(node => name.test(text(node))); assert.ok(node, name.toString()); return node; };
  return { render, calls, requests, store, notification, timers,
    button, click(name: RegExp) { (button(name).props.onClick as () => unknown)(); },
    consent(value: boolean) { const input = elements(render(), 'input')[0]; assert.ok(input); (input.props.onChange as (event: unknown) => void)({ target: { checked: value } }); },
    emit(id: string | null) { for (const callback of observers) callback('SIGNED_IN', id ? { user: { id } } : null); },
    cleanup: () => cleanup(), observers: () => observers.size,
    expire() { for (const callback of [...timers.values()]) callback(); },
    replay() { cleanup(); mounted = false; render(); cleanup = effect!(); mounted = true; },
    changeAccount() { props = { ...props, accountId: other }; mounted = false; render(); cleanup(); cleanup = effect!(); mounted = true; },
  };
}

test('mount and effect replay only observe identity, never register, prompt, send or change storage', () => {
  const h = harness(); assert.deepEqual(h.calls, ['auth-client']); assert.equal(h.requests.length, 0); assert.equal(h.store.size, 1);
  assert.equal(h.observers(), 1); h.replay(); assert.equal(h.observers(), 1); assert.equal(h.requests.length, 0);
  assert.ok(elements(h.render(), 'button').every(button => button.props.className === 'canonical-link'));
  h.cleanup(); assert.equal(h.observers(), 0);
});

test('preparation remains disabled until a matching initial identity event and does not re-enable after invalidation', () => {
  const h = harness({ delayedIdentity: true, permission: 'default' });
  assert.equal(h.button(/Prepare this device/).props.disabled, true); h.click(/Prepare this device/);
  assert.deepEqual(h.calls, ['auth-client']); h.emit(account);
  assert.equal(h.button(/Prepare this device/).props.disabled, false); h.emit(other); h.emit(account);
  assert.equal(h.button(/Prepare this device/).props.disabled, true); assert.equal(h.requests.length, 0); h.cleanup();
});

test('permission is requested synchronously from prepare gesture, with no automatic test or game consent', async () => {
  const permission = deferred<NotificationPermission>(); const h = harness({ permission: 'default', permissionWait: permission.promise });
  h.click(/Prepare this device/); assert.deepEqual(h.calls, ['auth-client', 'permission']); assert.equal(h.requests.length, 0);
  h.click(/Prepare this device/); assert.equal(h.calls.filter(value => value === 'permission').length, 1);
  permission.resolve('granted'); await tick();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].url, '/api/notifications/devices');
  assert.equal(elements(h.render(), 'input')[0].props.checked, false); assert.equal(h.button(/Send one test/).props.disabled, true);
  h.cleanup();
});

test('matching acknowledgement plus separate explicit consent sends exactly one diagnostic and never claims receipt', async () => {
  const h = harness(); h.click(/Prepare this device/); await tick();
  h.click(/Send one test/); assert.equal(h.requests.length, 1);
  h.consent(true); h.click(/Send one test/); h.click(/Send one test/); await tick();
  assert.deepEqual(h.requests.map(value => value.url), ['/api/notifications/devices', '/api/notifications/rehearsal']);
  assert.equal(new Headers(h.requests[1].init.headers).get('x-touchline-expected-account'), account);
  assert.deepEqual(JSON.parse(String(h.requests[1].init.body)), { installationId: installation, requestId, explicitTestConsent: true });
  assert.match(text(h.render()), /does not confirm receipt/i); assert.equal(h.button(/Send one test/).props.disabled, true);
  assert.equal([...h.store.keys()].filter(key => key.includes('push-rehearsal-attempt')).length, 1);
  h.cleanup();
});

test('unconfigured or different installation stays registered-but-test-not-enabled without an attempt', async () => {
  for (const configuredInstallationId of [null, other]) {
    const h = harness({ configuredInstallationId }); h.click(/Prepare this device/); await tick();
    assert.match(text(h.render()), /registered.*test.*not enabled/i); assert.equal(elements(h.render(), 'input').length, 0);
    assert.equal(h.requests.length, 1); assert.equal(h.store.size, 1); h.cleanup();
  }
});

test('wrong account acknowledgement, missing auth or storage cannot enable a test', async () => {
  for (const options of [{ acknowledgement: { ok: true, delivery: 'not-sent', accountId: other, installationId: installation } }, { missingAuth: true }, { missingStorage: true }]) {
    const h = harness(options); h.click(/Prepare this device/); await tick();
    assert.equal(elements(h.render(), 'input').length, 0); assert.ok(h.requests.every(request => request.url !== '/api/notifications/rehearsal'));
    assert.equal(h.store.size, 1); h.cleanup();
  }
});

test('permission timeout, identity switch and unmount fence a late granted permission', async () => {
  for (const action of ['timeout', 'identity', 'unmount'] as const) {
    const permission = deferred<NotificationPermission>(); const h = harness({ permission: 'default', permissionWait: permission.promise });
    h.click(/Prepare this device/); if (action === 'timeout') h.expire(); else if (action === 'identity') h.emit(other); else h.cleanup();
    await tick(); permission.resolve('granted'); await tick();
    assert.equal(h.requests.length, 0); assert.equal(h.calls.includes('worker'), false); assert.equal(h.timers.size, 0); h.cleanup();
  }
});

test('denied permission never registers and an unconfirmed test never offers a repeat', async () => {
  const denied = harness({ permission: 'default', permissionWait: Promise.resolve('denied') }); denied.click(/Prepare this device/); await tick();
  assert.equal(denied.requests.length, 0); assert.match(text(denied.render()), /Permission not granted/); denied.cleanup();
  const uncertain = harness({ sendWait: Promise.resolve(Response.json({ ok: false, status: 'unconfirmed' }, { status: 503 })) });
  uncertain.click(/Prepare this device/); await tick(); uncertain.consent(true); uncertain.click(/Send one test/); await tick();
  assert.match(text(uncertain.render()), /Outcome unconfirmed/); assert.equal(uncertain.requests.length, 2);
  assert.equal(elements(uncertain.render(), 'input').length, 0); assert.equal(uncertain.button(/Prepare this device/).props.disabled, true);
  assert.equal([...uncertain.store.keys()].filter(key => key.includes('push-rehearsal-attempt')).length, 1); uncertain.cleanup();
});

test('same-account events preserve flow but new-account commit and logout fence a late registration', async () => {
  for (const action of ['commit', 'logout'] as const) {
    const registration = deferred<Response>(); const h = harness({ registrationWait: registration.promise });
    h.emit(account); h.click(/Prepare this device/); await tick(); assert.equal(h.requests.length, 1);
    if (action === 'commit') h.changeAccount(); else h.emit(null);
    registration.resolve(Response.json({ ok: true, delivery: 'not-sent', accountId: account, installationId: installation })); await tick();
    assert.equal(elements(h.render(), 'input').length, 0); assert.equal(h.requests[0].init.signal?.aborted, true);
    assert.equal(h.requests.length, 1); h.cleanup();
  }
});

test('permission is rechecked before send and uncertain existing marker is never reset', async () => {
  const revoked = harness(); revoked.click(/Prepare this device/); await tick(); revoked.consent(true); revoked.notification.permission = 'denied';
  revoked.click(/Send one test/); await tick(); assert.equal(revoked.requests.length, 1); revoked.cleanup();
  const marked = harness({ storedAttempt: true }); marked.click(/Prepare this device/); await tick(); marked.consent(true); marked.click(/Send one test/); await tick();
  assert.equal(marked.requests.length, 1); assert.match(text(marked.render()), /earlier attempt/i);
  assert.equal(marked.store.get(`touchline:push-rehearsal-attempt:v1:${account}:${installation}`), 'unknown'); marked.cleanup();
});

test('identity change or unmount while sending aborts transport and fences late accepted UI', async () => {
  for (const action of ['identity', 'unmount'] as const) {
    const send = deferred<Response>(); const h = harness({ sendWait: send.promise }); h.click(/Prepare this device/); await tick();
    h.consent(true); h.click(/Send one test/); await tick(); assert.equal(h.requests.length, 2);
    if (action === 'identity') h.emit(other); else h.cleanup();
    send.resolve(Response.json({ ok: true, status: 'provider_accepted' }, { status: 202 })); await tick();
    assert.equal(h.requests[1].init.signal?.aborted, true); assert.doesNotMatch(text(h.render()), /Accepted by the push provider/);
    assert.equal(h.requests.length, 2); h.cleanup();
  }
});

test('Portuguese control keeps diagnostic consent distinct from game settings', async () => {
  const h = harness({ locale: 'pt-BR' }); h.click(/Preparar este dispositivo/); await tick();
  assert.match(text(h.render()), /um único TESTE/); assert.match(text(h.render()), /preferências do jogo/);
  assert.equal(elements(h.render(), 'input')[0].props.checked, false); h.cleanup();
});

import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { handlePushRehearsal } from '../lib/touchlineArena/push-rehearsal-handler.ts';
import { createPushRehearsalStore } from '../lib/touchlineArena/push-rehearsal-store.ts';
import { parseMatchPushVapidConfig } from '../lib/touchlineArena/match-push-vapid-config.ts';
import { hasTouchLineArenaAccess } from '../lib/touchlineArena/auth-access.ts';
import { resolveTouchlineDataSource } from '../lib/touchlineMirror/runtime.ts';
import * as isolation from '../lib/touchlinePreview/isolation.ts';

const actor = '10000000-0000-4000-8000-000000000001';
const installation = '20000000-0000-4000-8000-000000000001';
const device = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const reservation = '50000000-0000-4000-8000-000000000001';
const origin = 'https://qa.example.test';
const qa = 'https://xgxbwqxjssxxuihuwmgy.supabase.co';
const curve = createECDH('prime256v1'); curve.setPrivateKey(Buffer.alloc(32, 1));
const subscription = { endpoint: 'https://fcm.googleapis.com/synthetic-device', keys: {
  p256dh: curve.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url'),
} };
const environment: Record<string, string | undefined> = {
  TOUCHLINE_PUSH_REHEARSAL_ENABLED: 'true', TOUCHLINE_PUSH_REHEARSAL_ORIGIN: origin,
  TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID: actor, TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID: installation,
  SUPABASE_URL: qa, NEXT_PUBLIC_SUPABASE_URL: qa,
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon',
  TOUCHLINE_WEB_PUSH_SUBJECT: 'mailto:test@example.test',
  TOUCHLINE_WEB_PUSH_PRIVATE_KEY: Buffer.alloc(32, 1).toString('base64url'),
  NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: curve.getPublicKey().toString('base64url'),
};
type Options = {
  env?: Record<string, string | undefined>; user?: unknown; authError?: unknown;
  fail?: 'auth' | 'admin' | 'read' | 'reserve' | 'send' | 'finish';
  authPromise?: Promise<unknown>; missingClient?: boolean; missingAdmin?: boolean;
  reservationStatus?: string; transport?: 'provider_accepted' | 'rejected';
};
function request(body: unknown = { installationId: installation, requestId, explicitTestConsent: true }, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request(`${origin}/api/notifications/rehearsal`, { method: 'POST', signal,
    headers: { origin, 'content-type': 'application/json', 'x-touchline-expected-account': actor, ...headers }, body: JSON.stringify(body) });
}
function harness(options: Options = {}) {
  const calls: string[] = [], sends: Record<string, unknown>[] = [];
  const signals: AbortSignal[] = [];
  const env = { ...environment, ...options.env };
  const source = readFileSync(new URL('../lib/touchlineArena/push-rehearsal-server.ts', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const admin = {
    from(name: string) {
      assert.equal(name, 'notification_devices'); calls.push('read');
      if (options.fail === 'read') throw Error('private-subscription-secret');
      const query = {
        select() { return query; },
        eq(column: string, value: string) { assert.equal(value, column === 'user_id' ? actor : installation); return query; },
        abortSignal(signal: AbortSignal) { assert.equal(signal.aborted, false); signals.push(signal); return query; },
        async maybeSingle() { return { error: null, data: { id: device, user_id: actor, installation_id: installation, permission: 'granted', push_subscription: subscription } }; },
      };
      return query;
    },
    rpc(name: string, input: Record<string, unknown>) {
      const operation = name === 'touchline_reserve_push_rehearsal' ? 'reserve' : 'finish'; calls.push(operation);
      assert.ok(['touchline_reserve_push_rehearsal', 'touchline_finish_push_rehearsal'].includes(name));
      if (options.fail === operation) throw Error('private-subscription-secret');
      return { async abortSignal(signal: AbortSignal) {
        assert.equal(signal.aborted, false); signals.push(signal);
        return { error: null, data: operation === 'finish' ? true : options.reservationStatus ? { status: options.reservationStatus } : {
          status: 'reserved', reservationId: reservation, actorId: input.p_actor, requestId: input.p_request,
          installationId: input.p_installation, deviceId: input.p_device, fingerprint: input.p_fingerprint, expiresAt: input.p_expires_at,
        } };
      } };
    },
  };
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => {
      calls.push('auth-client'); if (options.fail === 'auth') throw Error('private-subscription-secret');
      if (options.missingClient) return null;
      return { auth: { getUser: async () => {
        calls.push('get-user'); if (options.authPromise) return options.authPromise;
        return { data: { user: Object.hasOwn(options, 'user') ? options.user : { id: actor, app_metadata: { touchline_arena_access_v1: true } } }, error: options.authError ?? null };
      } } };
    } },
    '@/lib/supabase/admin': { createAdminClient: () => {
      calls.push('admin'); if (options.fail === 'admin') throw Error('private-subscription-secret'); return options.missingAdmin ? null : admin;
    } },
    '@/lib/touchlineMirror/runtime': { resolveTouchlineDataSource },
    '@/lib/touchlinePreview/isolation': isolation,
    './auth-access': { hasTouchLineArenaAccess },
    './push-rehearsal-handler': { handlePushRehearsal },
    './push-rehearsal-store': { createPushRehearsalStore },
    './match-push-vapid-config': { parseMatchPushVapidConfig },
    './match-push-transport': { sendMatchWebPush: async (input: Record<string, unknown>) => {
      calls.push('send'); sends.push(input); assert.equal((input.signal as AbortSignal).aborted, false);
      if (options.fail === 'send') throw Error('private-subscription-secret'); return options.transport ?? 'provider_accepted';
    } },
  };
  const exports: { handlePushRehearsalServer?: (input: Request) => Promise<Response> } = {};
  vm.runInNewContext(javascript, { exports, process: { env }, URL, Response, Date, Error,
    require(name: string) { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; } });
  return { run: (input = request()) => exports.handlePushRehearsalServer!(input), calls, sends, signals };
}

test('default-off and exact server flag reject without auth, admin or transport', async () => {
  for (const flag of [undefined, '', 'false', 'TRUE', '1', ' true ']) {
    const h = harness({ env: { TOUCHLINE_PUSH_REHEARSAL_ENABLED: flag } });
    assert.equal((await h.run()).status, 503); assert.deepEqual(h.calls, []);
  }
});

test('QA project, HTTPS origin, UUID and complete matching VAPID are required before privileged work', async () => {
  const cases = [
    ...['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'].flatMap(key => ['https://production.supabase.co', 'http://xgxbwqxjssxxuihuwmgy.supabase.co', `${qa}/rest/v1`, `${qa}?query=1`, `${qa}.evil.test`, 'not-a-url'].map(value => ({ [key]: value }))),
    { NEXT_PUBLIC_SUPABASE_URL: undefined }, { SUPABASE_URL: ' ' },
    ...['TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID', 'TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID'].flatMap(key => [undefined, 'bad'].map(value => ({ [key]: value }))),
    ...[undefined, 'http://qa.example.test', `${origin}/`, `${origin}/path`, `${origin}?q=1`].map(value => ({ TOUCHLINE_PUSH_REHEARSAL_ORIGIN: value })),
    { TOUCHLINE_WEB_PUSH_SUBJECT: undefined }, { TOUCHLINE_WEB_PUSH_PRIVATE_KEY: 'bad' },
    { TOUCHLINE_WEB_PUSH_PRIVATE_KEY: Buffer.alloc(32, 2).toString('base64url') },
    { NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: undefined },
    { SUPABASE_SERVICE_ROLE_KEY: undefined }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined },
    { TOUCHLINE_DATA_SOURCE: 'invalid' }, { TOUCHLINE_DATA_SOURCE: 'qa-mirror', TOUCHLINE_QA_READ_ORIGIN: 'https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app' },
    { TOUCHLINE_DEPLOYMENT_MODE: 'isolated-preview' }, { NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: 'isolated-preview' }, { VERCEL_ENV: 'production' },
  ];
  for (const env of cases) {
    const h = harness({ env }); const response = await h.run();
    assert.equal(response.status, 503, JSON.stringify(Object.keys(env))); assert.deepEqual(h.calls, []);
  }
});

test('method, request/config origin, cross-site and isolated request fences precede auth', async () => {
  for (const input of [new Request(`${origin}/api/notifications/rehearsal`),
    request(undefined, { origin: 'https://other.example.test' }), request(undefined, { 'sec-fetch-site': 'cross-site' }),
    request(undefined, { 'x-touchline-isolated-preview': 'true' }),
    new Request('https://other.example.test/api/notifications/rehearsal', request()),
  ]) {
    const h = harness(); assert.ok([403, 405, 503].includes((await h.run(input)).status)); assert.deepEqual(h.calls, []);
  }
});

test('real authenticated eligible configured actor is mandatory before lazy service-client creation', async () => {
  for (const options of [{ user: null }, { user: { id: actor } },
    { user: { id: requestId, app_metadata: { touchline_arena_access_v1: true } } },
    { authError: { message: 'private-subscription-secret' } }, { missingClient: true }]) {
    const h = harness(options); assert.ok([401, 403, 503].includes((await h.run()).status));
    assert.ok(!h.calls.includes('admin')); assert.equal(h.sends.length, 0);
  }
  for (const [body, headers] of [[{ installationId: requestId, requestId, explicitTestConsent: true }, {}],
    [undefined, { 'x-touchline-expected-account': requestId }]] as const) {
    const h = harness(); assert.equal((await h.run(request(body, headers))).status, 409);
    assert.ok(!h.calls.includes('admin')); assert.equal(h.sends.length, 0);
  }
});

test('configured real core and store reserve, reread, send once and finish without reporting delivery', async () => {
  for (const env of [{}, { SUPABASE_URL: undefined }]) {
    const h = harness({ env }); const response = await h.run();
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { ok: true, status: 'provider_accepted' });
    assert.deepEqual(h.calls, ['auth-client', 'get-user', 'admin', 'read', 'reserve', 'read', 'send', 'finish']);
    assert.equal(h.sends.length, 1); const sent = h.sends[0];
    assert.deepEqual(sent.subscription, subscription);
    assert.equal(JSON.parse(sent.payload as string).silent, true); assert.equal(JSON.parse(sent.payload as string).href, '/notifications');
    assert.match(JSON.parse(sent.payload as string).title, /TESTE.*TEST/);
    assert.equal((sent.vapid as { publicKey: string }).publicKey, environment.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY);
    assert.ok((sent.expiresAt as Date).getTime() - Date.now() <= 30_000);
    assert.ok(h.signals.every(signal => signal.aborted));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});

test('reservation refusals and missing service client never send', async () => {
  for (const options of [{ missingAdmin: true }, ...['duplicate', 'cooldown', 'unknown', 'unavailable'].map(reservationStatus => ({ reservationStatus }))]) {
    const h = harness(options); assert.ok([409, 429, 503].includes((await h.run()).status)); assert.equal(h.sends.length, 0);
  }
});

test('external failures are sanitized and never retried; rejection is not delivery', async () => {
  for (const fail of ['auth', 'admin', 'read', 'reserve', 'send', 'finish'] as const) {
    const h = harness({ fail }); const response = await h.run(); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private|secret|subscription|10000000|20000000|30000000/);
    assert.ok(h.sends.length <= 1); assert.ok(h.calls.filter(call => call === 'reserve').length <= 1);
  }
  const h = harness({ transport: 'rejected' }); const response = await h.run();
  assert.equal(response.status, 502); assert.deepEqual(await response.json(), { ok: false, status: 'rejected' }); assert.equal(h.sends.length, 1);
});

test('aborted request fences ignored and late authentication before any service client or send', async () => {
  let resolve!: (value: unknown) => void;
  const authPromise = new Promise(done => { resolve = done; });
  const h = harness({ authPromise }); const controller = new AbortController();
  const pending = h.run(request(undefined, {}, controller.signal));
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.ok(h.calls.includes('get-user')); controller.abort();
  assert.equal((await pending).status, 503);
  resolve({ data: { user: { id: actor, app_metadata: { touchline_arena_access_v1: true } } }, error: null });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.ok(!h.calls.includes('admin')); assert.equal(h.sends.length, 0);
});

test('five-second core deadline bounds stalled authentication and rejects its late success', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve!: (value: unknown) => void;
  const h = harness({ authPromise: new Promise(done => { resolve = done; }) });
  const pending = h.run();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.ok(h.calls.includes('get-user'));
  context.mock.timers.tick(5000);
  assert.equal((await pending).status, 503);
  resolve({ data: { user: { id: actor, app_metadata: { touchline_arena_access_v1: true } } }, error: null });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.deepEqual(h.calls, ['auth-client', 'get-user']); assert.equal(h.sends.length, 0);
});

test('Next route is server Node-only and forwards the original request to the boundary', async () => {
  const source = readFileSync(new URL('../app/api/notifications/rehearsal/route.ts', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const input = request(); const expected = new Response(null, { status: 503 });
  const exports: { runtime?: string; POST?: (request: Request) => Promise<Response> } = {};
  vm.runInNewContext(javascript, { exports, require(name: string) {
    if (name === 'server-only') return {};
    assert.equal(name, '@/lib/touchlineArena/push-rehearsal-server');
    return { handlePushRehearsalServer: async (received: Request) => { assert.equal(received, input); return expected; } };
  } });
  assert.equal(exports.runtime, 'nodejs'); assert.equal(await exports.POST!(input), expected);
});

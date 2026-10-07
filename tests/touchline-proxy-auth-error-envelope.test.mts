import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import * as hosts from '../lib/server/touchline-host-routing.ts';
import * as origin from '../lib/touchlineArena/public-origin.ts';
import * as auth from '../lib/touchlineArena/auth-i18n.ts';
import * as access from '../lib/touchlineArena/auth-access.ts';
import * as locale from '../lib/touchlineArena/root-locale.ts';
import * as resolver from '../lib/touchlineArena/catalogue-locale.ts';
import * as errors from '../lib/touchlineArena/public-error-i18n.ts';

const host = 'https://candidate.vercel.app';
const customer = { id: 'customer-fixture', email: 'customer@example.test', app_metadata: { touchline_arena_access_v1: true } };
const owner = { id: 'owner-fixture', email: 'owner@example.test', app_metadata: { touchline_arena_access_v1: true } };
type User = typeof customer;
type Receipt = { data?: { user: User | null } | null; error?: unknown } | null | undefined;

function compile(source: string, exports: object, context: Record<string, unknown>) {
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...context });
}

function harness(receipt: Receipt, reject = false, options: { origin?: string; offline?: boolean; cookie?: string } = {}) {
  let reads = 0;
  const process = { env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic',
    TOUCHLINE_OWNER_EMAILS: 'owner@example.test',
    TOUCHLINE_SITE_OFFLINE: options.offline ? 'true' : 'false',
  } };
  const ownerModule = {};
  compile(readFileSync(new URL('../lib/admin/owner.ts', import.meta.url), 'utf8'), ownerModule, { process });
  const siteLocales = {};
  compile(readFileSync(new URL('../lib/touchlineArena/site-locales-release.ts', import.meta.url), 'utf8'), siteLocales, { process });
  const modules: Record<string, unknown> = {
    '@/lib/touchlineArena/site-locales-release': siteLocales,
    'next/server': { NextResponse },
    '@/lib/server/touchline-host-routing': hosts,
    '@/lib/touchlineArena/public-origin': origin,
    '@/lib/touchlineArena/auth-i18n': auth,
    '@/lib/touchlineArena/auth-access': access,
    '@/lib/touchlineArena/root-locale': locale,
    '@/lib/touchlineArena/catalogue-locale': resolver,
    '@/lib/touchlineArena/public-error-i18n': errors,
    '@/lib/touchlineAudit/access': { isTouchlineAuditMode: () => false },
    '@/lib/touchlinePreview/isolation': { resolveTouchlineIsolatedPreviewRoutePolicy: () => ({ status: 'inactive' }) },
    '@/lib/touchlinePreview/qa-visual-review': { TOUCHLINE_STABLE_QA_HOST: 'qa.example.test', isTouchlineQaAuthenticatedVisualReviewRoute: () => false },
    '@/lib/admin/owner': ownerModule,
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => {
      reads++;
      if (reject) throw new Error('synthetic auth failure');
      return receipt;
    } } }) },
  };
  const exports = {} as { proxy: (request: NextRequest) => Promise<NextResponse> };
  compile(readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8'), exports, {
    URL, Headers, process,
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  return {
    run: (path: string) => exports.proxy(new NextRequest((options.origin ?? host) + path, {
      headers: options.cookie ? { cookie: options.cookie } : {},
    })),
    reads: () => reads,
  };
}

function assertLogin(response: NextResponse, path: string, admin = false, expectedOrigin = host) {
  assert.equal(response.status, 307);
  assert.notEqual(response.headers.get('location'), null);
  const target = new URL(response.headers.get('location')!);
  assert.equal(target.origin, expectedOrigin);
  assert.equal(target.pathname, admin ? '/admin/login' : '/login');
  assert.equal(target.searchParams.get('lang'), 'pt-BR');
  assert.equal(target.searchParams.get('returnTo'), path);
  assert.equal(response.headers.get('x-middleware-next'), null, 'unverified identity must not pass the edge boundary');
}

// This is the edge contract only. ClubOwner and the (app) layout independently
// revalidate the envelope; passing middleware is not proof of downstream access.
test('remote protected customer routes reject retained user when auth reports an error', async () => {
  for (const path of ['/clubowner?lang=pt-BR', '/notifications?lang=pt-BR', '/my-club?lang=pt-BR']) {
    const h = harness({ data: { user: customer }, error: new Error('synthetic auth failure') });
    assertLogin(await h.run(path), path);
    assert.equal(h.reads(), 1);
  }
});

test('remote admin route rejects retained owner when auth reports an error', async () => {
  const path = '/admin/card-engine?lang=pt-BR';
  const h = harness({ data: { user: owner }, error: new Error('synthetic auth failure') });
  assertLogin(await h.run(path), path, true);
  assert.equal(h.reads(), 1);
});

test('verified customer and owner keep existing access while customer cannot enter admin', async () => {
  for (const [user, path] of [[customer, '/clubowner?lang=pt-BR'], [owner, '/admin/card-engine?lang=pt-BR']] as const) {
    const h = harness({ data: { user }, error: null });
    const response = await h.run(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(h.reads(), 1);
  }
  const h = harness({ data: { user: customer }, error: null });
  const response = await h.run('/admin/card-engine?lang=pt-BR');
  assert.equal(response.headers.get('location'), host + '/intro?lang=pt-BR');
  assert.equal(h.reads(), 1);
});

test('guest, malformed receipt and rejected lookup preserve protected login recovery', async () => {
  const path = '/clubowner?lang=pt-BR';
  for (const receipt of [{ data: { user: null }, error: null }, null, undefined]) {
    const h = harness(receipt);
    assertLogin(await h.run(path), path);
    assert.equal(h.reads(), 1);
  }
  const h = harness(undefined, true);
  assertLogin(await h.run(path), path);
  assert.equal(h.reads(), 1);
});

test('retained identity without an explicit successful error-null receipt is not verified', async () => {
  const path = '/clubowner?lang=pt-BR';
  const h = harness({ data: { user: customer } });
  assertLogin(await h.run(path), path);
  assert.equal(h.reads(), 1);
});

test('returned auth failures and malformed receipts do not delete browser cookies', async () => {
  const cookie = 'sb-fixture-auth-token=synthetic; supabase-fixture=synthetic; touchline:locale:v1=pt-BR; unrelated=keep';
  for (const receipt of [
    { data: { user: customer }, error: new Error('synthetic returned failure') },
    { data: { user: customer } },
    { data: null, error: null },
    { error: null },
    null,
    undefined,
  ]) {
    const h = harness(receipt, false, { cookie });
    const response = await h.run('/clubowner?lang=pt-BR');
    assertLogin(response, '/clubowner?lang=pt-BR');
    assert.equal(h.reads(), 1);
    assert.deepEqual(response.cookies.getAll(), [], 'a returned or malformed receipt is not a thrown invalid-session cleanup');
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('thrown lookup clears only Supabase-owned cookies and retains login recovery', async () => {
  const h = harness(undefined, true, {
    cookie: 'sb-fixture-auth-token=synthetic; supabase-fixture=synthetic; touchline:locale:v1=pt-BR; unrelated=keep',
  });
  const response = await h.run('/clubowner?lang=pt-BR');
  assertLogin(response, '/clubowner?lang=pt-BR');
  assert.equal(h.reads(), 1);
  const deleted = response.cookies.getAll();
  assert.deepEqual(deleted.map((cookie) => cookie.name).sort(), ['sb-fixture-auth-token', 'supabase-fixture']);
  for (const cookie of deleted) {
    assert.equal(cookie.value, '');
    assert.equal(cookie.maxAge, 0);
    assert.equal(cookie.expires?.getTime(), 0);
    assert.equal(cookie.path, '/');
  }
  assert.equal(response.cookies.get('touchline:locale:v1'), undefined);
  assert.equal(response.cookies.get('unrelated'), undefined);
});

test('non-Vercel offline host preserves owner access, capability and failed-auth boundaries', async () => {
  const publicHost = 'https://touchline.com.br';
  const options = { origin: publicHost, offline: true };
  const path = '/clubowner?lang=pt-BR';
  const validOwner = harness({ data: { user: owner }, error: null }, false, options);
  const ownerResponse = await validOwner.run('/admin/card-engine?lang=pt-BR');
  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerResponse.headers.get('x-middleware-next'), '1');
  assert.equal(ownerResponse.headers.get('location'), null);
  assert.equal(validOwner.reads(), 1);

  const invalidOwner = harness({ data: { user: owner }, error: new Error('synthetic returned failure') }, false, options);
  assertLogin(await invalidOwner.run('/admin/card-engine?lang=pt-BR'), '/admin/card-engine?lang=pt-BR', true, publicHost);
  assert.equal(invalidOwner.reads(), 1);

  const withoutCapability = harness({ data: { user: { ...customer, app_metadata: { touchline_arena_access_v1: false } } }, error: null }, false, options);
  assertLogin(await withoutCapability.run(path), path, false, publicHost);
  assert.equal(withoutCapability.reads(), 1);

  const eligibleCustomer = harness({ data: { user: customer }, error: null }, false, options);
  const offline = await eligibleCustomer.run(path);
  assert.equal(offline.status, 503);
  assert.equal(offline.headers.get('location'), null);
  assert.equal(offline.headers.get('x-middleware-next'), null);
  assert.match(offline.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(eligibleCustomer.reads(), 1);

  const publicPage = harness({ data: { user: owner }, error: null }, false, options);
  assert.equal((await publicPage.run('/intro?lang=pt-BR')).status, 503);
  assert.equal(publicPage.reads(), 0, 'public offline response precedes identity lookup, even for an owner receipt');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as copy from '../lib/touchlineArena/auth-i18n.ts';
import * as locales from '../lib/touchlineArena/i18n.ts';
import * as browserStorage from '../lib/touchlineArena/browser-storage.ts';
import * as presentationIntent from '../lib/touchlineArena/presentation-locale-intent.ts';

type Node = { type: unknown; props: Record<string, unknown> };
type Component = (props: Record<string, unknown>) => Node | Promise<Node>;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const marker = () => null;
function compile(text: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const output = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, Component> = {};
  runInNewContext(output, { ...globals, exports, require(name: string) {
    if (name === 'react/jsx-runtime') return jsx;
    assert.ok(name in dependencies, `unexpected runtime dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
function find(tree: unknown, type: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(node => find(node, type));
  if (!tree || typeof tree !== 'object' || !('props' in tree)) return [];
  const node = tree as Node;
  return [...(node.type === type ? [node] : []), ...find(node.props.children, type)];
}
const account = { mode: 'account', accountId: '11111111-1111-4111-8111-111111111111' };
const release = compile(source('lib/touchlineArena/site-locales-release.ts'), {}, { process: { env: {} } });
for (const route of ['register', 'forgot-password', 'reset-password', 'admin/login']) {
  test(`${route} awaits trusted server context and preserves locale and destination`, async () => {
    for (const context of [account, { mode: 'guest' }, { mode: 'demo' }, { mode: 'unavailable' }]) {
      let reads = 0;
      const layout = () => null;
      const deps = {
        'next/link': { default: marker },
        'lucide-react': { ArrowLeft: marker, FlaskConical: marker },
        '@/components/auth-form': { AuthForm: marker },
        '@/components/reset-password-form': { ResetPasswordForm: marker },
        '@/components/admin-account-access': { AdminAccountAccess: marker },
        '@/components/auth-layout': { AuthLayout: layout },
        '@/lib/touchlineArena/auth-i18n': copy,
        '@/lib/touchlineArena/site-locales-release': release,
        '@/lib/touchlineArena/account-locale-context-server': { loadAccountLocaleContext: async () => { reads++; await Promise.resolve(); return context; } },
        '@/lib/admin/owner': { isOwnerEmail: () => false },
        '@/lib/supabase/server': { createClient: async () => null },
        '@/lib/touchlineArena/server-read-deadline': compile(source('lib/touchlineArena/server-read-deadline.ts'), {}, { setTimeout, clearTimeout }),
      };
      const page = compile(source(`app/(auth)/${route}/page.tsx`), deps).default;
      const tree = await page({ searchParams: Promise.resolve({ lang: 'pt-BR', returnTo: '/notifications?lang=pt-BR' }) });
      assert.equal(reads, 1);
      assert.equal(tree.type, layout);
      assert.equal(tree.props.accountLocaleContext, context);
      assert.equal(tree.props.locale, 'pt-BR');
      if (route !== 'reset-password') assert.ok(find(tree, marker).some(node => node.props.returnTo === '/notifications?lang=pt-BR' || route === 'admin/login' && node.props.returnTo === '/admin'));
    }
  });
}

test('public login preview preserves the auth form and destination without reading account context', async () => {
  const layout = () => null;
  const form = () => null;
  const page = compile(source('app/(auth)/login/page.tsx'), {
    '@/components/auth-form': { AuthForm: form },
    '@/components/auth-layout': { AuthLayout: layout },
    '@/lib/touchlineArena/auth-i18n': copy,
    '@/lib/touchlineArena/site-locales-release': release,
    // Any new account-context or Supabase runtime dependency fails compilation
    // through the strict module boundary above, rather than being silently mocked.
  }).default;
  for (const { code: locale } of locales.TOUCHLINE_APPROVED_LOCALES) {
    for (const error of ['invalid_credentials', 'auth_unavailable', 'not-an-approved-error']) {
      const destination = '/notifications?lang=pt-BR';
      const tree = await page({ searchParams: Promise.resolve({ lang: locale, returnTo: destination, error }) });
      assert.equal(tree.type, layout);
      assert.equal(tree.props.locale, locale);
      assert.equal(tree.props.accountLocaleContext, undefined, 'layout retains its fail-closed unavailable default');
      assert.equal(tree.props.draftLocalesEnabled, true);
      const forms = find(tree, form);
      assert.equal(forms.length, 1);
      assert.equal(forms[0].props.mode, 'login');
      assert.equal(forms[0].props.locale, locale);
      assert.equal(forms[0].props.draftLocaleEnabled, true);
      assert.equal(forms[0].props.returnTo, destination);
      assert.equal(forms[0].props.initialError, error === 'not-an-approved-error' ? null : error);
    }
  }
});

function adminReadHarness(auth: Promise<unknown>) {
  let sequence = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const calls: string[] = [];
  const form = () => null;
  const access = () => null;
  const deadline = compile(source('lib/touchlineArena/server-read-deadline.ts'), {}, {
    setTimeout(callback: () => void, delay: number) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  const page = compile(source('app/(auth)/admin/login/page.tsx'), {
    '@/components/auth-form': { AuthForm: form },
    '@/components/admin-account-access': { AdminAccountAccess: access },
    '@/components/auth-layout': { AuthLayout: marker },
    '@/lib/touchlineArena/auth-i18n': copy,
    '@/lib/touchlineArena/account-locale-context-server': { loadAccountLocaleContext: async () => { calls.push('locale-context'); return account; } },
    '@/lib/touchlineArena/server-read-deadline': deadline,
    '@/lib/admin/owner': { isOwnerEmail: (email: string) => { calls.push('authorize'); return email === 'owner@example.invalid'; } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: {
      getUser: () => { calls.push('second-get-user'); return auth; },
      getSession: () => { throw new Error('an untrusted session must never replace getUser'); },
    } }) },
  }).default;
  return { timers, calls, form, access, run: () => page({ searchParams: Promise.resolve({ lang: 'pt-BR', returnTo: '/admin/players' }) }),
    expire() { for (const [id, timer] of timers) { timers.delete(id); timer.callback(); } },
  };
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

test('admin second getUser has a finite deadline after locale context succeeds; late owner cannot grant access', async () => {
  let release!: (result: unknown) => void;
  const h = adminReadHarness(new Promise(resolve => { release = resolve; }));
  let tree: Node | undefined;
  const reading = h.run().then(value => { tree = value; });
  await flush();
  assert.deepEqual(h.calls, ['locale-context', 'second-get-user']);
  assert.equal(tree, undefined);
  assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [8000], 'the actual second getUser must be bounded');
  h.expire(); await reading;
  assert.equal(find(tree, h.access).length, 0);
  assert.equal(find(tree, h.form)[0].props.initialError, 'auth_unavailable');
  assert.equal(find(tree, h.form)[0].props.returnTo, '/admin/players');
  release({ data: { user: { email: 'owner@example.invalid' } }, error: null }); await flush();
  assert.equal(find(tree, h.access).length, 0);
  assert.equal(h.calls.includes('authorize'), false);
  assert.equal(h.timers.size, 0);
});

test('admin second read preserves owner authorization, non-owner denial, guest form and deadline cleanup', async () => {
  for (const email of ['owner@example.invalid', 'customer@example.invalid', null]) {
    const h = adminReadHarness(Promise.resolve({ data: { user: email ? { email } : null }, error: null }));
    const tree = await h.run(); await flush();
    if (email) {
      assert.equal(find(tree, h.form).length, 0);
      assert.equal(find(tree, h.access)[0].props.authorized, email === 'owner@example.invalid');
      assert.equal(find(tree, h.access)[0].props.returnTo, '/admin/players');
    } else {
      assert.equal(find(tree, h.access).length, 0);
      assert.equal(find(tree, h.form)[0].props.initialError, null);
    }
    assert.equal(tree.props.locale, 'pt-BR');
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls.filter(call => call === 'second-get-user').length, 1);
  }
});

test('admin rejected second read renders an unavailable form without authorization or retry', async () => {
  const h = adminReadHarness(Promise.reject(new Error('synthetic auth outage')));
  const tree = await h.run(); await flush();
  assert.equal(find(tree, h.access).length, 0);
  assert.equal(find(tree, h.form)[0].props.initialError, 'auth_unavailable');
  assert.deepEqual(h.calls, ['locale-context', 'second-get-user']);
  assert.equal(h.timers.size, 0);
});

test('admin error envelopes cannot authorize an accompanying owner; missing-session guest still gets the login form', async () => {
  for (const user of [{ email: 'owner@example.invalid' }, null]) {
    const h = adminReadHarness(Promise.resolve({ data: { user }, error: { name: 'AuthSessionMissingError' } }));
    const tree = await h.run(); await flush();
    assert.equal(find(tree, h.access).length, 0);
    assert.equal(find(tree, h.form).length, 1);
    assert.equal(find(tree, h.form)[0].props.initialError, null);
    assert.equal(h.calls.includes('authorize'), false);
    assert.equal(h.timers.size, 0);
  }
});
test('shared layout forwards context without importing server auth and defaults fail closed', async () => {
  const switcher = () => null;
  const controls = compile(source('components/touchline/TouchlinePageControls.tsx'), {
    'next/navigation': { usePathname: () => '/login' },
    './SiteLocaleReleaseContext': { useSiteLocaleRelease: () => false },
    '@/lib/touchlineArena/auth-i18n': copy,
    '@/components/auth-language-switcher': { AuthLanguageSwitcher: switcher },
    '@/components/auth-ambient-audio': { AuthAmbientAudio: marker },
    './TouchlinePageControls.module.css': { default: { controls: 'controls' } },
  }).default;
  const text = source('components/auth-layout.tsx');
  const layout = compile(text, {
    'next/link': { default: marker }, 'lucide-react': { Check: marker, Globe2: marker, Radio: marker, Trophy: marker, Users: marker, Zap: marker },
    '@/lib/touchlineArena/auth-i18n': copy,
    './logo': { Logo: marker }, './auth-cinematic-media': { AuthCinematicMedia: marker },
    './touchline/TouchlinePageControls': { default: controls },
    './auth-league-picker': { AuthLeaguePicker: marker },
  }).AuthLayout;
  for (const context of [account, { mode: 'guest' }, { mode: 'demo' }, { mode: 'unavailable' }, undefined]) {
    const tree = await layout({ locale: 'pt-BR', accountLocaleContext: context, children: 'form' });
    const groups = find(tree, controls);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].props.draftLocalesEnabled, false);
    const group = await controls(groups[0].props);
    const switches = find(group, switcher);
    assert.equal(switches.length, 1);
    const control = switches[0];
    assert.equal(control.props.locale, 'pt-BR');
    assert.equal(control.props.draftLocalesEnabled, false);
    if (context) assert.equal(control.props.context, context);
    else assert.equal((control.props.context as { mode: string }).mode, 'unavailable');
  }
});
test('auth language wrapper uses exactly one shared select and no separate preference handler', async () => {
  const shared = () => null;
  const wrapper = compile(source('components/auth-language-switcher.tsx'), {
    '@/components/touchline/AccountLocaleMenu': { default: shared },
    '@/lib/touchlineArena/i18n': locales,
    '@/lib/touchlineArena/browser-storage': browserStorage,
    '@/lib/touchlineArena/presentation-locale-intent': presentationIntent,
    'lucide-react': { ChevronDown: marker, Languages: marker },
  }).AuthLanguageSwitcher;
  const tree = await wrapper({ locale: 'pt-BR', context: account });
  assert.equal(tree.type, shared); assert.equal(tree.props.context, account);
  assert.equal(tree.props.variant, 'select'); assert.equal(tree.props.locale, 'pt-BR');
  assert.equal(tree.props.menuClassName, 'auth-language-switcher');
});
test('actual audit auth renderer explicitly supplies demo context without server dependencies', async () => {
  const text = source('components/touchline/audit/TouchlineAuditStudio.tsx');
  const file = ts.createSourceFile('audit.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AuditAuth');
  assert.ok(declaration);
  // Compile the actual audit boundary, avoiding unrelated football fixtures.
  const exported = `import { AuthLayout } from 'layout';\n${declaration.getText(file)}\nexport { AuditAuth };`;
  const layout = () => null;
  const audit = compile(exported, { layout: { AuthLayout: layout } }).AuditAuth;
  for (const id of ['public/login', 'public/register', 'public/forgot-password', 'public/reset-password']) {
    const tree = await audit({ route: { id }, language: 'pt-BR' });
    assert.equal(tree.type, layout);
    assert.equal((tree.props.accountLocaleContext as { mode: string }).mode, 'demo');
    assert.ok(find(tree, 'button').every(node => node.props.disabled === true));
  }
  assert.doesNotMatch(text, /import\s+(?!type\b)[^;]*(?:account-locale-context-server|supabase\/server)/);
});

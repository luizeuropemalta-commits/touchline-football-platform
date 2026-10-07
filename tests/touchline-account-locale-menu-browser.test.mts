import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { chromium, webkit, expect, type Browser } from '@playwright/test';

// Opt-in finite browser test. Real React/DOM/component/host/controller; synthetic
// auth/router and intercepted HTTP. No server, credentials or published DB.
const enabled = process.env.TOUCHLINE_RUN_LOCALE_BROWSER_TESTS === '1';
const require = createRequire(import.meta.url);
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
type FixtureContext = { mode: 'account'; accountId: string } | { mode: 'guest' | 'demo' };
function fixture(variant: 'menu' | 'select' = 'menu', initialContext: FixtureContext = { mode: 'account', accountId: owner }) {
  const reactDir = dirname(require.resolve('react'));
  const domDir = dirname(require.resolve('react-dom/client'));
  const schedulerDir = dirname(createRequire(require.resolve('react-dom/client')).resolve('scheduler'));
  const modules: Record<string, string> = {
    react: readFileSync(join(reactDir, 'cjs/react.development.js'), 'utf8'),
    'react/jsx-runtime': readFileSync(join(reactDir, 'cjs/react-jsx-runtime.development.js'), 'utf8'),
    'react-dom': readFileSync(join(domDir, 'cjs/react-dom.development.js'), 'utf8'),
    'react-dom/client': readFileSync(join(domDir, 'cjs/react-dom-client.development.js'), 'utf8'),
    scheduler: readFileSync(join(schedulerDir, 'cjs/scheduler.development.js'), 'utf8'),
    'next/navigation': 'exports.useRouter = () => window.fixtureRouter;',
    'lucide-react': 'exports.Check = exports.Languages = exports.ChevronDown = () => null;',
    '@/lib/supabase/client': `exports.createClient = () => { window.fixtureAuthCreates++; return {auth:{onAuthStateChange(callback){
      window.fixtureObservers.add(callback); return {data:{subscription:{unsubscribe(){window.fixtureObservers.delete(callback);}}}};
    }}}; };`,
  };
  for (const [id, path] of [
    ['./locale-catalogues/core-drafts.ts', '../lib/touchlineArena/locale-catalogues/core-drafts.ts'],
    ['./i18n.ts', '../lib/touchlineArena/i18n.ts'],
    ['./catalogue-locale.ts', '../lib/touchlineArena/catalogue-locale.ts'],
    ['@/lib/touchlineArena/account-locale-menu-i18n', '../lib/touchlineArena/account-locale-menu-i18n.ts'],
    ['./browser-storage.ts', '../lib/touchlineArena/browser-storage.ts'],
    ['@/lib/touchlineArena/presentation-locale-intent', '../lib/touchlineArena/presentation-locale-intent.ts'],
    ['./account-locale-selection.ts', '../lib/touchlineArena/account-locale-selection.ts'],
    ['./account-locale-host.ts', '../lib/touchlineArena/account-locale-host.ts'],
    ['@/lib/touchlineArena/account-locale-browser', '../lib/touchlineArena/account-locale-browser.ts'],
    ['menu', '../components/touchline/AccountLocaleMenu.tsx'],
  ]) modules[id] = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  modules['@/lib/touchlineArena/i18n'] = 'module.exports = require("./i18n.ts");';
  const definitions = Object.entries(modules).map(([id, source]) => `${JSON.stringify(id)}:function(module,exports,require){${source}\n}`).join(',');
  const css = readFileSync(new URL('../app/touchline-clubs/touchline-clubs.module.css', import.meta.url), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#06120c;color:white;font:14px Arial;padding:30px} ${css}</style></head>
  <body><div id="root"></div><script>
  const process={env:{NODE_ENV:'development'}};const modules={${definitions}};const cache={};
  function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Missing fixture module '+id);const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
  window.fixtureObservers=new Set();window.fixtureAuthCreates=0;window.fixtureRefreshes=0;
  window.fixtureRouter={refresh(){window.fixtureRefreshes++;}};
  const React=require('react'),root=require('react-dom/client').createRoot(document.getElementById('root'));
  const flushSync=require('react-dom').flushSync,Menu=require('menu').default;
  window.renderFixture=(context)=>flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Menu,{context,locale:'en-GB',variant:${JSON.stringify(variant)},menuClassName:${JSON.stringify(variant === 'select' ? 'auth-language-switcher' : 'languageMenu')},panelClassName:${JSON.stringify(variant === 'select' ? '' : 'languagePanel')}}))));
  window.unmountFixture=()=>flushSync(()=>root.unmount());
  window.emitFixture=(id)=>{for(const cb of window.fixtureObservers)cb('SIGNED_IN',id?{user:{id}}:null);};
  renderFixture(${JSON.stringify(initialContext)});
  </script></body></html>`;
}

test('real React StrictMode menu fences identity changes and confirms save before browser navigation', { skip: !enabled, timeout: 60_000 }, async () => {
  const html = fixture();
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
      const page = await context.newPage();
      page.setDefaultTimeout(5_000);
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      let writes = 0, release: (() => void) | undefined;
      let currentOwner = owner;
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        assert.equal(url.origin, 'http://locale.test');
        if (url.pathname === '/api/notifications/preferences') {
          if (route.request().method() === 'GET') {
            await route.fulfill({ json: { ok: true, data: { accountId: currentOwner, gameLocale: 'en-GB', gameLocaleRevision: '3' } } });
          } else {
            writes++;
            assert.equal(route.request().headers()['x-touchline-expected-account'], currentOwner);
            await new Promise<void>(resolve => { release = resolve; });
            await route.fulfill({ json: { ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: '4', updatedAt: '2026-10-02T21:00:00Z' } } }).catch(() => {});
          }
        } else await route.fulfill({ contentType: 'text/html', body: url.searchParams.get('lang') === 'pt-BR' ? '<h1>Destination</h1>' : html });
      });
      await page.goto('http://locale.test/touchline-clubs?club=42&lang=en-GB#players');
      await page.locator('summary').click();
      await page.waitForFunction(() => document.querySelector('a[href*="pt-BR"]')?.getAttribute('aria-disabled') === 'false');
      assert.equal(await page.evaluate('fixtureObservers.size'), 1, 'StrictMode cleans replayed subscription');
      assert.equal(writes, 0);
      assert.equal(await page.evaluate('document.cookie'), 'touchline:locale:v1=en-GB');
      assert.equal(await page.evaluate('localStorage.getItem("touchline:locale:v1")'), 'en-GB');
      await page.getByRole('link', { name: '🇧🇷 Português' }).click();
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent === 'Saving language…');
      await expect.poll(() => writes).toBe(1);
      assert.equal(writes, 1); assert.match(page.url(), /lang=en-GB/);
      assert.equal(await page.evaluate('document.cookie'), 'touchline:locale:v1=en-GB');
      assert.equal(await page.evaluate('localStorage.getItem("touchline:locale:v1")'), 'en-GB');
      currentOwner = other;
      await page.evaluate(id => { (window as unknown as { renderFixture: (ctx: unknown) => void }).renderFixture({ mode: 'account', accountId: id }); }, other);
      release!();
      await page.waitForFunction(() => document.querySelector('a[href*="pt-BR"]')?.getAttribute('aria-disabled') === 'false');
      assert.match(page.url(), /lang=en-GB/);
      assert.equal(await page.evaluate('document.cookie'), 'touchline:locale:v1=en-GB');
      assert.equal(await page.evaluate('localStorage.getItem("touchline:locale:v1")'), 'en-GB');
      assert.equal(writes, 1, 'restoring the replacement account must not write its preference');
      assert.equal(await page.evaluate('fixtureObservers.size'), 1);
      await page.getByRole('link', { name: '🇧🇷 Português' }).click();
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent === 'Saving language…');
      await expect.poll(() => writes).toBe(2);
      assert.equal(writes, 2); release!();
      await page.waitForURL('**/touchline-clubs?club=42&lang=pt-BR#players');
      assert.match(await page.evaluate('document.cookie'), /pt-BR/);
      assert.deepEqual(errors, []);
      await context.close();
    } finally { await browser.close(); }
  }
});

type Receipt = 'confirmed' | 'unavailable' | 'malformed';
const selectUrl = 'http://locale.test/login?returnTo=%2Fadmin%3Ftab%3Dplayers&lang=en-GB#help';
const selectedUrl = selectUrl.replace('lang=en-GB', 'lang=pt-BR');

async function selectCase(browser: Browser, initialContext: FixtureContext) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let currentOwner = initialContext.mode === 'account' ? initialContext.accountId : owner;
  let reads = 0;
  const writes: { owner: string | undefined; body: unknown }[] = [];
  const receipts: ((value: Receipt) => void)[] = [];
  const html = fixture('select', initialContext);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, 'http://locale.test');
    if (url.pathname !== '/api/notifications/preferences') {
      await route.fulfill({ contentType: 'text/html', body: url.searchParams.get('lang') === 'pt-BR' ? '<h1>Destination</h1>' : html });
      return;
    }
    if (route.request().method() === 'GET') {
      reads++;
      await route.fulfill({ json: { ok: true, data: { accountId: currentOwner, gameLocale: 'en-GB', gameLocaleRevision: '3' } } });
      return;
    }
    assert.equal(route.request().method(), 'PUT');
    writes.push({ owner: route.request().headers()['x-touchline-expected-account'], body: route.request().postDataJSON() });
    const receipt = await new Promise<Receipt>(resolve => { receipts.push(resolve); });
    // A cleanup-aborted request may no longer accept its intentionally late receipt.
    await route.fulfill(receipt === 'unavailable' ? { status: 503, json: { ok: false } }
      : receipt === 'malformed' ? { status: 200, json: { ok: true, data: { gameLocale: 'pt-BR' } } }
        : { json: { ok: true, data: { gameLocale: 'pt-BR', gameLocaleRevision: '4', updatedAt: '2026-10-02T21:00:00Z' } } }).catch(() => {});
  });
  return { page, writes, receipts, errors, get reads() { return reads; },
    setOwner(id: string) { currentOwner = id; },
    async open() {
      await page.goto(selectUrl);
      await expect(page.getByRole('combobox', { name: 'Select language' })).toBeEnabled();
      // A validated GET restores the saved locale even when the URL already
      // displays it. Restoration must not generate a PUT or a navigation.
      assert.equal(page.url(), selectUrl);
      assert.equal(writes.length, 0);
      assert.equal(await page.evaluate('document.cookie'), initialContext.mode === 'account' ? 'touchline:locale:v1=en-GB' : '');
      assert.equal(await page.evaluate('localStorage.getItem("touchline:locale:v1")'), initialContext.mode === 'account' ? 'en-GB' : null);
    },
    async assertUnchanged() {
      assert.equal(page.url(), selectUrl);
      assert.equal(await page.evaluate('document.cookie'), initialContext.mode === 'account' ? 'touchline:locale:v1=en-GB' : '');
      assert.equal(await page.evaluate('localStorage.getItem("touchline:locale:v1")'), initialContext.mode === 'account' ? 'en-GB' : null);
    },
    async close() { for (const release of receipts) release('unavailable'); await context.close(); },
  };
}

test('real React StrictMode auth select uses confirmed writes and fences uncertainty and identity changes', { skip: !enabled, timeout: 60_000 }, async t => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      await t.test(`${engine.name()}: select saves before navigating and preserves query/hash`, async () => {
        const h = await selectCase(browser, { mode: 'account', accountId: owner });
        try {
          await h.open();
          assert.equal(await h.page.evaluate('fixtureObservers.size'), 1);
          assert.equal(h.writes.length, 0);
          assert.deepEqual(await h.page.getByRole('combobox').locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)), ['pt-BR', 'en-GB']);
          await h.page.getByRole('combobox').selectOption('pt-BR');
          await expect.poll(() => h.writes.length).toBe(1);
          await expect(h.page.getByRole('combobox')).toBeDisabled();
          await expect(h.page.getByRole('status')).toHaveText('Saving language…');
          await h.assertUnchanged();
          assert.equal(h.writes[0].owner, owner);
          assert.deepEqual(h.writes[0].body, { action: 'set_game_locale', locale: 'pt-BR', expectedRevision: '3' });
          h.receipts[0]('confirmed');
          await h.page.waitForURL(selectedUrl);
          assert.match(await h.page.evaluate('document.cookie'), /pt-BR/);
          assert.equal(await h.page.evaluate('localStorage.getItem("touchline:locale:v1")'), 'pt-BR');
          assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
      });

      for (const receipt of ['unavailable', 'malformed'] as const) await t.test(`${engine.name()}: ${receipt} receipt does not apply locale or retry`, async () => {
        const h = await selectCase(browser, { mode: 'account', accountId: owner });
        try {
          await h.open(); await h.page.getByRole('combobox').selectOption('pt-BR');
          await expect.poll(() => h.writes.length).toBe(1);
          h.receipts[0](receipt);
          await expect(h.page.getByRole('status')).toHaveText('Language could not be confirmed. Reload the page to try again.');
          await expect(h.page.getByRole('combobox')).toBeDisabled();
          await h.assertUnchanged();
          // Even a synthetic late change event cannot bypass the blocked control.
          await h.page.getByRole('combobox').dispatchEvent('change');
          assert.equal(h.writes.length, 1); assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
      });

      for (const mode of ['guest', 'demo'] as const) await t.test(`${engine.name()}: ${mode} select remains presentation-only`, async () => {
        const h = await selectCase(browser, { mode });
        try {
          await h.open();
          assert.equal(await h.page.evaluate('fixtureObservers.size'), mode === 'guest' ? 1 : 0);
          if (mode === 'demo') assert.equal(await h.page.evaluate('fixtureAuthCreates'), 0);
          await h.page.getByRole('combobox').selectOption('pt-BR');
          await h.page.waitForURL(selectedUrl);
          assert.equal(h.reads, 0); assert.equal(h.writes.length, 0);
          assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
      });

      await t.test(`${engine.name()}: account replacement fences the old select receipt`, async () => {
        const h = await selectCase(browser, { mode: 'account', accountId: owner });
        try {
          await h.open(); await h.page.getByRole('combobox').selectOption('pt-BR');
          await expect.poll(() => h.writes.length).toBe(1);
          h.setOwner(other);
          await h.page.evaluate(id => { (window as unknown as { renderFixture: (ctx: unknown) => void }).renderFixture({ mode: 'account', accountId: id }); }, other);
          h.receipts[0]('confirmed');
          await expect(h.page.getByRole('combobox')).toBeEnabled();
          await h.assertUnchanged();
          assert.equal(await h.page.evaluate('fixtureObservers.size'), 1);
          await h.page.getByRole('combobox').selectOption('pt-BR');
          await expect.poll(() => h.writes.length).toBe(2);
          assert.deepEqual(h.writes.map(write => write.owner), [owner, other]);
          await h.assertUnchanged();
          h.receipts[1]('confirmed');
          await h.page.waitForURL(selectedUrl);
          assert.match(await h.page.evaluate('document.cookie'), /pt-BR/);
          assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
      });
    } finally { await browser.close(); }
  }
});

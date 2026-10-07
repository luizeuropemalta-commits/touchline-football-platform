import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import ts from 'typescript';
import { chromium, expect, type Route } from '@playwright/test';

// Real mounted Live, alerts and locale controls; synthetic HTTP only. This is
// client composition evidence, never server authorization or visual approval.
const enabled = process.env.TOUCHLINE_RUN_LOCALE_BROWSER_TESTS === '1';
const require = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const origin = 'http://localhost:31999';
const now = Date.parse('2026-10-07T12:00:00Z');
const fixtures = [0, 1].map(i => ({ id: `local-${i}`, providerId: `provider-${i}`, status: 'LIVE',
  name: `Synthetic Home ${i} vs Synthetic Away ${i}`, startsAt: '2026-10-07T11:30:00Z',
  liveMinute: 30, roundName: '1', homeScore: i, awayScore: 0,
  homeTeam: { id: '19', providerId: '19', name: `Synthetic Home ${i}` },
  awayTeam: { id: '18', providerId: '18', name: `Synthetic Away ${i}` },
}));
const detail = (id = 'provider-0') => ({ fixture: { ...fixtures[0], id },
  capturedAt: '2026-10-07T12:00:00Z', lineupAvailableAt: '2026-10-07T11:00:00Z',
  events: [{ id: 'event-1', type: 'Goal', minute: 12, playerName: 'Synthetic Scorer', teamId: '19' }],
  lineups: [{ id: 'lineup-1', teamId: '19', playerId: 'player-1', playerName: 'Synthetic Starter', isStarter: true, jerseyNumber: 7, position: 'Forward' }],
  playerStatistics: [{ playerId: 'player-1', teamId: '19', playerName: 'Synthetic Starter', appearanceStatus: 'started', rating: 8.2, minutes: 30 }],
});

function fixtureHtml(props: Record<string, unknown> = {}) {
  const modules: Record<string, string> = {};
  for (const [id, pkg, file] of [
    ['react', 'react', 'react.development.js'], ['react/jsx-runtime', 'react', 'react-jsx-runtime.development.js'],
    ['react-dom', 'react-dom', 'react-dom.development.js'], ['react-dom/client', 'react-dom', 'react-dom-client.development.js'],
    ['scheduler', 'scheduler', 'scheduler.development.js'],
  ]) modules[id] = readFileSync(join(dirname(pkg === 'scheduler'
    ? createRequire(require.resolve('react-dom/client')).resolve(pkg) : require.resolve(pkg)), 'cjs', file), 'utf8');
  modules['lucide-react'] = 'module.exports=new Proxy({}, {get:()=>()=>null});';
  modules['next/navigation'] = 'const router={refresh(){}};exports.useRouter=()=>router;exports.usePathname=()=>new URL(location.href).pathname;';
  modules['next/link'] = 'exports.__esModule=true;exports.useLinkStatus=()=>({pending:false});exports.default=function Link(p){const {children,...rest}=p;return require("react").createElement("a",rest,children)};';
  // Excluded unrelated media/auth adapters. Locale guest branch, its controller,
  // actual navigation, alert component and Live scheduling remain production code.
  modules[resolve(root, 'components/auth-ambient-audio.tsx')] = 'exports.AuthAmbientAudio=()=>null;';
  modules[resolve(root, 'components/logo.tsx')] = 'exports.Logo=({href})=>require("react").createElement("a",{href},"TouchLine");';
  modules[resolve(root, 'lib/supabase/client.ts')] = 'exports.createClient=()=>({auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}}});';
  function add(file: string): string {
    if (modules[file]) return file;
    if (file.endsWith('.css')) {
      modules[file] = 'exports.__esModule=true;exports.default=new Proxy({}, {get:(_,key)=>String(key)});'; return file;
    }
    modules[file] = '';
    let code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    code = code.replace(/require\("([^"\n]+)"\)/g, (_, id: string) => {
      if (modules[id]) return `require(${JSON.stringify(id)})`;
      const base = id.startsWith('@/') ? resolve(root, id.slice(2)) : id.startsWith('.') ? resolve(dirname(file), id) : null;
      assert.ok(base, `Unexpected runtime dependency ${id}`);
      const path = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(existsSync);
      assert.ok(path, `Missing dependency ${id}`);
      return `require(${JSON.stringify(add(path))})`;
    });
    modules[file] = code; return file;
  }
  const entry = add(resolve(root, 'components/touchline/match-centre/TouchlineMatchCentre.tsx'));
  const definitions = Object.entries(modules).map(([id, source]) => `${JSON.stringify(id)}:function(module,exports,require){${source}\n}`).join(',');
  const initial = { initialFixtures: fixtures, initialFixtureId: 'local-0', initialLocale: 'en-GB',
    initialNow: now, initialTimeZone: 'UTC', accountLocaleContext: { mode: 'guest' },
    initialReadMetadata: { state: 'persisted-live-snapshot', degraded: false, fetchedAt: '2026-10-07T12:00:00Z' }, ...props };
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>
  const process={env:{NODE_ENV:'development'}};const modules={${definitions}},cache={};
  function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Missing module '+id);const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
  const props=${JSON.stringify(initial)};props.initialLocale=new URL(location.href).searchParams.get('lang')||props.initialLocale;
  props.initialFixtureId=new URL(location.href).searchParams.get('fixture')||props.initialFixtureId;
  require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require(${JSON.stringify(entry)}).default,props));
  </script></body></html>`;
}

test('Live mounted interactions: recovery, disclosure, detail identity and guest language', { skip: !enabled, timeout: 90_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function harness(props: Record<string, unknown> = {}) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      const page = await context.newPage(); page.setDefaultTimeout(5_000);
      await page.clock.install({ time: now }); await page.clock.pauseAt(now);
      const errors: string[] = [], unexpected: string[] = [];
      const requests: string[] = [];
      const pending: Route[] = [];
      const html = fixtureHtml(props);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        requests.push(`${req.method()} ${url.pathname}${url.search}`);
        if (url.origin !== origin || req.method() !== 'GET') { unexpected.push(req.url()); await route.abort(); return; }
        if (url.pathname === '/live' && req.isNavigationRequest()) { await route.fulfill({ contentType: 'text/html', body: html }); return; }
        if (url.pathname === '/api/football-data/fantasy/livescores' && url.search === '?snapshot=1'
          || url.pathname === '/api/football-data/fantasy/fixture' && /^\?fixtureId=provider-[01]$/.test(url.search)
          || /^\/api\/notifications\/fixtures\/local-[01]$/.test(url.pathname) && !url.search) { pending.push(route); return; }
        if (req.resourceType() === 'image' && !url.pathname.startsWith('/api/')) { await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }); return; }
        unexpected.push(req.url()); await route.abort();
      });
      await page.goto(`${origin}/live?fixture=local-0&lang=en-GB&keep=yes#saved`);
      try {
        await expect(page.getByTestId('touchline-match-centre')).toBeVisible();
      } catch (error) {
        throw new Error(`Live fixture did not mount; pageErrors=${JSON.stringify(errors)} body=${JSON.stringify((await page.locator('body').innerText()).slice(0,500))}`, { cause: error });
      }
      async function take(fragment: string) {
        await expect.poll(() => pending.some(r => r.request().url().includes(fragment))).toBe(true);
        return pending.splice(pending.findIndex(r => r.request().url().includes(fragment)), 1)[0];
      }
      async function snapshot(score: number) {
        const route = await take('livescores');
        await route.fulfill({ json: { ok: true, data: fixtures.map(f => ({ ...f, homeScore: score })), state: 'persisted-live-snapshot', degraded: false, fetchedAt: '2026-10-07T12:00:00Z' } });
      }
      return { page, take, snapshot, requests, async close() {
        for (const route of pending) await route.abort().catch(() => {});
        await context.close(); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      } };
    }
    await t.test('held snapshot and 503 retain selection then recover through the real 45-second interval', async () => {
      const h = await harness();
      try {
        const held = await h.take('livescores');
        const rail = h.page.locator('button[aria-pressed]');
        await rail.nth(1).focus(); await h.page.keyboard.press('Enter');
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        const history = await h.page.evaluate(() => window.history.length);
        await held.fulfill({ json: { ok: true, data: fixtures.map(f => ({ ...f, homeScore: 3 })), state: 'persisted-live-snapshot', degraded: false, fetchedAt: '2026-10-07T12:00:00Z' } });
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('3 — 0');
        await h.page.clock.runFor(45_000);
        const failed = await h.take('livescores');
        const response = h.page.waitForResponse(r => r.url().includes('livescores') && r.status() === 503);
        await failed.fulfill({ status: 503, json: { ok: false } }); await response;
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('3 — 0');
        await h.page.clock.runFor(45_000); await h.snapshot(7);
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('7 — 0');
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        assert.equal(await h.page.evaluate(() => window.history.length), history);
        assert.match(h.page.url(), /fixture=local-1&lang=en-GB&keep=yes#saved$/);
      } finally { await h.close(); }
    });
    await t.test('bell loading, signed-out, disabled and error recover without writes or permission prompts', async () => {
      const h = await harness();
      try {
        await h.snapshot(0);
        assert.equal(h.requests.filter(r => r.includes('/notifications/')).length, 0);
        const bell = h.page.getByRole('button', { name: 'Alerts: Synthetic Home 0 vs Synthetic Away 0', exact: true });
        await bell.focus(); await h.page.keyboard.press('Space');
        await expect(bell).toHaveAttribute('aria-expanded', 'true');
        const panel = h.page.getByRole('region', { name: 'Alerts: Synthetic Home 0 vs Synthetic Away 0' });
        assert.equal(await panel.getAttribute('id'), await bell.getAttribute('aria-controls'));
        await expect(panel.getByRole('status')).toHaveText('Checking preference…');
        await (await h.take('/notifications/')).fulfill({ status: 401, json: { ok: false } });
        await expect(panel.getByRole('link', { name: 'Sign in' })).toBeVisible();
        await bell.click(); await bell.click();
        await (await h.take('/notifications/')).fulfill({ status: 503, json: { error: 'ALERTS_NOT_ENABLED' } });
        await expect(panel.getByRole('status')).toHaveText('Match alerts have not been enabled yet.');
        await bell.click(); await bell.click();
        await (await h.take('/notifications/')).fulfill({ status: 500, json: { ok: false } });
        await expect(panel.getByRole('status')).toHaveText('Alerts unavailable. Your preference could not be confirmed.');
        await panel.getByRole('button').click();
        await expect(panel.getByRole('status')).toHaveText('Checking preference…');
        await (await h.take('/notifications/')).fulfill({ json: { ok: true, delivery: 'unavailable', data: { subscribed: false } } });
        await expect(panel.getByRole('button', { name: 'Save match', exact: true })).toBeEnabled();
        assert.ok(h.requests.every(r => r.startsWith('GET ')));
      } finally { await h.close(); }
    });
    await t.test('matching detail unlocks verified lineup; changing fixture never leaks old detail', async () => {
      const h = await harness({ canReadMatchDetail: true });
      try {
        await h.snapshot(0);
        await (await h.take('fixture?')).fulfill({ json: { ok: true, data: detail() } });
        await expect(h.page.getByTestId('touchline-verified-match-data')).toBeVisible();
        const history = await h.page.evaluate(() => window.history.length);
        await h.page.getByRole('link', { name: 'VIEW LINE-UP', exact: true }).click();
        await expect(h.page.locator('#touchline-match-lineups')).toBeFocused();
        await expect(h.page.locator('#touchline-match-lineups')).toContainText('Synthetic Starter');
        assert.equal(await h.page.evaluate(() => window.history.length), history);
        await h.page.locator('button[aria-pressed]').nth(1).click();
        await (await h.take('fixture?fixtureId=provider-1')).fulfill({ json: { ok: true, data: detail('provider-0') } });
        await expect(h.page.getByTestId('touchline-verified-match-data')).toHaveCount(0);
        await expect(h.page.locator('button[aria-pressed=true]')).toHaveCount(1);
      } finally { await h.close(); }
    });
    await t.test('guest language handoff and reload preserve fixture/query/hash without account transport', async () => {
      const h = await harness();
      try {
        await h.snapshot(0);
        await h.page.locator('button[aria-pressed]').nth(1).click();
        await h.page.getByRole('combobox', { name: 'Select language' }).selectOption('pt-BR');
        await h.page.waitForURL('**/live?fixture=local-1&lang=pt-BR&keep=yes#saved');
        await h.snapshot(0);
        await expect(h.page.getByRole('heading', { name: 'Central da partida', exact: true })).toBeVisible();
        await h.page.reload(); await h.snapshot(0);
        await expect(h.page.getByRole('heading', { name: 'Central da partida', exact: true })).toBeVisible();
        await expect(h.page.locator('button[aria-pressed]').nth(1)).toHaveAttribute('aria-pressed', 'true');
        assert.equal(h.requests.filter(r => r.includes('/notifications/preferences')).length, 0);
      } finally { await h.close(); }
    });
  } finally { await browser.close(); }
});

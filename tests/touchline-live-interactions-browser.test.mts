import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import ts from 'typescript';
import { chromium, expect, type Route } from '@playwright/test';
import { parseFixtureAlertSavedInterest } from '../lib/touchlineArena/fixture-alert-readiness.ts';
import { parseFixtureAlertStatus } from '../lib/touchlineArena/fixture-alert-status-client.ts';
import { parseTouchlineSportsPublication } from '../lib/touchlineArena/sports-publication.ts';
import { parseTouchlineLivePresentationState, TOUCHLINE_LIVE_PRESENTATION_POLL_MS, TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS } from '../lib/touchlineArena/live-presentation-state.ts';

// Real mounted Live, alerts and locale controls; synthetic HTTP only. This is
// client composition evidence, never server authorization or visual approval.
const enabled = process.env.TOUCHLINE_RUN_LOCALE_BROWSER_TESTS === '1';
const require = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const origin = 'http://localhost:31999';
const accountId = '10000000-0000-4000-8000-000000000019';
const now = Date.parse('2026-10-07T12:00:00Z');
const fixtures = [0, 1].map(i => ({ id: String(19700001 + i), providerId: String(19700001 + i), status: 'LIVE',
  name: `Synthetic Home ${i} vs Synthetic Away ${i}`, startsAt: '2026-10-07T11:30:00Z',
  liveMinute: 30, roundName: '1', homeScore: i, awayScore: 0,
  homeTeam: { id: '19', providerId: '19', name: `Synthetic Home ${i}` },
  awayTeam: { id: '18', providerId: '18', name: `Synthetic Away ${i}` },
}));
const detail = (id = '19700001') => ({ fixture: { ...fixtures[0], id },
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
  modules[resolve(root, 'lib/supabase/client.ts')] = `exports.createClient=()=>({auth:{
    getUser:async()=>({data:{user:window.fixtureAccountId?{id:window.fixtureAccountId}:null},error:null}),
    onAuthStateChange(callback){let active=true;queueMicrotask(()=>{if(active)callback('INITIAL_SESSION',window.fixtureAccountId?{user:{id:window.fixtureAccountId}}:null)});
      return {data:{subscription:{unsubscribe(){active=false}}}}}
  }});`;
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
  const initial = { initialFixtures: fixtures, initialFixtureId: '19700001', initialLocale: 'en-GB',
    initialNow: now, initialTimeZone: 'UTC', accountLocaleContext: { mode: 'guest' },
    initialReadMetadata: { state: 'persisted-live-snapshot', degraded: false, fetchedAt: '2026-10-07T12:00:00Z' }, ...props };
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>
  const process={env:{NODE_ENV:'development'}};const modules={${definitions}},cache={};
  function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Missing module '+id);const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
  const props=${JSON.stringify(initial)};window.fixtureAccountId=props.accountLocaleContext.mode==='account'?props.accountLocaleContext.accountId:null;
  window.fixturePermissionRequests=0;if(window.Notification)Object.defineProperty(Notification,'requestPermission',{configurable:true,value:()=>{window.fixturePermissionRequests++;return Promise.resolve('denied')}});
  props.initialLocale=new URL(location.href).searchParams.get('lang')||props.initialLocale;
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
      let publicationRevision = 0;
      const html = fixtureHtml(props);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        requests.push(`${req.method()} ${url.pathname}${url.search}`);
        if (url.origin !== origin || req.method() !== 'GET') { unexpected.push(req.url()); await route.abort(); return; }
        if (url.pathname === '/live' && req.isNavigationRequest()) { await route.fulfill({ contentType: 'text/html', body: html }); return; }
        if (url.pathname === '/api/notifications/preferences' && !url.search && (props.accountLocaleContext as { mode?: string })?.mode === 'account') {
          await route.fulfill({ json: { ok: true, data: { accountId, gameLocale: 'en-GB', gameLocaleRevision: '0' } } }); return;
        }
        if (/^\/api\/notifications\/fixtures\/1970000[12]\/readiness$/.test(url.pathname) && !url.search
          && (props.accountLocaleContext as { mode?: string })?.mode === 'account') {
          const fixtureId = url.pathname.split('/')[4];
          assert.equal(req.headers()['x-touchline-expected-account'], accountId);
          const receipt = { ok: true, version: 1, data: { accountId, fixtureId, installationId: null,
            subscribed: false, configuration: 'unconfigured', device: 'not-requested', preference: 'unconfirmed',
            operational: 'unknown', delivery: 'unconfirmed', active: false } };
          assert.ok(parseFixtureAlertStatus(receipt, { accountId, fixtureId, installationId: null }));
          await route.fulfill({ json: receipt }); return;
        }
        if ((url.pathname === '/api/touchline-arena/live-presentation-state'
            || url.pathname === '/api/touchline-arena/sports-publication') && !url.search
          || url.pathname === '/api/football-data/fantasy/fixture' && /^\?fixtureId=1970000[12]$/.test(url.search)
          || /^\/api\/notifications\/fixtures\/1970000[12]$/.test(url.pathname) && !url.search) { pending.push(route); return; }
        if (req.resourceType() === 'image' && !url.pathname.startsWith('/api/')) { await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }); return; }
        unexpected.push(req.url()); await route.abort();
      });
      await page.goto(`${origin}/live?fixture=19700001&lang=en-GB&keep=yes#saved`);
      try {
        await expect(page.getByTestId('touchline-match-centre')).toBeVisible();
      } catch (error) {
        throw new Error(`Live fixture did not mount; pageErrors=${JSON.stringify(errors)} body=${JSON.stringify((await page.locator('body').innerText()).slice(0,500))}`, { cause: error });
      }
      async function take(fragment: string) {
        await expect.poll(() => pending.some(r => r.request().url().includes(fragment))).toBe(true);
        return pending.splice(pending.findIndex(r => r.request().url().includes(fragment)), 1)[0];
      }
      async function snapshot(score: number, held?: Route, ageMs = 0) {
        const route = held ?? await take('live-presentation-state');
        const receivedAt = await page.evaluate(() => Date.now());
        const stamp = new Date(receivedAt - ageMs).toISOString();
        const revision = ++publicationRevision;
        const publication = parseTouchlineSportsPublication({ version: 1, scopeKey: 'touchline-england',
          publication: { snapshotId: `10000000-0000-4000-8000-${String(revision).padStart(12, '0')}`,
            contentDigest: revision.toString(16).padStart(32, '0'), publishedAt: new Date(receivedAt).toISOString(),
            playerRankingSnapshotId: null, coachRankingSnapshotId: null,
            liveScoreSnapshotDigest: (revision + 100).toString(16).padStart(32, '0') },
          playerRanking: null, coachRanking: null,
          live: { fetchedAt: stamp, fixtures: fixtures.map(f => ({ ...f, homeScore: score, verifiedAt: stamp })) },
        });
        assert.ok(publication, 'the existing Live fixtures must satisfy the real publication parser');
        const state = parseTouchlineLivePresentationState({ version: 1, available: true,
          playerRankingSnapshotId: null, coachRankingSnapshotId: null,
          livePresentationSnapshotId: publication.publication.contentDigest,
          liveFreshness: { fetchedAt: stamp, ageMs, degraded: ageMs > TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS },
          mode: 'live', pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null });
        assert.ok(state, 'the signal must satisfy the real presentation-state parser');
        await route.fulfill({ json: state });
        await (await take('sports-publication')).fulfill({ json: { ok: true, data: publication } });
      }
      return { page, take, snapshot, requests, async close() {
        for (const route of pending) await route.abort().catch(() => {});
        assert.equal(await page.evaluate('window.fixturePermissionRequests'), 0, 'read-only interactions must not request notification permission');
        await context.close(); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
        const stateReads = requests.filter(r => r === 'GET /api/touchline-arena/live-presentation-state').length;
        const publicationReads = requests.filter(r => r === 'GET /api/touchline-arena/sports-publication').length;
        assert.ok(stateReads > 0 && publicationReads > 0, 'real shared transport must read both canonical endpoints');
        assert.equal(requests.filter(r => r.includes('/fantasy/livescores')).length, 0, 'no legacy parallel poller');
        console.log(`LIVE_CANONICAL_READS ${JSON.stringify({ stateReads, publicationReads })}`);
      } };
    }
    await t.test('held publication and 503 retain selection through shared polling and recovery; stale facts stay labelled', async () => {
      const h = await harness();
      try {
        const held = await h.take('live-presentation-state');
        const rail = h.page.locator('button[aria-pressed]');
        await rail.nth(1).focus(); await h.page.keyboard.press('Enter');
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        const history = await h.page.evaluate(() => window.history.length);
        await h.snapshot(3, held);
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('3–0');
        await h.page.clock.runFor(TOUCHLINE_LIVE_PRESENTATION_POLL_MS);
        const failed = await h.take('live-presentation-state');
        const response = h.page.waitForResponse(r => r.url().includes('live-presentation-state') && r.status() === 503);
        await failed.fulfill({ status: 503, json: { ok: false } }); await response;
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('3–0');
        await h.page.clock.runFor(30_000); await h.snapshot(7);
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('7–0');
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        assert.equal(await h.page.evaluate(() => window.history.length), history);
        assert.match(h.page.url(), /fixture=19700002&lang=en-GB&keep=yes#saved$/);
        await h.page.clock.runFor(TOUCHLINE_LIVE_PRESENTATION_POLL_MS);
        await h.snapshot(7, undefined, TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS + 1);
        await expect(h.page.locator('[role="status"][data-state="persisted-live-snapshot"]')).toBeVisible();
        await expect(h.page.locator('#touchline-match-panel .hero')).toHaveAttribute('data-state', 'stale');
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('7–0');
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        await h.page.clock.runFor(TOUCHLINE_LIVE_PRESENTATION_POLL_MS); await h.snapshot(7);
        await expect(h.page.locator('[role="status"][data-state="persisted-live-snapshot"]')).toHaveCount(0);
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        assert.equal(await h.page.evaluate(() => window.history.length), history);
      } finally { await h.close(); }
    });
    await t.test('initial partial schedule survives 503 and clears its warning only after a verified snapshot', async () => {
      const h = await harness({ initialReadMetadata: { state: 'partial-persisted-schedule', degraded: true } });
      try {
        const warning = h.page.locator('[role="status"][data-state="partial-persisted-schedule"]');
        await expect(warning).toBeVisible();
        const rail = h.page.locator('button[aria-pressed]');
        await expect(rail).toHaveCount(2);
        await rail.nth(1).click();
        const failed = await h.take('live-presentation-state');
        const response = h.page.waitForResponse(r => r.url().includes('live-presentation-state') && r.status() === 503);
        await failed.fulfill({ status: 503, json: { ok: false } });
        await response;
        await expect(warning).toBeVisible();
        await expect(rail).toHaveCount(2);
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        await h.page.clock.runFor(30_000);
        await h.snapshot(4);
        await expect(warning).toHaveCount(0);
        await expect(h.page.locator('#touchline-match-panel .score')).toHaveText('4–0');
        await expect(rail.nth(1)).toHaveAttribute('aria-pressed', 'true');
        assert.ok(h.requests.every(r => r.startsWith('GET ')));
      } finally { await h.close(); }
    });
    await t.test('bell loading, signed-out, disabled and error recover without writes or permission prompts', async () => {
      const guest = await harness();
      try {
        await guest.snapshot(0);
        await guest.page.getByRole('button', { name: 'Alerts: Synthetic Home 0 vs Synthetic Away 0', exact: true }).click();
        const guestPanel = guest.page.getByRole('region', { name: 'Alerts: Synthetic Home 0 vs Synthetic Away 0' });
        await expect(guestPanel.getByRole('status')).toHaveText('Sign in to Arena to follow this match.');
        await expect(guestPanel.getByRole('link', { name: 'Sign in' })).toBeVisible();
        assert.equal(guest.requests.filter(r => r.includes('/notifications/')).length, 0, 'guest alerts never read account transport');
      } finally { await guest.close(); }
      const h = await harness({ accountLocaleContext: { mode: 'account', accountId } });
      try {
        await h.snapshot(0);
        assert.equal(h.requests.filter(r => r.includes('/notifications/fixtures/')).length, 0);
        const bell = h.page.getByRole('button', { name: 'Alerts: Synthetic Home 0 vs Synthetic Away 0', exact: true });
        await bell.focus(); await h.page.keyboard.press('Space');
        await expect(bell).toHaveAttribute('aria-expanded', 'true');
        const panel = h.page.getByRole('region', { name: 'Alerts: Synthetic Home 0 vs Synthetic Away 0' });
        assert.equal(await panel.getAttribute('id'), await bell.getAttribute('aria-controls'));
        await expect(panel.getByRole('status')).toHaveText('Checking preference…');
        await (await h.take('/notifications/fixtures/19700001')).fulfill({ status: 401, json: { ok: false } });
        await expect(panel.getByRole('link', { name: 'Sign in' })).toBeVisible();
        await bell.click(); await bell.click();
        await (await h.take('/notifications/fixtures/19700001')).fulfill({ status: 503, json: { error: 'ALERTS_NOT_ENABLED' } });
        await expect(panel.getByRole('status')).toHaveText('Match alerts have not been enabled yet.');
        await bell.click(); await bell.click();
        await (await h.take('/notifications/fixtures/19700001')).fulfill({ status: 500, json: { ok: false } });
        await expect(panel.getByRole('status')).toHaveText('Alerts unavailable. Your preference could not be confirmed.');
        await panel.getByRole('button').click();
        await expect(panel.getByRole('status')).toHaveText('Checking preference…');
        const receipt = { ok: true, delivery: 'unavailable', data: { accountId, fixtureId: '19700001', subscribed: false, revision: '0' } };
        assert.ok(parseFixtureAlertSavedInterest(receipt, { accountId, fixtureId: '19700001' }));
        await (await h.take('/notifications/fixtures/19700001')).fulfill({ json: receipt });
        await expect(panel.getByRole('button', { name: 'Save match', exact: true })).toBeEnabled();
        assert.ok(h.requests.every(r => r.startsWith('GET ')));
      } finally { await h.close(); }
    });
    await t.test('lineup navigation stays available while changing fixture never leaks old detail', async () => {
      const h = await harness({ canReadMatchDetail: true });
      try {
        await h.snapshot(0);
        await (await h.take('fixture?')).fulfill({ json: { ok: true, data: detail() } });
        await expect(h.page.getByTestId('touchline-verified-match-data')).toBeVisible();
        const history = await h.page.evaluate(() => window.history.length);
        const lineupLink = h.page.getByRole('link', { name: 'VIEW LINE-UP · Synthetic Home 0', exact: true });
        await expect(lineupLink).toHaveAttribute('href', '/touchline-clubs/arsenal?lang=en-GB&fixtureId=19700001#touchline-club-lineup');
        await lineupLink.focus(); await expect(lineupLink).toBeFocused();
        // The current link navigates to ClubHub, not this page's local section.
        // Prove its exact destination here; ClubHub navigation is a separate fixture.
        await expect(h.page.locator('#touchline-match-lineups')).toHaveAttribute('tabindex', '-1');
        await expect(h.page.locator('#touchline-match-lineups')).toContainText('Synthetic Starter');
        assert.equal(await h.page.evaluate(() => window.history.length), history);
        await h.page.locator('button[aria-pressed]').nth(1).click();
        await (await h.take('fixture?fixtureId=19700002')).fulfill({ json: { ok: true, data: detail('19700001') } });
        await expect(h.page.getByTestId('touchline-verified-match-data')).toHaveCount(0);
        await expect(h.page.getByRole('link', { name: /^VIEW LINE-UP ·/ })).toHaveCount(2);
        for (const link of await h.page.locator('[data-lineup-team]').all()) {
          await expect(link).toHaveAttribute('href', /fixtureId=19700002#touchline-club-lineup$/);
        }
        await expect(h.page.locator('button[aria-pressed=true]')).toHaveCount(1);
      } finally { await h.close(); }
    });
    await t.test('guest language handoff and reload preserve fixture/query/hash without account transport', async () => {
      const h = await harness();
      try {
        await h.snapshot(0);
        await h.page.locator('button[aria-pressed]').nth(1).click();
        await h.page.getByRole('combobox', { name: 'Select language' }).selectOption('pt-BR');
        await h.page.waitForURL('**/live?fixture=19700002&lang=pt-BR&keep=yes#saved');
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

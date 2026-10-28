import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, webkit, firefox, expect } from '@playwright/test';
import { bundleIsolatedBrowserFixture } from './helpers/touchline-isolated-browser-bundle.mts';
import { requireBrowserCapacity } from './helpers/touchline-browser-capacity.mts';
const enabled = process.env.TOUCHLINE_RUN_ROSTER_BROWSER === '1';
test('real roster Admin PT/EN renders paused, loading, empty, unavailable and exact guarded decision/retry payloads', { skip: !enabled, timeout: 180000 }, async (t) => {
    requireBrowserCapacity(process.cwd(), { allowLowDarwinDisk: true, allowModerateDarwinPressure: true });
    const bundle = bundleIsolatedBrowserFixture({ entryPath: 'components/admin-football-roster-controls.tsx', requiredSources: ['components/ui.tsx', 'lib/football-data/roster-reconciliation-contract.ts'], mountScript: `window.renderRoster=(locale)=>flushSync(()=>root.render(React.createElement(loadEntry().FootballRosterControls,{locale})));window.renderRoster('en-GB');` });
    const require = createRequire(import.meta.url), tw = createRequire(require.resolve('@tailwindcss/postcss'));
    const { compile } = tw('@tailwindcss/node'), { Scanner } = tw('@tailwindcss/oxide');
    const candidates = new Scanner({ sources: [] }).scanFiles(bundle.sources.filter(f => /\.tsx?$/.test(f)).map(f => ({ content: readFileSync(f, 'utf8'), extension: path.extname(f).slice(1) })));
    const globals = path.resolve('app/globals.css');
    const css = (await compile(readFileSync(globals, 'utf8'), { base: path.dirname(globals), from: globals, onDependency() { } })).build(candidates) + bundle.css;
    const output = process.env.TOUCHLINE_ROSTER_EVIDENCE_DIR;
    if (output)
        mkdirSync(output, { recursive: true });
    const origin = 'https://roster-local.invalid', id = '00000000-0000-4000-8000-000000000001';
    for (const engine of [chromium, webkit, firefox]) {
        const browser = await engine.launch({ headless: true });
        try {
            const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
            const page = await context.newPage();
            const errors: string[] = [];
            page.on('pageerror', e => errors.push(e.message));
            let mode = 'ok', holdPost = false, releasePost: (() => void) | null = null, holdGet = true, releaseGet: (() => void) | null = null;
            const requests: Record<string, unknown>[] = [];
            const snapshot = { id, status: 'review', revision: 0, fetchedAt: new Date().toISOString(), checksum: 'a'.repeat(64), seasonId: '25583', operations: [{ providerId: '101', canonicalPlayerId: null, name: 'Synthetic review player', fromTeamId: '19', teamId: '8', kind: 'TRANSFER_REVIEW_REQUIRED', decision: null as string | null, reason: null as string | null }, { providerId: '102', canonicalPlayerId: id, name: 'Synthetic absent player', fromTeamId: '19', teamId: null, kind: 'PRESERVE_UNSEEN_REVIEW_REQUIRED' }] };
            let state = { enabled: false, applyEnabled: false, snapshots: [snapshot], jobs: [{ id, status: 'review', createdAt: 'invalid-date', error: null }] };
            let captureReplacement: typeof snapshot | null = null;
            await context.route('**/*', async (route) => {
                const request = route.request(), url = new URL(request.url());
                if (url.origin !== origin)
                    return route.abort();
                if (url.pathname === '/')
                    return route.fulfill({ contentType: 'text/html', body: `<meta charset="utf-8"><style>${css}body{background:#081613;margin:0;padding:16px}</style><main id="root"></main><script>${bundle.script.replace(/<\/script/gi, '<\\/script')}</script>` });
                assert.equal(url.pathname, '/api/admin/football-data/rosters');
                if (request.method() === 'GET') {
                    if (holdGet) await new Promise<void>(r => { releaseGet = r; });
                    return route.fulfill(mode === 'get-error' ? { status: 503, json: { ok: false, error: 'private detail' } } : { json: { ok: true, status: state } });
                }
                const body = request.postDataJSON();
                requests.push(body);
                if (holdPost)
                    await new Promise<void>(r => { releasePost = r; });
                if (mode === 'denied')
                    return route.fulfill({ status: 403, json: { ok: false, error: 'FORBIDDEN' } });
                if (mode === 'error')
                    return route.fulfill({ status: 503, json: { ok: false, error: 'private infrastructure detail' } });
                if (body.action === 'capture' && captureReplacement) {state={...state,snapshots:[captureReplacement]};captureReplacement=null;}
                if (body.action === 'decide') {
                    snapshot.revision++;
                    snapshot.operations[0].decision = body.decision;
                    snapshot.operations[0].reason = body.reason;
                }
                return route.fulfill({ json: { ok: true, result: { status: body.action === 'decide' ? 'decided' : 'review', requestId: body.requestId } } });
            });
            await page.goto(origin);
            await expect(page.getByText('Loading history…',{exact:true})).toBeVisible();
            await expect(page.getByRole('button',{name:'Capture observation',exact:true})).toBeDisabled();
            await expect.poll(()=>releaseGet!==null).toBe(true);holdGet=false;releaseGet!();
            await expect(page.getByText('PAUSED — capture and application disabled', { exact: true })).toBeVisible();
            for (const locale of ['pt-BR', 'en-GB']) {
                const pt = locale === 'pt-BR';
                await page.evaluate(locale => (window as unknown as {
                    renderRoster(l: string): void;
                }).renderRoster(locale), locale);
                const capture = page.getByRole('button', { name: pt ? 'Capturar observação' : 'Capture observation', exact: true });
                await expect(capture).toBeDisabled();
                state = { ...state, enabled: true, applyEnabled: true };
                await page.getByRole('button', { name: pt ? 'Recarregar histórico' : 'Reload history' }).click();
                await expect(capture).toBeEnabled();
                const reason = page.getByRole('textbox');
                await reason.fill('');
                await expect(page.getByRole('button', { name: pt ? 'Aprovar' : 'Approve', exact: true })).toBeDisabled();
                await reason.fill('Reviewed synthetic change');
                holdPost = true;
                releasePost = null;
                const before = requests.length;
                await page.getByRole('button', { name: pt ? 'Aprovar' : 'Approve', exact: true }).click();
                await expect(capture).toBeDisabled();
                await page.getByRole('button', { name: pt ? 'Aprovar' : 'Approve', exact: true }).evaluate(b => (b as HTMLButtonElement).click());
                assert.equal(requests.length, before + 1);
                await expect.poll(() => releasePost !== null).toBe(true);
                releasePost!();
                holdPost = false;
                await expect(page.getByRole('status')).toContainText(pt ? 'confirmada no histórico' : 'confirmed in persistent history');
                const sent = requests.at(-1)!;
                assert.equal(sent.action, 'decide');
                assert.equal(sent.providerId, '101');
                assert.equal(sent.snapshotId, id);
                assert.equal(sent.decision, 'approve');
                assert.equal(sent.reason, 'Reviewed synthetic change');
                assert.match(String(sent.requestId), /^[0-9a-f-]{36}$/);
                // Same component/state, different locale: confirmation translates without mutation.
                await page.evaluate(locale => (window as unknown as {
                    renderRoster(l: string): void;
                }).renderRoster(locale === 'pt-BR' ? 'en-GB' : 'pt-BR'), locale);
                await expect(page.getByRole('status')).toContainText(pt ? 'confirmed in persistent history' : 'confirmada no histórico');
                assert.equal(requests.length, before + 1);
                await page.evaluate(locale => (window as unknown as {
                    renderRoster(l: string): void;
                }).renderRoster(locale), locale);
                mode = 'error';
                await capture.click();
                await expect(page.getByRole('status')).toContainText(pt ? 'não confirmada' : 'unconfirmed');
                assert.ok(!(await page.locator('body').innerText()).includes('private infrastructure'));
                const uncertain = requests.at(-1);
                mode = 'ok';
                await page.getByRole('button', { name: pt ? 'Reconciliar mesmo pedido' : 'Reconcile same request' }).click();
                await expect(capture).toBeEnabled();
                assert.deepEqual(requests.at(-1), uncertain);
                mode = 'denied';
                await capture.click();
                await expect(capture).toBeEnabled();
                assert.equal(await page.getByRole('button', { name: pt ? 'Reconciliar mesmo pedido' : 'Reconcile same request' }).count(), 0);
                mode = 'ok';
                await expect(page.getByRole('status')).toContainText(pt?'Acesso negado':'Access denied');
                await page.getByRole('button',{name:pt?'Recarregar histórico':'Reload history'}).click();
                await expect(capture).toBeEnabled();
                for (const width of [1280, 390, 768, 1440]) {
                    await page.setViewportSize({ width, height: 900 });
                    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
                    if (output)
                        await page.screenshot({ path: path.join(output, `${engine.name()}-${locale}-${width}.png`), fullPage: true });
                }
                assert.ok(!(await page.locator('body').innerText()).includes('Invalid Date'));
                const large={...snapshot,id:'00000000-0000-4000-8000-000000000002',operations:Array.from({length:61},(_,i)=>({...snapshot.operations[0],providerId:String(1000+i),name:`Paged synthetic player ${i}`,decision:null,reason:null}))};
                state={...state,snapshots:[large]};
                await page.getByRole('button',{name:pt?'Recarregar histórico':'Reload history'}).click();
                const nextPage=page.getByRole('button',{name:pt?'Próxima':'Next',exact:true});
                await nextPage.click();await nextPage.click();
                await expect(page.getByText('Paged synthetic player 40',{exact:true})).toBeVisible();
                captureReplacement={...snapshot,id:'00000000-0000-4000-8000-000000000003',revision:0,operations:[{...snapshot.operations[0],providerId:'3000',name:'New small snapshot visible',decision:null,reason:null}]};
                await capture.click();
                await expect(page.getByText('New small snapshot visible',{exact:true})).toBeVisible();
                assert.equal(await nextPage.count(),0,'single-page replacement needs no pagination escape hatch');
                await reason.fill('Review new small snapshot');
                await page.getByRole('button',{name:pt?'Aprovar':'Approve',exact:true}).click();
                await expect(capture).toBeEnabled();
                assert.equal(requests.at(-1)?.snapshotId,'00000000-0000-4000-8000-000000000003');
                assert.equal(requests.at(-1)?.providerId,'3000');

                state = { ...state, snapshots: [] };
                await page.getByRole('button', { name: pt ? 'Recarregar histórico' : 'Reload history' }).click();
                await expect(page.getByText(pt ? 'Nenhuma observação persistida.' : 'No persisted observation.', { exact: true })).toBeVisible();
                mode = 'get-error';
                await page.getByRole('button', { name: pt ? 'Recarregar histórico' : 'Reload history' }).click();
                await expect(capture).toBeDisabled();
                await expect(page.getByRole('status')).toContainText(pt ? 'Histórico indisponível' : 'History unavailable');
                mode = 'ok';
                state = { ...state, enabled: false, snapshots: [snapshot] };
                await page.getByRole('button', { name: pt ? 'Recarregar histórico' : 'Reload history' }).click();
                await expect(capture).toBeDisabled();
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
        finally {
            await browser.close();
        }
    }
    t.diagnostic('Real React/button/CSS in Chromium, WebKit and Firefox; isolated HTTP fixtures, no authenticated hosted service. SQL persistence proven separately in PGlite.');
});

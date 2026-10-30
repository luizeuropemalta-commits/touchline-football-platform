import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chromium, webkit, firefox, expect } from '@playwright/test';
import { bundleIsolatedBrowserFixture } from './helpers/touchline-isolated-browser-bundle.mts';
import { peopleCopy, type PeopleLocale } from '../lib/touchlineArena/clubowner-public-contract.ts';

test('Exchange searches people by public name and ID without publishing or editing a profile', {
  skip: process.env.TOUCHLINE_RUN_EXCHANGE_FRIENDS_BROWSER !== '1', timeout: 120_000,
}, async t => {
  const entry = 'components/touchline/market/ClubOwnerExchangeHub.tsx';
  const bundle = bundleIsolatedBrowserFixture({ entryPath: entry,
    requiredSources: [entry, 'components/touchline/social/ClubOwnerPublicDirectory.tsx', 'components/touchline/social/usePublicOwnersRequest.ts'],
    mountScript: 'const Hub=loadEntry().default;flushSync(()=>root.render(React.createElement(Hub,{publicDiscoveryEnabled:window.discoveryEnabled,locale:window.locale,ready:false,state:null,catalogue:[]})));',
  });
  const output = mkdtempSync(`${tmpdir()}/touchline-exchange-friends-`);
  const id = '66666666-7777-4888-8999-aaaaaaaaaaaa', origin = 'https://exchange-friends.invalid';
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const locale of ['pt-BR', 'en-GB'] as PeopleLocale[]) for (const width of [390, 844, 1280]) {
        const copy = peopleCopy(locale), calls: string[] = [], errors: string[] = [];
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
        const page = await context.newPage(); page.setDefaultTimeout(5000);
        page.on('pageerror', e => errors.push(e.message));
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#06100b;color:#eff8ed;font:16px Arial}#root{max-width:1000px;margin:auto}${bundle.css}</style><div id="root"></div><script>window.discoveryEnabled=${url.searchParams.get('disabled') !== '1'};window.locale=${JSON.stringify(locale)};${bundle.script.replace(/<\/script/gi,'<\\/script')}</script></html>` });
          calls.push(`${req.method()} ${url.pathname}`);
          assert.equal(req.method(), 'GET', 'friend discovery must never write');
          assert.equal(url.pathname, '/api/touchline/clubowners');
          const q = url.searchParams.get('q');
          if (q === 'failure') return route.fulfill({ status: 503, json: { error: 'unavailable' } });
          return route.fulfill({ json: { profiles: q === 'Synthetic' || q === id ? [{ publicId: id, displayName: 'Synthetic Friend' }] : [] } });
        });
        try {
          await page.goto(`${origin}/fixture?disabled=1`);
          await expect(page.getByText(copy.friends, { exact: true })).toHaveCount(0);
          await expect(page.getByRole('searchbox')).toHaveCount(0);
          assert.equal(calls.length, 0, 'disabled discovery never requests public profiles');
          await page.goto(`${origin}/fixture`);
          assert.equal(calls.length, 0, 'collapsed search must not poll');
          await page.locator('summary').filter({ hasText: copy.friends }).click();
          await expect(page.getByRole('checkbox')).toHaveCount(0);
          await expect(page.getByRole('heading', { name: copy.own })).toHaveCount(0);
          const input = page.getByLabel(copy.query, { exact: true });
          const search = page.getByRole('button', { name: copy.search, exact: true });
          for (const query of ['Synthetic', id]) {
            await input.fill(query); await search.click();
            await expect(page.getByRole('link', { name: 'Synthetic Friend' })).toHaveAttribute('href', `/clubowners/${id}?lang=${locale}`);
          }
          await page.screenshot({ path: `${output}/${engine.name()}-${locale}-${width}.png` });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          await input.fill('nobody'); await search.click(); await expect(page.getByText(copy.empty, { exact: true })).toBeVisible();
          await input.fill('failure'); await search.click(); await expect(page.getByRole('alert')).toHaveText(copy.error);
          const before = calls.length;
          await input.fill('name@example.com'); await search.click(); await expect(page.getByRole('alert')).toHaveText(copy.invalid);
          assert.equal(calls.length, before, 'invalid query is not sent');
          assert.deepEqual(errors, []);
        } catch (error) { writeFileSync(`${output}/failure.html`, await page.content()); writeFileSync(`${output}/errors.json`, JSON.stringify(errors)); console.error(output); throw error; } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  t.diagnostic(`18 scenarios; synthetic read boundary; screenshots ${output}`);
});

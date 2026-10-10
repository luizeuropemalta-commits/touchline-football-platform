import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { formatTouchlineLocalKickoff } from '../../lib/touchlineArena/local-kickoff.ts';
import { clubHubFixtureRailRefreshMs } from '../../lib/touchlineArena/club-hub-fixture-rail.ts';

// Explicit integration gate, not part of the lightweight default suite.
// Requires an existing disposable Next fixture runtime with one live ClubHub
// card and deterministic local data. Does not launch a server or touch remote QA.
const raw = process.env.TOUCHLINE_CLUBHUB_LOCAL_INTEGRATION_URL;
assert.ok(raw, 'Provide an explicitly authorized disposable local Next ClubHub URL; no skip.');
const target = new URL(raw);
assert.equal(target.protocol, 'http:');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.ok(target.port && !target.username && !target.password && !target.hash);
assert.match(target.pathname, /^\/touchline-clubs\/[a-z0-9-]+$/);
target.searchParams.set('lang', 'en-GB');

test('real Next refresh holds one transition, rearms with identical RSC data and stops after navigation', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ timezoneId: 'Europe/Malta', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    let refreshes = 0;
    let release: (() => void) | undefined;
    let frozen: { status: number; headers: Record<string, string>; body: Buffer } | undefined;
    let documentHtml = '';
    page.on('response', async response => {
      if (response.request().isNavigationRequest() && new URL(response.url()).pathname === target.pathname) documentHtml = await response.text();
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== target.origin) return route.abort();
      const request = route.request();
      if (url.pathname !== target.pathname || request.headers().rsc !== '1' || request.headers()['next-router-prefetch']) return route.continue();
      refreshes++;
      if (!frozen) {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        assert.match(response.headers()['content-type'] ?? '', /text\/x-component/);
        const headers = { ...response.headers() };
        delete headers['content-encoding']; delete headers['content-length'];
        frozen = { status: response.status(), headers, body: await response.body() };
      }
      await new Promise<void>(resolve => { release = resolve; });
      return route.fulfill(frozen);
    });
    await page.clock.install();
    await page.goto(target.href);
    const live = page.locator('article[data-state="live"]');
    await expect(live).toHaveCount(1); // Fixture precondition; never assume a live game exists.
    const score = await live.locator('[data-score="verified"]').innerText();
    const kickoff = page.locator('small time[datetime]').first();
    await expect(kickoff).toBeVisible();
    const iso = await kickoff.getAttribute('datetime'); assert.ok(iso);
    const utc = formatTouchlineLocalKickoff(iso, 'UTC', 'en-GB')!;
    const local = formatTouchlineLocalKickoff(iso, 'Europe/Malta', 'en-GB')!;
    await expect(kickoff).toHaveText(`${local.date} · ${local.time} · ${local.zoneName}`);
    await expect.poll(() => documentHtml).toContain(`${utc.date} · ${utc.time} · ${utc.zoneName}`);
    const cadence = clubHubFixtureRailRefreshMs({ state: 'live' }, iso)!;
    await page.clock.fastForward(cadence + 1);
    await expect.poll(() => refreshes).toBe(1);
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.clock.fastForward(cadence * 3);
    assert.equal(refreshes, 1, 'pending Next transition must not start overlapping refreshes');
    release!(); release = undefined;
    await expect(live.locator('[data-score="verified"]')).toHaveText(score);
    // Allow the real React/Next transition to commit before advancing timers.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.clock.fastForward(cadence + 1);
    await expect.poll(() => refreshes).toBe(2);
    await expect.poll(() => Boolean(release)).toBe(true);
    release!(); release = undefined;
    await expect(live.locator('[data-score="verified"]')).toHaveText(score);
    await page.locator('a[href^="/live"]').first().click();
    await expect(page).toHaveURL(/\/live(?:\?|$)/);
    await expect(live).toHaveCount(0);
    await page.clock.fastForward(cadence * 3);
    assert.equal(refreshes, 2, 'unmounted ClubHub must not keep refreshing its route');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

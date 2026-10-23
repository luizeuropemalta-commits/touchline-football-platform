import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { formatTouchlineLocalKickoff } from '../../lib/touchlineArena/local-kickoff.ts';
import { clubHubFixtureRailRefreshMs } from '../../lib/touchlineArena/club-hub-fixture-rail.ts';

// Explicit integration gate, not part of the lightweight default suite.
// Requires an existing disposable Next fixture runtime with one live ClubHub
// card and deterministic local data. The fixture must emit one changed,
// atomic GET-only live-presentation signal/envelope after its first shared
// read. This test never mutates that fixture, launches no server and touches
// no remote QA.
const raw = process.env.TOUCHLINE_CLUBHUB_LOCAL_INTEGRATION_URL;
assert.ok(raw, 'Provide an explicitly authorized disposable local Next ClubHub URL; no skip.');
assert.equal(process.env.TOUCHLINE_CLUBHUB_CONTROLLED_PUBLICATION_FIXTURE, '1',
  'The local fixture must explicitly provide a changed shared signal/envelope; no implicit live-data assumption.');
const target = new URL(raw);
assert.equal(target.protocol, 'http:');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.ok(target.port && !target.username && !target.password && !target.hash);
assert.match(target.pathname, /^\/touchline-clubs\/[a-z0-9-]+$/);
target.searchParams.set('lang', 'en-GB');

test('ClubHub keeps the T−24/T−1 boundary policy', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z');
  const startsAt = new Date(now + 25 * 60 * 60 * 1_000).toISOString();
  assert.equal(clubHubFixtureRailRefreshMs({ state: 'upcoming' }, startsAt, now), 60 * 60 * 1_000);
  const atTwentyFourHours = now + 60 * 60 * 1_000;
  assert.equal(clubHubFixtureRailRefreshMs({ state: 'upcoming' }, startsAt, atTwentyFourHours), 23 * 60 * 60 * 1_000);
  const atOneHour = now + 24 * 60 * 60 * 1_000;
  assert.equal(clubHubFixtureRailRefreshMs({ state: 'upcoming' }, startsAt, atOneHour), 60_000);
});

test('real shared refresh holds one transition, preserves focus/selection/mobile rail and stops after navigation', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ timezoneId: 'Europe/Malta', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    let refreshes = 0, stateReads = 0, publicationReads = 0;
    let release: (() => void) | undefined;
    let frozen: { status: number; headers: Record<string, string>; body: Buffer } | undefined;
    let documentHtml = '';
    page.on('response', async response => {
      if (response.request().isNavigationRequest() && new URL(response.url()).pathname === target.pathname) documentHtml = await response.text();
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const request = route.request();
      if (url.origin !== target.origin || request.method() !== 'GET') return route.abort();
      if (url.pathname === '/api/touchline-arena/live-presentation-state') {
        stateReads++;
        return route.continue();
      }
      if (url.pathname === '/api/touchline-arena/sports-publication') {
        publicationReads++;
        return route.continue();
      }
      if (url.pathname !== target.pathname || request.headers().rsc !== '1' || request.headers()['next-router-prefetch']) return route.continue();
      refreshes++;
      if (refreshes === 1) return route.continue();
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
    await expect.poll(() => stateReads).toBeGreaterThan(0);
    await expect.poll(() => publicationReads).toBeGreaterThan(0);
    await expect.poll(() => refreshes).toBe(1);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const liveLink = page.locator('a[href^="/live"]').first();
    await liveLink.focus();
    await expect(liveLink).toBeFocused();
    const selectedKickoff = await page.evaluate(() => {
      const node = document.querySelector('small time[datetime]')?.firstChild;
      if (!node) return '';
      const selection = window.getSelection(); selection?.removeAllRanges();
      const range = document.createRange(); range.selectNodeContents(node); selection?.addRange(range);
      return selection?.toString() ?? '';
    });
    assert.ok(selectedKickoff);
    const cadence = clubHubFixtureRailRefreshMs({ state: 'live' }, iso)!;
    await page.clock.fastForward(cadence + 1);
    await expect.poll(() => publicationReads).toBeGreaterThan(1);
    await expect.poll(() => refreshes).toBe(2);
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.clock.fastForward(cadence * 3);
    assert.equal(refreshes, 2, 'pending shared transition must not start overlapping refreshes');
    release!(); release = undefined;
    await expect(live.locator('[data-score="verified"]')).toHaveText(score);
    // Allow the real React/Next transition to commit before advancing timers.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(liveLink).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe(selectedKickoff);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(live).toBeVisible();
    await page.clock.fastForward(cadence + 1);
    await expect.poll(() => refreshes).toBe(3);
    await expect.poll(() => Boolean(release)).toBe(true);
    release!(); release = undefined;
    await expect(live.locator('[data-score="verified"]')).toHaveText(score);
    await page.locator('a[href^="/live"]').first().click();
    await expect(page).toHaveURL(/\/live(?:\?|$)/);
    await expect(live).toHaveCount(0);
    await page.clock.fastForward(cadence * 3);
    assert.equal(refreshes, 3, 'unmounted ClubHub must not keep refreshing its route');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

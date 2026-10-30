import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { chromium, webkit, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

async function expectMotion(locator: Locator, state: string) {
  await expect.poll(() => locator.evaluate(el => el.getAnimations()[0]?.playState)).toBe(state);
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const script = ts.transpileModule(read('lib/touchlineArena/visible-decoration-motion.ts').replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const css = read('app/globals.css') + read('components/touchline/pitch/TouchlinePitchSurface.module.css');
const clubProfile = read('app/touchline-clubs/[club]/page.tsx');
const pitchNeonOverrides = read('app/fantasy/fantasy.module.css').match(/[^{}]*\[data-touchline-card-neon-trace[^{}]*\{[^}]*\}/g)?.join('\n') ?? '';

test('decorative trace retains the restored bright intensity in page and portal fixtures, preserving reduced motion', { timeout: 45_000 }, async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
      const card = '<svg data-touchline-card-neon-trace="true" viewBox="0 0 100 100"><path data-touchline-card-neon-trace-base="true" d="M5 5H95V95H5Z"/><path data-touchline-card-neon-trace-run="true" pathLength="100" d="M5 5H95V95H5Z"/></svg>';
      await page.setContent(`<style>${css}${pitchNeonOverrides}.sample{position:relative;width:100px;height:100px}</style><div class="myClubTacticalPitch"><div class="sample">${card}</div></div><script>${script}observeVisibleDecorationMotion();</script>`);
      // Arena is mounted outside the page tree, after the observer starts.
      await page.evaluate(markup => {
        const portal = document.createElement('section');
        portal.className = 'arenaOverlay';
        portal.innerHTML = `<div class="myClubTacticalPitch"><div class="sample">${markup}</div></div>`;
        document.body.append(portal);
      }, card);
      const runs = page.locator('[data-touchline-card-neon-trace-run="true"]');
      for (const run of await runs.all()) {
        await expect(run).not.toHaveCSS('display', 'none');
        await expectMotion(run, 'running');
        await expect(run).toHaveCSS('animation-duration', '2s');
        await expect(run).toHaveCSS('animation-timing-function', 'linear');
        await expect.poll(() => run.evaluate(el => Number(el.getAnimations()[0]?.currentTime ?? 0))).toBeGreaterThan(100);
        await expect.poll(() => run.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.1);
      }
      for (const trace of await page.locator('[data-touchline-card-neon-trace="true"]').all()) await expect(trace).toHaveCSS('opacity', '1');
      for (const run of await runs.all()) {
        const samples = await run.evaluate(el => {
          const animation = el.getAnimations()[0];
          animation.pause();
          return [0, 500, 1000, 1500, 1999, 2000].map(time => {
            animation.currentTime = time;
            const style = getComputedStyle(el);
            return { opacity: Number(style.opacity), offset: parseFloat(style.strokeDashoffset), dash: style.strokeDasharray };
          });
        });
        assert.ok(samples.every(sample => Math.abs(sample.opacity - .9) < .001), 'the restored bright glow stays constant between laps');
        assert.equal(new Set(samples.map(sample => sample.dash)).size, 1, 'the moving segment keeps its length');
        assert.ok(Math.abs(samples[1].offset + 25) < .2);
        assert.ok(Math.abs(samples[2].offset + 50) < .2);
        assert.ok(Math.abs(samples[3].offset + 75) < .2);
        assert.ok(Math.abs(samples[5].offset) < .2, 'next lap starts without a wait');
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const run of await runs.all()) await expect(run).toHaveCSS('animation-name', 'none');
      assert.equal(await page.locator('svg').count(), 2);
      await page.close();
    } finally { await browser.close(); }
  }
});
const coverCss = ['club-hub-hero-image', 'club-hub-neon-trace'].map(name => {
  const rule = clubProfile.match(new RegExp(`\\.${name} \\{[^}]*\\}`));
  assert.ok(rule, `actual profile rule ${name} must exist`);
  return rule[0];
}).join('\n') + ['club-hub-stadium-breathe', 'club-hub-border-sweep'].map(name => {
  const rule = clubProfile.match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n        \\}`));
  assert.ok(rule, `actual profile keyframes ${name} must exist`);
  return rule[0];
}).join('\n') + clubProfile.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.club-hub-hero-image,[\s\S]*?\n        \}/)![0];

test('Chromium and WebKit preserve cards while pausing only offscreen decorative motion', { timeout: 60_000 }, async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 600 } });
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setContent(`<style>${css}body{margin:0;background:#08100c;color:white}.card{height:300px;width:200px;position:relative}.space{height:1800px}svg{height:280px;width:180px}</style><div class="card"><span>Visible athlete</span><svg data-touchline-card-neon-trace="true"><path data-touchline-card-neon-trace-run="true" d="M10 10H170V270H10Z"/></svg></div><div class="space"></div><div class="card"><span>Next athlete</span><svg data-touchline-card-neon-trace="true"><path data-touchline-card-neon-trace-run="true" d="M10 10H170V270H10Z"/></svg></div><script>${script}window.cleanupMotion=observeVisibleDecorationMotion();</script>`);
        const traces = page.locator('[data-touchline-card-neon-trace="true"]');
        const runs = page.locator('[data-touchline-card-neon-trace-run="true"]');
        await expectMotion(runs.nth(0), 'running');
        await expectMotion(runs.nth(1), 'paused');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expectMotion(runs.nth(0), 'paused');
        await expectMotion(runs.nth(1), 'running');
        await expect(page.getByText('Next athlete')).toBeVisible();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(runs.nth(1)).toHaveCSS('animation-name', 'none');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => window.scrollTo(0, 0));
        await expectMotion(runs.nth(0), 'running');
        assert.equal(await traces.count(), 2, 'scrolling never unmounts content');
        assert.deepEqual(errors, []);
        await page.close();
      }
      const pitchPage = await browser.newPage({ viewport: { width: 1280, height: 600 } });
      await pitchPage.setContent(`<style>${css}body{margin:0}.space{height:1800px}.surface{height:400px;width:500px}</style><div class="space"></div><div class="surface" data-touchline-pitch-surface="premium-stadium"><svg><path class="boundaryTraceRunner" d="M10 10H100V100Z"/></svg><span class="ledTrack">TouchLine</span></div><script>${script}observeVisibleDecorationMotion();</script>`);
      for (const selector of ['.boundaryTraceRunner', '.ledTrack']) await expectMotion(pitchPage.locator(selector), 'paused');
      await pitchPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      for (const selector of ['.boundaryTraceRunner', '.ledTrack']) await expectMotion(pitchPage.locator(selector), 'running');
      await pitchPage.evaluate(() => window.scrollTo(0, 0));
      for (const selector of ['.boundaryTraceRunner', '.ledTrack']) await expectMotion(pitchPage.locator(selector), 'paused');
      await pitchPage.close();
      const coverPage = await browser.newPage({ viewport: { width: 1280, height: 600 } });
      assert.match(clubProfile, /<header className="club-hub-hero" data-touchline-decoration-motion="club-cover">/);
      await coverPage.setContent(`<style>${coverCss}body{margin:0}.space{height:1800px}.club-hub-hero{height:400px;width:500px}.club-hub-hero-image{height:200px;width:500px}</style><div class="space"></div><header class="club-hub-hero" data-touchline-decoration-motion="club-cover"><div class="club-hub-hero-image"></div><svg><rect class="club-hub-neon-trace" width="100" height="100"/></svg><h1>Club identity preserved</h1></header><script>${script}observeVisibleDecorationMotion();</script>`);
      for (const selector of ['.club-hub-hero-image', '.club-hub-neon-trace']) await expectMotion(coverPage.locator(selector), 'paused');
      for (const selector of ['.club-hub-hero-image', '.club-hub-neon-trace']) assert.equal(await coverPage.locator(selector).evaluate(el => el.getAnimations().length), 1, 'actual keyframes must create an animation');
      await coverPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      for (const selector of ['.club-hub-hero-image', '.club-hub-neon-trace']) await expectMotion(coverPage.locator(selector), 'running');
      for (const selector of ['.club-hub-hero-image', '.club-hub-neon-trace']) await expect.poll(() => coverPage.locator(selector).evaluate(el => Number(el.getAnimations()[0].currentTime))).toBeGreaterThan(10);
      await expect(coverPage.getByRole('heading', { name: 'Club identity preserved' })).toBeVisible();
      await coverPage.evaluate(() => window.scrollTo(0, 0));
      for (const selector of ['.club-hub-hero-image', '.club-hub-neon-trace']) await expectMotion(coverPage.locator(selector), 'paused');
      await coverPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const stoppedTime = await coverPage.locator('.club-hub-hero-image').evaluate(el => Number(el.getAnimations()[0].currentTime));
      await coverPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await coverPage.locator('.club-hub-hero-image').evaluate(el => Number(el.getAnimations()[0].currentTime)), stoppedTime);
      await coverPage.emulateMedia({ reducedMotion: 'reduce' });
      for (const selector of ['.club-hub-hero-image', '.club-hub-neon-trace']) await expect(coverPage.locator(selector)).toHaveCSS('animation-name', 'none');
      assert.equal(await coverPage.locator('header').count(), 1);
      await coverPage.close();
    } finally { await browser.close(); }
  }
});

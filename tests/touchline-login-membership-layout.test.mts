import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localLoginBrowserURL, loginRequestAllowed } from './helpers/local-login-browser-policy.ts';

test("login plans share the approved live-text artwork without payment, fictional identity or account writes", () => {
  const gallery = readFileSync(new URL("../components/touchline/LoginPlanGallery.tsx", import.meta.url), "utf8");
  assert.match(gallery, /CLUB_OWNER_PLAN_PREVIEWS\.map/);
  assert.match(gallery, /<ClubOwnerPlanCard/);
  assert.match(gallery, /planActionUnavailable/);
  assert.match(gallery, /labels\.masterPrice/);
  assert.match(gallery, /labels\.betaPrice/);
  assert.match(gallery, /labels\.vipPrice/);
  assert.doesNotMatch(gallery, /labels\.invitation/);
  assert.doesNotMatch(gallery, /fetch\(|localStorage|stripe|checkout|\.png|name=/);
  const login = readFileSync(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8");
  assert.match(login, /planGallery=\{!protectedReturn/);
});

const loginTarget = process.env.TOUCHLINE_LOGIN_BROWSER_URL === undefined ? undefined : localLoginBrowserURL(process.env.TOUCHLINE_LOGIN_BROWSER_URL);
if (loginTarget) test("rendered customer login keeps full-screen video, four plans, and usable auth controls", { timeout: 90_000 }, async t => {
  const blocked: string[] = [];
  let browser: import('@playwright/test').Browser | undefined = undefined;
  let closing: Promise<void> | undefined;
  const closeBrowser = () => browser ? (closing ??= browser.close()) : Promise.resolve();
  const onAbort = () => { void closeBrowser().catch(() => {}); };
  t.signal.addEventListener('abort', onAbort, { once: true });
  t.after(async () => {
    t.signal.removeEventListener('abort', onAbort);
    try { await closeBrowser(); }
    finally { assert.deepEqual(blocked, [], 'blocked network attempts are test failures'); }
  });
  t.signal.throwIfAborted();
  const { webkit, expect } = await import("@playwright/test");
  browser = await webkit.launch({ headless: true, timeout: 15_000 });
  try {
    t.signal.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request();
      if (!loginRequestAllowed(loginTarget.origin, request.url(), request.method())) {
        blocked.push(`request:${request.method()}`);
        return route.abort('blockedbyclient');
      }
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 10_000 });
      try {
        if (response.status() >= 300 && response.status() < 400) {
          blocked.push('redirect');
          return await route.abort('blockedbyclient');
        }
        await route.fulfill({ response });
      } finally { await response.dispose(); }
    });
    await context.routeWebSocket('**/*', socket => {
      blocked.push('websocket');
      socket.close();
    });
    const page = await context.newPage();
    const errors: string[] = [], writes: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" || message.type() === "warning") errors.push(message.text()); });
    page.on("request", request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    await page.goto(loginTarget.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.locator("[data-login-plans]")).toBeVisible({ timeout: 20_000 });
    // This video mounts from a client effect, unlike the server-rendered gallery.
    // Wait for hydration before changing native details state with the keyboard.
    await expect(page.locator("video.auth-cinematic-video")).toBeVisible({ timeout: 20_000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("video.auth-cinematic-video")).toHaveCount(0);
    await expect(page.locator(".ps-career-home")).toHaveCount(0);
    await expect(page.locator("[data-plan-offer]")).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Explore a public club" })).toHaveCount(0);
    for (const width of [1440, 844, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}`);
      const headerFits = await page.locator(".auth-brand-header").evaluate(header =>
        [...header.querySelectorAll("a, button, select")].every(control => {
          const rect = control.getBoundingClientRect();
          return !rect.width || (rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 1);
        }),
      );
      assert.equal(headerFits, true, `brand and controls must not be clipped at ${width}`);
      const headline = page.locator(".auth-login-hero h1.console-title");
      if (width === 1440) assert.ok(await headline.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 108, "desktop introduction should fill the left hero with a larger headline");
      assert.equal(await headline.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `headline must fit at ${width}`);
      assert.equal(await page.locator(".auth-login-story").evaluate(el => getComputedStyle(el).direction), "ltr", "translated copy must not mirror the introduction layout");
      if (width === 1440) {
        const introduction = await page.locator(".auth-login-story").boundingBox();
        const form = await page.locator(".stadium-scoreboard").boundingBox();
        const beta = await page.locator('[data-plan-offer="beta"]').boundingBox();
        const standard = await page.locator('[data-plan-offer="standard"]').boundingBox();
        const vip = await page.locator('[data-plan-offer="vip"]').boundingBox();
        assert.ok(introduction && form && introduction.x + introduction.width <= form.x, "introduction stays left of the form in every language");
        assert.ok(beta && standard && vip && beta.x < standard.x && standard.x < vip.x, "Beta comes first and plan order must not reverse in Arabic");
      }
      const background = await page.locator(".auth-cinematic-media").boundingBox();
      // Cover the actual content viewport; WebKit's Arabic scrollbar may occupy its left edge.
      assert.equal(background?.x, (await page.locator("main.auth-cinematic").boundingBox())?.x);
      assert.equal(background?.y, 0); assert.equal(background?.width, await page.evaluate(() => document.documentElement.clientWidth)); assert.equal(background?.height, 1000);
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      for (const tier of ["beta", "standard", "master", "vip"]) {
        const offer = page.locator(`article[data-plan-preview="${tier}"]`);
        assert.equal(await offer.locator("[data-plan-offer]").evaluate(el => getComputedStyle(el).direction), "ltr", "artwork, brand and amounts keep the same composition in Arabic");
        assert.equal(await offer.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${tier}/${width}`);
        await offer.locator("summary").focus(); await page.keyboard.press("Enter");
        await expect(offer.locator("details")).toHaveAttribute("open");
        await page.keyboard.press("Enter");
      }
      if (process.env.TOUCHLINE_LOGIN_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_LOGIN_CAPTURE_PREFIX}-${width}.png`, fullPage: true });
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator("video.auth-cinematic-video")).toBeVisible();
    assert.equal(await page.locator("video").evaluate(el => getComputedStyle(el).objectFit), "cover");
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  } finally { await closeBrowser(); }
});

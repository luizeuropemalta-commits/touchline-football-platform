import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium, webkit, expect, type Locator } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const enabled = process.env.TOUCHLINE_RUN_ZOOM_LANDSCAPE_BROWSER_TESTS === "1";

test("canonical player/coach zoom: two landscape notch sides, crowns, dismissal and focus", { skip: !enabled, timeout: 120_000 }, async () => {
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/CardZoomLandscapeBrowserFixture.tsx", cssPrefix: "landscapezoom",
    requiredSources: ["components/touchline/fantasy/TouchlineGameweekCard.tsx", "components/touchline/cards/TouchlineCoachCardZoom.tsx",
      "components/touchline/cards/TouchlineCardZoom.tsx", "components/touchline/cards/TouchlineCardZoom.module.css",
      "components/touchline/cards/TouchlineEliteExactCard.tsx", "components/touchline/cards/TouchlineCoachCard.tsx",
      "components/touchline/a11y/TouchlineDialog.tsx"],
    mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default)));",
  });
  // Headless WebKit/Chromium expose zero physical notch insets. Replace ONLY
  // env inputs with controlled variables; preserve every product selector and
  // formula. This is synthetic notch geometry, NOT native Safari/device proof.
  const safeAreaTokens = /env\(safe-area-inset-(top|right|bottom|left)(?:,\s*0px)?\)/g;
  assert.ok([...bundle.css.matchAll(safeAreaTokens)].length >= 8);
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
  const insetCss = css.replace(safeAreaTokens, (_, edge: string) => `var(--fixture-safe-${edge}, 0px)`);
  const publicRoot = realpathSync(path.join(root, "public"));
  const origin = "https://zoom-landscape.test";
  const reports: unknown[] = [];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const viewport of [{ width: 844, height: 390 }, { width: 812, height: 375 }]) for (const notch of ["left", "right"] as const) {
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(8000);
          const errors: string[] = [], assetReads: string[] = [], external: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          const safe = { left: notch === "left" ? 47 : 0, right: notch === "right" ? 47 : 0, top: 0, bottom: 21 };
          const html = `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${insetCss}</style></head><body style="--fixture-safe-left:${safe.left}px;--fixture-safe-right:${safe.right}px;--fixture-safe-top:0px;--fixture-safe-bottom:21px;background:#07120e;color:white"><div id="root"></div></body></html>`;
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== "GET" || url.origin !== origin) { external.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
            if (url.pathname === "/clubowner") return route.fulfill({ contentType: "text/html", body: html });
            if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { ok: false, error: "Isolated layout boundary" } });
            const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) {
              assetReads.push(url.pathname); return route.fulfill({ path: asset });
            }
            return route.abort();
          });
          await page.goto(`${origin}/clubowner`);
          await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
          assert.deepEqual(errors, [], "fixture must mount without page errors before any scroll assertion");
          await expect(page.locator('main [data-landscape-subject="player"]')).toBeVisible();
          await expect(page.locator('main [data-landscape-subject="coach"]')).toBeVisible();
          const initialGeometry = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight,
            rootOverflow: getComputedStyle(document.documentElement).overflowY, bodyOverflow: getComputedStyle(document.body).overflowY,
            mainHeight: document.querySelector("main")?.getBoundingClientRect().height ?? null }));
          console.log(JSON.stringify({ engine: engine.name(), viewport, notch, initialGeometry, errors }));
          assert.ok(initialGeometry.height > initialGeometry.viewport + 420, "real fixture main must make document scrollable");
          await page.evaluate(() => scrollTo({ top: 420, behavior: "instant" }));
          const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          assert.ok(before.y > 0, "document starts genuinely scrolled");
          for (const subject of ["player", "coach"]) {
            const trigger = page.locator(`[data-landscape-subject="${subject}"] [data-touchline-card-zoom="trigger"] > [role="button"]`);
            await trigger.evaluate(node => (node as HTMLElement).focus({ preventScroll: true }));
            await page.keyboard.press("Enter");
            const dialog = page.locator('[data-touchline-card-zoom="dialog"]'), close = dialog.getByRole("button", { name: getTouchlineCardZoomCopy("en-GB").close, exact: true });
            await expect(dialog).toBeVisible(); await expect(close).toBeFocused();
            const expanded = dialog.locator('[data-card-zoom="expanded"]');
            const crown = expanded.locator(subject === "player" ? '[data-touchline-player-golden-ball="true"]' : '[data-touchline-coach-leader-crown="true"]');
            await expect(crown).toHaveCount(1);
            for (const image of [crown, expanded.locator('img[data-touchline-card-frame="true"]').first()]) {
              await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
            }
            assert.match(await expanded.locator('img[data-touchline-card-frame="true"]').first().getAttribute("src") ?? "", /\/templates\/zoom\//, "expanded artwork must not reuse the tiny live frame");
            if (subject === "coach") await expect(expanded.locator('[data-coach-frame-ready]')).toHaveAttribute("data-coach-frame-ready", "true");
            await expect.poll(() => expanded.locator('img[data-touchline-card-frame="true"]').first().evaluate(node => {
              let element: Element | null = node;
              while (element) { const style = getComputedStyle(element); if (style.opacity === "0" || style.visibility === "hidden" || style.display === "none") return false; element = element.parentElement; }
              return getComputedStyle(node).opacity === "1";
            })).toBe(true);
            const inSafeViewport = async (element: Locator) => element.evaluate((node, inset) => {
              const b = node.getBoundingClientRect(); return b.left >= inset.left - .5 && b.right <= innerWidth - inset.right + .5 && b.top >= inset.top - .5 && b.bottom <= innerHeight - inset.bottom + .5;
            }, safe);
            await expect.poll(() => inSafeViewport(crown)).toBe(true);
            await expect.poll(() => inSafeViewport(expanded.locator('img[data-touchline-card-frame="true"]').first())).toBe(true);
            await expect.poll(() => inSafeViewport(close)).toBe(true);
            const closeSize = await close.boundingBox(); assert.ok(closeSize && closeSize.width >= 44 && closeSize.height >= 44);
            // A real long modal must scroll; otherwise the end-of-list close
            // check could accidentally pass without testing sticky dismissal.
            const scrollRange = await dialog.evaluate(node => node.scrollHeight - node.clientHeight);
            assert.ok(scrollRange > 20, `${subject} needs a real scroll range`);
            await page.keyboard.press("Shift+Tab");
            assert.equal(await dialog.evaluate(node => {
              const eligible = [...node.querySelectorAll<HTMLElement>('a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"]),input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]),select:not([disabled]):not([tabindex="-1"]),textarea:not([disabled]):not([tabindex="-1"]),[tabindex]:not([tabindex="-1"])')]
                .filter(element => element.getClientRects().length > 0 && !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
              return eligible.length > 1 && document.activeElement === eligible.at(-1) && document.activeElement !== eligible[0];
            }), true, "Shift+Tab wraps from close to the last real eligible control");
            await page.keyboard.press("Tab"); await expect(close).toBeFocused();
            await dialog.evaluate(node => { node.scrollTop = node.scrollHeight; });
            await expect.poll(() => dialog.evaluate(node => node.scrollTop > 0)).toBe(true);
            await expect.poll(() => inSafeViewport(close)).toBe(true);
            assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), before);
            await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
            assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), before);
            // Explicit touch/click dismissal as well as Escape, at scroll end.
            await page.keyboard.press("Enter"); await expect(close).toBeFocused();
            await dialog.evaluate(node => { node.scrollTop = node.scrollHeight; });
            await close.click(); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
            assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), before);
            reports.push({ engine: engine.name(), viewport, notch, subject, scrollRange });
          }
          assert.deepEqual(errors, []); assert.deepEqual(external, []);
          assert.ok(assetReads.some(value => /\.png|\.webp/.test(value)), "original local artwork actually loaded");
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  console.log(JSON.stringify({ syntheticNotchOnly: true, reports }));
});

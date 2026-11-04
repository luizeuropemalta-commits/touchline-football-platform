import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium, webkit, expect, type Page } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";

const root = path.resolve(import.meta.dirname, "..");
const enabled = process.env.TOUCHLINE_RUN_DENSE_SQUAD_MOTION_BROWSER_TESTS === "1";
const requestedEngine = process.env.TOUCHLINE_DENSE_SQUAD_MOTION_BROWSER_ENGINE ?? "all";
assert.ok(["all", "webkit", "chromium"].includes(requestedEngine), "unknown dense squad browser shard");
const engines = [webkit, chromium].filter(engine => requestedEngine === "all" || requestedEngine === engine.name());
const cardSelector = '[data-dense-squad-grid="true"] [data-dense-card]';

async function readMotion(page: Page) {
  return page.locator(cardSelector).evaluateAll(cards => cards.map(card => {
    const trace = card.querySelector<SVGElement>('[data-touchline-card-neon-trace="true"]');
    const runner = trace?.querySelector<SVGPathElement>('[data-touchline-card-neon-trace-run="true"]');
    const base = trace?.querySelector<SVGPathElement>('[data-touchline-card-neon-trace-base="true"]');
    const box = trace?.getBoundingClientRect();
    const animations = runner?.getAnimations() ?? [];
    return { id: Number(card.getAttribute("data-dense-card")),
      traces: card.querySelectorAll('[data-touchline-card-neon-trace="true"]').length,
      visible: Boolean(box && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth),
      hover: Boolean(card.querySelector(".touchline-card-surface:hover")),
      opacity: trace ? Number(getComputedStyle(trace).opacity) : null,
      baseOpacity: base ? Number(getComputedStyle(base).opacity) : null,
      runnerOpacity: runner ? Number(getComputedStyle(runner).opacity) : null,
      filter: trace ? getComputedStyle(trace).filter : null,
      animations: animations.map(animation => ({ name: (animation as CSSAnimation).animationName,
        state: animation.playState, pending: animation.pending, time: Number(animation.currentTime ?? 0) })),
    };
  }));
}

async function settledMotion(page: Page) {
  await expect.poll(async () => (await readMotion(page)).every(card => card.traces === 1 && card.animations.length === 1
    && !card.animations[0].pending && card.animations[0].state === (card.visible ? "running" : "paused")),
  { message: "all 36 original traces must follow their own viewport visibility", timeout: 8000 }).toBe(true);
  const states = await readMotion(page);
  assert.equal(states.length, 36);
  assert.ok(states.some(card => card.visible), "at least one original card is on screen");
  assert.ok(states.filter(card => !card.visible).length >= 18, "a full offscreen squad subset must be present");
  for (const card of states) {
    assert.equal(card.opacity, 1, `card ${card.id}: neon remains visible without hover`);
    assert.ok(card.baseOpacity !== null && card.baseOpacity > 0);
    assert.ok(card.runnerOpacity !== null && card.runnerOpacity > 0);
    assert.equal(card.filter, "none", `card ${card.id}: no filtered surface on touch`);
    assert.match(card.animations[0].name, /touchline-card-perimeter-trace/);
  }
  return states;
}

// Opt-in only: 36 originals at once is deliberately heavier than a 2-card zoom
// fixture. It proves bounded animation ownership, not a device CPU/FPS budget,
// native Safari, physical pinch gestures or the authenticated full application.
test(`dense original squad (${requestedEngine}): touch neon ownership, scroll, reduced motion and zoom`, { skip: !enabled, timeout: 180_000 }, async t => {
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
    allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI,
    allowLowDarwinDisk: process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI });
  capacity();
  const output = mkdtempSync(path.join(tmpdir(), "touchline-dense-squad-motion-"));
  t.diagnostic(`Isolated dense squad evidence: ${output}`);
  // Release the TypeScript compiler graph before starting a single browser.
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import { writeFileSync, readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import { bundleIsolatedBrowserFixture } from './tests/helpers/touchline-isolated-browser-bundle.mts';
    const bundle = bundleIsolatedBrowserFixture({ entryPath: 'tests/fixtures/DenseSquadMotionBrowserFixture.tsx', cssPrefix: 'densesquad',
      requiredSources: ['components/touchline/fantasy/TouchlineGameweekCard.tsx', 'components/touchline/cards/TouchlineEliteExactCard.tsx',
        'components/touchline/cards/TouchlineCardZoom.tsx', 'components/touchline/cards/TouchlineCardZoom.module.css',
        'components/touchline/cards/TouchlineCardPerimeterTrace.tsx', 'components/touchline/TouchlineDecorationMotion.tsx',
        'lib/touchlineArena/visible-decoration-motion.ts', 'components/touchline/a11y/TouchlineDialog.tsx'],
      mountScript: 'flushSync(()=>root.render(React.createElement(loadEntry().default)));' });
    writeFileSync(process.argv[1] + '/bundle.json', JSON.stringify(bundle));
    writeFileSync(process.argv[1] + '/sources.json', JSON.stringify(Object.fromEntries([...bundle.sources,
      'app/globals.css', 'node_modules/tailwindcss/preflight.css'].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])), null, 2));
  `, output], { cwd: root, timeout: 40_000, stdio: "pipe" });
  const bundle = JSON.parse(readFileSync(path.join(output, "bundle.json"), "utf8")) as { script: string; css: string };
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
  const publicRoot = realpathSync(path.join(root, "public")), origin = "https://dense-squad.test";
  const results: unknown[] = [];
  for (const engine of engines) {
    t.signal.throwIfAborted(); capacity();
    assert.ok(existsSync(engine.executablePath()), `${engine.name()} must already be installed`);
    const browser = await engine.launch({ headless: true });
    let closing: Promise<void> | undefined;
    const closeBrowser = () => closing ??= browser.close();
    const abortBrowser = () => { void closeBrowser().catch(() => undefined); };
    t.signal.addEventListener("abort", abortBrowser, { once: true });
    try {
      t.signal.throwIfAborted();
      const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
        deviceScaleFactor: 3, reducedMotion: "no-preference", serviceWorkers: "block" });
      try {
        const page = await context.newPage(); page.setDefaultTimeout(8000);
        const errors: string[] = [], forbidden: string[] = [], missingAssets: string[] = [], assetReads = new Set<string>();
        page.on("pageerror", error => errors.push(error.message));
        page.on("crash", () => errors.push("Page crashed"));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        const html = `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body style="margin:0;background:#07120e;color:white"><div id="root"></div></body></html>`;
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== origin || url.pathname.startsWith("/api/")) {
            forbidden.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort();
          }
          if (url.pathname === "/clubowner") return route.fulfill({ contentType: "text/html", body: html });
          const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) {
            assetReads.add(url.pathname); return route.fulfill({ path: asset });
          }
          missingAssets.push(url.pathname); return route.abort();
        });
        await page.goto(`${origin}/clubowner`);
        await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
        const grid = page.locator('[data-dense-squad-grid="true"]');
        await expect(page.locator(cardSelector)).toHaveCount(36);
        await expect.poll(() => grid.locator('img[data-touchline-card-frame="true"]').evaluateAll(images => images.length === 36
          && images.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
        const canvasSizes = await grid.locator('.touchline-card-surface').evaluateAll(nodes => nodes.map(node => {
          const image = node.querySelector<HTMLImageElement>('img[data-touchline-card-frame="true"]');
          const svg = node.querySelector<SVGSVGElement>('[data-touchline-card-neon-trace="true"]');
          if (!image || !svg) throw new Error('Real card frame and neon required');
          const ib = image.getBoundingClientRect(), sb = svg.getBoundingClientRect(), hb = node.getBoundingClientRect();
          const matrix = svg.getScreenCTM(), viewBox = svg.viewBox.baseVal;
          return { id: node.closest('[data-dense-card]')?.getAttribute('data-dense-card'),
            source: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            shell: { width: hb.width, height: hb.height },
            frame: { x: ib.x, y: ib.y, width: ib.width, height: ib.height },
            svg: { x: sb.x, y: sb.y, width: sb.width, height: sb.height },
            ctm: matrix ? { a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e,f:matrix.f } : null,
            viewBox: { width:viewBox.width,height:viewBox.height } };
        }));
        assert.equal(canvasSizes.length, 36);
        for (const measured of canvasSizes) {
          assert.ok(measured.frame.width > 0 && measured.frame.height > 0 && measured.ctm);
          for (const key of ['x', 'y', 'width', 'height'] as const) {
            assert.ok(Math.abs(measured.svg[key] - measured.frame[key]) <= .25,
              `Dense card ${measured.id} neon must follow the rendered frame ${key}, not its wider column`);
          }
          assert.ok(Math.abs(measured.ctm.a - measured.ctm.d) <= .000001, `Dense card ${measured.id} canvas scale must stay uniform`);
          assert.deepEqual(measured.viewBox, { width: 430, height: 691 });
        }
        const identity = await grid.evaluateHandle(node => ({ grid: node, cards: [...node.querySelectorAll("[data-dense-card]")], surfaces: [...node.querySelectorAll(".touchline-card-surface")] }));
        const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
          scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
          touch: navigator.maxTouchPoints, hover: matchMedia("(hover: hover)").matches, coarse: matchMedia("(pointer: coarse)").matches }));
        assert.deepEqual([geometry.width, geometry.height, geometry.dpr], [844, 390, 3]);
        // Installed headless WebKit reports maxTouchPoints=0 even with hasTouch;
        // verify the actual touch media mode and exercise touchscreen.tap below.
        assert.ok(geometry.coarse && !geometry.hover, JSON.stringify(geometry));
        if (engine === chromium) assert.ok(geometry.touch > 0);
        assert.ok(geometry.scrollWidth <= 844 && geometry.scrollHeight > 3 * 390, "dense grid must scroll vertically without horizontal overflow");
        const checkpoints: unknown[] = [], seen = new Set<number>();
        for (const row of [0, 1, 2, 3, 4, 5]) {
          t.signal.throwIfAborted();
          await page.locator(`[data-dense-card="${row * 6 + 1}"]`).evaluate(node => scrollTo({ top: Math.max(0, scrollY + node.getBoundingClientRect().top - 20), behavior: "instant" }));
          const states = await settledMotion(page);
          for (const card of states.filter(card => card.visible)) seen.add(card.id);
          assert.ok(states.every(card => !card.hover), "touch scrolling must not need pointer hover");
          // A paused state alone is insufficient: compare clocks across actual
          // browser frames, including every offscreen original card.
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
          const next = await readMotion(page);
          for (const card of states) {
            const current = next.find(candidate => candidate.id === card.id)!;
            assert.equal(current.visible, card.visible);
            if (card.visible) assert.ok(current.animations[0].time > card.animations[0].time, `visible card ${card.id} must advance`);
            else assert.equal(current.animations[0].time, card.animations[0].time, `offscreen card ${card.id} must stop`);
          }
          checkpoints.push({ row, scrollY: await page.evaluate(() => scrollY), visible: states.filter(card => card.visible).map(card => card.id),
            running: states.filter(card => card.animations[0].state === "running").length,
            paused: states.filter(card => card.animations[0].state === "paused").length });
          if (row === 0 || row === 3) await page.screenshot({ path: path.join(output, `${engine.name()}-row-${row}.png`) });
        }
        assert.equal(seen.size, 36, "every card must enter the viewport and run during the scroll audit");
        const trigger = page.locator('[data-dense-card="31"] [data-touchline-card-zoom="trigger"] > [role="button"]');
        await trigger.evaluate(node => (node as HTMLElement).focus({ preventScroll: true }));
        const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        await page.keyboard.press("Enter");
        const dialog = page.locator('[data-touchline-card-zoom="dialog"]');
        const close = dialog.getByRole("button", { name: getTouchlineCardZoomCopy("en-GB").close, exact: true });
        await expect(dialog).toBeVisible(); await expect(close).toBeFocused();
        await expect(page.locator(cardSelector)).toHaveCount(36);
        const expandedFrame = dialog.locator('img[data-touchline-card-frame="true"]').first();
        await expect.poll(() => expandedFrame.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
        assert.match(await expandedFrame.getAttribute("src") ?? "", /\/templates\/zoom\//);
        await expect.poll(() => dialog.locator('[data-touchline-card-neon-trace="true"]').evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))).toBe(true);
        await page.screenshot({ path: path.join(output, `${engine.name()}-zoom.png`) });
        await close.tap(); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
        assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), before);
        assert.equal(await page.evaluate(saved => saved.grid === document.querySelector('[data-dense-squad-grid="true"]')
          && saved.cards.every((node, index) => node === saved.grid.querySelectorAll("[data-dense-card]")[index] && node.isConnected)
          && saved.surfaces.length === 36 && saved.surfaces.every((node, index) => node === saved.grid.querySelectorAll(".touchline-card-surface")[index] && node.isConnected), identity), true,
        "zoom dismissal preserves the exact 36 card DOM nodes and grid");
        await identity.dispose();
        await settledMotion(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect.poll(async () => (await readMotion(page)).every(card => card.animations.length === 0)).toBe(true);
        const reduced = await readMotion(page);
        assert.equal(reduced.length, 36);
        assert.ok(reduced.every(card => card.opacity === 1 && card.baseOpacity !== null && card.baseOpacity >= .4 && card.runnerOpacity === 0),
          "reduced motion preserves the static tier perimeter on all 36 cards");
        await page.screenshot({ path: path.join(output, `${engine.name()}-reduced-motion.png`) });
        assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.deepEqual(missingAssets, []);
        assert.ok([...assetReads].some(asset => /\/templates\/zoom\//.test(asset)));
        assert.ok([...assetReads].some(asset => /\.png|\.webp/.test(asset)));
        results.push({ engine: engine.name(), geometry, canvasSizes, checkpoints, seenCards: seen.size, reducedCards: reduced.length,
          zoomRestoredFocusAndDom: true, pageAndConsoleErrors: errors, forbiddenRequests: forbidden, localAssets: [...assetReads].sort() });
        writeFileSync(path.join(output, "results.json"), JSON.stringify({ syntheticFixtureOnly: true, nativeSafariOrPhysicalPinchProof: false,
          requestedEngine, sourceReceiptSha256: createHash("sha256").update(readFileSync(path.join(output, "sources.json"))).digest("hex"), results }, null, 2));
      } finally { await context.close(); }
    } finally {
      t.signal.removeEventListener("abort", abortBrowser);
      await closeBrowser();
    }
  }
  assert.equal(results.length, engines.length);
});

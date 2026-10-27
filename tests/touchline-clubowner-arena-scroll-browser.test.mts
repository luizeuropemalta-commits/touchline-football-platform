import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, realpathSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect } from "@playwright/test";
import { readArenaScrollBundle } from "./helpers/touchline-arena-scroll-bundle-receipt.mts";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
test("real Arena portal scrolls a full-width pitch without trapping controls below the viewport", {
  skip: process.env.TOUCHLINE_RUN_ARENA_SCROLL_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const requestedEngine = process.env.TOUCHLINE_ARENA_SCROLL_ENGINE;
  const requestedWidth = process.env.TOUCHLINE_ARENA_SCROLL_VIEWPORT_WIDTH;
  assert.ok(requestedEngine === undefined || requestedEngine === "chromium" || requestedEngine === "webkit",
    "TOUCHLINE_ARENA_SCROLL_ENGINE must be chromium or webkit when supplied");
  assert.ok(requestedWidth === undefined || ["844", "667", "1024", "1280"].includes(requestedWidth),
    "TOUCHLINE_ARENA_SCROLL_VIEWPORT_WIDTH must be 844, 667, 1024 or 1280 when supplied");
  const engines = [chromium, webkit].filter(engine => requestedEngine === undefined || engine.name() === requestedEngine);
  const viewports = ([[844, 390], [667, 375], [1024, 768], [1280, 900]] as const)
    .filter(([width]) => requestedWidth === undefined || String(width) === requestedWidth);
  assert.ok(engines.length > 0 && viewports.length > 0, "selection cannot silently execute an empty matrix");
  t.diagnostic(JSON.stringify({ scope: "Arena selected matrix", completeMatrix: requestedEngine === undefined && requestedWidth === undefined,
    engines: engines.map(engine => engine.name()), viewports, caseCount: engines.length * viewports.length }));
  const capacity = () => requireBrowserCapacity(rootPath, { darwinFreePercent: true });
  capacity();
  t.signal.throwIfAborted();
  const reuseDirectory = process.env.TOUCHLINE_ARENA_SCROLL_BUNDLE_DIR;
  const directory = reuseDirectory ?? mkdtempSync("/private/tmp/touchline-arena-scroll-");
  if (reuseDirectory === undefined) await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      path.join(rootPath, "tests/helpers/touchline-arena-scroll-compile-worker.mts"), directory], {
      cwd: rootPath, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Arena fixture compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      failure = new Error("Arena fixture compilation exceeded 30 seconds"); child.kill("SIGKILL");
    }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Arena fixture compiler could not start"); });
    // close, rather than exit or an IPC receipt, proves the compiler and its
    // streams are gone before browser launch. Failures also wait for close.
    child.once("close", code => {
      clearTimeout(timeout); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Arena fixture compiler exited with code ${code}; evidence: ${directory}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  t.signal.throwIfAborted();
  const { script, css, sources, outputs } = readArenaScrollBundle(rootPath, directory);
  t.diagnostic(JSON.stringify({ scope: reuseDirectory === undefined ? "Arena compiler exited before browser" : "Arena reused bundle validated; no compiler started",
    directory, sourceCount: sources.length, outputs }));
  const publicRoot = realpathSync(path.join(rootPath, "public"));
  for (const engine of engines) {
    capacity(); t.signal.throwIfAborted(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close().catch(() => {}); }; t.signal.addEventListener("abort", abort, { once: true });
    if (t.signal.aborted) abort();
    try {
      t.signal.throwIfAborted();
      for (const [width, height] of viewports) {
        capacity();
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
        const page = await context.newPage(), errors: string[] = [], denied: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        const origin = "https://arena-scroll.test";
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== origin) { denied.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort(); return; }
          if (url.pathname === "/") { await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div id="root"></div></body></html>` }); return; }
          if (url.pathname.startsWith("/api/")) { await route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }); return; }
          const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep) && /\.(png|webp|svg|jpe?g|json)$/i.test(asset)) { await route.fulfill({ path: asset }); return; }
          denied.push(url.pathname); await route.abort();
        });
        try {
          const probe = '<!doctype html><a id="native-link" href="#native">Link</a><input id="native-input">';
          await page.setContent(probe);
          await page.keyboard.press("Tab");
          let forward = "Tab";
          if (!await page.locator("#native-link").evaluate(element => element === document.activeElement)) {
            assert.equal(engine.name(), "webkit", "only native WebKit link-skipping permits Option-Tab");
            await expect(page.locator("#native-input")).toBeFocused();
            await page.setContent(probe); forward = "Alt+Tab";
            await page.keyboard.press(forward);
            await expect(page.locator("#native-link")).toBeFocused();
          }
          const backward = forward === "Tab" ? "Shift+Tab" : "Alt+Shift+Tab";
          await page.goto(origin); await page.addScriptTag({ content: `(()=>{${script}})()` });
          await page.locator('[data-arena-open]').click();
          const overlay = page.getByRole("dialog", { name: "Arena geometry fixture", exact: true });
          await expect(overlay).toBeVisible();
          await expect(overlay.locator('[data-arena-slot]')).toHaveCount(11);
          assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
          const documentScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          for (const selector of ['[data-arena-close]', '[data-arena-formation] summary']) {
            const target = overlay.locator(selector); const box = await target.boundingBox();
            assert.ok(box && box.width >= 44 && box.height >= 44, `${selector}: 44px target`);
          }
          const cardSizes = await overlay.locator('[data-arena-slot] [data-touchline-card-zoom="trigger"] > [role="button"]').evaluateAll(nodes => nodes.map(node => ({
            target: node.getBoundingClientRect().toJSON(), artwork: node.querySelector('img[data-live-card-asset="frame"]')!.getBoundingClientRect().toJSON(),
          })));
          assert.equal(cardSizes.length, 11);
          // 625px field at 667px viewport: floor((22% * 625 * 68/105 - 18 - 6) / (691/430)) = 40.
          const minimumArtworkWidth = width === 667 ? 40 : 44;
          for (const { target, artwork } of cardSizes) {
            assert.ok(artwork.width >= minimumArtworkWidth - .1, "full-width field preserves calculated artwork instead of miniature cards");
            assert.ok(target.width >= 44 && target.height >= 44, "transparent zoom target remains at least 44px independently of artwork");
            assert.ok(Math.abs(artwork.width / artwork.height - 430 / 691) < .001, "actual frame image retains its canonical ratio");
            assert.ok(Math.abs(artwork.x + artwork.width / 2 - target.x - target.width / 2) <= 1, "transparent target centres the actual artwork");
          }
          for (let first = 0; first < cardSizes.length; first++) for (let second = first + 1; second < cardSizes.length; second++) {
            const a = cardSizes[first].target, b = cardSizes[second].target;
            assert.ok(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1,
              `real zoom targets ${first}/${second} must not overlap`);
          }
          const measure = await overlay.evaluate(node => ({ height: node.clientHeight, scroll: node.scrollHeight, overflow: getComputedStyle(node).overflowY, viewport: innerHeight }));
          assert.equal(measure.overflow, "auto"); assert.ok(measure.height <= height);
          if (height <= 390) assert.ok(measure.scroll > measure.height + 1, "landscape requires a real vertical scroll range, not a miniaturized field");
          await overlay.evaluate(node => { node.scrollTop = node.scrollHeight; });
          const bottom = await overlay.evaluate(node => {
            const surface = node.querySelector('[aria-label="Arena fixture pitch"]')!;
            const pitch = surface.getBoundingClientRect(), outer = node.getBoundingClientRect();
            const host = surface.parentElement!, hostStyle = getComputedStyle(host);
            return { pitchLeft: pitch.left, pitchRight: pitch.right, hostLeft: host.getBoundingClientRect().left, hostRight: host.getBoundingClientRect().right, pitchHeight: pitch.height, pitchBottom: pitch.bottom, outerBottom: outer.bottom, scrollTop: node.scrollTop, width: node.scrollWidth, clientWidth: node.clientWidth,
              pitchWidth: pitch.width, availableHostWidth: host.clientWidth - parseFloat(hostStyle.paddingLeft) - parseFloat(hostStyle.paddingRight) };
          });
          if (width <= 1180) assert.ok(Math.abs(bottom.pitchWidth - Math.min(bottom.availableHostWidth, 1400)) <= 1, "pitch occupies the full available host width up to the 1400px cap");
          else {
            assert.ok(bottom.pitchWidth > 0 && bottom.pitchWidth <= Math.min(bottom.availableHostWidth, 1400) + 1, "desktop field fits width while height can be the limiting axis");
            assert.ok(bottom.pitchLeft >= bottom.hostLeft - 1 && bottom.pitchRight <= bottom.hostRight + 1, "desktop grid cannot push the pitch past either host edge");
          }
          assert.ok(Math.abs(bottom.pitchWidth / bottom.pitchHeight - 105 / 68) < .003, "field retains regulation ratio at every breakpoint");
          if (height <= 390) assert.ok(bottom.scrollTop > 0, "landscape field bottom is reached through actual overlay scrolling");
          assert.ok(bottom.pitchBottom <= bottom.outerBottom + 1, "pitch bottom remains reachable by overlay scroll");
          assert.ok(bottom.width <= bottom.clientWidth + 1, "no horizontal overlay overflow");
          assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), documentScroll);
          const close = overlay.locator('[data-arena-close]');
          await expect(close).toBeFocused();
          // Opening already focused Close. Refocusing that same active node
          // after programmatic scroll is a browser no-op, not user navigation.
          await page.keyboard.press(forward);
          assert.equal(await close.evaluate(node => node === document.activeElement), false, "native Tab leaves Close");
          assert.equal(await overlay.evaluate(node => node.contains(document.activeElement)), true);
          await page.keyboard.press(backward);
          await expect(close).toBeFocused();
          await expect(close).toBeInViewport();
          const keyboardReturn = await close.evaluate(node => {
            const box = node.getBoundingClientRect(), dialog = node.closest('[role="dialog"]')!;
            return { active: node === document.activeElement, top: box.top, bottom: box.bottom, scrollTop: dialog.scrollTop };
          });
          const summary = overlay.locator('[data-arena-formation] summary'); await summary.click();
          await expect(overlay.locator('[data-arena-formation] details')).toHaveAttribute("open", "");
          const options = overlay.locator('[data-arena-formation] details button'); await options.last().focus();
          await expect(options.last()).toBeInViewport();
          await summary.click();
          await close.focus(); await page.keyboard.press(forward);
          assert.equal(await overlay.evaluate(node => node.contains(document.activeElement)), true);
          await page.keyboard.press(backward);
          assert.equal(await overlay.evaluate(node => node.contains(document.activeElement)), true);
          const controlSelector = 'button:not(:disabled), summary, select:not(:disabled), a[href], [tabindex="0"]';
          await overlay.evaluate((node, selector) => {
            const controls = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(control => control.getClientRects().length > 0);
            if (controls.length < 2) throw new Error("Arena must expose multiple real focusable controls");
            controls.at(-1)!.focus();
          }, controlSelector);
          await page.keyboard.press(forward);
          assert.equal(await overlay.evaluate((node, selector) => {
            const controls = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(control => control.getClientRects().length > 0);
            return document.activeElement === controls[0];
          }, controlSelector), true, "Tab wraps from the actual last Arena control to its first");
          await page.keyboard.press(backward);
          assert.equal(await overlay.evaluate((node, selector) => {
            const controls = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(control => control.getClientRects().length > 0);
            return document.activeElement === controls.at(-1);
          }, controlSelector), true, "Shift+Tab wraps from the actual first Arena control to its last");
          await page.keyboard.press("Escape"); await expect(overlay).toHaveCount(0);
          await expect(page.locator('[data-arena-open]')).toBeFocused();
          assert.equal(await page.evaluate(() => document.body.style.overflow), "");
          assert.deepEqual(errors, []); assert.deepEqual(denied, []);
          t.diagnostic(JSON.stringify({ browser: engine.name(), width, height, forward, measure, bottom, keyboardReturn, minimumArtworkWidth, cardSizes, scope: "isolated components, no auth/native-fullscreen/safe-area-device proof" }));
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});

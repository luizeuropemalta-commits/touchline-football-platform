import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://delayed-lineup.test";
const anchor = "touchline-club-lineup";
const destination = `${origin}/touchline-clubs/arsenal?lang=pt-BR&fixtureId=990099#${anchor}`;

test("native delayed ClubHub anchor arrival, reload and history (not Next/RSC routing)", {
  skip: process.env.TOUCHLINE_RUN_LINEUP_ANCHOR_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const selectedEngine = process.env.TOUCHLINE_LINEUP_ANCHOR_ENGINE;
  const selectedWidth = process.env.TOUCHLINE_LINEUP_ANCHOR_WIDTH;
  const selectedCase = process.env.TOUCHLINE_LINEUP_ANCHOR_CASE;
  assert.ok(selectedEngine === undefined || ["chromium", "webkit"].includes(selectedEngine));
  assert.ok(selectedWidth === undefined || ["390", "844", "1280"].includes(selectedWidth));
  assert.ok(selectedCase === undefined || ["navigation", "keyboard-navigation", "touch-navigation", "user-changed-hash", "user-scrolled-away", "user-keyboard-away", "user-touched-page", "user-scrollbar-away"].includes(selectedCase));
  const capacity = () => {
    if (process.platform === "darwin" && !process.env.CI && process.env.TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB !== undefined) {
      requireBrowserCapacity(root, { darwinFreePercent: true });
      return;
    }
    const disk = statfsSync(root);
    assert.ok(disk.bavail * disk.bsize > 5 * 1024 ** 3, "more than 5GiB disk required");
    const pressure = execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim();
    assert.ok(pressure === "1" || (process.env.TOUCHLINE_LOCAL_MODERATE_MEMORY === "1" && pressure === "2"), "critical memory pressure is not authorized");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25, "at least 25% free memory required");
  };
  capacity();
  const screenshots = mkdtempSync("/private/tmp/touchline-lineup-anchor-");
  t.diagnostic(JSON.stringify({ screenshots, selectedEngine, selectedWidth, selectedCase: selectedCase ?? "all",
    partial: Boolean(selectedEngine || selectedWidth || selectedCase),
    boundary: "real lineup/nav/page CSS plus global base typography/scrollbar rules (no decorative global layers or portrait gate); touch is a real tap interruption, not swipe proof; native document navigation and client Suspense only; explicit unrelated-content gap separates menu and loader; empty unconfirmed lineup; no Next/RSC stream or real fixture selection" }));
  // Wait for process close, not just output: compiler caches must not overlap
  // the browser. The parser's three AST tests run in their own unit-test file.
  t.signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      path.join(root, "tests/helpers/touchline-lineup-anchor-compile-worker.mts"), screenshots], {
      cwd: root, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Lineup anchor fixture compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      failure = new Error("Lineup anchor fixture compilation exceeded 30 seconds"); child.kill("SIGKILL");
    }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Lineup anchor fixture compiler could not start"); });
    child.once("close", code => {
      clearTimeout(timeout); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Lineup anchor fixture compiler exited with code ${code}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  t.signal.throwIfAborted();
  const html = readFileSync(path.join(screenshots, "fixture.html"), "utf8");
  const receipt = JSON.parse(readFileSync(path.join(screenshots, "fixture-sources.json"), "utf8")) as { sources: string[]; sha256: Record<string, string> };
  assert.ok(html.length > 0 && Array.isArray(receipt.sources) && receipt.sources.length > 0, "fresh compiled fixture and source receipt required");
  for (const source of receipt.sources) {
    assert.ok(typeof source === "string" && /^[a-f0-9]{64}$/.test(receipt.sha256[source]), "hashed real source required");
  }
  for (const required of ["components/touchline/ClubHubOfficialLineup.tsx", "components/touchline/ClubHubOfficialLineup.module.css",
    "components/touchline/club-hub/ClubHubSectionNavigation.tsx", "components/touchline/club-hub/ClubHubSectionNavigation.module.css",
    "app/touchline-clubs/[club]/page.tsx", "app/globals.css"]) {
    assert.ok(receipt.sources.includes(required), required);
  }
  t.diagnostic(`Compiler exited before browser launch; ${receipt.sources.length} hashed sources: ${path.join(screenshots, "fixture-sources.json")}`);
  const publicRoot = realpathSync(path.join(root, "public"));
  const observations: unknown[] = [], failures: string[] = [];
  for (const engine of [chromium, webkit].filter(value => !selectedEngine || value.name() === selectedEngine)) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    t.signal.throwIfAborted();
    const browser = await engine.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      t.signal.throwIfAborted();
      for (const width of [390, 844, 1280].filter(value => !selectedWidth || String(value) === selectedWidth)) {
        capacity();
        const context = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 844 }, reducedMotion: "reduce", hasTouch: true, serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(5000);
          const errors: string[] = [], forbidden: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await context.route("**/*", route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== "GET" || url.origin !== origin) { forbidden.push(request.url()); return route.abort(); }
            if (url.pathname === "/touchline-clubs/arsenal") return route.fulfill({ contentType: "text/html", body: html });
            if (url.pathname === "/elsewhere") return route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Native history destination</p>" });
            let assetPath: string;
            try { assetPath = decodeURIComponent(url.pathname); } catch { forbidden.push(url.pathname); return route.abort(); }
            const file = path.resolve(publicRoot, `.${assetPath}`);
            if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile()
              && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) return route.fulfill({ path: file });
            forbidden.push(url.pathname); return route.abort();
          });
          const release = async () => {
            await expect(page.locator(".club-hub-deferred-lineup")).toBeVisible();
            await expect(page.locator(`#${anchor}`)).toHaveCount(0);
            await page.evaluate(() => (window as unknown as { resolveIsolatedLineup(): void }).resolveIsolatedLineup());
            await expect(page.locator(`#${anchor}`)).toHaveCount(1);
          };
          const observe = async (phase: string) => {
            let reached = true;
            try { await expect.poll(() => page.locator(`#${anchor}`).evaluate(node => {
              const rect = node.getBoundingClientRect(); return rect.top >= -1 && rect.top < innerHeight - 40;
            }), { timeout: 1200 }).toBe(true); } catch { reached = false; }
            const geometry = await page.locator(`#${anchor}`).evaluate(node => ({ rect: node.getBoundingClientRect().toJSON(), scrollY, hash: location.hash, url: location.href }));
            const observation = { engine: engine.name(), width, phase, reached, ...geometry };
            observations.push(observation); t.diagnostic(JSON.stringify(observation));
            await page.screenshot({ path: path.join(screenshots, `${engine.name()}-${width}-${phase}.png`) });
            if (!reached) failures.push(`${engine.name()} ${width} ${phase}: delayed anchor not in reading viewport`);
            assert.equal(new URL(page.url()).searchParams.get("fixtureId"), "990099", "native URL retains request only; fixture selection is outside this test");
            assert.equal(new URL(page.url()).searchParams.get("lang"), "pt-BR");
          };
          if (!selectedCase || selectedCase === "navigation") {
            await page.goto(destination); await release(); await observe("initial-hash");
            capacity(); await page.reload(); await release(); await observe("reload-hash");
            // Removing only a fragment can keep the resolved React document.
            // Cold cases cross a different path before loading a fresh promise.
            await page.goto(`${origin}/elsewhere`);
            await page.goto(destination.split("#")[0]);
            await expect(page.locator(".club-hub-deferred-lineup")).toBeVisible();
            await page.locator(`nav a[href="#${anchor}"]`).click();
            // locator.click may scroll the menu into view. Prove that this
            // action alone did not bring the neighboring loader into view,
            // without requiring a brittle exact post-anchor scroll position.
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            const beforeResolve = await page.locator(".club-hub-deferred-lineup").evaluate(node => ({
              top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom,
              viewportHeight: innerHeight, scrollY, hash: location.hash,
            }));
            t.diagnostic(JSON.stringify({ engine: engine.name(), width, phase: "click-before-load-precondition", ...beforeResolve }));
            assert.equal(beforeResolve.hash, `#${anchor}`);
            assert.ok(beforeResolve.top >= beforeResolve.viewportHeight,
              "the unresolved lineup must remain entirely below the viewport after the menu click");
            await expect(page.locator(`#${anchor}`)).toHaveCount(0);
            await release(); await observe("click-before-load");
            await page.evaluate(() => scrollTo(0, 0));
            await page.locator(`nav a[href="#${anchor}"]`).click();
            await observe("click-after-load");
            await page.goto(`${origin}/elsewhere`); await page.goBack();
            if (await page.locator(".club-hub-deferred-lineup").count()) await release();
            await expect(page.locator(`#${anchor}`)).toHaveCount(1); await observe("native-back");
            capacity(); await page.goForward();
            await expect(page).toHaveURL(`${origin}/elsewhere`);
            await expect(page.getByText("Native history destination", { exact: true })).toBeVisible();
            await page.screenshot({ path: path.join(screenshots, `${engine.name()}-${width}-native-forward.png`) });
            observations.push({ engine: engine.name(), width, phase: "native-forward", url: page.url(), reached: true });
            await page.goBack();
            if (await page.locator(".club-hub-deferred-lineup").count()) await release();
            await expect(page.locator(`#${anchor}`)).toHaveCount(1); await observe("native-back-after-forward");
            // Also traverse forward into the anchored document, rather than
            // claiming an outgoing forward navigation proves anchor arrival.
            await page.goto(`${origin}/elsewhere`);
            await page.goto(destination); await release();
            await page.goBack(); await expect(page).toHaveURL(`${origin}/elsewhere`);
            await page.goForward();
            if (await page.locator(".club-hub-deferred-lineup").count()) await release();
            await expect(page.locator(`#${anchor}`)).toHaveCount(1); await observe("native-forward-arrival");
          }
          for (const activation of (["keyboard-navigation", "touch-navigation"] as const).filter(value => !selectedCase || selectedCase === value)) {
            capacity();
            await page.goto(`${origin}/elsewhere`);
            await page.goto(destination.split("#")[0]);
            await expect(page.locator(".club-hub-deferred-lineup")).toBeVisible();
            const link = page.locator(`nav a[href="#${anchor}"]`);
            await page.evaluate(() => {
              const state = window as unknown as { anchorActivationEvents: unknown[] };
              state.anchorActivationEvents = [];
              for (const type of ["keydown", "keyup", "focusin", "click", "scroll"]) addEventListener(type, event => {
                if (state.anchorActivationEvents.length < 80) state.anchorActivationEvents.push({ type, y: scrollY,
                  key: event instanceof KeyboardEvent ? event.key : null, detail: event instanceof MouseEvent ? event.detail : null,
                  active: document.activeElement?.getAttribute("href"), trusted: event.isTrusted,
                  scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior });
              }, { capture: true, passive: true });
            });
            const activate = async () => {
              await link.evaluate(node => {
                (window as unknown as { anchorActivationTrusted: boolean }).anchorActivationTrusted = false;
                node.addEventListener('click', event => {
                  (window as unknown as { anchorActivationTrusted: boolean }).anchorActivationTrusted = event.isTrusted;
                }, { once: true });
              });
              if (activation === "keyboard-navigation") {
                // Option+Tab enables native link traversal in WebKit's default
                // macOS keyboard policy; no script focus or synthetic click.
                const key = engine.name() === "webkit" ? "Alt+Tab" : "Tab";
                let reached = await link.evaluate(node => node === document.activeElement);
                for (let step = 0; !reached && step < 24; step++) {
                  await page.keyboard.press(key);
                  reached = await link.evaluate(node => node === document.activeElement);
                }
                assert.equal(reached, true, "keyboard must reach the actual lineup link");
                await expect(link).toBeFocused();
                await expect(link).toHaveCSS("outline-style", "solid");
                assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "auto",
                  "real hashed navigation CSS must make native keyboard focus scrolling immediate");
                await page.keyboard.press("Enter");
              } else await link.tap();
              assert.equal(await page.evaluate(() => (window as unknown as { anchorActivationTrusted: boolean }).anchorActivationTrusted), true,
                "activation must originate from trusted keyboard/touch input");
              await expect.poll(() => new URL(page.url()).hash).toBe(`#${anchor}`);
            };
            await activate();
            const beforeResolve = await page.locator(".club-hub-deferred-lineup").evaluate(node => ({ top: node.getBoundingClientRect().top, viewport: innerHeight }));
            assert.ok(beforeResolve.top >= beforeResolve.viewport, "activation alone must not reveal the unresolved lineup");
            await release(); await observe(`${activation}-before-load`);
            t.diagnostic(JSON.stringify({ engine: engine.name(), width, phase: `${activation}-event-order`,
              events: await page.evaluate(() => (window as unknown as { anchorActivationEvents: unknown[] }).anchorActivationEvents) }));
            // Reset only the test precondition, not the activation under test.
            // The extracted real html CSS uses smooth scrolling: the positional
            // overload can still be animating when its evaluate() has returned.
            await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: "instant" }));
            await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
            assert.ok(await page.locator(`#${anchor}`).evaluate(node => node.getBoundingClientRect().top >= innerHeight),
              "mounted lineup must remain below the viewport before trusted activation");
            await activate(); await observe(`${activation}-after-load`);
          }
          for (const phase of (["user-changed-hash", "user-scrolled-away", "user-keyboard-away", "user-touched-page", "user-scrollbar-away"] as const).filter(phase => !selectedCase || phase === selectedCase)) {
            capacity(); await page.goto(`${origin}/elsewhere`); await page.goto(destination);
            await expect(page.locator(".club-hub-deferred-lineup")).toBeVisible();
            await expect(page.locator(`#${anchor}`)).toHaveCount(0);
            if (phase === "user-changed-hash") await page.evaluate(() => { location.hash = "#club-hub-top"; });
            else if (phase === "user-scrolled-away") await page.mouse.wheel(0, 400);
            else if (phase === "user-keyboard-away") {
              await page.evaluate(() => {
                (window as unknown as { anchorTrustedInput: boolean }).anchorTrustedInput = false;
                addEventListener("keydown", event => { (window as unknown as { anchorTrustedInput: boolean }).anchorTrustedInput = event.isTrusted && event.key === "PageDown"; }, { once: true });
              });
              await page.keyboard.press("PageDown");
              assert.equal(await page.evaluate(() => (window as unknown as { anchorTrustedInput: boolean }).anchorTrustedInput), true,
                "keyboard interruption must come from a trusted PageDown input");
            } else if (phase === "user-touched-page") {
              await page.evaluate(() => {
                (window as unknown as { anchorTrustedInput: boolean }).anchorTrustedInput = false;
                addEventListener("touchstart", event => { (window as unknown as { anchorTrustedInput: boolean }).anchorTrustedInput = event.isTrusted; }, { once: true });
              });
              await page.touchscreen.tap(100, 100);
              assert.equal(await page.evaluate(() => (window as unknown as { anchorTrustedInput: boolean }).anchorTrustedInput), true,
                "touch cancellation must use a real Playwright touch, not dispatchEvent");
            } else {
              // DOM visibility alone does not ensure the native scrollbar has
              // been painted after a fresh navigation. Do not move scrollY here.
              await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
              const scrollbar = await page.evaluate(() => ({
                width: innerWidth - document.documentElement.clientWidth, viewport: innerHeight,
                documentHeight: document.documentElement.scrollHeight, start: scrollY, viewportWidth: innerWidth,
              }));
              assert.ok(scrollbar.width > 0 && scrollbar.documentHeight > scrollbar.viewport && scrollbar.start === 0,
                `Scrollbar precondition unavailable; do not replace native drag with script scrolling: ${JSON.stringify(scrollbar)}`);
              const x = scrollbar.viewportWidth - scrollbar.width / 2;
              const thumbMiddle = Math.max(8, scrollbar.viewport * scrollbar.viewport / scrollbar.documentHeight / 2);
              await page.mouse.move(x, thumbMiddle);
              const hoveredScrollbar = await page.evaluate(() => ({
                clientWidth: document.documentElement.clientWidth,
                color: getComputedStyle(document.documentElement).scrollbarColor,
                width: getComputedStyle(document.documentElement).scrollbarWidth,
              }));
              // Hover must not switch the site's custom thumb to a zero-width
              // native overlay and make the user's drag target disappear.
              assert.equal(scrollbar.viewportWidth - hoveredScrollbar.clientWidth, scrollbar.width,
                `Scrollbar geometry must survive hover: ${JSON.stringify(hoveredScrollbar)}`);
              t.diagnostic(JSON.stringify({ phase: "scrollbar-hover", metrics: hoveredScrollbar }));
              await page.mouse.down();
              try { await page.mouse.move(x, thumbMiddle + 60, { steps: 8 }); }
              finally { await page.mouse.up(); }
              t.diagnostic(JSON.stringify({ engine: engine.name(), width, phase, scrollbar,
                drag: { x, startY: thumbMiddle, endY: thumbMiddle + 60 },
                afterDrag: await page.evaluate(() => ({ scrollY, clientWidth: document.documentElement.clientWidth })) }));
            }
            if (phase === "user-changed-hash") await expect.poll(() => page.locator("#club-hub-top").evaluate(node => {
              const margin = Number.parseFloat(getComputedStyle(node).scrollMarginTop) || 0;
              const documentTop = node.getBoundingClientRect().top + scrollY;
              const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
              const expectedScroll = Math.min(maxScroll, Math.max(0, documentTop - margin));
              return location.hash === "#club-hub-top" && Math.abs(scrollY - expectedScroll) <= 1;
            }), { timeout: 1000 }).toBe(true);
            else if (phase === "user-scrolled-away") await expect.poll(() => page.evaluate(() => scrollY >= 200 && scrollY < 800), { timeout: 1000 }).toBe(true);
            else if (phase === "user-touched-page") assert.equal(await page.evaluate(() => scrollY), 0, "A tap cancels pending arrival without pretending to be a swipe");
            else await expect.poll(() => page.evaluate(() => scrollY > 100), { timeout: 1000 }).toBe(true);
            // Finish the user's own native scroll animation before observing
            // resolution. This is a stability precondition, not a scripted move.
            await expect.poll(async () => {
              const before = await page.evaluate(() => scrollY);
              await page.waitForTimeout(100);
              return (await page.evaluate(() => scrollY)) === before;
            }, { timeout: 2000 }).toBe(true);
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            const before = await page.evaluate(() => ({ scrollY, hash: location.hash }));
            assert.equal(before.hash, phase === "user-changed-hash" ? "#club-hub-top" : `#${anchor}`);
            // Observe every scrolling event during resolution, not only the
            // final position: a transient jump and return is also a failure.
            await page.evaluate(() => {
              const state = window as unknown as { anchorScrollSamples: number[]; recordAnchorScroll: () => void };
              state.anchorScrollSamples = [scrollY];
              state.recordAnchorScroll = () => { state.anchorScrollSamples.push(scrollY); };
              addEventListener("scroll", state.recordAnchorScroll, { passive: true });
            });
            await release(); await page.waitForTimeout(300);
            const after = await page.evaluate(() => {
              const state = window as unknown as { anchorScrollSamples: number[]; recordAnchorScroll: () => void };
              removeEventListener("scroll", state.recordAnchorScroll);
              return { scrollY, hash: location.hash, samples: [...state.anchorScrollSamples, scrollY] };
            });
            const stable = after.hash === before.hash && after.samples.every(value => value === before.scrollY);
            const observation = { engine: engine.name(), width, phase, stable, before, after };
            observations.push(observation); t.diagnostic(JSON.stringify(observation));
            await page.screenshot({ path: path.join(screenshots, `${engine.name()}-${width}-${phase}.png`) });
            if (!stable) failures.push(`${engine.name()} ${width} ${phase}: loader stole the user's chosen scroll/hash`);
          }
          assert.deepEqual(forbidden, [], "no API or remote reads permitted");
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  t.diagnostic(JSON.stringify(observations));
  assert.deepEqual(failures, [], "native anchor observations; failure does not alone diagnose the Next router");
});

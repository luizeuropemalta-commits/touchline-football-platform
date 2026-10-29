import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, realpathSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import { touchlineFantasyTechnicalCardWidth } from "../lib/touchlineFantasy/market-browser.ts";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const enabled = process.env.TOUCHLINE_RUN_TECHNICAL_RAIL_BROWSER_TESTS === "1";
// Independent presentation contracts, not dimensions read back from the DOM
// under test. Player canvas: TouchlineEliteExactCard CARD_W/CARD_H. Coach:
// TouchlineCoachCard shell 2:3 and normalized --coach-art-scale:1. Coach export
// files have transparent gutters/object-fit:contain; their natural pixel ratio
// (240x320 or 810x1080) is deliberately NOT the presentation-box ratio.
const artworkContract = { playerHeightPerWidth: 691 / 430, coachHeightPerWidth: 3 / 2, coachArtScale: 1 } as const;

// Opt-in isolated component proof, not a native Safari/account/complete XI pass.
test("ClubOwner technical rail preserves nine real cards, coach crown and horizontal keyboard access", { skip: !enabled, timeout: 120_000 }, async t => {
  // Optional single-engine/viewport batches preserve the complete matrix by
  // default. A filtered PASS is evidence only for the printed selected cases.
  const matrix = [[1280,900,"ltr"],[844,900,"ltr"],[844,390,"ltr"],[568,900,"ltr"],[390,900,"ltr"],[320,900,"ltr"],[390,900,"rtl"]] as const;
  const engineFilter = process.env.TOUCHLINE_TECHNICAL_RAIL_BROWSER_ENGINE;
  const viewportFilter = process.env.TOUCHLINE_TECHNICAL_RAIL_BROWSER_VIEWPORT;
  assert.ok(engineFilter === undefined || ["chromium", "webkit"].includes(engineFilter), "unknown TOUCHLINE_TECHNICAL_RAIL_BROWSER_ENGINE");
  assert.ok(viewportFilter === undefined || matrix.some(([width, height]) => `${width}x${height}` === viewportFilter), "unknown TOUCHLINE_TECHNICAL_RAIL_BROWSER_VIEWPORT");
  const engines = [chromium, webkit].filter(engine => engineFilter === undefined || engine.name() === engineFilter);
  const cases = matrix.filter(([width, height]) => viewportFilter === undefined || `${width}x${height}` === viewportFilter);
  assert.ok(engines.length > 0 && cases.length > 0, "selection cannot become an empty passing test");
  const scope = { filtered: engineFilter !== undefined || viewportFilter !== undefined,
    engines: engines.map(engine => engine.name()), cases: cases.map(([width, height, direction]) => ({ width, height, direction })),
    selectedCases: engines.length * cases.length, fullMatrixCases: 2 * matrix.length };
  t.diagnostic(`Selected technical integration scope: ${JSON.stringify(scope)}`);
  let passedCases = 0;
  const capacity = () => requireBrowserCapacity(rootPath, { darwinFreePercent: true,
    allowLowDarwinDisk: process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI });
  capacity();
  const screenshots = mkdtempSync("/private/tmp/touchline-technical-integration-");
  // Compile outside the browser process and wait for process close so the
  // TypeScript/PostCSS graph is released before any browser is launched.
  t.signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      path.join(rootPath, "tests/helpers/touchline-technical-rail-compile-worker.mts"), screenshots], {
      cwd: rootPath, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Technical rail compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      failure = new Error("Technical rail compilation exceeded 30 seconds"); child.kill("SIGKILL");
    }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Technical rail compiler could not start"); });
    child.once("close", code => {
      clearTimeout(timeout); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Technical rail compiler exited with code ${code}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  t.signal.throwIfAborted();
  const bundle = { script: readFileSync(path.join(screenshots, "fixture-script.js"), "utf8"),
    css: readFileSync(path.join(screenshots, "fixture-style.css"), "utf8") };
  const receipt = JSON.parse(readFileSync(path.join(screenshots, "fixture-sources.json"), "utf8")) as { sources: string[]; sha256: Record<string, string> };
  assert.ok(bundle.script.length > 0 && bundle.css.length > 0 && Array.isArray(receipt.sources) && receipt.sources.length > 0);
  for (const source of receipt.sources) {
    assert.ok(typeof source === "string" && !path.isAbsolute(source) && !source.split(/[\\/]/).includes(".."));
    assert.match(receipt.sha256[source], /^[a-f0-9]{64}$/);
    assert.equal(createHash("sha256").update(readFileSync(path.join(rootPath, source))).digest("hex"), receipt.sha256[source], `source changed after compilation: ${source}`);
  }
  for (const source of ["components/touchline/fantasy/ClubOwnerTechnicalRail.tsx", "components/touchline/fantasy/ClubOwnerCollectionSlots.tsx",
    "components/touchline/fantasy/TouchlineGameweekCard.tsx", "components/touchline/cards/TouchlineCoachCard.tsx",
    "components/touchline/cards/TouchlineCoachCardZoom.tsx", "components/touchline/cards/TouchlineCardZoom.tsx",
    "components/touchline/fantasy/ClubOwnerCollectionSlots.module.css", "app/fantasy/fantasy.module.css",
    "components/touchline/ClubHubFixtureStrip.tsx", "components/touchline/pitch/TouchlinePitchSurface.tsx",
    "app/fantasy/FantasyGameweekClient.tsx"]) assert.ok(receipt.sources.includes(source), source);
  t.diagnostic(`Compiler exited before browser launch; ${receipt.sources.length} hashed sources: ${path.join(screenshots, "fixture-sources.json")}`);
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ serviceWorkers: "block" });
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      const origin = "https://technical-rail.test";
      const publicRoot = realpathSync(path.join(rootPath, "public"));
      const html = `<meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#07120e;color:white;font:14px Arial}${bundle.css}
        button:focus-visible,[role=button]:focus-visible{outline:2px solid white!important;outline-offset:5px!important}</style>
        <div aria-hidden="true" style="height:800px"></div><div id="root"></div><div aria-hidden="true" style="height:800px"></div>`;
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET" || url.origin !== origin) return route.abort();
        if (url.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: html });
        const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep) && /\.(png|webp|svg|jpe?g|json)$/i.test(asset)) {
          const extension = path.extname(asset).toLowerCase();
          const contentType = extension === ".json" ? "application/json" : extension === ".svg" ? "image/svg+xml" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : `image/${extension.slice(1)}`;
          return route.fulfill({ status: 200, contentType, body: readFileSync(asset) });
        }
        return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' });
      });
      for (const [viewport, viewportHeight, direction] of cases) {
        capacity();
        await page.setViewportSize({ width: viewport, height: viewportHeight });
        await page.emulateMedia({ reducedMotion: direction === "rtl" ? "reduce" : "no-preference" });
        await page.goto(origin);
        await page.addScriptTag({ content: `(() => {${bundle.script}})()` });
        const width = Math.min(96, touchlineFantasyTechnicalCardWidth(viewport - 32));
        await page.evaluate(props => (window as unknown as { renderRailFixture(props: object): void }).renderRailFixture(props), { width, direction, empty: true });
        const emptyRail = page.locator('[data-clubowner-technical-rail="true"]');
        await expect(emptyRail.locator('[data-collection-slot]')).toHaveCount(9);
        for (const button of await emptyRail.locator('[data-collection-placeholder]').all()) await expect(button).toBeDisabled();
        const emptyAlignment = await emptyRail.evaluate(node => {
          const coach = node.querySelector('[data-technical-coach]')!.getBoundingClientRect();
          const line = node.querySelector('[data-technical-test-line] span')!.getBoundingClientRect();
          return Math.abs(coach.x + coach.width / 2 - line.x - line.width / 2);
        });
        assert.ok(emptyAlignment < 3, `empty coach is centered over technical area: ${emptyAlignment}`);
        if (viewport === 844 || viewport === 1280) {
          await emptyRail.screenshot({ path: path.join(screenshots, `${engine.name()}-${viewport}x${viewportHeight}-empty.png`), animations: "disabled" });
        }
        await page.evaluate(props => (window as unknown as { renderRailFixture(props: object): void }).renderRailFixture(props), { width, direction });
        const rail = page.locator('[data-clubowner-technical-rail="true"]');
        await expect(rail).toBeVisible();
        const measureArtwork = async () => {
          // Measure resting geometry, not the deliberate hover/focus enlargement.
          // Move the pointer as a user can; never blur focus or override CSS.
          await page.mouse.move(0, 0);
          await expect.poll(() => rail.locator('[data-coach-card-art]').evaluate(node =>
            !node.matches(":hover, :focus-within"))).toBe(true);
          const frames = rail.locator('img[data-touchline-card-frame="true"]');
          await expect(frames).toHaveCount(10);
          await expect(rail.locator('[data-coach-frame-ready]')).toHaveAttribute("data-coach-frame-ready", "true");
          for (const frame of await frames.all()) await expect.poll(() => frame.evaluate(node => {
            const image = node as HTMLImageElement;
            return image.complete && image.naturalWidth > 0 && getComputedStyle(image).opacity === "1";
          })).toBe(true);
          const read = () => rail.evaluate((node, contract) => {
            const measure = (host: HTMLElement, coach: boolean) => {
              const image = host.querySelector<HTMLImageElement>('img[data-touchline-card-frame="true"]')!;
              const hostBox = host.getBoundingClientRect(), frameBox = image.getBoundingClientRect();
              // Host width is responsive; the frame aspect and normalized
              // coach scale are independent approved contracts. A distorted
              // image height or shrinking CSS variable must not redefine them.
              const shell = coach ? host.querySelector<HTMLElement>('[data-coach-card-art]')! : null;
              const expectedWidth = hostBox.width * (coach ? contract.coachArtScale : 1);
              const expectedHeight = expectedWidth * (coach ? contract.coachHeightPerWidth : contract.playerHeightPerWidth);
              return { id: coach ? "coach" : host.dataset.collectionSlot!, width: frameBox.width, height: frameBox.height,
                hostWidth: hostBox.width, widthRatio: frameBox.width / hostBox.width, heightRatio: frameBox.height / hostBox.width,
                expectedWidth, expectedHeight, shellWidth: shell?.getBoundingClientRect().width ?? hostBox.width };
            };
            return [...node.querySelectorAll<HTMLElement>('[data-collection-slot]')].map(host => measure(host, false))
              .concat(measure(node.querySelector<HTMLElement>('[data-technical-coach]')!, true));
          }, artworkContract);
          await expect.poll(async () => (await read()).every(frame =>
            Number.isFinite(frame.expectedHeight) && frame.width > 0 && frame.height > 0
            && Math.abs(frame.width - frame.expectedWidth) < 1
            && Math.abs(frame.height - frame.expectedHeight) < 1
            && Math.abs(frame.shellWidth - frame.hostWidth) < 1
          ), { message: "actual player and coach artwork fills its host at the authored layout ratio" }).toBe(true);
          return read();
        };
        const inspectComposition = async (phase: "before" | "arena" | "after") => {
          if (phase === "arena") await expect(page.getByRole("dialog", { name: "Technical rail Arena fixture", exact: true })).toBeVisible();
          await expect(page.locator('[data-clubowner-live-position="above-reserves"]')).toHaveCount(1);
          await expect(page.locator('[data-fixture-carousel="continuous"]')).toHaveCount(1);
          const dimensions = await page.evaluate(() => {
            const live = document.querySelector('[data-clubowner-live-position="above-reserves"]')!.getBoundingClientRect();
            const pitch = document.querySelector('[aria-label="Technical rail pitch fixture"]')!.getBoundingClientRect();
            const technical = document.querySelector('[data-clubowner-technical-rail]')?.getBoundingClientRect();
            return { liveWidth: live.width, liveHeight: live.height, liveBottom: live.bottom, pitchWidth: pitch.width, pitchHeight: pitch.height,
              pitchTop: pitch.top, railWidth: technical?.width ?? null, railTop: technical?.top ?? null, railBottom: technical?.bottom ?? null };
          });
          assert.ok(dimensions.liveWidth > 0 && dimensions.pitchWidth > 0);
          assert.ok(dimensions.liveBottom <= dimensions.pitchTop + 1, "one horizontal Live stays above the field");
          if (phase !== "arena") {
            assert.ok(dimensions.railTop !== null && dimensions.railBottom !== null);
            assert.ok(dimensions.liveBottom <= dimensions.railTop + 1, "Live is above all reserves, not beside them");
            assert.ok(dimensions.railBottom <= dimensions.pitchTop + 1, "technical rail remains above pitch");
          } else assert.equal(dimensions.railWidth, null, "Arena contains no duplicated reserve rail");
          if (viewport === 844 || viewport === 1280) {
            await page.evaluate(() => document.fonts.ready);
            if (phase !== "arena") {
              await expect(page.locator('[data-technical-coach] [data-coach-frame-ready]')).toHaveAttribute("data-coach-frame-ready", "true");
              const artwork = page.locator('img[data-touchline-card-frame="true"], img[data-touchline-coach-leader-crown="true"]');
              await expect(artwork).toHaveCount(11); // Nine players, one coach frame and one crown.
              for (const image of await artwork.all()) await expect.poll(() => image.evaluate(node => {
                const img = node as HTMLImageElement;
                return img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === "1";
              })).toBe(true);
            }
            const screenshot = path.join(screenshots, `${engine.name()}-${viewport}x${viewportHeight}-${phase}.png`);
            await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
            t.diagnostic(`Screenshot: ${screenshot}`);
          }
          return dimensions;
        };
        const compositionBefore = await inspectComposition("before");
        const artworkBefore = await measureArtwork();
        const captionGap = () => rail.evaluate(node => {
          const price = node.querySelector('[data-coach-signing-value]')!.getBoundingClientRect();
          const title = node.querySelector('[data-technical-test-line] > span')!.getBoundingClientRect();
          return title.top - price.bottom;
        });
        assert.ok(await captionGap() >= 6, "coach signing amount remains separated from the technical-area title");
        await expect(page.locator('[data-collection-slot]')).toHaveCount(9);
        await expect(page.locator('[data-touchline-coach-leader-crown="true"]')).toHaveCount(1);
        assert.equal(await page.locator('[data-test-formation]').count(), 1);
        assert.equal(await rail.locator('[data-test-formation]').count(), 0, "formation remains outside the scrollport");
        const sizes = await rail.evaluate(node => [...node.querySelectorAll<HTMLElement>('[data-collection-slot]')].map(item => {
          const b = item.getBoundingClientRect(), action = item.querySelector<HTMLButtonElement>('button[title]')!;
          return { top: b.top, width: b.width, actionWidth: action.getBoundingClientRect().width, actionHeight: action.getBoundingClientRect().height };
        }));
        for (const size of sizes) {
          assert.ok(size.width >= 43.9 && size.actionWidth >= 43.9 && size.actionHeight >= 43.9, "44px targets retained");
          assert.ok(Math.abs(size.top - sizes[0].top) < 1, "all nine reserves remain on one row");
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        // In short landscape, place the rail inside the vertical viewport
        // before checking that horizontal focus never scrolls the document.
        await rail.evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top - 8, behavior: "instant" }));
        const pageScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        assert.ok(pageScroll.y > 0, "document genuinely scrolled before focus checks");
        for (const index of [0, 8, 4, 3]) {
          const button = page.locator(`[data-collection-slot="${index}"] > button[title]`);
          await button.focus();
          await expect.poll(() => button.evaluate(node => {
            const r = node.closest('[data-clubowner-technical-rail]')!.getBoundingClientRect(), b = node.getBoundingClientRect();
            return b.left - 7 >= r.left - .5 && b.right + 7 <= r.right + .5 && b.top - 7 >= r.top - .5 && b.bottom + 7 <= r.bottom + .5;
          })).toBe(true);
          assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), pageScroll, "focus never moves document");
        }
        const coachTrigger = page.locator('[data-technical-coach] [data-touchline-card-zoom="trigger"] [role="button"]');
        await expect(coachTrigger).toHaveCount(1);
        const coachTarget = await coachTrigger.boundingBox();
        assert.ok(coachTarget && coachTarget.width >= 44 && coachTarget.height >= 44, "real coach zoom retains a touch target");
        await coachTrigger.focus();
        await expect.poll(captionGap, { message: "coach keyboard focus cannot overlap the signing amount and technical title" }).toBeGreaterThanOrEqual(4);
        await expect.poll(() => page.locator('[data-touchline-coach-leader-crown]').evaluate(node => {
          const crown = node.getBoundingClientRect(), rail = node.closest('[data-clubowner-technical-rail]')!.getBoundingClientRect();
          return crown.top >= rail.top && crown.left >= rail.left && crown.right <= rail.right && crown.bottom <= rail.bottom;
        })).toBe(true);
        const alignment = await rail.evaluate(node => {
          const coach = node.querySelector('[data-technical-coach]')!.getBoundingClientRect();
          const label = node.querySelector('[data-technical-test-line] > span')!.getBoundingClientRect();
          return Math.abs((coach.left + coach.right) / 2 - (label.left + label.right) / 2);
        });
        assert.ok(alignment < 1, "technical title stays aligned to the scrolling coach");
        assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), pageScroll);

        // Hold only RAFs scheduled synchronously by focus, then use the real
        // React unmount cleanup. No timing sleep or production timer mutation.
        const lifecycle = await page.evaluate(props => {
          const fixtureWindow = window as unknown as { renderRailFixture(props: object): void };
          const originalRequest = window.requestAnimationFrame;
          const originalCancel = window.cancelAnimationFrame;
          const pending = new Map<number, FrameRequestCallback>();
          const cancelled: number[] = [];
          let nextId = 1_000_000, staleScrolls = 0;
          const oldRail = document.querySelector<HTMLElement>('[data-clubowner-technical-rail]')!;
          const originalScrollBy = oldRail.scrollBy;
          oldRail.scrollBy = () => { staleScrolls++; };
          window.requestAnimationFrame = callback => { const id = nextId++; pending.set(id, callback); return id; };
          window.cancelAnimationFrame = id => {
            if (pending.has(id)) { cancelled.push(id); pending.delete(id); }
            else originalCancel.call(window, id);
          };
          try {
            document.querySelector<HTMLButtonElement>('[data-collection-slot="0"] > button[title]')!.focus({ preventScroll: true });
            const scheduled = [...pending.entries()];
            fixtureWindow.renderRailFixture({ ...props, arenaOpen: true });
            const result = { scheduled: scheduled.length, cancelled: scheduled.every(([id]) => cancelled.includes(id)),
              removed: !oldRail.isConnected && document.querySelector('[data-clubowner-technical-rail]') === null,
              arena: document.querySelectorAll('[data-test-arena]').length,
              pickers: document.querySelectorAll('[data-test-formation]').length, staleScrolls: 0 };
            // A callback already dequeued before cancellation must also be safe.
            for (const [, callback] of scheduled) callback(performance.now());
            result.staleScrolls = staleScrolls;
            return result;
          } finally {
            window.requestAnimationFrame = originalRequest;
            window.cancelAnimationFrame = originalCancel;
            oldRail.scrollBy = originalScrollBy;
          }
        }, { width, direction });
        assert.equal(lifecycle.scheduled, 1, "focus scheduled one real rail RAF");
        assert.equal(lifecycle.cancelled, true, "Arena unmount cancelled the pending RAF");
        assert.equal(lifecycle.removed, true);
        assert.equal(lifecycle.arena, 1);
        assert.equal(lifecycle.pickers, 1);
        assert.equal(lifecycle.staleScrolls, 0, "stale callback cannot scroll detached rail");
        await inspectComposition("arena");
        await page.evaluate(props => (window as unknown as { renderRailFixture(props: object): void }).renderRailFixture({ ...props, arenaOpen: false }), { width, direction });
        await expect(rail).toBeVisible();
        const compositionAfter = await inspectComposition("after");
        const artworkAfter = await measureArtwork();
        assert.deepEqual(artworkAfter.map(frame => frame.id), artworkBefore.map(frame => frame.id));
        for (const [index, frame] of artworkAfter.entries()) {
          const before = artworkBefore[index];
          assert.ok(Math.abs(frame.width - before.width) < 1 && Math.abs(frame.height - before.height) < 1,
            `${frame.id}: real frame dimensions survive Arena, not just the outer slot`);
          // Express ratio tolerance as one rendered CSS pixel, rather than an
          // arbitrary percentage that could permit a miniature inside a slot.
          assert.ok(Math.abs(frame.widthRatio - before.widthRatio) * before.hostWidth < 1
            && Math.abs(frame.heightRatio - before.heightRatio) * before.hostWidth < 1,
          `${frame.id}: frame-to-host proportions survive Arena`);
        }
        for (const key of ["liveWidth", "liveHeight", "pitchWidth", "pitchHeight", "railWidth"] as const) {
          assert.ok(Math.abs(compositionAfter[key]! - compositionBefore[key]!) < 1, `${key} unchanged after Arena return`);
        }
        await expect(page.locator('[data-test-arena]')).toHaveCount(0);
        await expect(page.locator('[data-collection-slot]')).toHaveCount(9);
        await expect(page.locator('[data-touchline-coach-leader-crown]')).toHaveCount(1);
        await expect(page.locator('[data-test-formation]')).toHaveCount(1);
        assert.equal(await rail.locator('[data-test-formation]').count(), 0);
        const restored = await rail.evaluate(node => [...node.querySelectorAll<HTMLElement>('[data-collection-slot]')].map(item => {
          const bounds = item.getBoundingClientRect(), button = item.querySelector('button[title]')!.getBoundingClientRect();
          return { width: bounds.width, top: bounds.top, buttonWidth: button.width, buttonHeight: button.height };
        }));
        for (const item of restored) {
          assert.ok(item.width >= 43.9 && item.buttonWidth >= 43.9 && item.buttonHeight >= 43.9);
          assert.ok(Math.abs(item.width - sizes[0].width) < 1, "return from Arena restores reserve size");
          assert.ok(Math.abs(item.top - restored[0].top) < 1);
        }
        await rail.evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top - 8, behavior: "instant" }));
        const returnedScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        assert.ok(returnedScroll.y > 0);
        const lastReserve = page.locator('[data-collection-slot="8"] > button[title]');
        await lastReserve.focus();
        await expect.poll(() => lastReserve.evaluate(node => {
          const r = node.closest('[data-clubowner-technical-rail]')!.getBoundingClientRect(), b = node.getBoundingClientRect();
          return b.left - 7 >= r.left - .5 && b.right + 7 <= r.right + .5;
        })).toBe(true);
        assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), returnedScroll, "remounted focus only scrolls rail");
        await coachTrigger.focus();
        await expect.poll(() => page.locator('[data-touchline-coach-leader-crown]').evaluate(node => {
          const crown = node.getBoundingClientRect(), r = node.closest('[data-clubowner-technical-rail]')!.getBoundingClientRect();
          return crown.top >= r.top && crown.left >= r.left && crown.right <= r.right && crown.bottom <= r.bottom;
        })).toBe(true);
        const restoredAlignment = await rail.evaluate(node => {
          const coach = node.querySelector('[data-technical-coach]')!.getBoundingClientRect();
          const label = node.querySelector('[data-technical-test-line] > span')!.getBoundingClientRect();
          return Math.abs((coach.left + coach.right) / 2 - (label.left + label.right) / 2);
        });
        assert.ok(restoredAlignment < 1);
        assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), returnedScroll);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        passedCases++;
        t.diagnostic(`Passed selected case: ${JSON.stringify({ engine: engine.name(), viewport, viewportHeight, direction })}`);
      }
    } finally { await browser.close(); }
  }
  assert.equal(passedCases, scope.selectedCases);
  t.diagnostic(`Completed technical integration scope: ${JSON.stringify({ ...scope, passedCases })}`);
});

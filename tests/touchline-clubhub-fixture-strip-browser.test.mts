import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const requestedEngine = process.env.TOUCHLINE_STRIP_BROWSER_ENGINE;
const requestedWidth = process.env.TOUCHLINE_STRIP_BROWSER_WIDTH;
assert.ok(requestedEngine === undefined || ["chromium", "webkit"].includes(requestedEngine), "invalid strip browser filter");
assert.ok(requestedWidth === undefined || ["390", "844", "1280"].includes(requestedWidth), "invalid strip width filter");
const engines = [chromium, webkit].filter(engine => requestedEngine === undefined || engine.name() === requestedEngine);
const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
  allowLowDarwinDisk: process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI,
  allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI });
function harness(locale: string, seed: "absent" | "unavailable" | "empty" | "controlled" = "absent") {
  const react = dirname(require.resolve("react")), dom = dirname(require.resolve("react-dom/client"));
  const scheduler = dirname(createRequire(require.resolve("react-dom/client")).resolve("scheduler"));
  const modules: Record<string, string> = {
    react: readFileSync(join(react, "cjs/react.development.js"), "utf8"),
    "react/jsx-runtime": readFileSync(join(react, "cjs/react-jsx-runtime.development.js"), "utf8"),
    "react-dom": readFileSync(join(dom, "cjs/react-dom.development.js"), "utf8"),
    "react-dom/client": readFileSync(join(dom, "cjs/react-dom-client.development.js"), "utf8"),
    scheduler: readFileSync(join(scheduler, "cjs/scheduler.development.js"), "utf8"),
  };
  function bundle(path: string): string {
    if (modules[path]) return path;
    if (path.endsWith(".css")) { modules[path] = 'exports.default=new Proxy({},{get:(_,key)=>String(key)});'; return path; }
    modules[path] = "";
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    modules[path] = code.replace(/require\("([^"]+)"\)/g, (all, id: string) => {
      if (!id.startsWith(".") && !id.startsWith("@/")) return all;
      let target = id.startsWith("@/") ? join(root, id.slice(2)) : resolve(dirname(path), id);
      if (!/\.(ts|tsx|css)$/.test(target)) target += ".ts";
      return `require(${JSON.stringify(bundle(target))})`;
    });
    return path;
  }
  const entry = bundle(join(root, "components/touchline/ClubHubFixtureStrip.tsx"));
  const css = readFileSync(join(root, "components/touchline/ClubHubFixtureStrip.module.css"), "utf8") + readFileSync(join(root, "components/touchline/TouchlineGlobalNavigation.module.css"), "utf8");
  const defs = Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",");
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#08100c;color:white;padding:10px}img{width:100%;height:100%}${css}</style><div id="root"></div><script>
  const process={env:{NODE_ENV:'development'}},modules={${defs}},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
  const React=require('react');const fixtureRoot=require('react-dom/client').createRoot(document.getElementById('root'));
  ${seed === "controlled" ? `
  const syntheticFixtures=Array.from({length:10},(_,i)=>({id:String(i+1),providerId:String(i+1),status:'FullTime',homeScore:2,awayScore:1,homeTeam:{id:'1',providerId:'1',name:'Synthetic Home'},awayTeam:{id:'2',providerId:'2',name:'Synthetic Away'}}));
  const renderSeed=count=>fixtureRoot.render(React.createElement(require(${JSON.stringify(entry)}).default,{locale:${JSON.stringify(locale)},draftLocalesEnabled:true,initialFixtures:syntheticFixtures.slice(0,count),initialMetadata:{state:'partial-persisted-schedule',degraded:true}}));
  window.addEventListener('fixture-strip-test-seed',event=>renderSeed(event.detail));renderSeed(1);
  ` : `fixtureRoot.render(React.createElement(require(${JSON.stringify(entry)}).default,{locale:${JSON.stringify(locale)},draftLocalesEnabled:true${seed === "absent" ? "" : `,initialFixtures:${seed === "empty" ? "[]" : "null"}`}}));`}
  </script>`;
}

test("native hover predating overflow survives a seed update without remounting the real strip", {
  timeout: 90_000,
}, async t => {
  const widths = [390, 844, 1280].filter(width => requestedWidth === undefined || String(width) === requestedWidth);
  t.diagnostic(`Delayed overflow: engines=${requestedEngine ?? "all"}; widths=${widths}; PT/AR; synthetic props on real component, no Next or real-account proof`);
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const width of widths) for (const locale of ["pt-BR", "ar-SA"]) {
        capacity();
        const page = await browser.newPage({ viewport: { width, height: 260 }, reducedMotion: "no-preference", serviceWorkers: "block" });
        try {
          const errors: string[] = [], forbidden: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== "GET" || url.origin !== "http://fixture-strip-delayed.test") {
              forbidden.push(`${request.method()} ${url.href}`); return route.abort();
            }
            if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: harness(locale, "controlled") });
            // Real publication subscription stays isolated; a supplied seed
            // must not invoke the component's recovery schedule read.
            if (["/api/touchline-arena/live-presentation-state", "/api/touchline-arena/sports-publication"].includes(url.pathname)) return route.fulfill({ status: 503, json: { ok: false } });
            forbidden.push(url.href); return route.abort();
          });
          await page.goto("http://fixture-strip-delayed.test/");
          const strip = page.locator(".strip"), rail = page.locator(".viewport");
          await expect(page.locator('[data-fixture-run="original"] .fixture')).toHaveCount(1);
          await expect(page.locator('[data-fixture-run="before"]')).toHaveCount(0);
          await expect(strip.getByRole("button").first()).toBeDisabled();
          await expect.poll(() => rail.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
          // Settle passive effects before the native pointer enters. The test
          // changes only props on the same root; it never synthesizes hover.
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          await strip.evaluate(node => {
            (node as HTMLElement).dataset.instanceMarker = "original-instance";
            (node as HTMLElement).dataset.enters = "0";
            (node as HTMLElement).dataset.leaves = "0";
            node.addEventListener("pointerleave", () => {
              const element = node as HTMLElement; element.dataset.leaves = String(Number(element.dataset.leaves) + 1);
            });
            node.addEventListener("pointerenter", () => {
              const element = node as HTMLElement; element.dataset.enters = String(Number(element.dataset.enters) + 1);
            });
          });
          const bounds = await rail.boundingBox(); assert.ok(bounds);
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          await expect(strip).toHaveAttribute("data-enters", "1");
          assert.equal(await strip.evaluate(node => node.matches(":hover")), true);
          await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-strip-test-seed", { detail: 10 })));
          await expect(page.locator('[data-fixture-run="original"] .fixture')).toHaveCount(10);
          await expect(page.locator('[data-fixture-run="before"] .fixture')).toHaveCount(10);
          await expect(strip.getByRole("button").first()).toBeEnabled();
          await expect(strip).toHaveAttribute("data-instance-marker", "original-instance");
          await expect(strip).toHaveAttribute("data-enters", "1");
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const before = await rail.evaluate(node => ({ offset: node.scrollLeft, y: scrollY, x: scrollX }));
          await page.waitForTimeout(350);
          assert.deepEqual(await rail.evaluate(node => ({ offset: node.scrollLeft, y: scrollY, x: scrollX })), before, "native hover must prevent all automatic movement after delayed overflow");
          assert.equal(await strip.evaluate(node => node.matches(":hover")), true);
          assert.equal(await strip.evaluate(node => node.contains(document.activeElement)), false, "hover is the only interaction pause");
          if (process.env.TOUCHLINE_STRIP_CAPTURE_PREFIX) {
            const screenshot = `${process.env.TOUCHLINE_STRIP_CAPTURE_PREFIX}-delayed-hover-${engine.name()}-${width}-${locale}.png`;
            await page.screenshot({ path: screenshot }); t.diagnostic(`Screenshot: ${screenshot}`);
          }
          await page.mouse.move(1, 240);
          try {
            await expect.poll(() => rail.evaluate((node, offset) => node.scrollLeft !== offset, before.offset), { timeout: 2000, message: "leaving the same strip resumes autoplay" }).toBe(true);
          } catch (error) {
            t.diagnostic(`${engine.name()} ${width} ${locale}: resume failure ${JSON.stringify(await rail.evaluate(node => {
              const strip = node.closest(".strip") as HTMLElement;
              return { offset: node.scrollLeft, cycle: node.querySelector('[data-fixture-run="original"]')?.getBoundingClientRect().width,
                hovered: strip.matches(":hover"), enters: strip.dataset.enters, leaves: strip.dataset.leaves,
                focused: strip.contains(document.activeElement), active: document.activeElement?.outerHTML.slice(0, 200),
                hidden: document.hidden, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
                bounds: strip.getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight } };
            }))}; paused baseline=${before.offset}`);
            throw error;
          }
          assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
          t.diagnostic(`${engine.name()} ${width} ${locale}: native pre-overflow hover paused; leaving resumed`);
        } finally { await page.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});

test("unavailable SSR seed recovers once while a confirmed empty seed never refetches", {
  skip: requestedWidth !== undefined && requestedWidth !== "844", timeout: 60_000,
}, async t => {
  t.diagnostic(`Seed matrix: engines=${requestedEngine ?? "all"}; width=844; partial=${requestedEngine !== undefined || requestedWidth !== undefined}`);
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const seed of ["unavailable", "empty"] as const) {
        capacity();
        const page = await browser.newPage({ viewport: { width: 844, height: 390 }, reducedMotion: "reduce", serviceWorkers: "block" });
        let reads = 0;
        const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", route => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/api/football-data/fantasy/livescores") {
            reads++;
            return route.fulfill({ json: { ok: true, state: "partial-persisted-schedule", degraded: true,
              data: [{ id: "123", providerId: "123", status: "FullTime", homeScore: 2, awayScore: 1,
                homeTeam: { id: "1", providerId: "1", name: "Home" }, awayTeam: { id: "2", providerId: "2", name: "Away" } }] } });
          }
          if (path !== "/") return route.fulfill({ status: 503, json: { ok: false } });
          return route.fulfill({ contentType: "text/html", body: harness("pt-BR", seed) });
        });
        await page.goto("http://fixture-strip-seed.test/");
        await expect(page.locator('[data-fixture-carousel="continuous"]')).toBeVisible();
        await expect(page.getByRole("link")).toHaveCount(seed === "empty" ? 0 : 1);
        await page.waitForTimeout(300);
        assert.equal(reads, seed === "empty" ? 0 : 1);
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});

test("compact strip loops smoothly, pauses for accessible interaction and preserves crests", {
  skip: requestedWidth === "844", timeout: 120_000,
}, async t => {
  const cases = ([[1280, "pt-BR"], [390, "pt-BR"], [390, "ar-SA"]] as const)
    .filter(([width]) => requestedWidth === undefined || String(width) === requestedWidth);
  assert.ok(cases.length > 0 && engines.length > 0, "selected matrix cannot be empty");
  t.diagnostic(`Motion and keyboard matrix: engines=${requestedEngine ?? "all"}; width=${requestedWidth ?? "all"}; partial=${requestedEngine !== undefined || requestedWidth !== undefined}`);
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const [width, locale] of cases) {
        capacity();
        const page = await browser.newPage({ viewport: { width, height: 260 }, reducedMotion: "reduce", serviceWorkers: "block" });
        page.setDefaultTimeout(8000);
        // Probe native macOS link navigation without changing preferences or
        // adding tabindex to the real component. Only the known WebKit
        // link-skipping preference permits Option-Tab as an alternative.
        const probe = '<a id="native-link" href="#probe">Native link</a><input id="native-input">';
        await page.setContent(probe);
        await page.keyboard.press("Tab");
        let forward = "Tab";
        if (!await page.locator("#native-link").evaluate(node => node === document.activeElement)) {
          assert.equal(engine.name(), "webkit");
          assert.equal(await page.locator("#native-input").evaluate(node => node === document.activeElement), true);
          await page.setContent(probe);
          forward = "Alt+Tab";
          await page.keyboard.press(forward);
          assert.equal(await page.locator("#native-link").evaluate(node => node === document.activeElement), true);
        }
        const backward = forward === "Tab" ? "Shift+Tab" : "Alt+Shift+Tab";
        t.diagnostic(`${engine.name()} ${width} ${locale}: native full-navigation key=${forward}`);
        const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
        const destinations: string[] = [], forbidden: string[] = [];
        const html = harness(locale);
        await page.route("**/*", route => {
          const url = new URL(route.request().url()), path = url.pathname;
          if (url.origin !== "http://fixture-strip.test" || route.request().method() !== "GET") {
            forbidden.push(route.request().url()); return route.abort();
          }
          // 204 observes actual browser navigation without replacing the
          // component or contacting a real site. It does not intercept click.
          if (path === "/live") { destinations.push(url.href); return route.fulfill({ status: 204 }); }
          if (path.endsWith(".png")) return route.fulfill({ contentType: "image/png", body: readFileSync(join(root, "public", path)) });
          if (path === "/api/football-data/fantasy/livescores") return route.fulfill({ json: { ok: true, state: "partial-persisted-schedule", degraded: true, data: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), providerId: String(i + 1), status: i === 0 ? "FullTime" : "Not started", startsAt: "2030-10-09T18:00:00Z", homeScore: 2, awayScore: 1, homeTeam: { id: "19", providerId: "19", name: "Arsenal", logoUrl: "/touchlineArena/shared/club-logos/2026-27/arsenal.png" }, awayTeam: { id: "71", providerId: "71", name: "Leeds", logoUrl: "/touchlineArena/shared/club-logos/2026-27/leeds-united.png" } })) } });
          if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
          return route.fulfill({ status: 503, json: { ok: false } });
        });
        await page.goto("http://fixture-strip.test/");
        await expect(page.locator('[data-fixture-run="original"] .fixture')).toHaveCount(10);
        await expect(page.locator('[data-fixture-run="before"] .fixture')).toHaveCount(10);
        await expect(page.getByRole("link")).toHaveCount(10);
        await page.waitForFunction(() => [...document.querySelectorAll("img")].every(img => img.complete && img.naturalWidth > 0));
        assert.equal(await page.locator("header").count(), 0);
        assert.match(await page.locator(".fixture").first().innerText(), /^2 – 1/);
        const dimensions = await page.locator("img").evaluateAll(images => images.map(img => { const box = img.getBoundingClientRect(); return { w: box.width, h: box.height, ratio: img.naturalWidth / img.naturalHeight, fit: getComputedStyle(img).objectFit }; }));
        for (const d of dimensions) { assert.ok(d.w <= 28.1 && d.h <= 32.1); assert.ok(Math.abs(d.w / d.h - d.ratio) < .02); assert.equal(d.fit, "contain"); }
        const bounds = await page.locator(".strip").boundingBox(); assert.ok(bounds && bounds.height < 90);
        assert.ok(await page.locator(".fixture").first().getAttribute("title"));
        const stripOffset = () => page.locator(".viewport").evaluate(node => node.scrollLeft);
        const stripGeometry = () => page.locator(".viewport").evaluate(node => ({ offset: node.scrollLeft,
          cycle: node.querySelector('[data-fixture-run="original"]')!.getBoundingClientRect().width,
          scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
        const start = await stripOffset();
        const initialGeometry = await stripGeometry();
        assert.ok(start > 0, "original run starts between two visual copies");
        const assertCanonical = (geometry: Awaited<ReturnType<typeof stripGeometry>>) => {
          // Native scroll offsets may be integer-quantized, while run widths
          // remain fractional. A value just below 2 cycles is valid, too.
          assert.ok(geometry.offset >= geometry.cycle - 1 && geometry.offset < 2 * geometry.cycle + 1,
            `canonical loop offset: ${JSON.stringify(geometry)}`);
        };
        const forwardDistance = (from: number, to: number, cycle: number) => ((to - from) % cycle + cycle) % cycle;
        assertCanonical(initialGeometry);
        await page.waitForTimeout(120);
        assert.equal(await stripOffset(), start, "reduced motion keeps strip still");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        // Measure motion in the browser clock. A host-side poll can first arrive
        // after the fixed 3..20px window has already passed on a busy CI runner.
        // Keep positive motion and the speed ceiling; do not relax either on retry.
        const motion = await page.locator(".viewport").evaluate(node => new Promise<{
          elapsed: number; distance: number; samples: Array<{ time: number; offset: number; cycle: number }>;
          hidden: boolean; hovered: boolean; focused: boolean; reducedMotion: boolean;
        }>(resolve => {
          const samples: Array<{ time: number; offset: number; cycle: number }> = [];
          const sample = (time: number) => {
            const cycle = node.querySelector('[data-fixture-run="original"]')!.getBoundingClientRect().width;
            samples.push({ time, offset: node.scrollLeft, cycle });
            if (time - samples[0].time < 600) { requestAnimationFrame(sample); return; }
            const distance = samples.slice(1).reduce((total, current, index) =>
              total + ((current.offset - samples[index].offset) % current.cycle + current.cycle) % current.cycle, 0);
            const strip = node.closest(".strip")!;
            resolve({ elapsed: time - samples[0].time, distance, samples, hidden: document.hidden,
              hovered: strip.matches(":hover"), focused: strip.contains(document.activeElement),
              reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
          };
          requestAnimationFrame(sample);
        }));
        const motionDiagnostic = `${engine.name()} ${width} ${locale}: ${JSON.stringify(motion)}`;
        for (const sample of motion.samples) {
          assertCanonical({ ...initialGeometry, ...sample });
          assert.ok(Math.abs(sample.cycle - initialGeometry.cycle) < .01, `motion does not resize its own cycle: ${motionDiagnostic}`);
        }
        assert.ok(motion.distance > 3, `automatic forward motion must occur: ${motionDiagnostic}`);
        // 30px/s is the product speed. Allow one pixel for quantized scrollLeft;
        // long frames may slow movement, but must never cause catch-up jumps.
        assert.ok(motion.distance <= motion.elapsed * .03 + 1, `bounded forward speed across loop seams: ${motionDiagnostic}`);
        for (let index = 1; index < motion.samples.length; index++) {
          const previous = motion.samples[index - 1], current = motion.samples[index];
          const distance = forwardDistance(previous.offset, current.offset, current.cycle);
          assert.ok(distance <= Math.min(current.time - previous.time, 50) * .03 + 1,
            `bounded frame motion without catch-up jumps: ${motionDiagnostic}`);
        }
        const focusedOriginal = page.locator('[data-fixture-run="original"] .fixture').first();
        await focusedOriginal.focus();
        await expect(focusedOriginal).toBeFocused();
        // Focus reveal is a one-shot correction, not autoplay. Establish the
        // stationary baseline only after that correction is fully visible.
        await expect.poll(() => focusedOriginal.evaluate(node => {
          const rail = node.closest(".viewport")!, bounds = rail.getBoundingClientRect(), item = node.getBoundingClientRect();
          const left = bounds.left + rail.clientLeft, right = left + rail.clientWidth;
          return document.activeElement === node && !node.closest('[aria-hidden="true"]')
            && item.width > 0 && item.height > 0 && item.left >= left - 1 && item.right <= right + 1
            && item.top >= bounds.top - 1 && item.bottom <= bounds.bottom + 1;
        }), { timeout: 1000, message: "focused original is completely revealed before the autoplay pause baseline" }).toBe(true);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
        const focusOffset = await stripOffset();
        await page.waitForTimeout(160);
        assert.equal(await stripOffset(), focusOffset, "focused links never move automatically");
        await page.evaluate(() => {
          const button = document.createElement("button"); button.id = "outside-focus"; button.textContent = "Outside";
          document.body.append(button); button.focus();
        });
        const released = await stripGeometry();
        await expect.poll(async () => {
          const now = await stripGeometry();
          return forwardDistance(released.offset, now.offset, now.cycle) > 3;
        }, { message: "moving focus outside the strip resumes automatic movement" }).toBe(true);
        await page.locator("#outside-focus").evaluate(node => node.remove());
        const previous = page.locator(".strip > button").first(), next = page.locator(".strip > button").last();
        await expect(previous).toBeEnabled();
        await expect(next).toBeEnabled();
        const beforeArrow = await stripOffset();
        await next.click();
        assert.notEqual(await stripOffset(), beforeArrow);
        await expect(previous).toBeEnabled();
        assert.equal(await page.locator("[aria-pressed]").count(), 0);
        await page.locator(".viewport").evaluate(node => { node.scrollLeft = node.scrollWidth; });
        await expect.poll(() => page.locator(".viewport").evaluate(node => {
          const width = node.querySelector('[data-fixture-run="original"]')!.getBoundingClientRect().width;
          return node.scrollLeft >= width - 1 && node.scrollLeft < width * 2;
        })).toBe(true);
        await page.locator(".viewport").evaluate(node => {
          const cycle = node.querySelector('[data-fixture-run="original"]')!.getBoundingClientRect().width;
          node.scrollLeft = cycle - 20;
        });
        await expect.poll(async () => {
          const geometry = await stripGeometry();
          return Math.abs(geometry.offset - (2 * geometry.cycle - 20)) < 2;
        }, { message: "backward crossing wraps to the same fixture sequence" }).toBe(true);
        const visibleFixtures = () => page.locator(".viewport").evaluate(node => {
          const viewport = node.getBoundingClientRect();
          return [...node.querySelectorAll(".fixture")].filter(fixture => {
            const box = fixture.getBoundingClientRect(); return box.right > viewport.left && box.left < viewport.right;
          }).length;
        });
        assert.ok(await visibleFixtures() > 0, "wrapping never exposes an empty viewport");
        await page.setViewportSize({ width: width === 1280 ? 1024 : 600, height: 260 });
        await expect.poll(async () => { const geometry = await stripGeometry();
          return geometry.offset >= geometry.cycle - 1 && geometry.offset < 2 * geometry.cycle + 1;
        }, { message: "resize rebases the canonical loop" }).toBe(true);
        assert.ok(await visibleFixtures() > 0);
        await page.setViewportSize({ width, height: 260 });
        const arrows = await page.locator(".strip > button").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
        const viewportBox = await page.locator(".viewport").boundingBox();
        assert.ok(viewportBox && arrows[0].right < viewportBox.x && arrows[1].left > viewportBox.x + viewportBox.width, "arrows are outside the crest viewport");
        if (process.env.TOUCHLINE_STRIP_CAPTURE_PREFIX && engine === chromium) await page.screenshot({ path: `${process.env.TOUCHLINE_STRIP_CAPTURE_PREFIX}-${width}-${locale}.png` });
        capacity();
        await page.emulateMedia({ reducedMotion: "reduce" });
        const originalLinks = page.locator('[data-fixture-run="original"] .fixture');
        // Starting at the previous arrow, use native keys for every product
        // link. No manual scrolling/focus of individual targets is allowed.
        await previous.focus();
        await page.keyboard.press(forward);
        await expect(page.locator(".viewport")).toBeFocused();
        const keyboardPageOffset = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
        const assertOriginalFocus = async (index: number) => {
          const target = originalLinks.nth(index);
          const focusGeometry = () => target.evaluate(node => {
            const rail = node.closest(".viewport")!, bounds = rail.getBoundingClientRect(), item = node.getBoundingClientRect();
            const active = document.activeElement;
            return {
              complete: !node.closest('[aria-hidden="true"]') && node.matches(":focus-visible")
              && item.width > 0 && item.height > 0 && item.left >= bounds.left - 1 && item.right <= bounds.right + 1
              && item.top >= bounds.top - 1 && item.bottom <= bounds.bottom + 1,
              target: { href: node.getAttribute("href"), rect: item.toJSON(), hidden: Boolean(node.closest('[aria-hidden="true"]')), focusVisible: node.matches(":focus-visible"), active: active === node },
              active: active ? { tag: active.tagName, href: active.getAttribute("href"), run: active.closest<HTMLElement>('[data-fixture-run]')?.dataset.fixtureRun ?? null, hidden: Boolean(active.closest('[aria-hidden="true"]')), rect: active.getBoundingClientRect().toJSON() } : null,
              rail: { rect: bounds.toJSON(), clientLeft: rail.clientLeft, clientWidth: rail.clientWidth, clientHeight: rail.clientHeight, scrollLeft: rail.scrollLeft, scrollTop: rail.scrollTop, scrollWidth: rail.scrollWidth, scrollHeight: rail.scrollHeight, direction: getComputedStyle(rail).direction, overflowX: getComputedStyle(rail).overflowX },
              window: { scrollX: window.scrollX, scrollY: window.scrollY, width: window.innerWidth, height: window.innerHeight },
            };
          });
          try {
            await expect(target).toBeFocused();
            await expect.poll(async () => (await focusGeometry()).complete, { timeout: 1000, message: `${engine.name()} ${width} ${locale} original ${index}: complete native keyboard focus` }).toBe(true);
            assert.deepEqual(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })), keyboardPageOffset, "revealing a fixture must not scroll the document");
          } catch (cause) {
            throw new Error(`${engine.name()} ${width} ${locale} original ${index}: native keyboard focus diagnostics ${JSON.stringify(await focusGeometry())}`, { cause });
          }
        };
        for (let index = 0; index < 10; index++) {
          await page.keyboard.press(forward);
          await assertOriginalFocus(index);
        }
        await page.keyboard.press(forward);
        await expect(next).toBeFocused();
        for (let index = 9; index >= 0; index--) {
          await page.keyboard.press(backward);
          await assertOriginalFocus(index);
        }
        await page.keyboard.press(backward);
        await expect(page.locator(".viewport")).toBeFocused();
        await page.keyboard.press(backward);
        await expect(previous).toBeFocused();

        // Expose the next visual copy at the seam, then click the visible
        // intersection using actual pointer coordinates (not force/DOM click).
        await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>('[data-fixture-carousel="continuous"]')!;
          root.dataset.hiddenFocus = ""; root.dataset.clickedRun = "";
          root.addEventListener("focusin", event => {
            if ((event.target as Element).closest('[aria-hidden="true"]')) root.dataset.hiddenFocus = "true";
          });
          root.addEventListener("click", event => {
            root.dataset.clickedRun = (event.target as Element).closest<HTMLElement>('[data-fixture-run]')?.dataset.fixtureRun ?? "";
          });
          const rail = root.querySelector<HTMLElement>(".viewport")!;
          const cycle = rail.querySelector('[data-fixture-run="original"]')!.getBoundingClientRect().width;
          rail.scrollLeft = cycle * 2 - 80;
        });
        const clone = page.locator('[data-fixture-run="after"] .fixture').first();
        const point = await clone.evaluate(node => {
          const rail = node.closest(".viewport")!.getBoundingClientRect(), item = node.getBoundingClientRect();
          const left = Math.max(rail.left, item.left), right = Math.min(rail.right, item.right);
          const top = Math.max(rail.top, item.top), bottom = Math.min(rail.bottom, item.bottom);
          if (right <= left || bottom <= top) throw new Error("Clone must be visible without forced scroll");
          return { x: (left + right) / 2, y: (top + bottom) / 2 };
        });
        assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-fixture-run]')?.dataset.fixtureRun, point), "after");
        const navigation = page.waitForRequest(request => new URL(request.url()).pathname === "/live");
        await page.mouse.click(point.x, point.y);
        const destination = new URL((await navigation).url());
        assert.equal(destination.pathname, "/live");
        assert.equal(destination.searchParams.get("fixture"), "1");
        assert.equal(destination.searchParams.get("lang"), locale);
        await expect.poll(() => destinations.length).toBe(1);
        assert.equal(await page.locator(".strip").getAttribute("data-clicked-run"), "after");
        assert.equal(await page.locator(".strip").getAttribute("data-hidden-focus"), "");
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-hidden="true"]'))), false);
        assert.deepEqual(forbidden, []);
        assert.deepEqual(errors, []); await page.close();
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});

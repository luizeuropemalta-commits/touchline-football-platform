import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect } from "@playwright/test";
import { getTouchlineNotificationCentreCopy } from "../lib/touchlineArena/notification-centre-i18n.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const viewports = [{ width: 1280, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }];
const locales = ["pt-BR", "ar-SA"];
const syntheticPreferences = {
  accountId: "11111111-1111-4111-8111-111111111111",
  settings: {
    playerRumours: false, availability: false, confirmedLineup: false, goalsAndEvents: false,
    selectedLiveMatches: false, leagueLeadership: false, transfersAndOffers: false,
    creditsPromotionsRewards: false, accountSecurity: false, generalComms: false,
    scopes: { clubs: ["Synthetic long club name"], players: ["Synthetic player"], competitions: ["Synthetic competition"], fixtures: [] },
  },
  channels: { in_app: false, push: false, email: false }, frequency: "paused",
  quietHours: { enabled: false, start: "21:35", end: "06:45", timezone: "Europe/Malta" },
  explicitConsentAt: null, updatedAt: null,
};

test("actual Notifications presentation keeps native quiet-time controls reachable in its read-only local canvas", {
  skip: process.env.TOUCHLINE_RUN_NOTIFICATIONS_CONTENT_BROWSER_TESTS !== "1", timeout: 180_000,
}, async t => {
  const engineFilter = process.env.TOUCHLINE_NOTIFICATIONS_CONTENT_ENGINE;
  const widthFilter = process.env.TOUCHLINE_NOTIFICATIONS_CONTENT_WIDTH;
  const localeFilter = process.env.TOUCHLINE_NOTIFICATIONS_CONTENT_LOCALE;
  assert.ok(engineFilter === undefined || ["chromium", "webkit"].includes(engineFilter), "invalid engine");
  assert.ok(widthFilter === undefined || viewports.some(v => String(v.width) === widthFilter), "invalid width");
  assert.ok(localeFilter === undefined || locales.includes(localeFilter), "invalid locale");
  const engines = [chromium, webkit].filter(e => engineFilter === undefined || e.name() === engineFilter);
  const selectedViewports = viewports.filter(v => widthFilter === undefined || String(v.width) === widthFilter);
  const selectedLocales = locales.filter(l => localeFilter === undefined || l === localeFilter);
  const selectedCases = engines.length * selectedViewports.length * selectedLocales.length;
  assert.ok(selectedCases > 0);
  t.diagnostic(JSON.stringify({ selectedCases, fullMatrixCases: 12, engineFilter, widthFilter, localeFilter,
    scope: "actual page declarations/handlers/CSS, client mount, synthetic GET only; no Next hydration, native Safari, account or consent delivery proof" }));
  const capacity = () => {
    if (process.platform === "darwin" && !process.env.CI && process.env.TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB !== undefined) {
      requireBrowserCapacity(root, { darwinFreePercent: true });
      return;
    }
    const fs = statfsSync(root);
    assert.ok(fs.bavail * fs.bsize > 5 * 1024 ** 3, "disk must exceed 5 GiB");
    const pressure = execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim();
    assert.ok(pressure === "1" || (process.env.TOUCHLINE_LOCAL_MODERATE_MEMORY === "1" && pressure === "2"), "critical memory pressure is not authorized");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25, "free memory must be at least 25%");
  };
  capacity();
  const screenshots = mkdtempSync("/private/tmp/touchline-notifications-content-");
  t.diagnostic(`Screenshots: ${screenshots}`);
  // Wait for close, not a ready message: compiler caches must be released
  // before starting a browser. Test timeout/abort also terminate this child.
  t.signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      path.join(root, "tests/helpers/touchline-notifications-content-compile-worker.mts"), screenshots], {
      cwd: root, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Notifications fixture compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      failure = new Error("Notifications fixture compilation exceeded 30 seconds"); child.kill("SIGKILL");
    }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Notifications fixture compiler could not start"); });
    child.once("close", code => {
      clearTimeout(timeout); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Notifications fixture compiler exited with code ${code}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  t.signal.throwIfAborted();
  const bundle = { script: readFileSync(path.join(screenshots, "fixture-script.js"), "utf8") };
  const css = readFileSync(path.join(screenshots, "fixture-style.css"), "utf8");
  const receipt = JSON.parse(readFileSync(path.join(screenshots, "fixture-sources.json"), "utf8")) as { sources: string[]; sha256: Record<string, string> };
  assert.ok(bundle.script.length > 0 && css.length > 0 && Array.isArray(receipt.sources) && receipt.sources.length > 0);
  for (const source of receipt.sources) {
    assert.ok(typeof source === "string" && !path.isAbsolute(source) && !source.split(/[\\/]/).includes(".."));
    assert.match(receipt.sha256[source], /^[a-f0-9]{64}$/);
    assert.equal(createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex"), receipt.sha256[source], `source changed after compilation: ${source}`);
  }
  for (const source of ["components/touchline/TouchlineNavigationRail.tsx", "components/touchline/SiteLocaleReleaseContext.tsx",
    "components/touchline/TouchlineGlobalNavigation.module.css", "app/(app)/notifications/NotificationsContent.module.css",
    "lib/touchlineArena/notification-centre-i18n.ts", "app/(app)/notifications/page.tsx", "app/globals.css"]) assert.ok(receipt.sources.includes(source), source);
  t.diagnostic(`Compiler exited before browser launch; ${receipt.sources.length} hashed sources: ${path.join(screenshots, "fixture-sources.json")}`);
  const origin = "https://notifications-content.test", publicRoot = realpathSync(path.join(root, "public"));
  let passedCases = 0;
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser required");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewport of selectedViewports) for (const locale of selectedLocales) {
        capacity();
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block", permissions: [] });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(5000);
          const errors: string[] = [], forbidden: string[] = [], reads: string[] = [], consoleErrors: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
          await context.route("**/*", async route => {
            const req = route.request(), url = new URL(req.url());
            if (req.method() !== "GET" || url.origin !== origin) { forbidden.push(`${req.method()} ${url.origin}${url.pathname}`); return route.abort(); }
            if (url.pathname === "/notifications") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>` });
            if (url.pathname === "/api/notifications/preferences") {
              reads.push(url.pathname); return route.fulfill({ json: { ok: true, data: syntheticPreferences } });
            }
            const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) return route.fulfill({ path: asset });
            forbidden.push(url.pathname); return route.abort();
          });
          await page.goto(`${origin}/notifications?lang=${locale}`);
          await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
          await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
          const copy = getTouchlineNotificationCentreCopy(locale, true);
          const main = page.locator("main");
          // Native time fields do not consistently expose a textbox role.
          const times = main.locator('input[type="time"]'), timezone = main.locator(`input[aria-label=${JSON.stringify(copy.quietTimezone)}]`);
          const first = times.nth(0), last = times.nth(1), quietRow = first.locator("..");
          const rail = main.locator(":scope > div > div").first();
          await expect(times).toHaveCount(2);
          await expect(first).toHaveValue("21:35"); await expect(last).toHaveValue("06:45"); await expect(timezone).toHaveValue("Europe/Malta");
          await expect(main.getByRole("button", { name: copy.save, exact: true })).toBeEnabled();
          await expect(main.getByText(copy.consentNotRecorded, { exact: true })).toBeVisible();
          await expect(main.locator('input[type="checkbox"]:checked')).toHaveCount(0);
          assert.equal(reads.length, 1);
          await page.evaluate(() => document.fonts.ready);
          const geometry = await quietRow.evaluate(node => {
            const inputs = Array.from(node.querySelectorAll("input"));
            const boxes = inputs.map(input => input.getBoundingClientRect());
            const controls = inputs.map(input => {
              const style = getComputedStyle(input), box = input.getBoundingClientRect();
              return { type: input.type, value: input.value, width: box.width, height: box.height,
                left: box.left, right: box.right, scrollWidth: input.scrollWidth, clientWidth: input.clientWidth,
                scrollLeft: input.scrollLeft, font: style.font, minWidth: style.minWidth, paddingLeft: style.paddingLeft,
                paddingRight: style.paddingRight, borderLeft: style.borderLeftWidth, borderRight: style.borderRightWidth,
                boxSizing: style.boxSizing, overflowX: style.overflowX, appearance: style.appearance,
                before: getComputedStyle(input, '::before').content, after: getComputedStyle(input, '::after').content };
            });
            return { controls, rowWidth: node.getBoundingClientRect().width, columns: getComputedStyle(node).gridTemplateColumns.split(" ").length,
              sameRow: boxes.every(b => Math.abs(b.top - boxes[0].top) < 1),
              separate: boxes.every((a, i) => boxes.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1)),
              dimensions: boxes.map(b => ({ width: b.width, height: b.height })),
              fontSizes: inputs.map(input => parseFloat(getComputedStyle(input).fontSize)),
              fit: inputs.every(input => input.scrollWidth <= input.clientWidth + 1),
              documentFits: document.documentElement.scrollWidth <= innerWidth };
          });
          t.diagnostic(JSON.stringify({ stage: "pre-geometry-assert", engine: engine.name(), viewport, locale, geometry }));
          // Native inputs have internal editors rather than text DOM ranges.
          // Preserve the failing fit assertion and capture the actual controls.
          await first.evaluate(node => window.scrollTo({ top: Math.max(0, node.getBoundingClientRect().top + scrollY - 100), behavior: "instant" }));
          const beforeAssert = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-before-geometry-assert.png`);
          await page.screenshot({ path: beforeAssert, animations: "disabled" });
          t.diagnostic(`Pre-assert screenshot: ${beforeAssert}`);
          assert.equal(geometry.columns, 3); assert.equal(geometry.sameRow, true); assert.equal(geometry.separate, true);
          assert.ok(geometry.dimensions.every(b => b.width >= 44 && b.height >= 44));
          assert.ok(geometry.fontSizes.every(size => size >= 12)); assert.equal(geometry.fit, true); assert.equal(geometry.documentFits, true);
          await expect.poll(() => rail.evaluate(node => getComputedStyle(node).overflowX)).toBe("auto");
          await page.keyboard.press("Tab");
          await first.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY - 60, behavior: "instant" }));
          const stable = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          if (process.env.TOUCHLINE_NOTIFICATIONS_FOCUS_TRACE === '1' && engine.name() === 'webkit') {
            await rail.evaluate(node => {
              const traced = node as HTMLElement & { notificationFocusTrace?: unknown[] };
              const trace: unknown[] = []; traced.notificationFocusTrace = trace;
              const record = (kind: string, eventTarget?: EventTarget | null) => {
                if (trace.length >= 180) return;
                const active = document.activeElement as HTMLElement | null;
                const box = active?.getBoundingClientRect(), frame = node.getBoundingClientRect();
                const style = active ? getComputedStyle(active) : null;
                trace.push({ kind, at: performance.now(), eventType: eventTarget instanceof HTMLInputElement ? eventTarget.type : null,
                  activeIndex: active ? Array.from(node.querySelectorAll('input')).indexOf(active as HTMLInputElement) : -1,
                  activeType: active?.getAttribute('type'), focusVisible: active?.matches(':focus-visible'),
                  active: box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null,
                  rail: { left: frame.left, right: frame.right }, scrollLeft: node.scrollLeft,
                  outline: style ? { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle } : null,
                  documentScroll: { x: scrollX, y: scrollY } });
              };
              node.addEventListener('focusin', event => {
                record('focusin', event.target);
                let remaining = 12;
                const sample = () => { record(`raf-${13 - remaining}`); if (--remaining > 0) requestAnimationFrame(sample); };
                requestAnimationFrame(sample);
              }, true);
              node.addEventListener('focus', event => record('focus', event.target), true);
              node.addEventListener('blur', event => record('blur', event.target), true);
              node.addEventListener('focusout', event => record('focusout', event.target), true);
              node.addEventListener('scroll', event => record('scroll', event.target), { passive: true });
              record('trace-start');
            });
          }
          // Focus without triggering native editors or changing a value; only
          // the production rail may reveal the clipped input horizontally.
          for (const [index, target] of [first, last, timezone].entries()) {
            await target.evaluate(node => (node as HTMLElement).focus({ preventScroll: true }));
            await expect(target).toBeFocused();
            try {
            await expect.poll(() => rail.evaluate((node, { stable, webkit }) => {
              const active = document.activeElement as HTMLElement, b = active.getBoundingClientRect(), r = node.getBoundingClientRect(), style = getComputedStyle(active);
              const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
              const paintedOutline = !['none', 'hidden'].includes(style.outlineStyle) && parseFloat(style.outlineWidth) > 0
                && style.outlineColor !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(style.outlineColor);
              const nativeTimeFocus = webkit && active instanceof HTMLInputElement && active.type === 'time'
                && active === document.activeElement;
              return (active.matches(":focus-visible") || nativeTimeFocus) && paintedOutline && ring > 0 && b.left - ring >= Math.max(0, r.left + node.clientLeft) - 1
                && b.right + ring <= Math.min(innerWidth, r.left + node.clientLeft + node.clientWidth) + 1
                && b.top - ring >= 0 && b.bottom + ring <= innerHeight && scrollX === stable.x && scrollY === stable.y;
            }, { stable, webkit: engine.name() === 'webkit' })).toBe(true);
            } catch (error) {
              const focusGeometry = await rail.evaluate((node, stable) => {
                const active = document.activeElement as HTMLElement;
                const b = active.getBoundingClientRect(), r = node.getBoundingClientRect(), style = getComputedStyle(active);
                const rect = (box: DOMRect) => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height });
                const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
                return { activeTag: active.tagName, activeType: active.getAttribute('type'), focused: active === document.activeElement,
                  focusVisible: active.matches(':focus-visible'), ring, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset,
                  outlineStyle: style.outlineStyle, outlineColor: style.outlineColor,
                  active: rect(b), rail: rect(r), railClientWidth: node.clientWidth, railClientLeft: node.clientLeft, railScrollLeft: node.scrollLeft,
                  viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY }, stable,
                  leftFits: b.left - ring >= Math.max(0, r.left + node.clientLeft) - 1,
                  rightFits: b.right + ring <= Math.min(innerWidth, r.left + node.clientLeft + node.clientWidth) + 1,
                  topFits: b.top - ring >= 0, bottomFits: b.bottom + ring <= innerHeight,
                  stableScroll: scrollX === stable.x && scrollY === stable.y };
              }, stable);
              t.diagnostic(JSON.stringify({ stage: 'focus-failure', engine: engine.name(), viewport, locale, index, focusGeometry }));
              const temporalTrace = await rail.evaluate(node => (node as HTMLElement & { notificationFocusTrace?: unknown[] }).notificationFocusTrace ?? []);
              t.diagnostic(JSON.stringify({ stage: 'focus-temporal-trace', engine: engine.name(), viewport, locale, index, temporalTrace }));
              const failureScreenshot = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-quiet-${index}-focus-failure.png`);
              await page.screenshot({ path: failureScreenshot, animations: 'disabled' });
              t.diagnostic(`Focus failure screenshot: ${failureScreenshot}`);
              throw error;
            }
            const screenshot = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-quiet-${index}.png`);
            await page.screenshot({ path: screenshot, animations: "disabled" }); t.diagnostic(`Screenshot: ${screenshot}`);
          }
          // Separately prove genuine keyboard reachability. Native time
          // editors may consume several Tabs for their hour/minute segments.
          // No arrows, typing, click or value mutation is used here.
          await page.locator('#before-notifications').focus();
          for (const [index, target] of [first, last, timezone].entries()) {
            let reached = false;
            for (let step = 0; step < 64; step++) {
              await page.keyboard.press('Tab');
              if (await target.evaluate(node => node === document.activeElement)) { reached = true; break; }
            }
            assert.equal(reached, true, `quiet control ${index} must be reachable with real Tab navigation`);
            await expect(target).toBeFocused();
            try {
            await expect.poll(() => target.evaluate((node, webkit) => {
              const style = getComputedStyle(node), box = node.getBoundingClientRect();
              const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
              const paintedOutline = !['none', 'hidden'].includes(style.outlineStyle) && parseFloat(style.outlineWidth) > 0
                && style.outlineColor !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(style.outlineColor);
              const nativeTimeFocus = webkit && node instanceof HTMLInputElement && node.type === 'time';
              return node === document.activeElement && (node.matches(':focus-visible') || nativeTimeFocus)
                && paintedOutline && ring > 0 && box.left - ring >= -1 && box.right + ring <= innerWidth + 1
                && box.top - ring >= 0 && box.bottom + ring <= innerHeight;
            }, engine.name() === 'webkit')).toBe(true);
            } catch (error) {
              const keyboardGeometry = await target.evaluate(node => {
                const style = getComputedStyle(node), b = node.getBoundingClientRect();
                const ancestors = []; let ancestor: HTMLElement | null = node.parentElement;
                while (ancestor) { const r = ancestor.getBoundingClientRect(), s = getComputedStyle(ancestor); ancestors.push({ tag: ancestor.tagName, className: ancestor.className, left:r.left, right:r.right, top:r.top, bottom:r.bottom, scrollLeft:ancestor.scrollLeft, scrollTop:ancestor.scrollTop, overflowX:s.overflowX, overflowY:s.overflowY }); ancestor=ancestor.parentElement; }
                return { active:node===document.activeElement, type:node.getAttribute('type'), focusVisible:node.matches(':focus-visible'), outlineWidth:style.outlineWidth, outlineOffset:style.outlineOffset, outlineStyle:style.outlineStyle, outlineColor:style.outlineColor, box:{left:b.left,right:b.right,top:b.top,bottom:b.bottom}, viewport:{width:innerWidth,height:innerHeight}, documentScroll:{x:scrollX,y:scrollY}, ancestors };
              });
              t.diagnostic(JSON.stringify({stage:'keyboard-focus-failure',engine:engine.name(),viewport,locale,index,keyboardGeometry}));
              const trace=await rail.evaluate(node=>(node as HTMLElement & {notificationFocusTrace?:unknown[]}).notificationFocusTrace ?? []);
              t.diagnostic(JSON.stringify({stage:'keyboard-focus-trace',trace}));
              const failureScreenshot=path.join(screenshots,`${engine.name()}-${viewport.width}x${viewport.height}-${locale}-keyboard-${index}-failure.png`);
              await page.screenshot({path:failureScreenshot,animations:'disabled'});
              t.diagnostic(`Keyboard failure screenshot: ${failureScreenshot}`);
              throw error;
            }
          }
          await expect(first).toHaveValue("21:35"); await expect(last).toHaveValue("06:45"); await expect(timezone).toHaveValue("Europe/Malta");
          await expect(main.getByText(copy.consentNotRecorded, { exact: true })).toBeVisible();
          await expect(main.locator('input[type="checkbox"]:checked')).toHaveCount(0);
          assert.equal(reads.length, 1); assert.deepEqual(forbidden, []); assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
          if (process.env.TOUCHLINE_NOTIFICATIONS_FOCUS_TRACE === '1' && engine.name() === 'webkit') {
            const temporalTrace = await rail.evaluate(node => (node as HTMLElement & { notificationFocusTrace?: unknown[] }).notificationFocusTrace ?? []);
            t.diagnostic(JSON.stringify({ stage: 'focus-temporal-success', engine: engine.name(), viewport, locale, temporalTrace }));
          }
          passedCases++; t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale, geometry, passedCases }));
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  assert.equal(passedCases, selectedCases);
});

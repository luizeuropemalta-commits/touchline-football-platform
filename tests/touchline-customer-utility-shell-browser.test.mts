import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect, type Locator } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref } from "../lib/touchlineArena/auth-i18n.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const viewports = [{ width: 1280, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }];
const locales = ["pt-BR", "ar-SA"];
const routes = ["/notifications", "/inbox", "/football-search"];

test("real customer utility shell keeps one header/main/logout and accessible primary and secondary rails", {
  skip: process.env.TOUCHLINE_RUN_UTILITY_SHELL_BROWSER_TESTS !== "1", timeout: 180_000,
}, async t => {
  const engineFilter = process.env.TOUCHLINE_UTILITY_SHELL_ENGINE;
  const widthFilter = process.env.TOUCHLINE_UTILITY_SHELL_WIDTH;
  const localeFilter = process.env.TOUCHLINE_UTILITY_SHELL_LOCALE;
  const routeFilter = process.env.TOUCHLINE_UTILITY_SHELL_ROUTE;
  assert.ok(engineFilter === undefined || ["chromium", "webkit"].includes(engineFilter), "invalid engine filter");
  assert.ok(widthFilter === undefined || viewports.some(value => String(value.width) === widthFilter), "invalid width filter");
  assert.ok(localeFilter === undefined || locales.includes(localeFilter), "invalid locale filter");
  assert.ok(routeFilter === undefined || routes.includes(routeFilter), "invalid route filter");
  const engines = [chromium, webkit].filter(value => engineFilter === undefined || value.name() === engineFilter);
  const selectedViewports = viewports.filter(value => widthFilter === undefined || String(value.width) === widthFilter);
  const selectedLocales = locales.filter(value => localeFilter === undefined || value === localeFilter);
  const selectedRoutes = routes.filter(value => routeFilter === undefined || value === routeFilter);
  const selectedCases = engines.length * selectedViewports.length * selectedLocales.length * selectedRoutes.length;
  assert.ok(selectedCases > 0);
  t.diagnostic(JSON.stringify({ selectedCases, fullMatrixCases: 36, engineFilter, widthFilter, localeFilter, routeFilter,
    scope: "synthetic identity and logout callback; real client mount/CSS, not SSR hydration, authenticated account or Next routing" }));
  const capacity = () => {
    const disk = statfsSync(root);
    assert.ok(disk.bavail * disk.bsize > 5 * 1024 ** 3, "more than5GiB disk required");
    assert.equal(execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim(), "1");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25);
  };
  capacity();
  const screenshots = mkdtempSync("/private/tmp/touchline-utility-shell-");
  t.diagnostic(`Screenshots: ${screenshots}`);
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/CustomerUtilityShellBrowserFixture.tsx", cssPrefix: "utilityshell",
    requiredSources: ["components/touchline/TouchlineCustomerUtilityShell.tsx", "components/touchline/TouchlineCustomerUtilityShell.module.css",
      "components/touchline/TouchlineBrandHeader.tsx", "components/touchline/TouchlineGlobalNavigation.tsx", "components/touchline/TouchlineNavigationRail.tsx"],
    mountScript: `flushSync(()=>root.render(React.createElement(loadEntry().default,{pathname:location.pathname,locale:document.documentElement.lang})));`,
  });
  // Same installed, source-scoped compiler as the real header browser proof.
  const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwindRequire("@tailwindcss/node");
  const { Scanner } = tailwindRequire("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles(bundle.sources.filter(file => /\.tsx?$/.test(file)).map(file => ({ content: readFileSync(path.join(root, file), "utf8"), extension: path.extname(file).slice(1) })));
  const globals = path.join(root, "app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  const css = `${compiler.build(candidates)}\n${bundle.css}`;
  const origin = "https://utility-shell.test", publicRoot = realpathSync(path.join(root, "public"));
  let passedCases = 0;
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewport of selectedViewports) for (const locale of selectedLocales) for (const pathname of selectedRoutes) {
        capacity();
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(5000);
          const errors: string[] = [], hydrationErrors: string[] = [], forbidden: string[] = [], blockedApis: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("console", message => { if (/hydration|hydrating|did not match/i.test(message.text())) hydrationErrors.push(message.text()); });
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== "GET" || url.origin !== origin) { forbidden.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
            if (url.pathname === pathname) return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>` });
            if (url.pathname.startsWith("/api/")) { blockedApis.push(url.pathname); return route.fulfill({ status: 503, json: { ok: false, error: "Isolated utility fixture" } }); }
            const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) return route.fulfill({ path: asset });
            forbidden.push(url.pathname); return route.abort();
          });
          // Respect WebKit's native full-keyboard-navigation preference.
          const probe = '<a id="probe-link" href="#native">Link</a><input id="probe-input">';
          await page.setContent(probe); await page.keyboard.press("Tab");
          let forward = "Tab";
          if (!await page.locator("#probe-link").evaluate(node => node === document.activeElement)) {
            assert.equal(engine.name(), "webkit"); await expect(page.locator("#probe-input")).toBeFocused();
            await page.setContent(probe); forward = "Alt+Tab"; await page.keyboard.press(forward); await expect(page.locator("#probe-link")).toBeFocused();
          }
          const backward = forward === "Tab" ? "Shift+Tab" : "Alt+Shift+Tab";
          await page.goto(`${origin}${pathname}?lang=${locale}`); await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
          await expect(page.locator("header")).toHaveCount(1); await expect(page.locator("main")).toHaveCount(1);
          await expect(page.locator("[data-utility-fixture-content]")).toHaveCount(1);
          const nav = page.locator("nav[data-touchline-navigation-surface]"), primaryRail = nav.locator("..");
          const primary = nav.locator(":scope > a"), general = nav.locator(":scope > div > a[data-touchline-navigation-key]");
          const logout = primaryRail.locator("button");
          await expect(logout).toHaveCount(1); await expect(logout).toBeEnabled();
          assert.equal(await primary.getAttribute("href"), `/clubowner?lang=${locale}`); await expect(general).toHaveCount(3);
          const secondary = page.locator("nav").filter({ has: page.locator(`a[href="/notifications?lang=${locale}"]`) });
          await expect(secondary).toHaveCount(1);
          const secondaryRail = secondary.locator(".."), utilityLinks = secondary.locator(":scope > a");
          await expect(utilityLinks).toHaveCount(5);
          await expect(secondary.locator('[aria-current="page"]')).toHaveAttribute("href", `${pathname}?lang=${locale}`);
          for (const anchor of (await utilityLinks.all()).slice(0, 4)) {
            const href = new URL((await anchor.getAttribute("href"))!, origin);
            assert.equal(href.searchParams.get("lang"), locale);
          }
          // Switch-account keeps the existing operational EN/PT policy, even
          // when customer presentation is explicitly released in eight locales.
          const expectedSwitchAccountHref = touchLineAuthEntryHref("/login", normalizeTouchLineAuthLocale(locale), `${pathname}?lang=${locale}`);
          await expect(utilityLinks.nth(4)).toHaveAttribute("href", expectedSwitchAccountHref);
          type Scroll = { x: number; y: number };
          const geometry = async (target: Locator, rail: Locator, stable?: Scroll) => {
            await expect(target).toBeFocused();
            await expect.poll(() => rail.evaluate((element, stable) => {
              const active = document.activeElement as HTMLElement, b = active.getBoundingClientRect(), r = element.getBoundingClientRect();
              const style = getComputedStyle(active), rs = getComputedStyle(element);
              const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
              const clipsX = /auto|scroll|hidden|clip/.test(rs.overflowX), clipsY = /auto|scroll|hidden|clip/.test(rs.overflowY);
              const left = clipsX ? Math.max(0, r.left + element.clientLeft) : 0;
              const right = clipsX ? Math.min(innerWidth, r.left + element.clientLeft + element.clientWidth) : innerWidth;
              const top = clipsY ? Math.max(0, r.top + element.clientTop) : 0;
              const bottom = clipsY ? Math.min(innerHeight, r.top + element.clientTop + element.clientHeight) : innerHeight;
              return active.matches(":focus-visible") && ring > 0 && b.height >= 44 && b.width >= 44
                && b.left - ring >= left - 1 && b.right + ring <= right + 1 && b.top - ring >= top - 1 && b.bottom + ring <= bottom + 1
                && document.documentElement.scrollWidth <= innerWidth && (!stable || (scrollX === stable.x && scrollY === stable.y));
            }, stable), { timeout: 1500, message: "entire native focused control and ring must fit, without document scrolling" }).toBe(true);
          };
          // Native Tab starts at the logo and then enters the primary rail.
          await page.keyboard.press(forward); await page.keyboard.press(forward);
          await geometry(primary, primaryRail);
          const primaryScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          for (const link of await general.all()) { await page.keyboard.press(forward); await geometry(link, primaryRail, primaryScroll); }
          await page.keyboard.press(forward); await geometry(logout, primaryRail, primaryScroll);
          for (const target of [...(await general.all()).reverse(), primary]) { await page.keyboard.press(backward); await geometry(target, primaryRail, primaryScroll); }
          // Reach secondary naturally through the intervening real controls.
          for (let steps = 0; steps < 24 && !await utilityLinks.first().evaluate(node => node === document.activeElement); steps++) await page.keyboard.press(forward);
          await geometry(utilityLinks.first(), secondaryRail);
          const secondaryScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          const railStart = await secondaryRail.evaluate(node => node.scrollLeft);
          for (const target of (await utilityLinks.all()).slice(1)) { await page.keyboard.press(forward); await geometry(target, secondaryRail, secondaryScroll); }
          const overflow = await secondaryRail.evaluate(node => node.scrollWidth > node.clientWidth + 1);
          if (overflow) assert.notEqual(await secondaryRail.evaluate(node => node.scrollLeft), railStart, "secondary traversal must move its horizontal scrollport");
          for (const target of (await utilityLinks.all()).slice(0, -1).reverse()) { await page.keyboard.press(backward); await geometry(target, secondaryRail, secondaryScroll); }
          await page.evaluate(() => document.fonts.ready);
          for (const image of await page.locator("header img").all()) await expect.poll(() => image.evaluate(node => {
            const img = node as HTMLImageElement; return img.complete && img.naturalWidth > 0;
          })).toBe(true);
          const screenshot = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-${pathname.slice(1)}.png`);
          await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" }); t.diagnostic(`Screenshot: ${screenshot}`);
          await logout.click(); await expect(logout).toBeDisabled(); await expect(logout).toHaveAttribute("aria-busy", "true");
          await expect(page.locator('[data-utility-fixture-content]')).toHaveAttribute("data-sign-out-calls", "1");
          assert.deepEqual(errors, []); assert.deepEqual(hydrationErrors, []); assert.deepEqual(forbidden, []);
          assert.equal(new URL(page.url()).pathname, pathname, "synthetic logout never navigates or authenticates");
          passedCases++; t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale, pathname, blockedApis, passedCases }));
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  assert.equal(passedCases, selectedCases);
});

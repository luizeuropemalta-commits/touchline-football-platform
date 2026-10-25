import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect } from "@playwright/test";
import ts from "typescript";
import { bundleIsolatedBrowserFixture, transpileFixtureModule } from "./helpers/touchline-isolated-browser-bundle.mts";
import { getTouchlineNotificationCentreCopy } from "../lib/touchlineArena/notification-centre-i18n.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const viewports = [{ width: 1280, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }];
const locales = ["pt-BR", "ar-SA"];
const syntheticPreferences = {
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
    const fs = statfsSync(root);
    assert.ok(fs.bavail * fs.bsize > 5 * 1024 ** 3, "disk must exceed 5 GiB");
    assert.equal(execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim(), "1", "pressure must be normal");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25, "free memory must be at least 25%");
  };
  capacity();
  const pagePath = "app/(app)/notifications/page.tsx";
  const source = readFileSync(path.join(root, pagePath), "utf8");
  const ast = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter(ts.isFunctionDeclaration);
  assert.equal(functions.filter(f => f.name?.text === "NotificationsPage").length, 1);
  assert.equal(functions.filter(f => f.name?.text === "NotificationsContent").length, 1);
  // All declarations are copied mechanically, including real state/effects/
  // save handlers. We replace only imports with the explicit fixture bindings.
  const compiled = transpileFixtureModule(ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join("\n"), "actual-notifications-page.tsx");
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/NotificationsContentBrowserFixture.tsx", cssPrefix: "notificationscontent",
    requiredSources: ["components/touchline/TouchlineNavigationRail.tsx", "components/touchline/SiteLocaleReleaseContext.tsx",
      "app/(app)/notifications/NotificationsContent.module.css", "components/touchline/TouchlineGlobalNavigation.module.css", "lib/touchlineArena/notification-centre-i18n.ts"],
    mountScript: `const fixture=loadEntry();
      const {Bell,CheckCircle2,Clock3,Mail,Radio,Save,ShieldCheck,Smartphone,TouchlineNavigationRail,useSiteLocaleRelease,styles,navigationStyles,resolveTouchlineCatalogueLocale,getTouchlineNotificationCentreCopy,formatTouchlineNotificationActiveCount}=fixture;
      const {useEffect,useMemo,useRef,useState}=fixture.ReactHooks;
      const useSearchParams=()=>new URLSearchParams(location.search);
      const exports={};const require=id=>{if(id==='react/jsx-runtime')return fixture.jsxRuntime;throw Error('Unexpected extracted page dependency '+id);};
      ${compiled}
      flushSync(()=>root.render(React.createElement(fixture.default,null,React.createElement(exports.default))));
      document.documentElement.dataset.fixtureReady='true';`,
  });
  const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwindRequire("@tailwindcss/node");
  const { Scanner } = tailwindRequire("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles([...bundle.sources, pagePath].filter(f => /\.tsx?$/.test(f)).map(f => ({ content: readFileSync(path.join(root, f), "utf8"), extension: path.extname(f).slice(1) })));
  const globals = path.join(root, "app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  const css = `${compiler.build(candidates)}\n${bundle.css}`;
  const screenshots = mkdtempSync("/private/tmp/touchline-notifications-content-");
  t.diagnostic(`Screenshots: ${screenshots}`);
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
            return { columns: getComputedStyle(node).gridTemplateColumns.split(" ").length,
              sameRow: boxes.every(b => Math.abs(b.top - boxes[0].top) < 1),
              separate: boxes.every((a, i) => boxes.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1)),
              dimensions: boxes.map(b => ({ width: b.width, height: b.height })),
              fontSizes: inputs.map(input => parseFloat(getComputedStyle(input).fontSize)),
              fit: inputs.every(input => input.scrollWidth <= input.clientWidth + 1),
              documentFits: document.documentElement.scrollWidth <= innerWidth };
          });
          assert.equal(geometry.columns, 3); assert.equal(geometry.sameRow, true); assert.equal(geometry.separate, true);
          assert.ok(geometry.dimensions.every(b => b.width >= 44 && b.height >= 44));
          assert.ok(geometry.fontSizes.every(size => size >= 12)); assert.equal(geometry.fit, true); assert.equal(geometry.documentFits, true);
          await expect.poll(() => rail.evaluate(node => getComputedStyle(node).overflowX)).toBe("auto");
          await page.keyboard.press("Tab");
          await first.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY - 60, behavior: "instant" }));
          const stable = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          // Focus without triggering native editors or changing a value; only
          // the production rail may reveal the clipped input horizontally.
          for (const [index, target] of [first, last, timezone].entries()) {
            await target.evaluate(node => (node as HTMLElement).focus({ preventScroll: true }));
            await expect(target).toBeFocused();
            await expect.poll(() => rail.evaluate((node, stable) => {
              const active = document.activeElement as HTMLElement, b = active.getBoundingClientRect(), r = node.getBoundingClientRect(), style = getComputedStyle(active);
              const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
              return active.matches(":focus-visible") && ring > 0 && b.left - ring >= Math.max(0, r.left + node.clientLeft) - 1
                && b.right + ring <= Math.min(innerWidth, r.left + node.clientLeft + node.clientWidth) + 1
                && b.top - ring >= 0 && b.bottom + ring <= innerHeight && scrollX === stable.x && scrollY === stable.y;
            }, stable)).toBe(true);
            const screenshot = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-quiet-${index}.png`);
            await page.screenshot({ path: screenshot, animations: "disabled" }); t.diagnostic(`Screenshot: ${screenshot}`);
          }
          await expect(first).toHaveValue("21:35"); await expect(last).toHaveValue("06:45"); await expect(timezone).toHaveValue("Europe/Malta");
          await expect(main.getByText(copy.consentNotRecorded, { exact: true })).toBeVisible();
          await expect(main.locator('input[type="checkbox"]:checked')).toHaveCount(0);
          assert.equal(reads.length, 1); assert.deepEqual(forbidden, []); assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
          passedCases++; t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale, geometry, passedCases }));
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  assert.equal(passedCases, selectedCases);
});

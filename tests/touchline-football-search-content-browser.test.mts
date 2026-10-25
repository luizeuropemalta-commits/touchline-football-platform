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
import { getTouchlineFootballSearchCopy } from "../lib/touchlineArena/football-search-i18n.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const viewports = [{ width: 1280, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }];
const locales = ["pt-BR", "ar-SA"];
const scenarios = ["catalogue", "long-labels"];

test("actual football search renderer preserves its row, readable labels and locally scrolling focus", {
  skip: process.env.TOUCHLINE_RUN_SEARCH_CONTENT_BROWSER_TESTS !== "1", timeout: 180_000,
}, async t => {
  const engineFilter = process.env.TOUCHLINE_SEARCH_CONTENT_ENGINE;
  const widthFilter = process.env.TOUCHLINE_SEARCH_CONTENT_WIDTH;
  const localeFilter = process.env.TOUCHLINE_SEARCH_CONTENT_LOCALE;
  const scenarioFilter = process.env.TOUCHLINE_SEARCH_CONTENT_SCENARIO;
  assert.ok(engineFilter === undefined || ["chromium", "webkit"].includes(engineFilter), "invalid engine");
  assert.ok(widthFilter === undefined || viewports.some(v => String(v.width) === widthFilter), "invalid width");
  assert.ok(localeFilter === undefined || locales.includes(localeFilter), "invalid locale");
  assert.ok(scenarioFilter === undefined || scenarios.includes(scenarioFilter), "invalid scenario");
  const engines = [chromium, webkit].filter(e => !engineFilter || e.name() === engineFilter);
  const selectedViewports = viewports.filter(v => !widthFilter || String(v.width) === widthFilter);
  const selectedLocales = locales.filter(l => !localeFilter || l === localeFilter);
  const selectedScenarios = scenarios.filter(s => !scenarioFilter || s === scenarioFilter);
  const selectedCases = engines.length * selectedViewports.length * selectedLocales.length * selectedScenarios.length;
  assert.ok(selectedCases > 0);
  t.diagnostic(JSON.stringify({ selectedCases, fullMatrixCases: 24, engineFilter, widthFilter, localeFilter, scenarioFilter,
    scope: "real renderer AST/client mount, real CSS/rail; synthetic long labels; not Next SSR, hydration, routing, auth or complete utility shell" }));
  const capacity = () => {
    const fs = statfsSync(root);
    assert.ok(fs.bavail * fs.bsize > 5 * 1024 ** 3, "disk must exceed 5 GiB");
    assert.equal(execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim(), "1", "pressure must be normal");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25, "free memory must be at least 25%");
  };
  capacity();
  const pagePath = "app/(app)/football-search/page.tsx";
  const source = readFileSync(path.join(root, pagePath), "utf8");
  const ast = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const renderers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "renderFootballSearchPage");
  assert.equal(renderers.length, 1, "extract the actual server renderer, never duplicate JSX");
  assert.ok(renderers[0].body);
  const compiledRenderer = transpileFixtureModule(renderers[0].getText(ast), "real-football-search-renderer.tsx");
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/FootballSearchContentBrowserFixture.tsx", cssPrefix: "searchcontent",
    requiredSources: ["components/player-database-search.tsx", "components/touchline/TouchlineNavigationRail.tsx",
      "components/touchline/TouchlineGlobalNavigation.module.css", "app/(app)/football-search/FootballSearchContent.module.css"],
    mountScript: `void (async()=>{
      const fixture=loadEntry();
      const {Link,ArrowLeft,DatabaseZap,PlayerDatabaseSearch,TouchlineNavigationRail,navigationStyles,styles,touchLineAuthHref,resolveTouchlineCatalogueLocale}=fixture;
      const longLabels=new URLSearchParams(location.search).get('scenario')==='long-labels';
      const getTouchlineFootballSearchCopy=(locale,enabled)=>{
        const copy=fixture.getTouchlineFootballSearchCopy(locale,enabled);
        return longLabels?{...copy,back:copy.back+' · TouchLine',title:copy.title+' · '+copy.title+' · '+copy.title}:copy;
      };
      const exports={};
      const require=id=>{if(id==='react/jsx-runtime')return fixture.jsxRuntime;throw Error('Unapproved extracted renderer dependency: '+id);};
      ${compiledRenderer}
      const content=await renderFootballSearchPage({searchParams:Promise.resolve({lang:document.documentElement.lang})},true);
      flushSync(()=>root.render(React.createElement(fixture.default,null,content)));
      document.documentElement.dataset.fixtureReady='true';
    })().catch(error=>{setTimeout(()=>{throw error;},0);});`,
  });
  const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwindRequire("@tailwindcss/node");
  const { Scanner } = tailwindRequire("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles([...bundle.sources, pagePath].filter(f => /\.tsx?$/.test(f)).map(f => ({ content: readFileSync(path.join(root, f), "utf8"), extension: path.extname(f).slice(1) })));
  const globals = path.join(root, "app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  const css = `${compiler.build(candidates)}\n${bundle.css}`;
  const screenshots = mkdtempSync("/private/tmp/touchline-search-content-");
  t.diagnostic(`Screenshots: ${screenshots}`);
  const origin = "https://search-content.test", publicRoot = realpathSync(path.join(root, "public"));
  let passedCases = 0;
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser required");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewport of selectedViewports) for (const locale of selectedLocales) for (const scenario of selectedScenarios) {
        capacity();
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(5000);
          const errors: string[] = [], forbidden: string[] = [], consoleErrors: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
          await context.route("**/*", async route => {
            const req = route.request(), url = new URL(req.url());
            if (req.method() !== "GET" || url.origin !== origin) { forbidden.push(`${req.method()} ${url.origin}${url.pathname}`); return route.abort(); }
            if (url.pathname === "/football-search") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>` });
            if (url.pathname.startsWith("/api/")) { forbidden.push(url.pathname); return route.fulfill({ status: 503, json: { ok: false, error: "No API in isolated search fixture" } }); }
            const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) return route.fulfill({ path: asset });
            forbidden.push(url.pathname); return route.abort();
          });
          const probe = '<a id="probe-link" href="#probe">Link</a><input id="probe-input">';
          await page.setContent(probe); await page.keyboard.press("Tab");
          let forward = "Tab";
          if (!await page.locator("#probe-link").evaluate(node => node === document.activeElement)) {
            assert.equal(engine.name(), "webkit"); await expect(page.locator("#probe-input")).toBeFocused();
            await page.setContent(probe); forward = "Alt+Tab"; await page.keyboard.press(forward); await expect(page.locator("#probe-link")).toBeFocused();
          }
          const backward = forward === "Tab" ? "Shift+Tab" : "Alt+Shift+Tab";
          await page.goto(`${origin}/football-search?lang=${locale}&scenario=${scenario}`);
          await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
          await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
          await page.evaluate(() => document.fonts.ready);
          const main = page.locator("main[data-football-search-fixture]"), back = main.locator("a");
          const row = back.locator(".."), rail = row.locator(".."), title = row.locator(":scope > div");
          const copy = getTouchlineFootballSearchCopy(locale, true);
          const expectedBack = copy.back + (scenario === "long-labels" ? " · TouchLine" : "");
          const expectedTitle = scenario === "long-labels" ? `${copy.title} · ${copy.title} · ${copy.title}` : copy.title;
          await expect(back).toHaveCount(1); await expect(back).toHaveText(expectedBack);
          await expect(back).toHaveAttribute("href", `/clubowner?lang=${locale}`);
          await expect(title).toHaveText(expectedTitle);
          await expect(main.locator('[data-touchline-editorial-card-notice="true"]')).toHaveCount(1);
          await expect(main.locator("input,button,form")).toHaveCount(0);
          const layout = await row.evaluate(node => {
            const [a, title] = Array.from(node.children) as HTMLElement[];
            const ab = a.getBoundingClientRect(), tb = title.getBoundingClientRect();
            return { flexWrap: getComputedStyle(node).flexWrap, sameRow: Math.abs(ab.top + ab.height / 2 - tb.top - tb.height / 2) < 1,
              font: [a, title].map(el => parseFloat(getComputedStyle(el).fontSize)), height: ab.height, width: ab.width,
              complete: [a, title].every(el => el.scrollWidth <= el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis"),
              noDocumentOverflow: document.documentElement.scrollWidth <= innerWidth };
          });
          assert.equal(layout.flexWrap, "nowrap"); assert.equal(layout.sameRow, true); assert.equal(layout.complete, true);
          // Canonical navigation deliberately uses 11px below640px; the page
          // badge stays12px. Do not redefine the shared button to fit this test.
          assert.ok(layout.font[0] >= 11 && layout.font[1] >= 12); assert.ok(layout.height >= 44 && layout.width >= 44); assert.equal(layout.noDocumentOverflow, true);
          const stable = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          const visibleBack = async () => {
            await expect(back).toBeFocused();
            await expect.poll(() => rail.evaluate((node, stable) => {
              const active = document.activeElement as HTMLElement, b = active.getBoundingClientRect(), r = node.getBoundingClientRect();
              const style = getComputedStyle(active), ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
              return active.matches(":focus-visible") && ring > 0 && b.left - ring >= Math.max(0, r.left + node.clientLeft) - 1
                && b.right + ring <= Math.min(innerWidth, r.left + node.clientLeft + node.clientWidth) + 1
                && b.top - ring >= Math.max(0, r.top + node.clientTop) - 1
                && b.bottom + ring <= Math.min(innerHeight, r.top + node.clientTop + node.clientHeight) + 1
                && scrollX === stable.x && scrollY === stable.y;
            }, stable)).toBe(true);
          };
          await page.keyboard.press(forward); await expect(page.locator("#before-search-content")).toBeFocused();
          await page.keyboard.press(forward); await visibleBack();
          await page.keyboard.press(forward); await expect(page.locator("#after-search-content")).toBeFocused();
          // Reach the actual final label glyph using this scrollport only, even
          // when the complete long title is wider than a phone viewport.
          const initialScroll = await rail.evaluate(node => node.scrollLeft);
          const revealTitleEnd = () => rail.evaluate(node => {
            const label = node.querySelector(":scope > div > div")!;
            const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
            let last: Text | null = null; while (walker.nextNode()) if (walker.currentNode.textContent?.trim()) last = walker.currentNode as Text;
            if (!last) throw Error("Missing label text");
            const range = document.createRange(); range.setStart(last, last.length - 1); range.setEnd(last, last.length);
            const b = range.getBoundingClientRect(), r = node.getBoundingClientRect();
            const left = r.left + node.clientLeft + 8, right = r.left + node.clientLeft + node.clientWidth - 8;
            const delta = b.left < left ? b.left - left : b.right > right ? b.right - right : 0;
            if (delta) node.scrollBy({ left: delta, behavior: "instant" });
            const end = range.getBoundingClientRect();
            return { visible: end.left >= left - 1 && end.right <= right + 1 && end.top >= r.top && end.bottom <= r.top + node.clientHeight,
              x: scrollX, y: scrollY, overflow: node.scrollWidth > node.clientWidth + 1, scroll: node.scrollLeft };
          });
          const end = await revealTitleEnd(); assert.equal(end.visible, true); assert.equal(end.x, stable.x); assert.equal(end.y, stable.y);
          if (end.overflow) assert.notEqual(end.scroll, initialScroll, "overflowing title must be reached by local scrolling");
          await page.keyboard.press(backward); await visibleBack();
          await page.keyboard.press(backward); await expect(page.locator("#before-search-content")).toBeFocused();
          await page.keyboard.press(forward); await visibleBack();
          assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), stable);
          const screenshot = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-${scenario}.png`);
          await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" }); t.diagnostic(`Screenshot: ${screenshot}`);
          assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(forbidden, []);
          passedCases++; t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale, scenario, layout, passedCases }));
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  assert.equal(passedCases, selectedCases);
});

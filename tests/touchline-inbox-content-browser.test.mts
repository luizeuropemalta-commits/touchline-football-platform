import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect } from "@playwright/test";
import ts from "typescript";
import { bundleIsolatedBrowserFixture, transpileFixtureModule } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }];
const locales = ["pt-BR", "ar-SA"];

test("actual Inbox return preserves desktop columns and reflows actions on smaller screens with visible keyboard focus", {
  skip: process.env.TOUCHLINE_RUN_INBOX_CONTENT_BROWSER_TESTS !== "1", timeout: 180_000,
}, async t => {
  assert.notEqual(process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE, "1", "memory bypass is not allowed for this matrix");
  const engineFilter = process.env.TOUCHLINE_INBOX_CONTENT_ENGINE;
  const widthFilter = process.env.TOUCHLINE_INBOX_CONTENT_WIDTH;
  const localeFilter = process.env.TOUCHLINE_INBOX_CONTENT_LOCALE;
  assert.ok(engineFilter === undefined || ["chromium", "webkit"].includes(engineFilter), "invalid engine");
  assert.ok(widthFilter === undefined || viewports.some(v => String(v.width) === widthFilter), "invalid width");
  assert.ok(localeFilter === undefined || locales.includes(localeFilter), "invalid locale");
  const engines = [chromium, webkit].filter(e => engineFilter === undefined || e.name() === engineFilter);
  const selectedViewports = viewports.filter(v => widthFilter === undefined || String(v.width) === widthFilter);
  const selectedLocales = locales.filter(l => localeFilter === undefined || l === localeFilter);
  const selectedCases = engines.length * selectedViewports.length * selectedLocales.length;
  assert.ok(selectedCases > 0);
  t.diagnostic(JSON.stringify({ selectedCases, fullMatrixCases: 16, engineFilter, widthFilter, localeFilter,
    scope: "real return/catalogues extracted by AST, real client list/rail/CSS; synthetic item and intercepted 503 receipt, no session/DB/Next hydration" }));
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
      allowModerateDarwinPressure: !process.env.CI && process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" });
  capacity();
  const pagePath = "app/(app)/inbox/page.tsx";
  const source = readFileSync(path.join(root, pagePath), "utf8");
  const ast = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const catalogue = ast.statements.filter((node): node is ts.VariableStatement => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === "TOUCHLINE_INBOX_CATALOGUES"));
  const copy = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "getTouchlineInboxCopy");
  const renderers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "renderTouchlineInboxPage");
  assert.equal(catalogue.length, 1); assert.equal(copy.length, 1); assert.equal(renderers.length, 1); assert.ok(renderers[0].body);
  const returns = renderers[0].body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1); assert.ok(returns[0].expression && ts.isJsxElement(returns[0].expression), "extract final JSX, not the server loader");
  const presentationSource = `${catalogue[0].getText(ast)}\n${copy[0].getText(ast)}\nfunction renderInboxPresentation(locale,items){const draftLocalesEnabled=true;const unavailable=false;const copy=getTouchlineInboxCopy(locale,true);${returns[0].getText(ast)}}`;
  assert.doesNotMatch(presentationSource, /createClient|createAdminClient|\.from\(|auth\.getUser/);
  const compiled = transpileFixtureModule(presentationSource, "actual-inbox-presentation.tsx");
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/InboxContentBrowserFixture.tsx", cssPrefix: "inboxcontent",
    requiredSources: ["components/touchline/TouchlineInboxList.tsx", "components/touchline/TouchlineNavigationRail.tsx",
      "components/touchline/TouchlineGlobalNavigation.module.css", "app/(app)/inbox/InboxContent.module.css"],
    mountScript: `const fixture=loadEntry();
      const {Link,TouchlineInboxList,TouchlineNavigationRail,navigationStyles,styles,resolveTouchlineCatalogueLocale}=fixture;
      const exports={};const require=id=>{if(id==='react/jsx-runtime')return fixture.jsxRuntime;throw Error('Unexpected presentation dependency '+id);};
      ${compiled}
      const locale=document.documentElement.lang;
      const content=renderInboxPresentation(locale,fixture.syntheticInboxItems(locale));
      flushSync(()=>root.render(React.createElement(fixture.default,null,content)));
      document.documentElement.dataset.fixtureReady='true';`,
  });
  const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwindRequire("@tailwindcss/node");
  const { Scanner } = tailwindRequire("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles([...bundle.sources, pagePath].filter(f => /\.tsx?$/.test(f)).map(f => ({ content: readFileSync(path.join(root, f), "utf8"), extension: path.extname(f).slice(1) })));
  const globals = path.join(root, "app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  const css = `${compiler.build(candidates)}\n${bundle.css}`;
  const screenshots = mkdtempSync("/private/tmp/touchline-inbox-content-");
  t.diagnostic(`Screenshots: ${screenshots}`);
  const origin = "https://inbox-content.test", publicRoot = realpathSync(path.join(root, "public"));
  let passedCases = 0;
  const clippedCoverage = new Map<string, { direct: number; native: number }>();
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser required");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewport of selectedViewports) for (const locale of selectedLocales) {
        capacity();
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(5000);
          const errors: string[] = [], forbidden: string[] = [], receipts: unknown[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await context.route("**/*", async route => {
            const req = route.request(), url = new URL(req.url());
            if (url.origin !== origin) { forbidden.push(`${req.method()} ${url.origin}${url.pathname}`); return route.abort(); }
            if (req.method() === "POST" && url.pathname === "/api/touchline-central/inbox/read") {
              const payload: unknown = req.postDataJSON(); receipts.push(payload);
              assert.deepEqual(payload, { messageId: "synthetic-inbox-layout-message" });
              return route.fulfill({ status: 503, json: { ok: false, error: "Isolated synthetic receipt unavailable" } });
            }
            if (req.method() !== "GET") { forbidden.push(`${req.method()} ${url.pathname}`); return route.abort(); }
            if (url.pathname === "/inbox") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>` });
            const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) return route.fulfill({ path: asset });
            forbidden.push(url.pathname); return route.abort();
          });
          // Detect the macOS WebKit link-navigation preference without changing
          // it or adding tabindex to production controls.
          const probe = '<a id="probe-link" href="#probe">Link</a><input id="probe-input">';
          await page.setContent(probe); await page.keyboard.press("Tab");
          let forward = "Tab";
          if (!await page.locator("#probe-link").evaluate(node => node === document.activeElement)) {
            assert.equal(engine.name(), "webkit"); await expect(page.locator("#probe-input")).toBeFocused();
            await page.setContent(probe); forward = "Alt+Tab";
            await page.keyboard.press(forward); await expect(page.locator("#probe-link")).toBeFocused();
          }
          const backward = forward === "Tab" ? "Shift+Tab" : "Alt+Shift+Tab";
          await page.goto(`${origin}/inbox?lang=${locale}`);
          await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
          await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
          await page.evaluate(() => document.fonts.ready);
          const main = page.locator("main"), item = main.locator("ol > li"), message = item.locator(":scope > div"), aside = item.locator(":scope > aside");
          const rail = item.locator("../../.."), button = aside.locator("button");
          await expect(main).toHaveCount(1); await expect(item).toHaveCount(1); await expect(button).toHaveCount(1);
          const expectedTitle = (locale === "ar-SA" ? "رسالة اصطناعية لاختبار عرض النص الطويل " : "Mensagem sintética para testar título extenso ").repeat(5);
          const expectedBody = (locale === "ar-SA" ? "نصاختباراصطناعيطويلبدونفواصل" : "SyntheticUnbrokenEditorialBody").repeat(35);
          assert.equal(await message.locator("h2").textContent(), expectedTitle);
          assert.equal(await message.locator("p").textContent(), expectedBody);
          await expect(main.locator("a")).toHaveAttribute("href", `/clubowner?lang=${locale}`);
          const unread = locale === "ar-SA" ? "غير مقروء" : "Não lida";
          await expect(aside.locator("b")).toHaveText(unread);
          await expect(button).toHaveText(locale === "ar-SA" ? "وضع علامة مقروء" : "Marcar como lida");
          if (engine.name() === "webkit" && viewport.width === 1280) {
            const trace = await item.evaluate(async node => {
              const frames = [];
              for (let index = 0; index < 12; index++) {
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                const a = node.children[0].getBoundingClientRect(), b = node.children[1].getBoundingClientRect();
                frames.push({ index, compact: matchMedia("(max-width:1279px)").matches,
                  innerWidth, clientWidth: document.documentElement.clientWidth,
                  columns: getComputedStyle(node).gridTemplateColumns,
                  canvasMinWidth: getComputedStyle(node.parentElement!.parentElement!).minWidth,
                  top: [a.top, b.top], bottom: [a.bottom, b.bottom] });
              }
              return frames;
            });
            t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale, boundaryTrace: trace }));
          }
          const layout = await item.evaluate(node => {
            const [message, aside] = Array.from(node.children) as HTMLElement[];
            const m = message.getBoundingClientRect(), a = aside.getBoundingClientRect(), b = aside.querySelector("button")!.getBoundingClientRect();
            const canvas = node.parentElement!.parentElement!;
            return { compact: matchMedia("(max-width:1279px)").matches, innerWidth, clientWidth: document.documentElement.clientWidth,
              canvasMinWidth: getComputedStyle(canvas).minWidth, canvasFits: canvas.scrollWidth <= canvas.clientWidth + 1,
              columns: getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length,
              display: getComputedStyle(node).display, topAligned: Math.abs(m.top - a.top) < 1,
              separated: m.right <= a.left || a.right <= m.left, below: a.top >= m.bottom - 1, buttonHeight: b.height, buttonWidth: b.width,
              textFits: Array.from(message.querySelectorAll("h2,p")).every(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 && getComputedStyle(el).textOverflow !== "ellipsis"),
              documentFits: document.documentElement.scrollWidth <= innerWidth };
          });
          t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale, initialLayout: layout }));
          assert.equal(layout.display, "grid");
          const compactLayout = layout.canvasMinWidth === "0px" && layout.columns === 1 && layout.below;
          const desktopLayout = layout.canvasMinWidth === "760px" && layout.columns === 2 && layout.topAligned && layout.separated;
          const boundaryCase = engine.name() === "webkit" && viewport.width === 1280;
          if (boundaryCase) {
            // WebKit's nominal1280 boundary produced a stable disagreement
            // between matchMedia and computed CSS. Preserve both observations;
            // accept exactly one complete, usable layout, never mixed geometry.
            // Scrollbar feedback remains an unproven explanation.
            assert.equal(Number(compactLayout) + Number(desktopLayout), 1);
            t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale,
              boundaryContract: { compactLayout, desktopLayout, mediaCompact: layout.compact,
                mediaComputedMismatch: layout.compact !== compactLayout,
                canvasMinWidth: layout.canvasMinWidth, columns: layout.columns } }));
          } else if (viewport.width < 1280) {
            assert.equal(layout.compact, true); assert.equal(compactLayout, true);
          } else {
            assert.equal(layout.compact, false); assert.equal(desktopLayout, true);
          }
          assert.equal(layout.canvasFits, true, "message canvas must not need horizontal panning");
          assert.equal(await rail.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, "message and action fit without horizontal panning");
          assert.ok(layout.buttonHeight >= 44 && layout.buttonWidth >= 44); assert.equal(layout.textFits, true); assert.equal(layout.documentFits, true);
          await expect.poll(() => rail.evaluate(node => getComputedStyle(node).overflowX)).toBe("auto");
          // Deliberate setup scroll places the action vertically in view. The
          // assertion below isolates the rail's reveal: it must not move page Y.
          await page.keyboard.press("Tab");
          await button.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY - 40, behavior: "instant" }));
          const focusGeometry = () => rail.evaluate(node => {
            const target = node.querySelector("aside button") as HTMLElement;
            const b = target.getBoundingClientRect(), r = node.getBoundingClientRect(), style = getComputedStyle(target);
            const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
            const rect = (box: DOMRect) => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height });
            return { rail: rect(r), button: rect(b), scrollLeft: node.scrollLeft,
              scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, clientLeft: node.clientLeft,
              direction: getComputedStyle(node).direction, ring, focused: target === document.activeElement,
              focusVisible: target.matches(":focus-visible"), activeTag: document.activeElement?.tagName,
              clipLeft: Math.max(0, r.left + node.clientLeft), clipRight: Math.min(innerWidth, r.left + node.clientLeft + node.clientWidth),
              page: { x: scrollX, y: scrollY }, viewport: { width: innerWidth, height: innerHeight } };
          });
          const selectedCase = { engine: engine.name(), viewport, locale };
          const coverageKey = `${engine.name()}/${locale}`;
          const coverage = clippedCoverage.get(coverageKey) ?? { direct: 0, native: 0 };
          clippedCoverage.set(coverageKey, coverage);
          const beforeReveal = await focusGeometry();
          t.diagnostic(JSON.stringify({ ...selectedCase, phase: "before-direct-reveal", geometry: beforeReveal }));
          const stable = beforeReveal.page;
          await button.evaluate(node => (node as HTMLElement).focus({ preventScroll: true }));
          await expect(button).toBeFocused();
          await expect.poll(() => rail.evaluate((node, stable) => {
            const active = document.activeElement as HTMLElement, b = active.getBoundingClientRect(), r = node.getBoundingClientRect(), style = getComputedStyle(active);
            const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
            return active.matches(":focus-visible") && ring > 0 && b.left - ring >= Math.max(0, r.left + node.clientLeft) - 1
              && b.right + ring <= Math.min(innerWidth, r.left + node.clientLeft + node.clientWidth) + 1
              && b.top - ring >= 0 && b.bottom + ring <= innerHeight
              && scrollX === stable.x && scrollY === stable.y;
          }, stable)).toBe(true).catch(async error => {
            t.diagnostic(JSON.stringify({ ...selectedCase, phase: "failed-direct-reveal", geometry: await focusGeometry() }));
            throw error;
          });
          const afterReveal = await focusGeometry();
          const gutter = Math.max(7, afterReveal.ring + 1);
          const left = beforeReveal.rail.left + beforeReveal.clientLeft + gutter;
          const right = beforeReveal.rail.left + beforeReveal.clientLeft + beforeReveal.clientWidth - gutter;
          const expectedDelta = beforeReveal.scrollWidth <= beforeReveal.clientWidth ? 0
            : beforeReveal.button.left < left ? beforeReveal.button.left - left
            : beforeReveal.button.right > right ? beforeReveal.button.right - right : 0;
          const clippedBefore = beforeReveal.button.left < beforeReveal.clipLeft - 1 || beforeReveal.button.right > beforeReveal.clipRight + 1;
          t.diagnostic(JSON.stringify({ ...selectedCase, phase: "after-direct-reveal", geometry: afterReveal, expectedDelta, clippedBefore }));
          if (Math.abs(expectedDelta) > 1) assert.notEqual(afterReveal.scrollLeft, beforeReveal.scrollLeft, "a control outside the rail's reveal bounds must scroll its local rail");
          if (expectedDelta === 0) assert.equal(afterReveal.scrollLeft, beforeReveal.scrollLeft, "an already revealed action must not scroll unnecessarily");
          assert.deepEqual(afterReveal.page, stable, "local reveal preserves page X/Y");
          assert.equal(clippedBefore, false, "action is fully available before focus");
          if (clippedBefore) coverage.direct++;
          const before = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-unread.png`);
          await page.screenshot({ path: before, fullPage: true, animations: "disabled" }); t.diagnostic(`Screenshot: ${before}`);
          assert.equal(receipts.length, 0);
          await button.click();
          await expect(main.locator('[role="status"]')).toHaveText(locale === "ar-SA" ? "تعذر تأكيد حالة القراءة." : "Não foi possível confirmar o status de leitura.");
          await expect(button).toBeEnabled(); await expect(aside.locator("b")).toHaveText(unread);
          assert.deepEqual(receipts, [{ messageId: "synthetic-inbox-layout-message" }]);
          assert.equal(new URL(page.url()).pathname, "/inbox", "failed mark-read must not navigate");
          const failed = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-receipt-503.png`);
          await page.screenshot({ path: failed, fullPage: true, animations: "disabled" }); t.diagnostic(`Screenshot: ${failed}`);
          // Additional native-keyboard proof: only the initial sentinel is
          // focused programmatically. Both product controls must be reached in
          // order and reverse order, without per-target focus or manual scroll.
          capacity();
          const beforeSentinel = page.locator("#before-inbox-content"), afterSentinel = page.locator("#after-inbox-content");
          const back = main.locator("a");
          const visibleNativeFocus = async (target: typeof button, label: string) => {
            try {
              await expect(target).toBeFocused();
              await expect.poll(() => target.evaluate(node => {
                const b = node.getBoundingClientRect(), style = getComputedStyle(node);
                const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
                const local = node.closest("aside")?.closest("ol")?.parentElement?.parentElement;
                const r = local?.getBoundingClientRect();
                const left = r && local ? Math.max(0, r.left + local.clientLeft) : 0;
                const right = r && local ? Math.min(innerWidth, r.left + local.clientLeft + local.clientWidth) : innerWidth;
                return node === document.activeElement && node.matches(":focus-visible") && ring > 0
                  && b.left - ring >= left - 1 && b.right + ring <= right + 1
                  && b.top - ring >= -1 && b.bottom + ring <= innerHeight + 1;
              }), { message: `${engine.name()} ${viewport.width} ${locale} ${label}: native focus is completely visible` }).toBe(true);
            } catch (error) {
              const geometry = await target.evaluate(node => {
                const box = node.getBoundingClientRect(), style = getComputedStyle(node);
                const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
                const local = node.closest("aside")?.closest("ol")?.parentElement?.parentElement;
                const railBox = local?.getBoundingClientRect();
                return { tag: node.tagName, text: node.textContent, href: node.getAttribute("href"),
                  box: box.toJSON(), ring, outlinedBounds: { left: box.left - ring, right: box.right + ring, top: box.top - ring, bottom: box.bottom + ring },
                  focused: node === document.activeElement, focusVisible: node.matches(":focus-visible"),
                  activeTag: document.activeElement?.tagName, activeText: document.activeElement?.textContent,
                  transform: style.transform, scrollMarginBlockStart: style.scrollMarginBlockStart, scrollMarginBlockEnd: style.scrollMarginBlockEnd,
                  rail: railBox?.toJSON() ?? null, railScrollLeft: local?.scrollLeft ?? null,
                  clipLeft: railBox && local ? Math.max(0, railBox.left + local.clientLeft) : 0,
                  clipRight: railBox && local ? Math.min(innerWidth, railBox.left + local.clientLeft + local.clientWidth) : innerWidth,
                  page: { x: scrollX, y: scrollY, scrollHeight: document.documentElement.scrollHeight },
                  viewport: { width: innerWidth, height: innerHeight } };
              });
              t.diagnostic(JSON.stringify({ ...selectedCase, phase: "failed-native-target", label, geometry }));
              const capture = path.join(screenshots, `${engine.name()}-${viewport.width}x${viewport.height}-${locale}-${label.replaceAll(" ", "-")}-failed-target.png`);
              await page.screenshot({ path: capture, animations: "disabled" }).then(() => t.diagnostic(`Failed-focus viewport: ${capture}`)).catch(() => undefined);
              throw error;
            }
          };
          await rail.evaluate(node => { node.scrollLeft = 0; });
          await beforeSentinel.focus();
          const beforeNative = await focusGeometry();
          const nativeClipped = beforeNative.button.left < beforeNative.clipLeft - 1 || beforeNative.button.right > beforeNative.clipRight + 1;
          t.diagnostic(JSON.stringify({ ...selectedCase, phase: "before-native-reveal", geometry: beforeNative, clippedBefore: nativeClipped }));
          assert.equal(nativeClipped, false, "action is visible before native traversal");
          await page.keyboard.press(forward);
          await visibleNativeFocus(button, "forward mark-read").catch(async error => {
            t.diagnostic(JSON.stringify({ ...selectedCase, phase: "failed-native-reveal", geometry: await focusGeometry() }));
            throw error;
          });
          const afterNative = await focusGeometry();
          t.diagnostic(JSON.stringify({ ...selectedCase, phase: "after-native-reveal", geometry: afterNative, clippedBefore: nativeClipped }));
          if (nativeClipped) {
            assert.notEqual(afterNative.scrollLeft, beforeNative.scrollLeft, "native traversal must reveal the clipped action through its rail");
            coverage.native++;
          }
          await page.keyboard.press(forward); await visibleNativeFocus(back, "forward return");
          await page.keyboard.press(forward); await expect(afterSentinel).toBeFocused();
          await page.keyboard.press(backward); await visibleNativeFocus(back, "reverse return");
          await page.keyboard.press(backward); await visibleNativeFocus(button, "reverse mark-read");
          await page.keyboard.press(backward); await expect(beforeSentinel).toBeFocused();
          assert.deepEqual(receipts, [{ messageId: "synthetic-inbox-layout-message" }], "keyboard traversal must not activate an action");
          assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
          passedCases++; t.diagnostic(JSON.stringify({ engine: engine.name(), viewport, locale, layout, passedCases }));
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  assert.equal(passedCases, selectedCases);
  const includesResponsiveViewport = selectedViewports.some(viewport => viewport.width < 1280);
  for (const engine of engines) for (const locale of selectedLocales) {
    const coverage = clippedCoverage.get(`${engine.name()}/${locale}`);
    assert.ok(coverage);
    if (includesResponsiveViewport) assert.deepEqual(coverage, { direct: 0, native: 0 },
      `${engine.name()}/${locale}: content and native actions need no horizontal reveal`);
    t.diagnostic(JSON.stringify({ engine: engine.name(), locale, clippedCoverage: coverage,
      responsiveViewportIncluded: includesResponsiveViewport, partial: selectedCases !== 16 }));
  }
});

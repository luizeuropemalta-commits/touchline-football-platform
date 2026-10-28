import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statfsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { normalizeTouchLineAuthReturnTo, normalizeTouchLineLoginLocale } from "../lib/touchlineArena/auth-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const widths = [320, 390, 844, 1280];
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];

test("real footer keeps copyright and its configured icon in one row at every width", {
  skip: process.env.TOUCHLINE_RUN_SITE_FOOTER_BROWSER_TESTS !== "1", timeout: 180_000,
}, async t => {
  const engineFilter = process.env.TOUCHLINE_SITE_FOOTER_ENGINE, widthFilter = process.env.TOUCHLINE_SITE_FOOTER_WIDTH, localeFilter = process.env.TOUCHLINE_SITE_FOOTER_LOCALE;
  assert.ok(engineFilter === undefined || ["chromium", "webkit"].includes(engineFilter));
  assert.ok(widthFilter === undefined || widths.some(w => String(w) === widthFilter));
  assert.ok(localeFilter === undefined || locales.includes(localeFilter));
  const engines = [chromium, webkit].filter(e => !engineFilter || e.name() === engineFilter);
  const selectedWidths = widths.filter(w => !widthFilter || String(w) === widthFilter), selectedLocales = locales.filter(l => !localeFilter || l === localeFilter);
  const selectedCases = engines.length * selectedWidths.length * selectedLocales.length;
  assert.ok(selectedCases > 0);
  t.diagnostic(JSON.stringify({ selectedCases, fullMatrixCases: 64, engineFilter, widthFilter, localeFilter,
    scope: "real footer SSR/CSS Modules, synthetic configured URL; no click/network, Next hydration, locale navigation or official-profile verification" }));
  const capacity = () => {
    // Explicit local operator override; shared helper still enforces disk reserve.
    if (process.platform === "darwin" && !process.env.CI
      && process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1"
      && process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE === "1") {
      requireBrowserCapacity(root, { allowLowDarwinDisk: true });
      return;
    }

    const fs = statfsSync(root); assert.ok(fs.bavail * fs.bsize > 5 * 1024 ** 3);
    assert.equal(execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim(), "1");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25);
  };
  capacity();
  const nextRequire = createRequire(require.resolve("next/package.json"));
  const postcss = nextRequire("postcss"), localByDefault = require("next/dist/compiled/postcss-modules-local-by-default"), scope = require("next/dist/compiled/postcss-modules-scope");
  const mappings: Record<string, { default: Record<string, string> }> = {}, styles: string[] = [];
  for (const name of ["TouchlineGlobalNavigation", "TouchlineSiteFooter"]) {
    const result = postcss([localByDefault({ mode: "local" }), scope({ generateScopedName: (key: string) => `${name}_${key}` })])
      .process(read(`components/touchline/${name}.module.css`), { from: undefined }).sync();
    const classes: Record<string, string> = {};
    result.root.walkRules(":export", (rule: { walkDecls(fn: (decl: {prop: string; value: string}) => void): void; remove(): void }) => {
      rule.walkDecls(decl => { classes[decl.prop] = decl.value; }); rule.remove();
    });
    assert.ok(Object.keys(classes).length); mappings[`./${name}.module.css`] = { default: classes }; styles.push(result.root.toString());
  }
  const exports: { default?: React.ComponentType<{locale: string; draftLocalesEnabled: boolean; instagramUrl?: string}> } = {};
  vm.runInNewContext(ts.transpileModule(read("components/touchline/TouchlineSiteFooter.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, URL, require: (id: string) => {
    if (Object.hasOwn(mappings, id)) return mappings[id];
    if (id.endsWith("catalogue-locale")) return { resolveTouchlineCatalogueLocale };
    if (id.endsWith("auth-i18n")) return { normalizeTouchLineAuthReturnTo, normalizeTouchLineLoginLocale };
    if (id.endsWith("root-locale")) return { resolveTouchLinePresentationLocale };
    if (id.endsWith("SiteLocaleReleaseContext")) return { useSiteLocaleRelease: () => false };
    if (id === "next/navigation") return { usePathname: () => null, useSearchParams: () => null };
    assert.ok(["react", "react/jsx-runtime", "lucide-react"].includes(id), `unexpected footer dependency: ${id}`); return require(id);
  } });
  assert.ok(exports.default);
  const css = `${read("node_modules/tailwindcss/preflight.css")}\n${read("app/globals.css").replace(/^@(import|source)[^;]*;\s*/gm, "")}\n${styles.join("\n")}`;
  const screenshotDir = mkdtempSync("/private/tmp/touchline-site-footer-"); t.diagnostic(`Screenshots: ${screenshotDir}`);
  let passedCases = 0;
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()));
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const width of selectedWidths) for (const locale of selectedLocales) {
        capacity();
        const context = await browser.newContext({ viewport: { width, height: 390 }, serviceWorkers: "block", reducedMotion: "reduce" });
        try {
          const unexpected: string[] = [], errors: string[] = [];
          await context.route("**/*", async route => { unexpected.push(route.request().url()); await route.abort(); });
          const page = await context.newPage(); page.setDefaultTimeout(5000); page.on("pageerror", error => errors.push(error.message));
          const probe = '<a id="probe-link" href="#probe">Link</a><input id="probe-input">';
          await page.setContent(probe); await page.keyboard.press("Tab"); let forward = "Tab";
          if (!await page.locator("#probe-link").evaluate(el => el === document.activeElement)) {
            assert.equal(engine.name(), "webkit"); await expect(page.locator("#probe-input")).toBeFocused();
            await page.setContent(probe); forward = "Alt+Tab"; await page.keyboard.press(forward); await expect(page.locator("#probe-link")).toBeFocused();
          }
          const footer = renderToStaticMarkup(React.createElement(exports.default, { locale, draftLocalesEnabled: true, instagramUrl: "https://www.instagram.com/touchline_test/" }));
          await page.setContent(`<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${footer}</body></html>`);
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator("footer")).toHaveCount(1); await expect(page.locator("footer a")).toHaveCount(1);
          await expect(page.locator("footer")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
          await expect(page.locator("footer a")).toHaveAttribute("href", "https://www.instagram.com/touchline_test/");
          await page.keyboard.press(forward); await expect(page.locator("footer a")).toBeFocused();
          const result = await page.locator("footer").evaluate(node => {
            const label = node.querySelector("small")!, link = node.querySelector("a")!;
            const frame = node.getBoundingClientRect(), text = label.getBoundingClientRect(), icon = link.getBoundingClientRect();
            const style = getComputedStyle(link), ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
            const range = document.createRange(); range.selectNodeContents(label);
            return { sameRow: Math.abs(text.top + text.height / 2 - icon.top - icon.height / 2) <= 2,
              noCollision: getComputedStyle(node).direction === "rtl" ? icon.right + 19 <= text.left : text.right + 19 <= icon.left,
              width: icon.width, height: icon.height, layoutWidth: link.offsetWidth, layoutHeight: link.offsetHeight, font: parseFloat(getComputedStyle(label).fontSize),
              allTextInside: Array.from(range.getClientRects()).every(r => r.left >= text.left - 1 && r.right <= text.right + 1 && r.top >= text.top - 1 && r.bottom <= text.bottom + 1),
              focused: link.matches(":focus-visible") && ring > 0,
              ringInside: icon.left - ring >= frame.left && icon.right + ring <= frame.right && icon.top - ring >= frame.top && icon.bottom + ring <= frame.bottom,
              noOverflow: document.documentElement.scrollWidth <= innerWidth, scrollX, scrollY };
          });
          assert.equal(result.sameRow, true); assert.equal(result.noCollision, true); // translateY during focus can produce 43.999996px from a 44px box.
          // Require the actual layout target and bound visual rounding separately.
          assert.ok(result.layoutWidth >= 44 && result.layoutHeight >= 44);
          assert.ok(result.width >= 44 - .001 && result.height >= 44 - .001, JSON.stringify({ engine: engine.name(), width, locale, result }));
          assert.equal(result.font, 12); assert.equal(result.allTextInside, true); assert.equal(result.focused, true); assert.equal(result.ringInside, true);
          assert.equal(result.noOverflow, true); assert.equal(result.scrollX, 0); assert.equal(result.scrollY, 0);
          const screenshot = path.join(screenshotDir, `${engine.name()}-${width}-${locale}.png`);
          await page.screenshot({ path: screenshot, animations: "disabled" }); t.diagnostic(`Screenshot: ${screenshot}`);
          assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); passedCases++;
          t.diagnostic(JSON.stringify({ engine: engine.name(), width, locale, result, passedCases }));
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  assert.equal(passedCases, selectedCases);
});

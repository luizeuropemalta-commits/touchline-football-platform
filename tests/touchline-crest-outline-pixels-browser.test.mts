import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync, statfsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webkit, chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://crest-outline.invalid";

function realFilterMarkup() {
  const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
  const fragment = layout.match(/<filter id="touchline-proportional-crest-outline"[\s\S]*?<\/filter>/)?.[0];
  assert.ok(fragment, "Actual root filter required");
  const source = ts.transpileModule(`export default function Filter(){return <svg><defs>${fragment}</defs></svg>;}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {} as { default: () => ReactElement };
  runInNewContext(source, { exports, require(name: string) {
    assert.equal(name, "react/jsx-runtime"); return jsx;
  } });
  return renderToStaticMarkup(exports.default());
}

test("root crest SVG fragment is serialized by React with actual SVG attribute names", () => {
  const markup = realFilterMarkup();
  assert.match(markup, /flood-color="#ffffff"/);
  assert.match(markup, /flood-opacity="1"/);
  assert.match(markup, /color-interpolation-filters="sRGB"/);
  assert.doesNotMatch(markup, /floodColor=|floodOpacity=|colorInterpolationFilters=/);
  assert.match(markup, /primitiveUnits="objectBoundingBox"/);
});

test("real card crests have visible solid white contour at small and enlarged scales", {
  skip: process.env.TOUCHLINE_RUN_CREST_OUTLINE_BROWSER !== "1", timeout: 90_000,
}, async t => {
  const allCases = ["tottenham-160", "tottenham-430", "forest-160", "forest-430"];
  const selectedCases = process.env.TOUCHLINE_CREST_OUTLINE_CASES === undefined
    ? allCases : process.env.TOUCHLINE_CREST_OUTLINE_CASES.split(",");
  assert.ok(selectedCases.length > 0 && selectedCases.every(value => allCases.includes(value)), "explicit valid crest cases required");
  assert.equal(new Set(selectedCases).size, selectedCases.length, "duplicate crest cases rejected");
  const capacity = () => {
    const disk = statfsSync(root), freeBytes = disk.bavail * disk.bsize;
    assert.ok(freeBytes > 5 * 1024 ** 3, "stop own test below 5 GiB");
    const output = execFileSync("memory_pressure", { encoding: "utf8" });
    const freeMemory = Number(output.match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(freeMemory) && freeMemory >= 25, "stop own test under memory pressure");
    return { freeBytes, freeMemory };
  };
  const initialCapacity = capacity();
  const engineName = process.env.TOUCHLINE_CREST_OUTLINE_ENGINE ?? "webkit";
  assert.ok(["webkit", "chromium"].includes(engineName));
  const engine = engineName === "webkit" ? webkit : chromium;
  assert.ok(existsSync(engine.executablePath()), "Installed browser required; never download implicitly");
  const output = process.env.TOUCHLINE_CREST_OUTLINE_EVIDENCE_DIR;
  assert.ok(output && path.isAbsolute(output), "Explicit absolute evidence directory required");
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/CrestOutlineBrowserFixture.tsx", cssPrefix: "crest",
    requiredSources: ["components/touchline/cards/TouchlineCoachCard.tsx", "components/touchline/cards/TouchlineEliteExactCard.tsx"],
    mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default)));" });
  const svg = realFilterMarkup().replace('<svg>', '<svg width="0" height="0" aria-hidden="true">');
  const globals = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const css = readFileSync(path.join(root, "app/touchline-crest-visibility.css"), "utf8");
  const preflight = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  const html = `<!doctype html><html><head><style>${preflight}\n${globals}\n${bundle.css}\n${css}</style></head><body>${svg}<div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  capacity();
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1600 }, deviceScaleFactor: 2,
      reducedMotion: "reduce", serviceWorkers: "block" });
    const denied: string[] = [], errors: string[] = [];
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET" || url.origin !== origin) { denied.push(route.request().url()); await route.abort(); return; }
      if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html", body: html }); return; }
      const candidate = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
      if (candidate.startsWith(publicRoot + path.sep) && existsSync(candidate) && statSync(candidate).isFile()
        && realpathSync(candidate).startsWith(publicRoot + path.sep)) { await route.fulfill({ path: candidate }); return; }
      denied.push(route.request().url()); await route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${origin}/fixture`);
    const evidence: unknown[] = [];
    mkdirSync(output, { recursive: true });
    for (const club of ["tottenham", "forest"]) for (const size of [160, 430]) {
      if (!selectedCases.includes(`${club}-${size}`)) continue;
      capacity();
      const card = page.locator(`[data-case="${club}-${size}"]`);
      const crest = card.locator('img[data-touchline-card-crest="true"]').first();
      await crest.waitFor({ state: "visible" });
      await page.waitForFunction(() => [...document.images].every(i => i.complete));
      assert.ok(await crest.evaluate(i => (i as HTMLImageElement).naturalWidth > 0));
      const bounds = await crest.boundingBox(); assert.ok(bounds && bounds.width > 0);
      const presentation = club === "tottenham" ? await card.locator("[data-coach-card-display]").getAttribute("data-coach-card-display") : "player";
      const shellBounds = await card.boundingBox();
      if (club === "tottenham") {
        assert.equal(presentation, size === 160 ? "compact" : "default");
        if (size === 160) assert.ok(bounds.width >= 9 && bounds.width <= 28.1, "real compact crest clamp");
        else assert.ok(bounds.width > 28.1, "default crest differs from compact presentation");
      }
      const clip = { x: Math.max(0, bounds.x - 4), y: Math.max(0, bounds.y - 4), width: bounds.width + 8, height: bounds.height + 8 };
      const before = await page.screenshot({ clip, animations: "disabled" });
      // Comparison control alters only the test document, never product source/assets.
      const filtered = await crest.evaluate(i => getComputedStyle(i).filter);
      assert.ok(filtered.includes("touchline-proportional-crest-outline"), "real outline filter must be active");
      const prior = await crest.evaluate(i => {
        const style = (i as HTMLElement).style;
        const saved = { value: style.getPropertyValue("filter"), priority: style.getPropertyPriority("filter") };
        style.setProperty("filter", "none", "important");
        return saved;
      });
      let without: Buffer;
      try {
        await expect(crest).toHaveCSS("filter", "none");
        assert.equal(await crest.evaluate(i => getComputedStyle(i).filter), "none", "control must actually disable filter");
        without = await page.screenshot({ clip, animations: "disabled" });
      } finally {
        await crest.evaluate((i, saved) => {
          const style = (i as HTMLElement).style;
          if (saved.value) style.setProperty("filter", saved.value, saved.priority);
          else style.removeProperty("filter");
        }, prior);
      }
      await expect(crest).toHaveCSS("filter", filtered);
      assert.equal(await crest.evaluate(i => getComputedStyle(i).filter), filtered, "restore real filter after control");
      const a = await sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const b = await sharp(without).removeAlpha().raw().toBuffer();
      let whiteGain = 0, farEdgeChanges = 0;
      for (let p = 0; p < a.info.width * a.info.height; p++) {
        const k = p * 3, diff = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[k + c] - b[k + c])));
        if (diff < 20) continue;
        if (Math.min(a.data[k], a.data[k + 1], a.data[k + 2]) > 210) whiteGain++;
        const x = p % a.info.width, y = Math.floor(p / a.info.width);
        if (x < 2 || y < 2 || x >= a.info.width - 2 || y >= a.info.height - 2) farEdgeChanges++;
      }
      writeFileSync(path.join(output, `${engineName}-${club}-${size}-outline.png`), before);
      writeFileSync(path.join(output, `${engineName}-${club}-${size}-control.png`), without);
      evidence.push({ club, size, presentation, shellBounds, bounds, filtered, controlFilter: "none", whiteGain, farEdgeChanges });
      writeFileSync(path.join(output, `${engineName}-evidence.json`), JSON.stringify({ selectedCases, evidence, denied, errors, sources: bundle.sources, initialCapacity, status: "in-progress" }, null, 2));
      assert.ok(whiteGain > 0, `${club}/${size}: no visible white contour pixels`);
      assert.equal(farEdgeChanges, 0, `${club}/${size}: effect reaches crop border`);
    }
    await page.screenshot({ path: path.join(output, `${engineName}-cards.png`), fullPage: true, animations: "disabled" });
    writeFileSync(path.join(output, `${engineName}-evidence.json`), JSON.stringify({ selectedCases, evidence, denied, errors, sources: bundle.sources, initialCapacity, finalCapacity: capacity() }, null, 2));
    assert.deepEqual(errors, []); assert.deepEqual(denied, []);
  } finally { await browser.close(); }
});

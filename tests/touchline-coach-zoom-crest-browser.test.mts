import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const enabled = process.env.TOUCHLINE_RUN_COACH_CREST_BROWSER_TESTS === "1";

test("real player and coach zoom crests match on desktop and phone without shrinking compact cards", { skip: !enabled, timeout: 120_000 }, async t => {
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
    allowLowDarwinDisk: process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI });
  capacity();
  const output = mkdtempSync(path.join(tmpdir(), "touchline-coach-crest-"));
  // Release the compiler graph before launching one browser at a time.
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import { writeFileSync, readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import { bundleIsolatedBrowserFixture } from './tests/helpers/touchline-isolated-browser-bundle.mts';
    const bundle=bundleIsolatedBrowserFixture({entryPath:'tests/helpers/coach-zoom-crest-fixture.tsx',
      requiredSources:['components/touchline/cards/TouchlineEliteExactCard.tsx','components/touchline/cards/TouchlineCoachCard.tsx','components/touchline/cards/TouchlineCoachCardZoom.tsx','components/touchline/cards/TouchlineCardZoom.tsx'],
      mountScript:'flushSync(()=>root.render(React.createElement(loadEntry().default)));'});
    writeFileSync(process.argv[1]+'/bundle.json',JSON.stringify(bundle));
    writeFileSync(process.argv[1]+'/sources.json',JSON.stringify(Object.fromEntries([...bundle.sources,'app/globals.css','node_modules/tailwindcss/preflight.css'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),null,2));
  `, output], { cwd: root, timeout: 30_000, stdio: "pipe" });
  const bundle = JSON.parse(readFileSync(path.join(output, "bundle.json"), "utf8")) as { script: string; css: string };
  const globalCss = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const publicRoot = realpathSync(path.join(root, "public"));
  const results: unknown[] = [];
  for (const engine of [chromium, webkit]) {
    capacity(); assert.ok(existsSync(engine.executablePath()));
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ serviceWorkers: "block", reducedMotion: "reduce" });
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      const origin = "https://coach-crest.test";
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET" || url.origin !== origin) return route.abort();
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<meta charset="utf-8"><style>${globalCss}${bundle.css}body{margin:0;background:#07120e;color:white;font:14px Arial}</style><div id="root"></div>` });
        const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) {
          const extension = path.extname(asset).toLowerCase();
          const contentType = extension === ".json" ? "application/json" : extension === ".svg" ? "image/svg+xml" : `image/${extension.slice(1)}`;
          return route.fulfill({ contentType, body: readFileSync(asset) });
        }
        return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' });
      });
      for (const [width, height] of [[1280, 900], [390, 900], [844, 390]]) {
        await page.setViewportSize({ width, height });
        await page.goto(origin);
        await page.addScriptTag({ content: `(() => {${bundle.script}})()` });
        const dimensions: Record<string, { card: number; crest: number; height: number; source: string }> = {};
        const compact = page.locator('[data-fixture-kind="coach"] [data-touchline-card-crest="true"]');
        await expect(compact).toBeVisible();
        const initialCompactWidth = (await compact.boundingBox())!.width;
        for (const kind of ["player", "coach"]) {
          await page.locator(`[data-fixture-kind="${kind}"] [data-touchline-card-zoom="trigger"]`).click();
          const expanded = page.locator('[data-card-zoom="expanded"]');
          await expect(expanded).toBeVisible();
          const crest = expanded.locator('[data-touchline-card-crest="true"]');
          await expect.poll(() => crest.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
          if (kind === "coach") await expect(expanded.locator('[data-coach-card-display="zoom"]')).toHaveCount(1);
          await expect.poll(() => crest.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(0);
          dimensions[kind] = await expanded.evaluate(node => {
            const image = node.querySelector<HTMLImageElement>('[data-touchline-card-crest="true"]')!;
            const rect = image.getBoundingClientRect();
            return { card: node.getBoundingClientRect().width, crest: rect.width, height: rect.height, source: new URL(image.src).pathname };
          });
          await page.screenshot({ path: path.join(output, `${engine.name()}-${width}x${height}-${kind}.png`), fullPage: true, animations: "disabled" });
          await page.keyboard.press("Escape");
          await expect(expanded).toHaveCount(0);
        }
        t.diagnostic(JSON.stringify({ engine: engine.name(), viewport: width, dimensions, output }));
        assert.ok(Math.abs(dimensions.player.card - dimensions.coach.card) < .1, "same modal card width");
        assert.ok(Math.abs(dimensions.player.crest - dimensions.coach.crest) < .2, "visible image widths match");
        assert.ok(Math.abs(dimensions.player.height - dimensions.coach.height) < .2, "visible image heights match");
        assert.equal(dimensions.player.source, dimensions.coach.source, "same local crest artwork including transparent padding");
        assert.ok(Math.abs(dimensions.coach.crest / dimensions.coach.card - 80.64 / 430) < .001);
        assert.ok(Math.abs((await compact.boundingBox())!.width - initialCompactWidth) < .1, "closing zoom preserves normal card");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        results.push({ engine: engine.name(), viewport: { width, height }, dimensions });
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  writeFileSync(path.join(output, "measurements.json"), JSON.stringify(results, null, 2));
  t.diagnostic(`Real component screenshots, dimensions and source hashes: ${output}`);
  t.diagnostic(JSON.stringify(results));
});

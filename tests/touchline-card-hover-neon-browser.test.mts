import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const enabled = process.env.TOUCHLINE_RUN_CARD_NEON_BROWSER_TESTS === "1";

test("real cards light only on pointer hover, animate their perimeter and never duplicate frame bitmap", { skip: !enabled, timeout: 240_000 }, async t => {
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
    allowLowDarwinDisk: process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI });
  capacity();
  const output = mkdtempSync(path.join(tmpdir(), "touchline-hover-neon-"));
  // Release the compiler graph before launching one browser at a time.
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import { writeFileSync, readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import { bundleIsolatedBrowserFixture } from './tests/helpers/touchline-isolated-browser-bundle.mts';
    const bundle=bundleIsolatedBrowserFixture({entryPath:'tests/helpers/card-hover-neon-fixture.tsx',
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
  const requestedEngine = process.env.TOUCHLINE_NEON_ENGINE;
  assert.ok(!requestedEngine || ["chromium", "webkit"].includes(requestedEngine), "unknown neon browser shard");
  const requestedTier = process.env.TOUCHLINE_NEON_TIER;
  assert.ok(!requestedTier || ["ruby-red", "sapphire-blue", "amethyst-purple", "radiant-gold", "emerald-green", "clear-diamond", "diamond-gold"].includes(requestedTier), "unknown neon tier shard");
  for (const engine of [chromium, webkit].filter(engine => !requestedEngine || engine.name() === requestedEngine)) {
    capacity(); assert.ok(existsSync(engine.executablePath()));
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ serviceWorkers: "block", reducedMotion: "no-preference" });
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
      const cases = ["ruby-red", "sapphire-blue", "amethyst-purple", "radiant-gold", "emerald-green", "clear-diamond", "diamond-gold"].map(tier=>({tier,club:"Arsenal"}));
      cases.push({tier:"sapphire-blue",club:"Tottenham Hotspur"},{tier:"sapphire-blue",club:"Manchester City"},{tier:"emerald-green",club:"Chelsea"});
      const selectedCases = requestedTier ? cases.filter(entry => entry.tier === requestedTier) : cases;
      for (const {tier,club} of (process.env.TOUCHLINE_NEON_TOUCH_ONLY === "1" ? [] : process.env.TOUCHLINE_NEON_COMPACT_ONLY === "1" ? selectedCases.filter(entry=>entry.tier==="sapphire-blue"&&entry.club==="Arsenal") : selectedCases)) {
        t.diagnostic(JSON.stringify({ engine: engine.name(), tier, club, stage: "start" }));
        const [width,height]=[1280,900];
        await page.setViewportSize({ width, height });
        await page.goto(`${origin}/?tier=${tier}&club=${encodeURIComponent(club)}`);
        await page.addScriptTag({ content: `(() => {${bundle.script}})()` });
        const dimensions: Record<string, { card: number; crest: number; height: number; source: string }> = {};
        const compact = page.locator('[data-fixture-kind="coach"] [data-touchline-card-crest="true"]');
        await expect(compact).toBeVisible();
        const initialCompactWidth = (await compact.boundingBox())!.width;
        for (const kind of ["player", "coach"]) {
          const small = page.locator(`[data-fixture-kind="${kind}"] .touchline-card-surface`).first();
          const smallTrace = small.locator('[data-touchline-card-neon-trace="true"]');
          for (let entry = 0; entry < 2; entry++) {
            await page.mouse.move(1, 1);
            await expect.poll(() => smallTrace.evaluate(node => getComputedStyle(node).opacity)).toBe("0");
            await small.hover();
            await expect.poll(() => smallTrace.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
            assert.equal(await small.evaluate(node => getComputedStyle(node, "::before").content), "none");
            if(kind === "player") await expect.poll(() => small.evaluate(node => {
              const image=node.querySelector('[data-touchline-card-frame="true"]')!.getBoundingClientRect();
              const trace=node.querySelector('[data-touchline-card-neon-trace="true"]')!.getBoundingClientRect();
              return Math.max(Math.abs(image.width-trace.width),Math.abs(image.height-trace.height));
            })).toBeLessThan(.25);

            await page.screenshot({path:path.join(output, `${engine.name()}-${club}-${tier}-${kind}-small-hover-${entry}.png`), fullPage:true});
          }
          await page.locator(`[data-fixture-kind="${kind}"] [data-touchline-card-zoom="trigger"]`).click();
          const expanded = page.locator('[data-card-zoom="expanded"]');
          await expect(expanded).toBeVisible();
          const surface = expanded.locator('.touchline-card-surface').first();
          const trace = surface.locator('[data-touchline-card-neon-trace="true"]');
          const run = trace.locator('[data-touchline-card-neon-trace-run="true"]');
          await page.mouse.move(1, 1);
          await expect.poll(() => trace.evaluate(node => getComputedStyle(node).opacity)).toBe("0");
          assert.equal(await surface.evaluate(node => getComputedStyle(node, "::before").content), "none", "no duplicate bitmap layer");
          await surface.hover();
          try {
            await expect.poll(() => trace.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
          } catch (error) {
            t.diagnostic(JSON.stringify({ engine: engine.name(), tier, club, kind, hoverFailure: await surface.evaluate(node => {
              const trace = node.querySelector('[data-touchline-card-neon-trace="true"]')!;
              const rect = node.getBoundingClientRect();
              return { hover: node.matches(":hover"), motion: node.getAttribute("data-card-motion"),
                rect: rect.toJSON(), opacity: getComputedStyle(trace).opacity,
                fineHover: matchMedia("(hover: hover) and (pointer: fine)").matches,
                topAtCenter: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML.slice(0, 500) };
            }) }));
            await page.screenshot({path:path.join(output, `${engine.name()}-${club}-${tier}-${kind}-hover-failure.png`), fullPage:true});
            throw error;
          }
          assert.notEqual(await trace.evaluate(node => getComputedStyle(node).display), "none");
          await expect.poll(() => run.evaluate(node => node.getAnimations()[0]?.playState)).toBe("running");
          assert.equal(await run.evaluate(node => getComputedStyle(node).animationDuration), "2s");
          assert.equal(await run.evaluate(node => getComputedStyle(node).stroke), await trace.evaluate(node => getComputedStyle(node).color), "neon retains its canonical tier colour");
          const before = await run.evaluate(node => getComputedStyle(node).strokeDashoffset);
          await page.waitForTimeout(180);
          const after = await run.evaluate(node => getComputedStyle(node).strokeDashoffset);
          assert.notEqual(after, before, "perimeter light advances");
          await page.screenshot({path:path.join(output, `${engine.name()}-${club}-${tier}-${kind}-hover.png`), fullPage:true});
          await page.mouse.move(1, 1);
          await expect.poll(() => trace.evaluate(node => getComputedStyle(node).opacity)).toBe("0");
          await page.screenshot({path:path.join(output, `${engine.name()}-${club}-${tier}-${kind}-rest.png`), fullPage:true});
          const crest = expanded.locator('[data-touchline-card-crest="true"]');
          await expect.poll(() => crest.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
          if (kind === "coach") await expect(expanded.locator('[data-coach-card-display="zoom"]')).toHaveCount(1);
          await expect.poll(() => crest.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(0);
          dimensions[kind] = await expanded.evaluate(node => {
            const image = node.querySelector<HTMLImageElement>('[data-touchline-card-crest="true"]')!;
            const rect = image.getBoundingClientRect();
            return { card: node.getBoundingClientRect().width, crest: rect.width, height: rect.height, source: new URL(image.src).pathname };
          });
          await page.screenshot({ path: path.join(output, `${engine.name()}-${club}-${tier}-${width}x${height}-${kind}.png`), fullPage: true, animations: "disabled" });
          await page.keyboard.press("Escape");
          await expect(expanded).toHaveCount(0);
        }
        t.diagnostic(JSON.stringify({ engine: engine.name(), viewport: width, dimensions, output }));
        assert.ok(Math.abs(dimensions.player.card - dimensions.coach.card) < .1, "same modal card width");
        assert.ok(Math.abs(dimensions.player.crest - dimensions.coach.crest) < .2, "visible image widths match");
        assert.ok(Math.abs(dimensions.player.height - dimensions.coach.height) < .2, "visible image heights match");
        if (club === "Arsenal") assert.equal(dimensions.player.source, dimensions.coach.source, "same local crest artwork including transparent padding");
        assert.ok(Math.abs(dimensions.coach.crest / dimensions.coach.card - 80.64 / 430) < .001);
        assert.ok(Math.abs((await compact.boundingBox())!.width - initialCompactWidth) < .1, "closing zoom preserves normal card");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        results.push({ engine: engine.name(), tier, club, viewport: { width, height }, dimensions });
      }
      await page.emulateMedia({reducedMotion:"reduce"});
      await page.goto(origin);
      await page.addScriptTag({content:`(() => {${bundle.script}})()`});
      const reduced = page.locator('[data-fixture-kind="player"] .touchline-card-surface').first();
      await reduced.hover();
      assert.equal(await reduced.locator('[data-touchline-card-neon-trace-run="true"]').evaluate(node => getComputedStyle(node).animationName), "none");
      const touch = await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:"block"});
      // Reuse the same isolated asset routing, without an app/local server.
      await touch.route("**/*", async route => {
        const url = new URL(route.request().url());
        if(url.origin!==origin || route.request().method()!=="GET") return route.abort();
        if(url.pathname==="/") return route.fulfill({contentType:"text/html",body:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalCss}${bundle.css}body{background:#07120e;color:white}</style><div id="root"></div>`});
        const asset=path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if(asset.startsWith(publicRoot+path.sep)&&existsSync(asset)&&statSync(asset).isFile()&&realpathSync(asset).startsWith(publicRoot+path.sep)) return route.fulfill({body:readFileSync(asset)});
        return route.fulfill({status:503,contentType:"application/json",body:'{"ok":false}'});
      });
      await touch.goto(origin);
      await touch.addScriptTag({content:`(() => {${bundle.script}})()`});
      await touch.screenshot({path:path.join(output,`${engine.name()}-touch-before.png`),fullPage:true});
      t.diagnostic(`Touch fixture ${output}`);
      for(const kind of ["player","coach"]){
        await touch.locator(`[data-fixture-kind="${kind}"] [data-touchline-card-zoom="trigger"]`).tap();
        const surface=touch.locator('[data-card-zoom="expanded"] .touchline-card-surface').first();
        await expect(surface).toBeVisible();
        assert.equal(await surface.locator('[data-touchline-card-neon-trace="true"]').evaluate(node=>getComputedStyle(node).opacity),"0","touch/zoom cannot leave neon lit");
        await touch.screenshot({path:path.join(output,`${engine.name()}-${kind}-touch.png`),fullPage:true});
        await touch.keyboard.press("Escape");
      }
      await touch.close();
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  writeFileSync(path.join(output, "measurements.json"), JSON.stringify(results, null, 2));
  t.diagnostic(`Real component screenshots, dimensions and source hashes: ${output}`);
  t.diagnostic(JSON.stringify(results));
});

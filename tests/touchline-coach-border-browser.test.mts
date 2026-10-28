import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
// No backend or authenticated state: exercises the actual card, frame assets and CSS.
test("coach frames keep one silhouette and purchase text below the art in every tier and size", {
  skip: process.env.TOUCHLINE_RUN_COACH_BORDER_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const capacity = () => requireBrowserCapacity(root, { allowLowDarwinDisk: process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI });
  capacity();
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/cards/TouchlineCoachCard.tsx",
    requiredSources: ["components/touchline/cards/TouchlineCoachCard.tsx", "components/touchline/cards/TouchlineCoachCard.module.css"],
    mountScript: `window.renderCoach=(props)=>flushSync(()=>root.render(React.createElement('div',{style:{width:props.width,margin:24}},React.createElement(loadEntry().default,{...props,coach:null,slot:{cardTier:props.tier,status:'awaiting-verified-coach',touchlinePoints:null},clubName:'Arsenal FC',clubLogoUrl:'/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png',countryCode3:'ENG',locale:'pt-BR',acquisitionPrice:{label:'Valor de contratação',valueTc:10000000},forceNeonActive:true,enableInteractiveNeon:false,showLeadershipCrown:false,assetLoading:'eager',frameLoading:'eager'}))));`,
  });
  const globalCss = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const preflight = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  const screenshots = mkdtempSync("/private/tmp/touchline-coach-borders-");
  t.diagnostic(`Screenshots: ${screenshots}`);
  const tiers = ["ruby-red", "sapphire-blue", "emerald-green", "amethyst-purple", "clear-diamond", "radiant-gold", "diamond-gold"];
  for (const engine of [chromium, webkit]) {
    capacity();
    const browser = await engine.launch({ headless: true });
    t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
    try {
      const context = await browser.newContext({ viewport: { width: 600, height: 850 }, deviceScaleFactor: 2, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage(), errors: string[] = [], unexpected: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      const safe = (value: string) => value.replace(/<\/script/gi, "<\\/script");
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === "https://coach-border.test" && route.request().method() === "GET") {
          if (url.pathname === "/fixture") {
            await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}\n${globalCss}\n${bundle.css}\nbody{background:#07110e}</style></head><body><div id="root"></div><script>${safe(bundle.script)}</script></body></html>` }); return;
          }
          const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) {
            await route.fulfill({ path: file }); return;
          }
        }
        unexpected.push(`${route.request().method()} ${url.pathname}`); await route.abort();
      });
      await page.goto("https://coach-border.test/fixture");
      for (const tier of tiers) for (const width of [72, 180, 340, 430]) {
        await page.setViewportSize({ width: width <= 340 ? 390 : 1280, height: 850 });
        const props = { tier, width, displayMode: width === 72 ? "compact" : "default", optimizeForLiveCompact: width === 72 };
        await page.evaluate(p => (window as unknown as { renderCoach: (props: typeof p) => void }).renderCoach(p), props);
        const card = page.locator('[data-coach-card-art="official-coach-tier"]');
        // Flush effects from the changed tier before observing its atomic reveal.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
        await expect(card).toHaveAttribute("data-coach-frame-ready", "true");
        await expect(card.locator('[data-coach-card-inner="true"]')).toHaveCSS("opacity", "1");
        const waitingName = card.locator('[data-coach-name-pending="true"] > strong');
        await expect(waitingName).toHaveText("Aguardando treinador");
        assert.ok(await waitingName.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${tier}/${width}: waiting label fits without clipped letters`);
        const box = await card.evaluate(el => {
          const frame = el.querySelector<HTMLImageElement>('[data-touchline-card-frame]')!;
          const price = el.querySelector<HTMLElement>('[data-coach-signing-value]')!;
          const b = el.getBoundingClientRect(), f = frame.getBoundingClientRect(), p = price.getBoundingClientRect();
          const paintedHeight = Math.min(f.height, f.width * frame.naturalHeight / frame.naturalWidth);
          const before = getComputedStyle(el, "::before");
          return { width:b.width, height:b.height, bottom:b.bottom, priceTop:p.top, priceBottom:p.bottom, priceWidth:p.width, priceScrollWidth:price.scrollWidth, artBottom:f.top+(f.height+paintedHeight)/2,
            fit:getComputedStyle(frame).objectFit, pseudoContent:before.content, pseudoImage:before.backgroundImage, border:before.borderWidth, shadow:before.boxShadow,
            outsideInner: !price.closest('[data-coach-card-inner]'), ratio:frame.naturalWidth/frame.naturalHeight };
        });
        assert.equal(box.fit, "contain");
        assert.equal(box.pseudoContent, "none", "removed duplicate frame must not return");
        assert.equal(box.pseudoImage, "none");
        assert.equal(box.border, "0px"); assert.equal(box.shadow, "none");
        assert.ok(Math.abs(box.ratio - .75) < .01, `${tier}: normalized artwork`);
        assert.ok(box.outsideInner && box.priceTop >= box.artBottom - .1, `${tier}/${width}: price cannot cover bottom gem`);
        assert.ok(box.priceBottom <= box.bottom + .1 && box.priceScrollWidth <= box.priceWidth + 1, `${tier}/${width}: caption stays inside shell`);
        assert.ok(Math.abs(box.height / box.width - 1.5) < .01, "pitch footprint unchanged");
        if (width === 340 || width === 72) await page.screenshot({ path: path.join(screenshots, `${engine.name()}-${tier}-${width}.png`) });
      }
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      await context.close();
    } finally { await browser.close(); }
  }
});

import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://release-fixture.test";
const enabled = process.env.TOUCHLINE_RUN_RELEASE_BROWSER_TESTS === "1";
const engineName = process.env.TOUCHLINE_RELEASE_BROWSER_ENGINE ?? "chromium";
assert.ok(engineName === "chromium" || engineName === "webkit", "unknown Release fixture browser");
const engine = engineName === "webkit" ? webkit : chromium;

test("isolated Release review: original card, no-write cancel/Escape, focus and narrow layout", { skip: !enabled, timeout: 90_000 }, async t => {
  assert.ok(existsSync(engine.executablePath()), "Use the installed browser; do not install a dependency for this fixture");
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/ClubOwnerReleaseBrowserFixture.tsx", cssPrefix: "release",
    requiredSources: ["components/touchline/fantasy/ClubOwnerReleaseDialog.tsx", "components/touchline/fantasy/ClubOwnerReleaseDialog.module.css",
      "components/touchline/fantasy/ClubOwnerCollectionSlots.module.css", "components/touchline/a11y/TouchlineDialog.tsx",
      "components/touchline/TouchlineGlobalNavigation.module.css", "components/touchline/cards/TouchlineEliteExactCard.tsx",
      "components/touchline/cards/TouchlineCardZoom.tsx", "lib/touchlineFantasy/club-release.ts"],
    mountScript: `window.unmountFixture=()=>flushSync(()=>root.unmount());
      flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(loadEntry().default,window.fixtureProps))));`,
  });
  // Use actual preflight/global rules. Only build-time directives are removed;
  // no rewritten component styles, monetary formulas, markup or focus handlers.
  const globalCss = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const preflight = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  const reports: unknown[] = [];
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  try {
    for (const scenario of [
      { width: 390, height: 844, locale: "pt-BR", touch: false, available: true },
      { width: 568, height: 320, locale: "pt-BR", touch: true, available: true },
      { width: 844, height: 390, locale: "en-GB", touch: true, available: true },
      { width: 390, height: 844, locale: "en-GB", touch: false, available: false },
    ]) {
      const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, hasTouch: scenario.touch,
        reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      const writes: string[] = [], external: string[] = [], unexpected: string[] = [], pageErrors: string[] = [];
      const safeScript = (value: string) => value.replace(/<\/script/gi, "<\\/script");
      const html = `<!doctype html><html lang="${scenario.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}\n${globalCss}\n${bundle.css}</style></head><body><div id="root" data-touchline-orientation-root></div><script>window.fixtureProps=${safeScript(JSON.stringify({locale:scenario.locale,available:scenario.available}))};</script><script>${safeScript(bundle.script)}</script></body></html>`;
      page.on("pageerror", error => pageErrors.push(error.message));
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET") { writes.push(`${request.method()} ${url.pathname}`); await route.abort("blockedbyclient"); return; }
        if (url.origin !== origin) { external.push(url.origin); await route.abort("blockedbyclient"); return; }
        if (url.pathname === "/fixture") { await route.fulfill({contentType:"text/html",body:html}); return; }
        if (/\.(png|webp|svg|jpg|jpeg|woff2?|json)$/i.test(url.pathname)) {
          const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) {
            await route.fulfill({ path: file }); return;
          }
        }
        // Read-only optional card/social/ranking data is unavailable, not fake.
        if (url.pathname.startsWith("/api/")) { await route.fulfill({status:503,json:{ok:false}}); return; }
        unexpected.push(url.pathname); await route.abort("blockedbyclient");
      });
      try {
        await page.goto(`${origin}/fixture`, { waitUntil: "domcontentloaded" });
        const trigger = page.locator('[data-touchline-card-zoom="trigger"] > [role="button"]');
        await expect(trigger).toBeVisible();
        const pt = scenario.locale === "pt-BR", releaseLabel = pt ? "Liberar jogador" : "Release player";
        const open = async () => {
          await trigger.click();
          await page.getByRole("button", {name:releaseLabel,exact:true}).click();
          const dialog = page.getByRole("dialog", {name:`${pt ? "Rescisão de contrato" : "Contract termination"} · Atleta Sintético de Validação`,exact:true});
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("heading",{level:2})).toBeFocused();
          return dialog;
        };
        const dialog = await open();
        const card = dialog.locator('[inert] [data-card-neon="permanent-tier-art"]');
        await expect(card).toHaveCount(1);
        await expect(card).toBeVisible();
        await expect.poll(() => dialog.locator('[inert] img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length)).toBe(0);
        const currentLabel = pt ? "Saldo atual confirmado" : "Current confirmed balance";
        await expect(dialog.locator("dt",{hasText:currentLabel}).locator("+ dd")).toHaveText(pt ? "1.145.000.000 TC" : "1,145,000,000 TC");
        for (const value of pt ? ["45.000.000 TC","4.500.000 TC","40.500.000 TC","1.185.500.000 TC"] : ["45,000,000 TC","4,500,000 TC","40,500,000 TC","1,185,500,000 TC"]) await expect(dialog).toContainText(value);
        const keep = dialog.getByRole("button", {name:pt ? "Manter no elenco" : "Keep in squad",exact:true});
        const confirm = dialog.getByRole("button", {name:pt ? "Confirmar liberação" : "Confirm release",exact:true});
        if (scenario.available) await expect(confirm).toBeEnabled();
        else await expect(confirm).toBeDisabled();
        const geometry = await dialog.evaluate(element => {
          const box=element.getBoundingClientRect(), review=element.querySelector('[data-has-card]')!;
          const backdrop=getComputedStyle(element.parentElement!);
          return { x:box.x,y:box.y,width:box.width,height:box.height,viewportWidth:innerWidth,viewportHeight:innerHeight,
            overflow:element.scrollWidth>element.clientWidth+1,columns:getComputedStyle(review).gridTemplateColumns,
            initialScroll:element.scrollTop,rootInert:document.getElementById('root')!.inert,
            backdropColor:backdrop.backgroundColor,
            backdropBlur:backdrop.getPropertyValue('backdrop-filter') || backdrop.getPropertyValue('-webkit-backdrop-filter') };
        });
        assert.ok(geometry.x>=0 && geometry.y>=0 && geometry.x+geometry.width<=scenario.width+1 && geometry.y+geometry.height<=scenario.height+1);
        assert.equal(geometry.overflow,false); assert.equal(geometry.initialScroll,0); assert.equal(geometry.rootInert,true);
        assert.equal(geometry.backdropColor,"rgba(0, 5, 6, 0.72)");
        assert.equal(geometry.backdropBlur,"blur(8px)","shared approved blur must survive the actual CSS cascade");
        assert.equal(geometry.columns.split(" ").length,scenario.width<=600 && scenario.height>scenario.width ? 1 : 2);
        if (process.env.TOUCHLINE_RELEASE_CAPTURE_PREFIX) await page.screenshot({path:`${process.env.TOUCHLINE_RELEASE_CAPTURE_PREFIX}-${engineName}-${scenario.width}-${scenario.locale}-${scenario.available ? "ready" : "off"}-top.png`});
        await page.keyboard.press("Tab"); await expect(keep).toBeFocused(); await expect(keep).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Shift+Tab"); await expect(scenario.available ? confirm : keep).toBeFocused();
        await expect(scenario.available ? confirm : keep).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Tab"); await expect(keep).toBeFocused(); await expect(keep).toBeInViewport({ ratio: 1 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const footer = await keep.boundingBox();
        if (process.env.TOUCHLINE_RELEASE_CAPTURE_PREFIX) {
          await page.screenshot({path:`${process.env.TOUCHLINE_RELEASE_CAPTURE_PREFIX}-${engineName}-${scenario.width}-${scenario.locale}-${scenario.available ? "ready" : "off"}-footer.png`});
        }
        assert.ok(footer && footer.y>=0 && footer.y+footer.height<=scenario.height+1, `focused footer outside viewport: ${JSON.stringify({scenario,footer,geometry,scrollTop:await dialog.evaluate(element=>element.scrollTop)})}`);
        await keep.click(); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
        await open(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(trigger).toBeFocused();
        const proof = await page.evaluate(() => ({...window.releaseFixtureEvidence,current:window.releaseFixtureEvidence.current(),inert:document.getElementById('root')!.inert}));
        assert.equal(proof.confirms,0);assert.equal(proof.closes,2);assert.equal(proof.current,proof.before);assert.equal(proof.inert,false);
        assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(pageErrors,[]);
        reports.push({scenario,geometry,confirmCalls:proof.confirms,closes:proof.closes,financialPosts:writes.length,externalRequests:external.length,originalCard:true,focusRestored:true});
      } finally { await page.evaluate("window.unmountFixture?.()").catch(()=>undefined); await context.close(); }
    }
    console.log(`RELEASE_BROWSER_PROOF ${JSON.stringify({engine:engineName,sources:bundle.sources,reports,qualification:"isolated fixture; no QA, real account, actual release, native Safari or physical device proof"})}`);
  } finally { await browser.close(); }
});

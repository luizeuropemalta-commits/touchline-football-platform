import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
function harness() {
  const react = dirname(require.resolve("react"));
  const dom = dirname(require.resolve("react-dom/client"));
  const scheduler = dirname(createRequire(require.resolve("react-dom/client")).resolve("scheduler"));
  const modules: Record<string, string> = {
    react: readFileSync(join(react, "cjs/react.development.js"), "utf8"),
    "react/jsx-runtime": readFileSync(join(react, "cjs/react-jsx-runtime.development.js"), "utf8"),
    "react-dom": readFileSync(join(dom, "cjs/react-dom.development.js"), "utf8"),
    "react-dom/client": readFileSync(join(dom, "cjs/react-dom-client.development.js"), "utf8"),
    scheduler: readFileSync(join(scheduler, "cjs/scheduler.development.js"), "utf8"),
    "next/image": 'exports.default=({unoptimized,...props})=>require("react").createElement("img",props);',
    "./TouchlineMatchCardBadge.module.css": 'exports.default=new Proxy({},{get:(_,key)=>String(key)});',
  };
  for (const [id, path] of [["badge", "../components/touchline/cards/TouchlineMatchCardBadge.tsx"], ["../touchlineArena/catalogue-locale.ts", "../lib/touchlineArena/catalogue-locale.ts"], ["./i18n.ts", "../lib/touchlineArena/i18n.ts"], ["./locale-catalogues/core-drafts.ts", "../lib/touchlineArena/locale-catalogues/core-drafts.ts"], ["@/lib/touchlineFantasy/match-card-i18n", "../lib/touchlineFantasy/match-card-i18n.ts"]]) {
    modules[id] = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  }
  const definitions = Object.entries(modules).map(([id, source]) => `${JSON.stringify(id)}:function(module,exports,require){${source}\n}`).join(",");
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineMatchCardBadge.module.css", import.meta.url), "utf8");
  return `<!doctype html><style>body{margin:0;background:#07120e}${css}</style><div id="root"></div><button id="outside" style="position:fixed;bottom:0;left:45%">Outside</button><script>
    const process={env:{NODE_ENV:'development'}},modules={${definitions}},cache={};
    function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
    const React=require('react'),root=require('react-dom/client').createRoot(document.getElementById('root')),Badge=require('badge').default,flush=require('react-dom').flushSync;
    window.cardClicks=0;window.show=(locale,side)=>flush(()=>root.render(React.createElement('div',{onClick:()=>window.cardClicks++,style:{position:'fixed',top:'80px',left:side==='left'?'0':side==='right'?'calc(100% - 48px)':'calc(50% - 24px)',width:'48px',height:'48px',overflow:'hidden',transform:'translateZ(0)'}},React.createElement(Badge,{key:locale+side,locale,kind:side==='left'?'yellow':'red',playerName:'Confirmed Player',draftLocalesEnabled:true}))));
  </script>`;
}

test("hover tooltip does not steal Escape from an independently opened modal", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(harness());
    await page.evaluate(() => {
      (window as unknown as {show:(locale:string,side:string)=>void}).show("en-GB", "center");
      document.querySelector("#outside")!.addEventListener("keydown", event => {
        if ((event as KeyboardEvent).key !== "Enter") return;
        const dialog = document.createElement("div");
        dialog.id = "independent-modal";
        dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("data-touchline-dialog-root", "true");
        dialog.tabIndex = -1; dialog.textContent = "Modal";
        document.body.append(dialog); dialog.focus();
        dialog.addEventListener("keydown", event => { if (event.key === "Escape") dialog.remove(); });
      });
    });
    await page.locator("#outside").focus();
    await page.locator(".trigger").hover(); await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Enter"); await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  } finally { await browser.close(); }
});

test("hydrated match-card tooltip stays in viewport, supports touch/keyboard and preserves card boundary", { timeout: 120_000 }, async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [390, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 600 }, hasTouch: true });
        const page = await context.newPage();
        page.setDefaultTimeout(3000);
        const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
        // The complete hydrated harness can take longer than the interaction
        // timeout on a cold WebKit process. Keep the 3s limit for every
        // interaction assertion, but give initial document parsing its own
        // deterministic budget.
        await page.setContent(harness(), { waitUntil: "domcontentloaded", timeout: 15_000 });
        await page.evaluate(() => (window as unknown as {show:(locale:string,side:string)=>void}).show("en-GB", "center"));
        await page.locator(".trigger").hover(); await expect(page.getByRole("tooltip")).toBeVisible();
        assert.equal(await page.locator(".trigger").evaluate(node => document.activeElement === node), false);
        await page.keyboard.press("Escape"); await expect(page.getByRole("tooltip")).toHaveCount(0);
        await page.mouse.move(5, 5);
        await page.locator(".trigger").hover(); await expect(page.getByRole("tooltip")).toBeVisible();
        const hoverTarget = await page.getByRole("tooltip").boundingBox(); assert.ok(hoverTarget);
        await page.mouse.move(hoverTarget.x + hoverTarget.width / 2, hoverTarget.y + hoverTarget.height / 2, { steps: 8 });
        // Stay on the text longer than the gap-crossing grace period.
        await page.waitForTimeout(240);
        await expect(page.getByRole("tooltip")).toBeVisible();
        await page.mouse.move(5, 5); await expect(page.getByRole("tooltip")).toHaveCount(0);
        await page.locator(".trigger").focus(); await expect(page.getByRole("tooltip")).toBeVisible();
        await page.locator("#outside").focus(); await expect(page.getByRole("tooltip")).toHaveCount(0);
        for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
          for (const side of ["left", "center", "right"]) {
            await page.evaluate(([locale, side]) => (window as unknown as {show:(locale:string,side:string)=>void}).show(locale, side), [locale, side]);
            const trigger = page.locator(".trigger");
            await trigger.focus();
            const tip = page.getByRole("tooltip");
            await expect(tip).toBeVisible();
            const bounds = await tip.boundingBox(); assert.ok(bounds);
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + .5, `${engine.name()} ${locale} ${side}: ${JSON.stringify(bounds)}`);
            assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 600);
            assert.equal(await trigger.getAttribute("aria-describedby"), await tip.getAttribute("id"));
            if (process.env.TOUCHLINE_MATCH_CARD_INTERACTION_CAPTURE_PREFIX && engine === chromium && width === 390
              && ((locale === "pt-BR" && side === "left") || (locale === "ar-SA" && side === "right"))) {
              await page.screenshot({ path: `${process.env.TOUCHLINE_MATCH_CARD_INTERACTION_CAPTURE_PREFIX}-${locale}-${side}.png` });
            }
            await trigger.press("Escape"); await expect(tip).toHaveCount(0);
            await page.locator("#outside").focus();
            await trigger.tap(); await expect(tip).toBeVisible();
            await trigger.tap(); await expect(tip).toHaveCount(0);
          }
        }
        await page.locator("#outside").focus();
        await page.locator(".trigger").focus();
        await page.setViewportSize({ width: 320, height: 300 });
        await expect.poll(async () => { const b = await page.getByRole("tooltip").boundingBox(); return Boolean(b && b.x >= 0 && b.x + b.width <= 320.5); }).toBe(true);
        await page.locator("#outside").tap(); await expect(page.getByRole("tooltip")).toHaveCount(0);
        assert.equal(await page.evaluate("window.cardClicks"), 0);
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally { await browser.close(); }
  }
});

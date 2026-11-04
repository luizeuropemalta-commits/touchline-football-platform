import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const enabled = process.env.TOUCHLINE_RUN_MOBILE_DECORATION_BROWSER_TESTS === "1";
const engineName = process.env.TOUCHLINE_MOBILE_DECORATION_BROWSER_ENGINE ?? "webkit";
assert.ok(["chromium", "webkit"].includes(engineName));
test(`mobile decoration (${engineName}): real CSS pseudos, ownership, React replacement and touch geometry`, { skip: !enabled, timeout: 90_000 }, async () => {
  const capacity = () => requireBrowserCapacity(fileURLToPath(new URL("../", import.meta.url)), { darwinFreePercent: true, allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI });
  capacity();
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/MobileDecorationBrowserFixture.tsx", cssPrefix: "mobiledecoration",
    requiredSources: ["components/touchline/TouchlineDecorationMotion.tsx", "lib/touchlineArena/visible-decoration-motion.ts", "components/touchline/ClubOwnerMarketHeader.module.css", "components/touchline/social/ClubOwnerPublic.module.css"],
    mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default)));",
  });
  const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  capacity();
  const browser = await (engineName === "webkit" ? webkit : chromium).launch({ headless: true });
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 3 : 1, reducedMotion: "no-preference", serviceWorkers: "block" });
      try {
        const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
        await page.route("**/*", route => route.abort());
        await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${globals}${bundle.css}</style><div id="root"></div>`);
        await page.addScriptTag({ content: `(()=>{${bundle.script}})()` });
        const states = (id: string) => page.locator(id).evaluate(n => n.getAnimations({ subtree: true }).map(a => ({ name: (a as CSSAnimation).animationName, state: a.playState })));
        await expect.poll(async () => (await states("#portrait")).some(a => /PhotoNeonSweep/.test(a.name) && a.state === "running")).toBe(true);
        await expect.poll(async () => (await states("#public-portrait")).some(a => /portraitNeonOrbit/.test(a.name) && a.state === "running")).toBe(true);
        assert.equal(await page.locator("#panel").evaluate(n => getComputedStyle(n, "::after").content === "none"), touch);
        if (!touch) await expect.poll(async () => (await states("#panel")).some(a => /GreenSweep/.test(a.name) && a.state === "running")).toBe(true);
        await expect.poll(() => page.locator("#nested button").evaluate(n => n.getAnimations().every(a => a.playState === "paused"))).toBe(true);
        const boxes = await page.locator("select").evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, height: r.height, font: getComputedStyle(n).fontSize }; }));
        assert.equal(boxes.length, 3); for (let i = 0; i < boxes.length; i++) { assert.ok(boxes[i].width >= 44 && boxes[i].height >= 44, JSON.stringify({touch,boxes})); assert.equal(boxes[i].font, "16px"); if (i) assert.ok(boxes[i].x >= boxes[i-1].right); }
        const priorities = await page.locator("select").evaluateAll(nodes => nodes.map(n => ({ border: getComputedStyle(n).borderTopWidth, background: getComputedStyle(n).backgroundColor, shadow: getComputedStyle(n).boxShadow })));
        for (const priority of priorities) { assert.equal(priority.border, "0px"); assert.equal(priority.background, "rgba(0, 0, 0, 0)"); assert.equal(priority.shadow, "none"); }
        await page.locator("#replace").click();
        await expect.poll(async () => (await states("#portrait")).some(a => a.state === "running")).toBe(true);
        await page.evaluate(() => scrollTo(0, 1200));
        await expect.poll(async () => (await states("#portrait")).every(a => a.state === "paused")).toBe(true);
        await expect.poll(() => page.locator("#nested button").evaluate(n => n.getAnimations().some(a => a.playState === "running"))).toBe(true);
        await page.locator("#replace").click();
        await expect.poll(async () => (await states("#portrait")).every(a => a.state === "paused")).toBe(true);
        await page.evaluate(() => scrollTo(0, 0));
        await expect.poll(async () => (await states("#portrait")).some(a => a.state === "running")).toBe(true);
        if (touch) assert.equal(await page.locator('[data-touchline-club-perimeter-trace="true"] rect').last().evaluate(n => getComputedStyle(n).filter), "none");
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal((await states("#portrait")).length, 0); assert.equal((await states("#public-portrait")).length, 0);
        if (!touch) {
          await page.setViewportSize({ width: 1280, height: 800 });
          assert.equal(await page.locator("select").first().evaluate(n => getComputedStyle(n).borderTopWidth), "1px", "desktop keeps its original priority control");
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

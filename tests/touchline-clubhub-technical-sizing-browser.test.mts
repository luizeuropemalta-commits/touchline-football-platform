import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { chromium, webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

// Layout-only proof using production styles and fixed canonical card geometry.
// Actual CardZoom/ResizeObserver rendering must additionally pass integrated QA.
// This two-engine matrix alone waits 28.4s for actual focus transitions.
// Keep a bounded per-test budget without relaxing the release-wide default.
test("technical-area styles keep all nine cards reachable inside their scrollport and coach exactly 20% smaller", { timeout: 120_000 }, async t => {
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/ClubHubBenchScrollList.tsx",
    requiredSources: ["components/touchline/ClubHubBenchScrollList.tsx"],
    mountScript: `flushSync(()=>root.render(React.createElement(loadEntry().default,{className:'cards'},Array.from({length:9},(_,i)=>React.createElement('li',{key:i},React.createElement('span',{className:'availabilityBadge'},'!'),React.createElement('div',{'data-touchline-card-zoom':'trigger'},React.createElement('div',{role:'button',tabIndex:0,className:'card mockCard','aria-label':'Card '+(i+1)},i+1)))))));`,
  });
  const css = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.module.css", import.meta.url), "utf8")
    .replaceAll(':global([data-touchline-card-zoom="trigger"] > [role="button"])', '[data-touchline-card-zoom="trigger"] > [role="button"]');
  const coachSource = readFileSync(new URL("../components/touchline/ClubHubCanonicalCoachPanel.module.css", import.meta.url), "utf8");
  // CSS Modules keeps the two shell/card namespaces separate in production.
  const coachCss = (coachSource.match(/\.technicalCard[^{}]*\{[^}]*\}/g) ?? []).join("\n").replaceAll(":global([data-coach-card-art])", "[data-coach-card-art]");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); };
    t.signal.addEventListener("abort", abort, { once: true });
    try {
      const page = await browser.newPage();
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      for (const { width, direction } of [...[1280, 1024, 844, 600, 390, 320].map(width => ({ width, direction: "ltr" })), { width: 390, direction: "rtl" }]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: direction === "rtl" ? "reduce" : "no-preference" });
        await page.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#07120e;color:white;font:14px Arial}*{box-sizing:border-box}${css}${coachCss}.mockCard{width:100%;aspect-ratio:430/691;border:0;padding:0;background:linear-gradient(135deg,#294b28,#09170b);outline:1px solid #73964a;display:grid;place-items:center}.mockCard:focus-visible{outline:2px solid white;outline-offset:5px}.coachLayout{width:100%}.availabilityBadge{width:18px;height:18px;border-radius:50%;background:gold;color:black;font:10px Arial;display:grid;place-items:center}</style>
        <div aria-hidden="true" style="height:800px"></div><div class="shell"><div class="content"><section class="coach"><span class="label">Coach</span><div class="coachLayout"><div class="technicalCard"><div data-coach-card-art class="mockCard">Coach</div></div></div></section><section class="bench"><div class="benchHeader">Bench · 9/9</div><div id="root"></div></section></div></div><div aria-hidden="true" style="height:800px"></div>`);
        await page.addScriptTag({ content: `(() => {${bundle.script}})()` });
        await page.locator(".cards").evaluate((node, direction) => { node.style.direction = direction; }, direction);
        await page.evaluate(() => scrollTo(0, 650));
        const current = await page.locator(".technicalCard").boundingBox(); assert.ok(current);
        const override = await page.addStyleTag({ content: ".technicalCard{width:min(100%,198px)}" });
        const previous = await page.locator(".technicalCard").boundingBox(); assert.ok(previous);
        await override.evaluate(node => node.remove());
        assert.ok(Math.abs(current.width / previous.width - .8) < .002, `${engine.name()} width${width}: coach20%`);
        const measurements = await page.locator(".cards").evaluate(node => {
          const frame = node.getBoundingClientRect();
          return { frame: { x: frame.x, right: frame.right, y: frame.y, bottom: frame.bottom }, cards: [...node.querySelectorAll(".card")].map(card => { const b = card.getBoundingClientRect(); return { x: b.x, right: b.right, y: b.y, bottom: b.bottom, w: b.width, h: b.height }; }) };
        });
        assert.equal(measurements.cards.length, 9);
        for (const card of measurements.cards) {
          assert.ok(card.y >= measurements.frame.y && card.bottom <= measurements.frame.bottom + .1);
          assert.ok(Math.abs(card.w / card.h - 430 / 691) < .002);
          assert.ok(card.w >= 80 && card.w <= 104.1, `${width}: readable width ${card.w}`);
          assert.ok(Math.abs(card.y - measurements.cards[0].y) < .1, "nine cards retain one row");
        }
        for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
          const a = measurements.cards[i], b = measurements.cards[j];
          assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, "no collision");
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no page-level horizontal overflow");
        const rail = page.locator(".cards");
        const initialScroll = await rail.evaluate(node => node.scrollLeft);
        const initialPageScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        assert.ok(initialPageScroll.y > 0, "fixture begins on an actually scrolled page");
        for (let index = 0; index < 9; index++) {
          const card = page.locator(".cards .card").nth(index);
          // Keyboard focus must reveal the complete target, not only programmatic scrollIntoView.
          if (index === 0) await card.focus();
          else await page.keyboard.press("Tab");
          assert.equal(await card.evaluate(node => node === document.activeElement), true);
          await page.waitForTimeout(200); // existing hover/focus translation settles
          if (direction === "rtl") {
            assert.deepEqual(await card.evaluate(node => ({ transform: getComputedStyle(node).transform, transition: getComputedStyle(node).transitionDuration })),
              { transform: "none", transition: "0s" }, "reduced motion disables bench hover/focus translation and transition");
          }
          const geometry = await card.evaluate(node => {
            const card = node.getBoundingClientRect(), rail = node.closest("ol")!.getBoundingClientRect();
            const badge = node.closest("li")!.querySelector(".availabilityBadge")!.getBoundingClientRect();
            const scrollport = node.closest("ol")!;
            return { card: card.toJSON(), rail: rail.toJSON(), badge: badge.toJSON(), scrollLeft: scrollport.scrollLeft, scrollWidth: scrollport.scrollWidth, clientWidth: scrollport.clientWidth };
          });
          assert.ok(geometry.card.left - 7 >= geometry.rail.left - 1 && geometry.card.right + 7 <= geometry.rail.right + 1,
            `${engine.name()} ${width} ${direction} card ${index + 1}: artwork and external focus ring reachable ${JSON.stringify(geometry)}`);
          assert.ok(geometry.card.top - 7 >= geometry.rail.top - 1 && geometry.card.bottom + 7 <= geometry.rail.bottom + 1,
            "vertical focus/hover envelope stays inside scrollport");
          assert.ok(geometry.badge.left >= geometry.rail.left - 1 && geometry.badge.right <= geometry.rail.right + 1
            && geometry.badge.top >= geometry.rail.top - 1 && geometry.badge.bottom <= geometry.rail.bottom + 1, "availability badge stays visible");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), initialPageScroll, "focus revelation does not scroll the page");
        }
        const overflowed = await rail.evaluate(node => node.scrollWidth > node.clientWidth + 1);
        if (overflowed) assert.ok(Math.abs(await rail.evaluate(node => node.scrollLeft) - initialScroll) > 1, "ninth card reached by internal scrolling in either direction");
        if (direction === "rtl") {
          for (let index = 7; index >= 0; index--) {
            await page.keyboard.press("Shift+Tab");
            const card = page.locator(".cards .card").nth(index);
            assert.equal(await card.evaluate(node => node === document.activeElement), true);
            await page.waitForTimeout(200);
            assert.equal(await card.evaluate(node => { const b = node.getBoundingClientRect(), r = node.closest("ol")!.getBoundingClientRect(); return b.left - 7 >= r.left - 1 && b.right + 7 <= r.right + 1; }), true, "reverse RTL focus remains fully visible");
            assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), initialPageScroll);
          }
        }
        assert.deepEqual(errors, []);
        if (process.env.TOUCHLINE_TECHNICAL_CAPTURE_PREFIX && engine === chromium && [1280, 390].includes(width)) await page.screenshot({ path: `${process.env.TOUCHLINE_TECHNICAL_CAPTURE_PREFIX}-${width}.png` });
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});

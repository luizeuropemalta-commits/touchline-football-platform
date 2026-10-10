import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { chromium, webkit } from "@playwright/test";

// Layout-only proof using production styles and fixed canonical card geometry.
// Actual CardZoom/ResizeObserver rendering must additionally pass integrated QA.
test("technical-area styles keep nine canonical card envelopes inside frame and coach exactly 20% smaller", async () => {
  const css = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.module.css", import.meta.url), "utf8");
  const coachSource = readFileSync(new URL("../components/touchline/ClubHubCanonicalCoachPanel.module.css", import.meta.url), "utf8");
  // CSS Modules keeps the two shell/card namespaces separate in production.
  const coachCss = (coachSource.match(/\.technicalCard[^{}]*\{[^}]*\}/g) ?? []).join("\n").replaceAll(":global([data-coach-card-art])", "[data-coach-card-art]");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (const width of [1280, 1024, 844, 600, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#07120e;color:white;font:14px Arial}*{box-sizing:border-box}${css}${coachCss}.mockCard{width:100%;aspect-ratio:430/691;background:linear-gradient(135deg,#294b28,#09170b);outline:1px solid #73964a;display:grid;place-items:center}.coachLayout{width:100%}</style>
        <div class="shell"><div class="content"><section class="coach"><span class="label">Coach</span><div class="coachLayout"><div class="technicalCard"><div data-coach-card-art class="mockCard">Coach</div></div></div></section><section class="bench"><div class="benchHeader">Bench · 9/9</div><ol class="cards">${Array.from({ length: 9 }, (_, i) => `<li><div class="card mockCard">${i + 1}</div></li>`).join("")}</ol></section></div></div>`);
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
          assert.ok(card.x >= measurements.frame.x - .1 && card.right <= measurements.frame.right + .1);
          assert.ok(card.y >= measurements.frame.y && card.bottom <= measurements.frame.bottom + .1);
          assert.ok(Math.abs(card.w / card.h - 430 / 691) < .002);
          assert.ok(card.w >= 70 && card.w <= 104.1, `${width}: readable width ${card.w}`);
        }
        for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
          const a = measurements.cards[i], b = measurements.cards[j];
          assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, "no collision");
        }
        if (process.env.TOUCHLINE_TECHNICAL_CAPTURE_PREFIX && engine === chromium && [1280, 390].includes(width)) await page.screenshot({ path: `${process.env.TOUCHLINE_TECHNICAL_CAPTURE_PREFIX}-${width}.png` });
      }
    } finally { await browser.close(); }
  }
});

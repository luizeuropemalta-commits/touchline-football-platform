import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chromium, webkit } from "@playwright/test";

// Isolated production-CSS geometry with representative markup, not provider,
// hydration, Suspense timing or integrated ClubHub acceptance evidence.
test("fixture stays above table beside field and stacks without overflow at narrow widths", async () => {
  const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const start = source.indexOf("        .club-hub-field-table-layout {");
  const end = source.indexOf("        .club-hub-matchday-support {", start);
  assert.ok(start > 0 && end > start);
  const layout = source.slice(start, end).replace(/\$\{(?:officialLeagueStyles|premiumStyles)\.(\w+)\}/g, "$1");
  const base = readFileSync(new URL("../components/touchline/club-hub/ClubHubOfficialLeague.module.css", import.meta.url), "utf8");
  const premium = readFileSync(new URL("../components/touchline/club-hub/ClubHubPremiumPrototype.module.css", import.meta.url), "utf8");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (const width of [1440, 1160, 844, 390]) for (const direction of ["ltr", "rtl"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.setContent(`<html dir="${direction}"><style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#06120d;color:white;font:14px Arial}${premium}${base}${layout}.field{height:520px;background:#14391c}.table-proof{height:420px;padding:16px}</style><div class="club-hub-field-table-layout"><div class="field">Field envelope</div><div class="club-hub-right-rail"><section class="layout"><div class="panel"><article class="fixture nextFixtureCard"><div class="nextFixtureHeading">Last match · 5</div><div class="nextFixtureTeams"><span class="nextFixtureClub"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='40'%3E%3Crect width='30' height='40' fill='gold'/%3E%3C/svg%3E"><b>Long official club name</b></span><em data-score="verified">2 – 1</em><span class="nextFixtureClub"><b>Visiting official club</b></span></div><div class="nextFixtureKickoff"><time>10 Oct · 13:30</time><small>GMT+2</small></div><div class="nextFixtureVenue"><span class="nextFixtureVenueCopy"><span>Official ground</span></span></div></article></div></section><aside class="panel table-proof">Official league table</aside></div></div></html>`);
        const field = await page.locator(".field").boundingBox();
        const fixture = await page.locator(".fixture").boundingBox();
        const table = await page.locator(".table-proof").boundingBox();
        assert.ok(field && fixture && table);
        assert.ok(fixture.y + fixture.height <= table.y);
        assert.ok(fixture.height < 240, `compact fixture ${width}/${direction}`);
        assert.ok(fixture.x >= 0 && fixture.x + fixture.width <= width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (width > 1150) {
          assert.ok(Math.abs(field.y - fixture.y) < 2);
          assert.ok(direction === "ltr" ? field.x + field.width <= fixture.x : fixture.x + fixture.width <= field.x);
        } else assert.ok(field.y + field.height <= fixture.y);
        if (process.env.TOUCHLINE_RIGHT_RAIL_CAPTURE_PREFIX && engine === chromium && [1440, 390].includes(width)) await page.screenshot({ path: `${process.env.TOUCHLINE_RIGHT_RAIL_CAPTURE_PREFIX}-${width}-${direction}.png`, fullPage: true });
      }
    } finally { await browser.close(); }
  }
});

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const feedCss = readFileSync(
  new URL("../../components/touchline/club-social/TouchlineClubSocialFeed.module.css", import.meta.url),
  "utf8",
);
const layoutCss = readFileSync(
  new URL("../../components/touchline/club-hub/ClubHubOfficialLeague.module.css", import.meta.url),
  "utf8",
);
const tableCss = readFileSync(
  new URL("../../components/touchline/TouchlineOfficialLeagueTable.module.css", import.meta.url),
  "utf8",
);

function cards(count: number) {
  return Array.from({ length: count }, (_, index) => `
    <article class="card">
      <div class="liveMedia"><span>TouchLine</span><strong>Synthetic club</strong><small>Live TouchLine update</small></div>
      <div class="body">
        <span class="kind">TouchLine post ${index + 1}</span>
        <p class="copy">Verified publication layout contract.</p>
        <time class="date">5 Sep 2026</time>
      </div>
    </article>
  `).join("");
}

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => `
    <tr><td>${index + 1}</td><th><a href="#club-${index + 1}"><span>Club ${index + 1}</span></a></th><td>0</td><td>0</td><td>0</td></tr>
  `).join("");
}

test("six feed posts stay scrollable in an explicit bounded component host, not the current ClubHub page", async ({ page }) => {
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #020907; color: white; }
      ${feedCss}
      ${layoutCss}
      /* Synthetic host contract: the reusable feed requires a definite height.
         These are not product feed/rail classes or a current page integration. */
      .feed-test-host, .feed-test-companion { height: 800px; min-height: 0; min-width: 0; }
      .fixture { min-height: 250px; }
      .tableWrap table { width: 100%; border-collapse: collapse; }
      .tableWrap th, .tableWrap td { height: 40px; border-bottom: 1px solid #29482d; }
    </style>
    <main class="layout" style="--club-accent:#a3ff12">
      <div class="feed-test-host">
        <section class="shell" data-scrollable="true">
          <header class="header"><div><span class="eyebrow">Official club channel</span><h2 class="title">Club · TouchLine</h2></div></header>
          <div class="grid" data-club-feed-scroll-region="true" tabindex="0">${cards(6)}</div>
        </section>
      </div>
      <aside class="feed-test-companion">
        <section class="fixture">Next fixture</section>
        <section class="table"><div class="tableWrap"><table><tbody>${rows(20)}</tbody></table></div></section>
      </aside>
    </main>
  `);

  const feed = page.locator(".feed-test-host");
  const rail = page.locator(".feed-test-companion");
  const scrollRegion = page.locator("[data-club-feed-scroll-region=true]");
  const viewport = page.viewportSize();

  await expect(scrollRegion).toHaveCSS("overflow-y", "auto");
  await expect(scrollRegion).toHaveCSS("touch-action", "pan-y");
  const scrollMetrics = await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    shellHeight: element.parentElement?.getBoundingClientRect().height ?? 0,
  }));
  expect(scrollMetrics.scrollHeight, JSON.stringify(scrollMetrics)).toBeGreaterThan(scrollMetrics.clientHeight);

  if (viewport && viewport.width > 1120) {
    const [feedBox, railBox] = await Promise.all([feed.boundingBox(), rail.boundingBox()]);
    expect(feedBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    expect(Math.abs((feedBox?.height ?? 0) - (railBox?.height ?? 0))).toBeLessThanOrEqual(1);
  }

  await scrollRegion.hover();
  await page.mouse.wheel(0, 700);
  await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await scrollRegion.focus();
  await page.keyboard.press("End");
  await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(700);

  const documentWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth);
});

test("the compact 20-club table remains contained in the companion rail", async ({ page }) => {
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #020907; color: white; }
      ${tableCss}
    </style>
    <section class="clubHubRail" style="height:640px;--club-accent:#a3ff12">
      <header class="header"><div><span class="eyebrow">TouchLine England</span><h2>Official League Table</h2></div></header>
      <div class="tableWrap" data-club-table-scroll-region="true">
        <table><tbody>${rows(20)}</tbody></table>
      </div>
    </section>
  `);

  const tableRegion = page.locator("[data-club-table-scroll-region=true]");
  await expect(tableRegion).toHaveCSS("overflow-y", "auto");
  await expect(tableRegion).toHaveCSS("touch-action", "pan-y");
  expect(await tableRegion.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await tableRegion.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => tableRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test("current official fixture and table panel composition contains table scrolling across breakpoints", async ({ page }) => {
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #020907; color: white; }
      ${layoutCss}
      ${tableCss}
    </style>
    <main class="layout" style="--club-accent:#a3ff12">
      <div class="panel" data-fixture-panel="true"><section class="fixture">Next fixture</section></div>
      <div class="panel" data-real-rail="true">
        <section class="table clubHubRail" data-real-table="true">
          <header class="header"><div><span class="eyebrow">TouchLine England</span><h2>Official League Table</h2></div></header>
          <div class="tableWrap" aria-label="Scrollable league table, 20 clubs" data-club-table-scroll-region="true" tabindex="0">
            <table><tbody>${rows(20)}</tbody></table>
          </div>
        </section>
      </div>
    </main>
  `);

  const rail = page.locator("[data-real-rail=true]");
  const table = page.locator("[data-real-table=true]");
  const tableRegion = page.locator("[data-club-table-scroll-region=true]");
  const [railBox, tableBox, regionBox] = await Promise.all([
    rail.boundingBox(),
    table.boundingBox(),
    tableRegion.boundingBox(),
  ]);
  expect(railBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(regionBox).not.toBeNull();
  expect((tableBox?.y ?? 0) + (tableBox?.height ?? 0)).toBeLessThanOrEqual((railBox?.y ?? 0) + (railBox?.height ?? 0) + 1);
  expect((regionBox?.y ?? 0) + (regionBox?.height ?? 0)).toBeLessThanOrEqual((railBox?.y ?? 0) + (railBox?.height ?? 0) + 1);
  const fixtureBox = await page.locator("[data-fixture-panel=true]").boundingBox();
  expect(fixtureBox).not.toBeNull();
  if ((page.viewportSize()?.width ?? 0) > 1120) {
    expect(Math.abs((fixtureBox?.y ?? 0) - (railBox?.y ?? 0))).toBeLessThanOrEqual(1);
    expect((railBox?.x ?? 0)).toBeGreaterThan((fixtureBox?.x ?? 0));
  } else {
    expect((railBox?.y ?? 0)).toBeGreaterThanOrEqual((fixtureBox?.y ?? 0) + (fixtureBox?.height ?? 0));
  }
  expect(await tableRegion.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await tableRegion.hover();
  const outerBefore = await page.evaluate(() => window.scrollY);
  const railBefore = await rail.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => tableRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(outerBefore);
  expect(await rail.evaluate((element) => element.scrollTop)).toBe(railBefore);

  await tableRegion.focus();
  await expect(tableRegion).toBeFocused();
  await page.keyboard.press("End");
  await expect.poll(() => tableRegion.evaluate((element) => (
    Math.abs(element.scrollTop - (element.scrollHeight - element.clientHeight)) <= 1
  ))).toBe(true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";

const origin = "http://localhost:31879";
const now = Date.parse("2026-10-30T12:00:00Z");
const fixtures = Array.from({ length: 10 }, (_, index) => {
  const [home, away] = TOUCHLINE_ENGLAND_CLUBS.slice(index * 2, index * 2 + 2);
  const team = (club: typeof home) => ({ id: club.teamId, providerId: club.teamId, name: club.name, logoUrl: club.logoUrl });
  return { id: String(19910000 + index), providerId: String(19910000 + index), status: "NS", roundId: "9", roundName: "9",
    startsAt: "2026-10-31T15:00:00Z", homeTeam: team(home), awayTeam: team(away) };
});

test("real Live keeps both club XI links below crests before teamsheets arrive, across twenty clubs and selection changes", {
  skip: process.env.TOUCHLINE_RUN_LIVE_LINEUP_LINKS_BROWSER !== "1", timeout: 180_000,
}, async () => {
  const output = process.env.TOUCHLINE_LIVE_LINEUP_LINKS_CAPTURE_DIR;
  assert.ok(output && path.isAbsolute(output)); mkdirSync(output, { recursive: true });
  const engineName = process.env.TOUCHLINE_LIVE_LINEUP_LINKS_ENGINE === "webkit" ? "webkit" : "chromium";
  const engine = engineName === "webkit" ? webkit : chromium;
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/match-centre/TouchlineMatchCentre.tsx", cssPrefix: "liveXi",
    requiredSources: ["lib/touchlineArena/live-club-lineup-links.ts", "components/touchline/TouchlineGlobalNavigation.module.css"],
    mountScript: `const Live=loadEntry().default;window.liveFixtures=${JSON.stringify(fixtures)};window.fixtureLocale='pt-BR';
      window.renderLive=(reset=false)=>flushSync(()=>root.render(React.createElement(Live,{key:reset?window.fixtureLocale:'live',initialFixtures:window.liveFixtures,initialFixtureId:'19910000',initialLocale:window.fixtureLocale,initialNow:${now},initialTimeZone:'UTC',initialSeasonName:'2026/2027',liveUpdates:false,canReadMatchDetail:false,draftLocalesEnabled:true,accountLocaleContext:{mode:'guest'}})));window.renderLive();`,
  });
  const browser = await engine.launch({ headless: true });
  const results: unknown[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage(), errors: string[] = [], unexpected: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const publicRoot = path.resolve("public");
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || request.method() !== "GET") { unexpected.push(request.url()); return route.abort(); }
      if (url.pathname === "/live") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;color:#eef5e8;background:#02100c;font:16px Arial}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}${bundle.css}</style></head><body><div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
      if (url.pathname.startsWith("/touchlineArena/")) {
        const file = path.resolve(publicRoot, `.${url.pathname}`);
        assert.ok(file.startsWith(`${publicRoot}${path.sep}`));
        return route.fulfill({ path: file });
      }
      // Navigation destination contract only; ClubHub's real XI rendering is
      // exercised separately in its owning integration. This is no hosted pass.
      if (url.pathname.startsWith("/touchline-clubs/")) return route.fulfill({ contentType: "text/html", body: "<h1>Fixture destination probe</h1>" });
      unexpected.push(url.pathname); return route.abort();
    });
    await page.clock.install({ time: now });
    await page.goto(`${origin}/live?lang=pt-BR`);
    const links = page.locator("[data-lineup-team]");
    await expect(links).toHaveCount(2);
    for (const selected of fixtures) {
      await page.locator("button[aria-pressed]").filter({ hasText: selected.homeTeam.name }).click();
      await expect(links).toHaveCount(2);
      for (const participant of [selected.homeTeam, selected.awayTeam]) {
        const club = TOUCHLINE_ENGLAND_CLUBS.find(item => item.teamId === participant.providerId)!;
        const link = page.locator(`[data-lineup-team="${club.teamId}"]`);
        await expect(link).toHaveAttribute("href", `/touchline-clubs/${club.slug}?lang=pt-BR&fixtureId=${selected.providerId}#touchline-club-lineup`);
        await expect(link).toHaveAccessibleName(`VER ESCALAÇÃO · ${club.name}`);
        const position = await link.evaluate(node => {
          const container = node.parentElement!, crest = container.querySelector("img")!;
          return { top: node.getBoundingClientRect().top, crestBottom: crest.getBoundingClientRect().bottom,
            sameColumn: container.contains(crest), height: node.getBoundingClientRect().height };
        });
        assert.ok(position.sameColumn && position.top >= position.crestBottom && position.height >= 44);
      }
    }
    assert.equal(await page.getByTestId("touchline-verified-match-data").count(), 0, "No XI or provider detail invented");
    await page.evaluate(() => {
      const target = window as typeof window & { liveFixtures: unknown[]; renderLive(): void };
      target.liveFixtures = [...target.liveFixtures].reverse(); target.renderLive();
    });
    assert.ok((await links.evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))).every(href => href?.includes("fixtureId=19910009#")));

    for (const [width, height, locale] of [[1440, 900, "pt-BR"], [1024, 768, "en-GB"], [844, 390, "pt-BR"], [390, 844, "ar-SA"]] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(value => { const target = window as typeof window & { fixtureLocale: string; renderLive(reset: boolean): void }; target.fixtureLocale = value; target.renderLive(true); }, locale);
      await expect(links).toHaveCount(2);
      await page.locator("#touchline-match-panel").scrollIntoViewIfNeeded();
      const copy = getTouchlineMatchCentreCopy(locale, true);
      for (const link of await links.all()) {
        await expect(link).toContainText(copy.viewLineup);
        const box = await link.boundingBox(); assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.height >= 44);
        await link.focus(); await expect(link).toBeFocused();
      }
      await page.locator('[class*="_hero"]').first().screenshot({ path: path.join(output, `${engineName}-${width}-${locale}.png`) });
      results.push({ width, height, locale, links: await links.evaluateAll(nodes => nodes.map(node => node.getAttribute("href"))) });
    }
    const href = await links.first().getAttribute("href"); assert.ok(href);
    await links.first().click(); await expect(page).toHaveURL(`${origin}${href}`);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    writeFileSync(path.join(output, `${engineName}-results.json`), JSON.stringify({ engineName, clubs: 20, results, errors, unexpected }, null, 2));
    await context.close();
  } finally { await browser.close(); }
});

import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { TOUCHLINE_OFFICIAL_CLUB_CHANNELS } from "../lib/touchlineArena/club-official-channels.ts";
import { getTouchlineClubHubFixtureCopy } from "../lib/touchlineArena/club-hub-fixture-i18n.ts";
import { getTouchlineClubHubProfileCopy } from "../lib/touchlineArena/club-hub-profile-i18n.ts";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

type FixtureHarnessWindow = Window & {
  renderFixture(value: unknown): void;
  revalidateFixture(): void;
  publicationRequests: string[];
  readerFixtureRead: {
    state: { livePresentationSnapshotId: string };
    sportsPublication: {
      publication: { contentDigest: string };
      live: { fixtures: Array<{ status: string; homeScore?: number; awayScore?: number }> };
    };
  };
};

// Actual components/CSS, synthetic fixture props and no provider/network writes.
// This proves presentation transitions, not production publication delivery.
test("all clubs expose official tickets above a next-only card across desktop, tablet and phone", {
  skip: process.env.TOUCHLINE_RUN_TICKETS_NEXT_BROWSER !== "1", timeout: 120_000,
}, async () => {
  const output = process.env.TOUCHLINE_TICKETS_NEXT_CAPTURE_DIR;
  assert.ok(output && path.isAbsolute(output)); mkdirSync(output, { recursive: true });
  const name = process.env.TOUCHLINE_TICKETS_NEXT_ENGINE ?? "chromium";
  const engine = name === "webkit" ? webkit : name === "firefox" ? firefox : chromium;
  const railCss = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8").split("\n")
    .filter(line => line.trim().startsWith(".club-hub-right-rail") && line.includes("{")).join("\n");
  assert.ok(railCss.includes("nextFixtureClub"));
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/club-hub/ClubHubNextFixtureCard.tsx",
    additionalEntryPaths: ["components/touchline/ClubHubOfficialChannel.tsx", "lib/touchlineArena/live-presentation-client-store.ts",
      "components/touchline/club-hub/ClubHubOfficialLeague.module.css", "components/touchline/club-hub/ClubHubPremiumPrototype.module.css"],
    allowSyntheticRouteRefresh: true,
    requiredSources: ["lib/touchlineArena/club-hub-next-fixture.ts", "components/touchline/club-hub/ClubHubPremiumPrototype.module.css", "components/touchline/ClubHubOfficialChannel.module.css"],
    mountScript: `const Card=loadEntry().default,Channel=loadAdditionalEntry('components/touchline/ClubHubOfficialChannel.tsx').default;
      const official=loadAdditionalEntry('components/touchline/club-hub/ClubHubOfficialLeague.module.css'),premium=loadAdditionalEntry('components/touchline/club-hub/ClubHubPremiumPrototype.module.css');
      const railStyle=document.createElement('style');
      let actualRailCss=${JSON.stringify(railCss)};
      for(const [family,styles] of Object.entries({premiumStyles:premium,officialLeagueStyles:official}))for(const [key,value] of Object.entries(styles))actualRailCss=actualRailCss.split('$'+'{'+family+'.'+key+'}').join(value);
      railStyle.textContent=actualRailCss;
      document.head.append(railStyle);
      window.onFixtureRouteRefresh=()=>{window.routeRefreshes=(window.routeRefreshes||0)+1;};
      window.publicationRequests=[];
      window.fetch=async(url)=>{
        window.publicationRequests.push(String(url));
        if(!window.readerFixtureRead)throw Error('Unexpected fixture fetch');
        if(url==='/api/touchline-arena/live-presentation-state')return Response.json(window.readerFixtureRead.state);
        if(url==='/api/touchline-arena/sports-publication')return Response.json({ok:true,data:window.readerFixtureRead.sportsPublication});
        throw Error('Unexpected fixture transport');
      };
      window.revalidateFixture=()=>loadAdditionalEntry('lib/touchlineArena/live-presentation-client-store.ts').touchlineLivePresentationStore.revalidate();
      window.renderFixture=(p)=>{flushSync(()=>{root.render(React.createElement(React.StrictMode,null,React.createElement('aside',{className:'club-hub-right-rail'},React.createElement(Channel,{kind:'tickets',channels:p.channels,locale:p.locale}),React.createElement('section',{className:official.layout},React.createElement('div',{className:official.panel},React.createElement(Card,{...p.card,className:official.fixture,locale:p.locale}))))));});};`,
  });
  const logo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%236cabdd'/%3E%3C/svg%3E";
  const card = { nextOnly: true, previewHref: null, startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    status: "Not Started", roundName: "9", homePosition: null, awayPosition: null, initialTimeZone: "Europe/Malta",
    homeTeam: { teamId: "19", name: "Manchester City", shortCode: "MCI", logoUrl: logo },
    awayTeam: { teamId: "20", name: "Aston Villa", shortCode: "AVL", logoUrl: logo }, venueName: "Etihad Stadium" };
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    await page.setContent('<input id="keyboard-start"><a id="keyboard-link" href="#x">link</a>');
    await page.locator("#keyboard-start").focus();
    await page.keyboard.press("Tab");
    let forward = "Tab";
    if (await page.evaluate(() => document.activeElement?.id) !== "keyboard-link") {
      assert.equal(name, "webkit");
      await page.locator("#keyboard-start").focus(); await page.keyboard.press("Alt+Tab");
      await expect(page.locator("#keyboard-link")).toBeFocused(); forward = "Alt+Tab";
    }
    const errors: string[] = [], requests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", async route => { requests.push(route.request().url()); await route.abort(); });
    await page.setContent(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#06120d;color:#edf5e6;font:16px Arial}#root{max-width:410px;margin:0 auto;display:grid;gap:20px}${bundle.css}</style><div id="root"></div>`);
    await page.addScriptTag({ content: bundle.script });
    for (const [locale, width, height] of [["en-GB", 1440, 900], ["pt-BR", 1024, 768], ["pt-BR", 844, 390]] as const) {
      await page.setViewportSize({ width, height });
      const copy = getTouchlineClubHubFixtureCopy(locale);
      for (const channels of Object.values(TOUCHLINE_OFFICIAL_CLUB_CHANNELS)) {
        await page.evaluate(p => (window as unknown as { renderFixture(p: unknown): void }).renderFixture(p), { locale, channels, card });
        const tickets = page.locator('[data-clubhub-official-channel="tickets"] a');
        await expect(tickets).toHaveAttribute("href", channels.tickets!.url);
        await expect(tickets).toHaveAttribute("target", "_blank");
        await expect(tickets).toHaveAttribute("rel", "noopener noreferrer");
        await expect(page.locator('article[data-state="upcoming"]')).toContainText(copy.nextMatch);
        assert.equal(await page.locator("[data-score]").count(), 0);
      }
      const ticketBox = await page.locator('[data-clubhub-official-channel="tickets"]').boundingBox();
      const cardBox = await page.locator("article").boundingBox();
      assert.ok(ticketBox && cardBox && ticketBox.y + ticketBox.height <= cardBox.y);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator("#root").evaluate(element => { element.tabIndex = -1; element.focus(); });
      await page.keyboard.press(forward);
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), "A");
      await page.screenshot({ path: path.join(output, `${name}-${width}-${locale}.png`), fullPage: true });
      const channels = TOUCHLINE_OFFICIAL_CLUB_CHANNELS["manchester-city"];
      for (const status of ["Finished", "Live", "Postponed"]) {
        await page.evaluate(p => (window as unknown as { renderFixture(p: unknown): void }).renderFixture(p), { locale, channels, card: { ...card, status, homeScore: 2, awayScore: 1 } });
        await expect(page.locator('article[data-state="awaiting"]')).toContainText(getTouchlineClubHubProfileCopy(locale).nextMatchChecking);
        assert.equal(await page.locator("[data-score]").count(), 0);
      }
      await page.evaluate(p => (window as unknown as { renderFixture(p: unknown): void }).renderFixture(p), { locale, channels, card: { ...card, nextOnly: false, status: "Finished", startsAt: "2026-01-01T12:00:00Z", homeScore: 2, awayScore: 1 } });
      await expect(page.locator('article[data-state="finished"]')).toContainText(copy.finished);
      await expect(page.locator('[data-score="verified"]')).toHaveText("2–1");
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    }
    // Exercise the real shared store, parser, reader and hook. Only the HTTP
    // boundary is synthetic; route.refresh intentionally cannot update props.
    const initialFixture = { id: "100", providerId: "100", competitionId: "8", seasonId: "25583", startsAt: card.startsAt, status: "Not Started",
      homeTeam: { id: "19", providerId: "19", name: "Manchester City" }, awayTeam: { id: "20", providerId: "20", name: "Aston Villa" } };
    const revisedAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const stamp = new Date().toISOString();
    const read = {
      state: { version: 1, available: true, playerRankingSnapshotId: null, coachRankingSnapshotId: null,
        livePresentationSnapshotId: "a".repeat(32), mode: "live", pollAfterMs: 10_000, resumeAt: null,
        liveFreshness: { fetchedAt: stamp, ageMs: 0, degraded: false } },
      sportsPublication: { version: 1, scopeKey: "touchline-england", publication: {
        snapshotId: "10000000-0000-4000-8000-000000000001", contentDigest: "a".repeat(32), publishedAt: stamp,
        playerRankingSnapshotId: null, coachRankingSnapshotId: null, liveScoreSnapshotDigest: "b".repeat(32),
      }, playerRanking: null, coachRanking: null, live: { fetchedAt: stamp, fixtures: [{ ...initialFixture, startsAt: revisedAt }] } },
    };
    await page.evaluate(value => { (window as FixtureHarnessWindow).readerFixtureRead = value; }, read);
    await page.evaluate(p => (window as FixtureHarnessWindow).renderFixture(p), { locale: "en-GB", channels: TOUCHLINE_OFFICIAL_CLUB_CHANNELS["manchester-city"], card: { ...card, initialFixture, liveUpdates: true } });
    await expect(page.locator("article time")).toHaveAttribute("datetime", revisedAt);
    assert.ok((await page.evaluate(() => (window as FixtureHarnessWindow).publicationRequests)).includes("/api/touchline-arena/sports-publication"));
    await page.evaluate(() => {
      const w = window as FixtureHarnessWindow, value = w.readerFixtureRead;
      value.state.livePresentationSnapshotId = "c".repeat(32);
      value.sportsPublication.publication.contentDigest = "c".repeat(32);
      value.sportsPublication.live.fixtures[0].status = "Finished";
      value.sportsPublication.live.fixtures[0].homeScore = 2;
      value.sportsPublication.live.fixtures[0].awayScore = 1;
      w.revalidateFixture();
    });
    await expect(page.locator('article[data-state="awaiting"]')).toBeVisible();
    assert.equal(await page.locator("[data-score]").count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  } finally { await browser.close(); }
});

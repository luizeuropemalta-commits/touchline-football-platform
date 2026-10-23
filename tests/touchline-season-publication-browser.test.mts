import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { buildTouchlineRankingSnapshot } from "../lib/touchlineArena/card-ranking.ts";
import { parseTouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";
import { parseTouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://sports-publication-fixture.test";
const now = "2026-10-23T12:00:00.000Z";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function publication(rev: number, total: number | null, seasonId = id(50)) {
  const built = buildTouchlineRankingSnapshot({ snapshotId: `player:${rev}`, roundId: "synthetic-round", generatedAt: now,
    source: "simulation", status: "published", players: ["GK", "CB", "RB", "CM", "RW", "ST", "ST"].map((position, index) => ({
      playerId: id(index + 1), providerPlayerId: String(101 + index), name: `Synthetic ${index}`, clubName: "Arsenal", position,
      totalRating: index === 5 ? total : index === 6 ? 49 : 10, minutesPlayed: 90, appearances: 1 })) });
  const ranking = parseTouchlineActiveRankingState({ phase: "ranked", leagueKey: "touchline-england", snapshotId: built.snapshotId,
    roundId: built.roundId, publishedAt: now, priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION, scoringVersion: "player_scoring_v4",
    coverageStatus: "complete", seasonId, fixtureIds: ["19722190"], expectedFixtureIds: ["19722190"], totalScorePoints: 0,
    players: built.players, leadershipDecision: null, cardGoals: null });
  assert.ok(ranking);
  const wins = rev % 2 ? rev : 0, draws = rev % 2 ? 0 : rev;
  const value = parseTouchlineSportsPublication({ version: 1, scopeKey: "touchline-england",
    publication: { snapshotId: id(100 + rev), contentDigest: rev.toString(16).padStart(32, "0"), publishedAt: now,
      playerRankingSnapshotId: built.snapshotId, coachRankingSnapshotId: `coach:${rev}`, liveScoreSnapshotDigest: "e".repeat(32) },
    playerRanking: ranking, coachRanking: { phase: "ranked", snapshotId: `coach:${rev}`, seasonId, scoringVersion: "coach_scoring_v2",
      fixtureIds: ["19722190"], generatedAt: now, rows: [{ rank: 1, coachProviderId: "42", coachName: "Synthetic Coach", clubName: "Arsenal",
        wins, draws, losses: 0, awayWins: 0, touchlinePoints: wins * 3 + draws,
        home: { wins, draws, losses: 0, touchlinePoints: wins * 3 + draws }, away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 } }] },
    live: { fetchedAt: now, fixtures: [] } });
  assert.ok(value); return value;
}

test("real shared transport updates profiles, club leaders and open zoom without remount or per-card fetch", {
  skip: process.env.TOUCHLINE_RUN_SEASON_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const seed = publication(1, 42);
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/PlayerSeasonPublicationBrowserFixture.tsx", cssPrefix: "seasonproof",
    requiredSources: ["components/touchline/cards/TouchlinePlayerSeasonScope.tsx", "components/touchline/cards/TouchlineCardLeadershipProvider.tsx",
      "components/touchline/cards/TouchlineCardZoom.tsx", "components/touchline/ClubHubPositionLeaders.tsx",
      "lib/touchlineArena/live-presentation-client-store.ts", "lib/touchlineArena/sports-publication.ts"],
    mountScript: `window.unmountFixture=()=>flushSync(()=>root.unmount());window.transportDigest=()=>loadEntry().transportDigest();window.rerenderSeed=serverSeed=>flushSync(()=>root.render(React.createElement(loadEntry().default,{...window.fixtureProps,serverSeed})));flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));`,
  });
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8") + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
  const safe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
  const html = (seedless: boolean) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root" data-touchline-orientation-root></div><script>window.fixtureProps=${safe(JSON.stringify({seed,seedless}))};</script><script>${safe(bundle.script)}</script></body></html>`;
  const publicRoot = realpathSync(path.join(root, "public"));
  assert.ok(existsSync(chromium.executablePath()));
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  const reports: unknown[] = [];
  try {
    for (const {viewport,seedless} of [
      {viewport:{width:1280,height:900},seedless:false}, {viewport:{width:390,height:844},seedless:false},
      {viewport:{width:844,height:390},seedless:false}, {viewport:{width:390,height:844},seedless:true},
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      let current = seedless ? publication(20,999,id(51)) : seed, payloadStatus = 200, mismatch = false;
      // A retry timer is scheduled only after the real store processes a bad
      // response. Count that boundary without replacing timers or transport.
      await page.addInitScript(() => {
        const original = window.setTimeout.bind(window);
        (window as unknown as {publicationRetryCount:number}).publicationRetryCount = 0;
        window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
          if (timeout === 30_000) (window as unknown as {publicationRetryCount:number}).publicationRetryCount++;
          return original(handler, timeout, ...args);
        }) as typeof window.setTimeout;
      });
      const requests: string[] = [], refused: string[] = [], errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== origin) { refused.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort(); return; }
        if (url.pathname === "/touchline-players/synthetic") { await route.fulfill({contentType:"text/html",body:html(seedless)}); return; }
        if (url.pathname === "/api/touchline-arena/live-presentation-state") {
          requests.push(`state:${current.publication.contentDigest}`);
          await route.fulfill({json:{ version:1,available:true,mode:"idle",pollAfterMs:null,resumeAt:null,
            livePresentationSnapshotId:current.publication.contentDigest,playerRankingSnapshotId:current.publication.playerRankingSnapshotId,
            coachRankingSnapshotId:current.publication.coachRankingSnapshotId }}); return;
        }
        if (url.pathname === "/api/touchline-arena/sports-publication") {
          requests.push(`payload:${current.publication.contentDigest}`);
          await route.fulfill({status:payloadStatus,json:{ok:payloadStatus===200,data:mismatch ? seed : current}}); return;
        }
        if (/^\/api\/touchline\/players\/\d+\/social$/.test(url.pathname)) { await route.fulfill({status:401,json:{ok:false}}); return; }
        const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) {
          await route.fulfill({path:file}); return;
        }
        refused.push(url.pathname); await route.abort();
      });
      try {
        await page.goto(`${origin}/touchline-players/synthetic`, {waitUntil:"domcontentloaded"});
        if (seedless) {
          await expect.poll(()=>page.evaluate("window.transportDigest()")).toBe(current.publication.contentDigest);
          await expect(page.locator("[data-profile-total]")).toHaveText("—");
          await expect(page.locator("[data-coach-matches]")).toHaveText("—");
          current = seed;
          await page.evaluate(()=>window.dispatchEvent(new Event("online")));
        }
        await expect(page.locator("[data-profile-total]")).toHaveText("42");
        await expect.poll(()=>requests.filter(r=>r.startsWith("payload:")).length).toBe(seedless ? 2 : 1);
        await page.getByRole("textbox",{name:"Local note"}).fill("keep my selection");
        const trigger = page.locator('[data-profile-zoom] [data-touchline-card-zoom="trigger"] > [role="button"]');
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const toggle = dialog.locator('button[aria-expanded]');
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded","true");
        const handle = await dialog.elementHandle();
        const scrollTarget = await dialog.evaluateHandle(element => {
          const target = [element, ...element.querySelectorAll<HTMLElement>("*")].find(node => {
            const style = getComputedStyle(node);
            return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
          });
          if (target) target.scrollTop = Math.min(37, target.scrollHeight - target.clientHeight);
          return target ?? element;
        });
        const before = {scroll:await scrollTarget.evaluate(element=>element.scrollTop), focus:await toggle.getAttribute("aria-controls")};
        if (viewport.width < 500) assert.ok(before.scroll > 0, "portrait must exercise a nonzero scroll position");
        const check = async (total: number | null, rev: number) => {
          await expect(page.locator("[data-profile-total]")).toHaveText(total === null ? "—" : String(total));
          const expected = publication(rev,total).playerRanking!.players.find(row=>row.providerPlayerId==="106")!;
          await expect(page.locator("[data-profile-rank]")).toHaveText(expected.positionRank == null ? "—" : `#${expected.positionRank}`);
          await expect(page.locator(".stat-available, .stat-unavailable")).toHaveClass(total===null?"stat-unavailable":"stat-available");
          await expect(page.locator(".stat-available strong, .stat-unavailable strong")).toHaveText(total===null?"—":String(total));
          await expect(page.locator("[data-coach-matches]")).toHaveText(String(rev));
          await expect(dialog.locator('section[aria-label="Total rating"] > strong')).toHaveText(total === null ? "—" : String(total));
          for (const selector of ["[data-profile-hero]", "[data-profile-zoom]", "[data-gameweek]", '[data-card-zoom="expanded"]']) {
            const text = await page.locator(`${selector} [data-card-total-rating="true"]`).first().innerText();
            assert.equal(total === null ? text === "—" : Number(text) === total, true, `${selector}: ${text}`);
          }
          assert.equal(await handle!.evaluate(node => node === document.querySelector('[role="dialog"]')),true);
          await expect(toggle).toHaveAttribute("aria-expanded","true");
          // The real modal makes its background inert; read the retained input
          // without treating it as an accessible/focusable control while open.
          await expect(page.locator('input[aria-label="Local note"]')).toHaveValue("keep my selection");
          const after = {scroll:await scrollTarget.evaluate(element=>element.scrollTop),focus:await page.evaluate(()=>document.activeElement?.getAttribute("aria-controls"))};
          assert.deepEqual(after,before);
        };
        for (const [rev,total] of [[2,50],[3,40],[4,0],[5,null],[6,50]] as const) {
          current = publication(rev,total);
          await page.evaluate(()=>window.dispatchEvent(new Event("online")));
          await check(total,rev);
          await expect(page.locator('[data-clubhub-card-spotlight="position-attacker"] header strong')).toHaveText(total!==null&&total>49?"Synthetic Player A":"Synthetic Player B");
          assert.equal(requests.filter(r=>r===`payload:${current.publication.contentDigest}`).length,1);
        }
        // An older server response can arrive after a newer transport read.
        // Reconcile it in place without regressing data or remounting the zoom.
        await page.evaluate(value=>(window as unknown as {rerenderSeed:(value:unknown)=>void}).rerenderSeed(value),publication(3,40));
        await check(50,6);
        // The same digest is reused, despite many mounted card consumers.
        const payloadCount = requests.filter(r=>r.startsWith("payload:")).length;
        const stateCount = requests.filter(r=>r.startsWith("state:")).length;
        await page.evaluate(()=>window.dispatchEvent(new Event("online")));
        await expect.poll(()=>requests.filter(r=>r.startsWith("state:")).length).toBe(stateCount+1);
        assert.equal(requests.filter(r=>r.startsWith("payload:")).length,payloadCount);
        for (const mode of ["error","mismatch","other-season"] as const) {
          current=publication(mode==="error"?7:mode==="mismatch"?8:9,999,mode==="other-season"?id(51):id(50));
          payloadStatus=mode==="error"?503:200; mismatch=mode==="mismatch";
          const retryBefore=await page.evaluate("window.publicationRetryCount") as number;
          await page.evaluate(()=>window.dispatchEvent(new Event("online")));
          if (mode === "other-season") await expect.poll(()=>page.evaluate("window.transportDigest()")).toBe(current.publication.contentDigest);
          else await expect.poll(()=>page.evaluate("window.publicationRetryCount")).toBe(retryBefore+1);
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          await check(50,6);
        }
        payloadStatus=200;mismatch=false;current=publication(10,51);
        await page.evaluate(()=>window.dispatchEvent(new Event("online")));
        await check(51,10);
        await expect(dialog).toContainText("Historical 7.2");
        if (process.env.TOUCHLINE_SEASON_CAPTURE_PREFIX) await page.screenshot({path:`${process.env.TOUCHLINE_SEASON_CAPTURE_PREFIX}-${viewport.width}x${viewport.height}${seedless?"-seedless":""}.png`});
        const bounds=await dialog.boundingBox();assert.ok(bounds && bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=viewport.width+1 && bounds.y+bounds.height<=viewport.height+1);
        await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
        assert.deepEqual(refused,[]);assert.deepEqual(errors,[]);
        reports.push({viewport,seedless,bounds,payloadCount,openZoomPreserved:true,scrollPreserved:before.scroll,localNotePreserved:true,requests:requests.length});
      } finally {await page.evaluate("window.unmountFixture?.()").catch(()=>undefined);await context.close();}
    }
    console.log(`SEASON_BROWSER_PROOF ${JSON.stringify({reports,qualification:"isolated real React/CSS/transport with synthetic data; not QA/Next/provider/native Safari proof"})}`);
  } finally {await browser.close();}
});

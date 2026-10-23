import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { buildTouchlineRankingSnapshot } from "../lib/touchlineArena/card-ranking.ts";
import { parseTouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";
import { touchlinePlayerLeadershipScope } from "../lib/touchlineArena/player-ranking-leadership.ts";
import { parseTouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";
import { getTouchLineRankingsCopy } from "../lib/touchlineArena/rankings-i18n.ts";
import { getTouchlineTablesPresentationCopy } from "../lib/touchlineArena/tables-presentation-i18n.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://ranking-podium-fixture.test";
const routePath = "/rankings";
const now = "2026-10-23T12:00:00.000Z";
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const position = (n: number) => ["GK", "CB", "RB", "CM", "RW"][n - 1] ?? "ST";
const targetId = id(6);
const copy = getTouchLineRankingsCopy("en-GB", true);
const presentationCopy = getTouchlineTablesPresentationCopy("en-GB", true);
const triggerSelector = '[data-touchline-card-zoom="trigger"] > [role="button"]';

function publication(rev: number, options: {
  targetTotal?: number | null; rivalTotal?: number; bootLeaders?: readonly number[];
  tiedBall?: boolean; unknown?: boolean; withdrawn?: boolean;
} = {}) {
  const targetTotal = options.targetTotal === undefined ? 100 : options.targetTotal;
  const rivalTotal = options.rivalTotal ?? 90;
  // #8 is deliberately absent: a goals-only candidate must never receive a fake rating.
  const ratedIds = [1, 2, 3, 4, 5, 6, 7, ...(options.unknown ? [9] : [])];
  const built = buildTouchlineRankingSnapshot({ snapshotId: `podium:${rev}`, roundId: "synthetic-round", generatedAt: now,
    source: "simulation", status: "published", players: ratedIds.map(n => ({
      playerId: id(n), providerPlayerId: String(100 + n), name: `Synthetic ${n}`, clubName: "Arsenal", position: position(n),
      totalRating: n === 6 ? targetTotal : n === 7 ? rivalTotal : n === 9 ? 160 : 10,
      minutesPlayed: 90, appearances: 1,
    })) });
  const leader = options.unknown ? 9 : targetTotal !== null && targetTotal > rivalTotal ? 6 : 7;
  const scope = touchlinePlayerLeadershipScope(built.snapshotId);
  const leadershipDecision = options.tiedBall
    ? { status: "tied", scope, contenders: [6, 7].map(n => ({ subjectType: "player", subjectId: id(n) })) }
    : { status: "unique-leader", scope, leader: { subjectType: "player", subjectId: id(leader) } };
  const bootLeaders = options.bootLeaders ?? [8];
  const ranking = parseTouchlineActiveRankingState({ phase: "ranked", leagueKey: "touchline-england", snapshotId: built.snapshotId,
    roundId: built.roundId, publishedAt: now, priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION, scoringVersion: "player_scoring_v4",
    coverageStatus: "complete", seasonId: id(50), fixtureIds: ["19722190"], expectedFixtureIds: ["19722190"], totalScorePoints: 0,
    players: built.players, leadershipDecision,
    cardGoals: { source: "published-card-goals-v1", snapshotId: built.snapshotId,
      rows: Array.from({ length: options.unknown ? 9 : 8 }, (_, index) => ({ playerId: id(index + 1), goals: bootLeaders.includes(index + 1) ? 5 : 1 })) },
  });
  assert.ok(ranking, "synthetic input must pass the real public ranking admission");
  assert.equal(ranking.players.some(row => row.playerId === id(8)), false);
  assert.ok(ranking.leadershipDecision, "synthetic leadership must survive exact snapshot validation");
  const value = parseTouchlineSportsPublication({ version: 1, scopeKey: "touchline-england",
    publication: { snapshotId: id(100 + rev), contentDigest: rev.toString(16).padStart(32, "0"), publishedAt: now,
      playerRankingSnapshotId: options.withdrawn ? null : built.snapshotId, coachRankingSnapshotId: null, liveScoreSnapshotDigest: "e".repeat(32) },
    playerRanking: options.withdrawn ? null : ranking, coachRanking: null, live: { fetchedAt: now, fixtures: [] } });
  assert.ok(value, "every browser revision must pass the real sports envelope parser");
  return value;
}

function card(n: number): ClubOwnerSquadCard {
  return { id: id(n), canonicalPlayerId: id(n), providerPlayerId: String(100 + n),
    name: `Synthetic ${n}`, shortName: `Synthetic ${n}`, clubName: "Arsenal", countryCode3: "ENG",
    role: "ST", position: position(n), shirtNumber: n, touchlinePoints: 0, marketValue: "€1m",
    // A stale catalogue total must never resurrect after a publication withdrawal.
    seasonTotalRating: 999, matchRating: 7.2,
    matchStats: { goals: 1, assists: 2, defense: 3, cleanSheets: 0, saves: 1, penaltySaves: 0, goalsConceded: 1,
      yellowCards: 0, redCards: 0, ownGoals: 0, rating: 7.2, shotsOnTarget: 3, shotsOffTarget: 2, penaltiesMissed: 0 },
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" } };
}

test("published /rankings awards update together without replacing the selected player's dialog", {
  skip: process.env.TOUCHLINE_RUN_PODIUM_BROWSER_TESTS !== "1", timeout: 180_000,
}, async t => {
  const seed = publication(1);
  const catalogue = Array.from({ length: 8 }, (_, index) => card(index + 1));
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/RankingPodiumPublicationBrowserFixture.tsx", cssPrefix: "rankingpodium",
    requiredSources: ["app/rankings/touchline-tables-client.tsx", "app/rankings/touchline-tables.module.css",
      "components/touchline/cards/TouchlineCardLeadershipProvider.tsx", "components/touchline/cards/TouchlineCardZoom.tsx",
      "components/touchline/a11y/TouchlineDialog.tsx", "lib/touchlineArena/published-ranking-awards.ts",
      "lib/touchlineArena/published-ranking-summary.ts",
      "lib/touchlineArena/touchline-ranking-zoom-selection.ts", "lib/touchlineArena/live-presentation-client-store.ts"],
    mountScript: `window.unmountFixture=()=>flushSync(()=>root.unmount());window.transportDigest=()=>loadEntry().transportDigest();window.rerenderCatalogue=catalogue=>flushSync(()=>root.render(React.createElement(loadEntry().default,{...window.fixtureProps,catalogue})));flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));`,
  });
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
  const safe = (source: string) => source.replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root" data-touchline-orientation-root></div><script>window.fixtureProps=${safe(JSON.stringify({ seed, catalogue }))};</script><script>${safe(bundle.script)}</script></body></html>`;
  const publicRoot = realpathSync(path.join(root, "public"));
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  const reports: unknown[] = [];
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      let current = seed;
      const requests: string[] = [], refused: string[] = [], errors: string[] = [];
      const accepted = [seed.publication.contentDigest];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== origin) { refused.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort(); return; }
        if (url.pathname === routePath) { await route.fulfill({ contentType: "text/html", body: html }); return; }
        if (url.pathname === "/api/touchline-arena/live-presentation-state") {
          requests.push(`state:${current.publication.contentDigest}`);
          await route.fulfill({ json: { version: 1, available: true, mode: "idle", pollAfterMs: null, resumeAt: null,
            livePresentationSnapshotId: current.publication.contentDigest, playerRankingSnapshotId: current.publication.playerRankingSnapshotId,
            coachRankingSnapshotId: null } }); return;
        }
        if (url.pathname === "/api/touchline-arena/sports-publication") {
          requests.push(`payload:${current.publication.contentDigest}`);
          await route.fulfill({ json: { ok: true, data: current } }); return;
        }
        if (/^\/api\/touchline\/players\/\d+\/social$/.test(url.pathname)) { await route.fulfill({ status: 401, json: { ok: false } }); return; }
        const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) {
          await route.fulfill({ path: file }); return;
        }
        refused.push(url.pathname); await route.abort();
      });
      try {
        await page.goto(`${origin}${routePath}`, { waitUntil: "domcontentloaded" });
        const ball = page.locator('[data-ranking-award="best-player"]');
        const boot = page.locator('[data-ranking-award="golden-boot"]');
        const heading = page.locator('[data-ranking-podium-focus-anchor="true"]');
        const dialog = page.locator('[data-touchline-card-zoom="dialog"]');
        const summary = async (count: number | null, active = true) => {
          await expect(page.getByText(copy.rankedCards, { exact: true }).locator("..").locator("dd")).toHaveText(count === null ? "—" : String(count));
          await expect(page.getByText(copy.rankMode, { exact: true }).locator("..").locator("dd")).toHaveText(active ? copy.pointsMode : copy.marketMode);
          await expect(page.getByText(copy.publishedCards, { exact: true }).locator("..").locator("dd")).toHaveText("42");
        };
        const awards = async (ballId: number | null, bootIds: readonly number[]) => {
          await expect(ball.locator(triggerSelector)).toHaveCount(ballId === null ? 0 : 1);
          if (ballId === null) {
            await expect(ball.locator('[role="status"]')).toContainText(copy.rankingPendingDescription);
          } else {
            await expect(ball.locator(triggerSelector)).toHaveAttribute("aria-label", new RegExp(`Synthetic ${ballId}$`));
            await expect(ball.locator('[data-touchline-player-golden-ball="true"]')).toHaveCount(1);
          }
          await expect(boot.locator(triggerSelector)).toHaveCount(bootIds.length);
          const names = await boot.locator(triggerSelector).evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")?.match(/Synthetic (\d+)$/)?.[1]).sort());
          assert.deepEqual(names, bootIds.map(String).sort(), "all joint goal leaders, never just the first sorted row");
          await expect(boot.locator('[data-card-golden-boot="true"]')).toHaveCount(bootIds.length);
          if (!bootIds.length) await expect(boot).toContainText(presentationCopy.goldenBootPending);
        };
        await expect.poll(() => requests.filter(value => value.startsWith("payload:")).length).toBe(1);
        await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(seed.publication.contentDigest);
        await awards(6, [8]);
        await summary(7);
        await expect(boot.locator('[data-card-total-rating="true"]')).toHaveText("—");
        await expect(dialog).toHaveCount(0);
        await page.getByRole("textbox", { name: "Local note" }).fill("keep podium selection");
        await ball.locator(triggerSelector).click();
        await expect(dialog).toHaveCount(1);
        await expect(ball.locator(triggerSelector)).toHaveAttribute("aria-expanded", "true");
        const handle = await dialog.elementHandle();
        assert.ok(handle);
        const toggle = dialog.locator("button[aria-expanded]");
        await toggle.click();
        const scrollTarget = await dialog.evaluateHandle(element => {
          const target = [element, ...element.querySelectorAll<HTMLElement>("*")].find(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2);
          if (target) target.scrollTop = Math.min(37, target.scrollHeight - target.clientHeight);
          return target ?? element;
        });
        const beforeScroll = await scrollTarget.evaluate(element => element.scrollTop);
        if (viewport.width < 500) assert.ok(beforeScroll > 0, "portrait must exercise nonzero real modal scrolling");
        const sameDialog = async () => {
          await expect(dialog).toHaveCount(1);
          assert.equal(await handle.evaluate(node => node === document.querySelector('[data-touchline-card-zoom="dialog"]')), true);
          await expect(page.getByRole("textbox", { name: "Local note", includeHidden: true })).toHaveValue("keep podium selection");
        };
        const selectedTotal = async (total: number | null, preserveInteraction = true) => {
          await sameDialog();
          await expect(dialog.getByRole("heading", { name: "Synthetic 6", exact: true })).toHaveCount(1);
          await expect(dialog.locator('section[aria-label="Total rating"] > strong')).toHaveText(total === null ? "—" : String(total));
          const displayed = await dialog.locator('[data-card-total-rating="true"]').innerText();
          assert.equal(total === null ? displayed === "—" : Number(displayed) === total, true);
          if (preserveInteraction) {
            await expect(toggle).toHaveAttribute("aria-expanded", "true");
            await expect(toggle).toBeFocused();
            const scrollState = await scrollTarget.evaluate(element => ({ top: element.scrollTop, height: element.clientHeight,
              content: element.scrollHeight, tag: element.tagName, className: element.className }));
            assert.equal(scrollState.top, beforeScroll, JSON.stringify({ viewport, total, beforeScroll, scrollState }));
          }
        };
        const publish = async (next: ReturnType<typeof publication>) => {
          const count = requests.filter(value => value.startsWith("payload:")).length;
          current = next;
          await page.evaluate(() => window.dispatchEvent(new Event("online")));
          await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(next.publication.contentDigest);
          await expect.poll(() => requests.filter(value => value.startsWith("payload:")).length).toBe(count + 1);
          accepted.push(next.publication.contentDigest);
        };
        const rerenderCatalogue = async (cards: readonly ClubOwnerSquadCard[]) => {
          await page.evaluate(value => (window as unknown as { rerenderCatalogue: (cards: unknown) => void }).rerenderCatalogue(value), cards);
        };
        await selectedTotal(100);
        await publish(publication(2, { targetTotal: 95, rivalTotal: 120, bootLeaders: [6] }));
        await awards(7, [6]); await selectedTotal(95);
        await summary(7);
        // The same athlete now appears in Boot, but it is not the opening surface.
        await expect(boot.locator(triggerSelector)).toHaveAttribute("aria-expanded", "false");
        await expect(dialog.locator('[data-touchline-player-golden-ball="true"]')).toHaveCount(0);
        await expect(dialog.locator('[data-card-golden-boot="true"]')).toHaveCount(1);
        await publish(publication(3, { targetTotal: 110, rivalTotal: 120, bootLeaders: [6] }));
        await awards(7, [6]); await selectedTotal(110);
        await publish(publication(4, { targetTotal: -5, rivalTotal: 120, bootLeaders: [6] }));
        await selectedTotal(-5);
        await publish(publication(5, { targetTotal: 0, rivalTotal: 120, bootLeaders: [6] }));
        await selectedTotal(0);
        await publish(publication(6, { targetTotal: null, rivalTotal: 120, bootLeaders: [6] }));
        await awards(7, [6]); await selectedTotal(null);
        await summary(7);
        await publish(publication(7, { targetTotal: 120, rivalTotal: 120, tiedBall: true, bootLeaders: [6, 8] }));
        await awards(null, [6, 8]); await selectedTotal(120);
        await expect(page.locator('[data-touchline-player-golden-ball="true"]')).toHaveCount(0);
        await publish(publication(8, { withdrawn: true }));
        await awards(null, []); await selectedTotal(null);
        await summary(0, false);
        await expect(dialog.locator('[data-card-golden-boot="true"]')).toHaveCount(0);
        await publish(seed); await awards(6, [8]); await selectedTotal(100); await summary(7);
        // A newly ranked candidate blocks the whole award projection until the catalogue is complete.
        await publish(publication(9, { targetTotal: 105, rivalTotal: 120, bootLeaders: [9], unknown: true }));
        await awards(null, []); await selectedTotal(105);
        await summary(null);
        const readsBeforeCatalogue = requests.filter(value => value.startsWith("payload:")).length;
        const expandedCatalogue = [...catalogue, card(9)];
        await rerenderCatalogue(expandedCatalogue);
        await awards(9, [9]); await selectedTotal(105);
        await summary(8);
        assert.equal(requests.filter(value => value.startsWith("payload:")).length, readsBeforeCatalogue, "catalogue refresh does not fetch per card");
        // A catalogue identity conflict withdraws facts/actions without replacing the open host.
        await rerenderCatalogue(expandedCatalogue.map(item => item.canonicalPlayerId === targetId ? { ...item, providerPlayerId: "wrong" } : item));
        await sameDialog();
        await expect(dialog.locator('[data-ranking-podium-zoom-unavailable="true"]')).toBeVisible();
        await expect(dialog.locator('[data-card-total-rating="true"]')).toHaveCount(0);
        await expect(dialog.locator("a")).toHaveCount(0);
        await expect(dialog.getByRole("heading", { name: "Synthetic 6", exact: true })).toHaveCount(0);
        await summary(null);
        await expect(dialog.getByRole("button", { name: "Close card", exact: true })).toBeFocused();
        await rerenderCatalogue(expandedCatalogue);
        await selectedTotal(105, false); await awards(9, [9]);
        await summary(8);
        await expect(dialog.getByRole("button", { name: "Close card", exact: true })).toBeFocused();
        await expect(dialog.locator('[data-ranking-podium-zoom-unavailable="true"]')).toHaveCount(0);
        await expect(dialog.locator("a").first()).toBeVisible();
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
        if (process.env.TOUCHLINE_PODIUM_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_PODIUM_CAPTURE_PREFIX}-${viewport.width}x${viewport.height}.png` });
        // The original Ball trigger vanished; close restores the persistent section heading.
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(heading).toBeFocused();
        // A shared Ball/Boot identity still expands only its actual invoking surface.
        const jointLeaderBall = ball.locator(triggerSelector);
        await jointLeaderBall.click();
        await expect(dialog).toHaveCount(1);
        await expect(dialog.getByRole("heading", { name: "Synthetic 9", exact: true })).toHaveCount(1);
        await expect(jointLeaderBall).toHaveAttribute("aria-expanded", "true");
        await expect(boot.locator(triggerSelector)).toHaveAttribute("aria-expanded", "false");
        await page.keyboard.press("Escape"); await expect(jointLeaderBall).toBeFocused();
        await publish(seed); await awards(6, [8]);
        // When the invoker is still mounted, close returns focus to that exact trigger.
        const invoker = ball.locator(triggerSelector);
        await invoker.click(); await expect(invoker).toHaveAttribute("aria-expanded", "true");
        await expect(boot.locator(triggerSelector)).toHaveAttribute("aria-expanded", "false");
        await page.keyboard.press("Escape"); await expect(invoker).toBeFocused();
        assert.deepEqual(requests.filter(value => value.startsWith("payload:")), accepted.map(digest => `payload:${digest}`), "exactly one shared payload for each accepted publication, including reactivation");
        assert.deepEqual(errors, []); assert.deepEqual(refused, []);
        reports.push({ viewport, sameDialogAcrossLeadersAndIdentityLoss: true, beforeScroll,
          bootAllTiedLeaders: true, ballTieUnawarded: true, unknownCatalogueRecovery: true,
          inputPreserved: true, focusReturnAndFallback: true, payloadReads: accepted.length, bounds });
      } finally { await page.evaluate("window.unmountFixture?.()").catch(() => undefined); await context.close(); }
    }
    console.log(`RANKING_PODIUM_BROWSER_PROOF ${JSON.stringify({ reports, qualification: "isolated real React/CSS/shared transport with synthetic data; not Next/native Safari/QA/provider proof" })}`);
  } finally { await browser.close(); }
});

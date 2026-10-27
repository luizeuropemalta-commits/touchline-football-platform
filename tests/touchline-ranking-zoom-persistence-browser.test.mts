import assert from "node:assert/strict";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { compileRankingBrowserFixture } from "./helpers/touchline-ranking-browser-compile.mts";
import { buildTouchlineRankingSnapshot } from "../lib/touchlineArena/card-ranking.ts";
import { parseTouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";
import { parseTouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://ranking-zoom-fixture.test";
const routePath = "/touchline-player-card-rankings";
const now = "2026-10-23T12:00:00.000Z";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const targetId = id(6);
function publication(rev: number, total: number | null, extra = false, withdrawn = false) {
  const built = buildTouchlineRankingSnapshot({ snapshotId: `ranking:${rev}`, roundId: "synthetic-round", generatedAt: now,
    source: "simulation", status: "published", players: Array.from({ length: extra ? 31 : 30 }, (_, index) => ({
      playerId: id(index + 1), providerPlayerId: String(101 + index), name: `Synthetic ${index + 1}`, clubName: "Arsenal",
      position: ["GK", "CB", "RB", "CM", "RW"][index] ?? "ST",
      totalRating: index === 5 ? total : index < 5 ? 10 : index === 30 ? 150 : 105 - index,
      minutesPlayed: 90, appearances: 1,
    })) });
  const ranking = parseTouchlineActiveRankingState({ phase: "ranked", leagueKey: "touchline-england", snapshotId: built.snapshotId,
    roundId: built.roundId, publishedAt: now, priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION, scoringVersion: "player_scoring_v4",
    coverageStatus: "complete", seasonId: id(50), fixtureIds: ["19722190"], expectedFixtureIds: ["19722190"], totalScorePoints: 0,
    players: built.players, leadershipDecision: null, cardGoals: null });
  assert.ok(ranking);
  const value = parseTouchlineSportsPublication({ version: 1, scopeKey: "touchline-england",
    publication: { snapshotId: id(100 + rev), contentDigest: rev.toString(16).padStart(32, "0"), publishedAt: now,
      playerRankingSnapshotId: withdrawn ? null : built.snapshotId, coachRankingSnapshotId: null, liveScoreSnapshotDigest: "e".repeat(32) },
    playerRanking: withdrawn ? null : ranking, coachRanking: null, live: { fetchedAt: now, fixtures: [] } });
  assert.ok(value); return value;
}
function card(index: number): ClubOwnerSquadCard {
  return { id: id(index + 1), canonicalPlayerId: id(index + 1), providerPlayerId: String(101 + index),
    name: `Synthetic ${index + 1}`, shortName: `Synthetic ${index + 1}`, clubName: "Arsenal", countryCode3: "ENG",
    role: "ST", position: ["GK", "CB", "RB", "CM", "RW"][index] ?? "ST", shirtNumber: index + 1,
    touchlinePoints: 0, marketValue: "€1m", seasonTotalRating: 999, matchRating: 7.2,
    matchStats: { goals: 1, assists: 2, defense: 3, cleanSheets: 0, saves: 1, penaltySaves: 0, goalsConceded: 1,
      yellowCards: 0, redCards: 0, ownGoals: 0, rating: 7.2, shotsOnTarget: 3, shotsOffTarget: 2, penaltiesMissed: 0 },
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" } };
}

test("one ranking dialog survives top3/top20 removal, incomplete catalogue and withdrawal with real focus/scroll", {
  skip: process.env.TOUCHLINE_RUN_RANKING_ZOOM_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const seed = publication(1, 100);
  const catalogue = Array.from({ length: 30 }, (_, index) => card(index));
  const bundle = await compileRankingBrowserFixture("zoom", t.signal);
  const css = bundle.css;
  t.diagnostic(`Compiler exited before browser launch; ${bundle.sources.length} hashed sources: ${bundle.directory}`);
  const safe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root" data-touchline-orientation-root></div><script>window.fixtureProps=${safe(JSON.stringify({ seed, catalogue }))};</script><script>${safe(bundle.script)}</script></body></html>`;
  const publicRoot = realpathSync(path.join(root, "public"));
  t.signal.throwIfAborted();
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= browser.close();
  const abort = () => { void close().catch(() => undefined); };
  t.signal.addEventListener("abort", abort, { once: true });
  const reports: unknown[] = [];
  try {
    t.signal.throwIfAborted();
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      let current = seed;
      const requests: string[] = [], refused: string[] = [], errors: string[] = [];
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
        const phase = page.locator("[data-ranking-publication]");
        await expect(phase).toHaveAttribute("data-ranking-publication", "ready");
        await expect.poll(() => requests.filter(r => r.startsWith("payload:")).length).toBe(1);
        await expect(page.locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(23);
        await expect(page.locator('[data-card-total-rating="true"]')).toHaveCount(23);
        await page.getByRole("textbox", { name: "Local note" }).fill("keep ranking selection");
        const featured = page.locator(`[id="${targetId}"] [data-touchline-card-zoom="trigger"] > [role="button"]`);
        const table = page.locator(`[id="row-${targetId}"] [data-touchline-card-zoom="trigger"] > [role="button"]`);
        const heading = page.locator('[data-ranking-zoom-focus-anchor="true"]');
        const dialog = page.locator('[data-touchline-card-zoom="dialog"]');
        await featured.click();
        await expect(dialog).toHaveCount(1);
        await expect(featured).toHaveAttribute("aria-expanded", "true");
        await expect(table).toHaveAttribute("aria-expanded", "false");
        const handle = await dialog.elementHandle();
        const toggle = dialog.locator("button[aria-expanded]");
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        const scrollTarget = await dialog.evaluateHandle(element => {
          const target = [element, ...element.querySelectorAll<HTMLElement>("*")].find(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2);
          if (target) target.scrollTop = Math.min(37, target.scrollHeight - target.clientHeight);
          return target ?? element;
        });
        const beforeScroll = await scrollTarget.evaluate(element => element.scrollTop);
        if (viewport.width < 500) assert.ok(beforeScroll > 0, "portrait exercises real nonzero modal scrolling");
        const publish = async (next: ReturnType<typeof publication>) => {
          const count = requests.filter(r => r.startsWith("payload:")).length;
          current = next;
          await page.evaluate(() => window.dispatchEvent(new Event("online")));
          await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(next.publication.contentDigest);
          await expect.poll(() => requests.filter(r => r.startsWith("payload:")).length).toBe(count + 1);
        };
        const check = async (total: number | null) => {
          await expect(dialog).toHaveCount(1);
          assert.equal(await handle!.evaluate(node => node === document.querySelector('[data-touchline-card-zoom="dialog"]')), true);
          await expect(dialog.locator('section[aria-label="Total rating"] > strong')).toHaveText(total === null ? "—" : String(total));
          const cardTotal = await dialog.locator('[data-card-total-rating="true"]').innerText();
          assert.equal(total === null ? cardTotal === "—" : Number(cardTotal) === total, true);
          await expect(toggle).toHaveAttribute("aria-expanded", "true");
          await expect(toggle).toBeFocused();
          assert.equal(await scrollTarget.evaluate(element => element.scrollTop), beforeScroll);
          await expect(page.locator('input[aria-label="Local note"]')).toHaveValue("keep ranking selection");
        };
        await check(100);
        await publish(publication(2, 96.5)); await check(96.5);
        await expect(featured).toHaveCount(0); await expect(table).toHaveCount(1);
        await expect(table).toHaveAttribute("aria-expanded", "false");
        await publish(publication(3, 79.5)); await check(79.5);
        await expect(table).toHaveCount(0);
        await publish(publication(4, 105, true)); await check(105);
        await expect(phase).toHaveAttribute("data-ranking-publication", "incomplete");
        await page.evaluate(value => (window as unknown as { rerenderCatalogue: (cards: unknown) => void }).rerenderCatalogue(value), [...catalogue, card(30)]);
        await expect(phase).toHaveAttribute("data-ranking-publication", "ready"); await check(105);
        await publish(publication(5, 0)); await check(0);
        await publish(publication(6, null)); await check(null);
        await publish(publication(7, null, false, true)); await check(null);
        await expect(phase).toHaveAttribute("data-ranking-publication", "withdrawn");
        await publish(seed); await check(100);
        if (process.env.TOUCHLINE_RANKING_ZOOM_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_RANKING_ZOOM_CAPTURE_PREFIX}-${viewport.width}x${viewport.height}.png` });
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
        // Original trigger was removed. A new same-ID node is not that trigger.
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(heading).toBeFocused();
        // Existing invoker: only that surface is expanded and focus returns to it.
        await featured.click(); await expect(featured).toHaveAttribute("aria-expanded", "true"); await expect(table).toHaveAttribute("aria-expanded", "false");
        await page.keyboard.press("Escape"); await expect(featured).toBeFocused();
        // A table-origin dialog has the same lifetime guarantee beyond top20.
        await table.click(); await expect(table).toHaveAttribute("aria-expanded", "true"); await expect(featured).toHaveAttribute("aria-expanded", "false");
        const tableHandle = await dialog.elementHandle();
        await publish(publication(8, 79.5)); await expect(table).toHaveCount(0);
        assert.equal(await tableHandle!.evaluate(node => node === document.querySelector('[data-touchline-card-zoom="dialog"]')), true);
        await expect(dialog.locator('section[aria-label="Total rating"] > strong')).toHaveText("79.5");
        // Identity loss must remove facts/actions, not retain a stale card.
        await page.evaluate(value => (window as unknown as { rerenderCatalogue: (cards: unknown) => void }).rerenderCatalogue(value), catalogue.map(c => c.canonicalPlayerId === targetId ? { ...c, providerPlayerId: "wrong" } : c));
        await expect(dialog.locator('[data-ranking-zoom-unavailable="true"]')).toBeVisible();
        await expect(dialog.locator('[data-card-total-rating="true"]')).toHaveCount(0);
        await expect(dialog.locator("a")).toHaveCount(0);
        assert.equal(await tableHandle!.evaluate(node => node === document.querySelector('[data-touchline-card-zoom="dialog"]')), true);
        await page.keyboard.press("Escape"); await expect(heading).toBeFocused();
        assert.deepEqual(errors, []); assert.deepEqual(refused, []);
        reports.push({ viewport, sameDialogAcrossRevisions: true, beforeScroll, oneExpandedInvoker: true,
          focusFallback: true, payloadReads: requests.filter(r => r.startsWith("payload:")).length, bounds });
      } finally { await page.evaluate("window.unmountFixture?.()").catch(() => undefined); await context.close(); }
    }
    console.log(`RANKING_ZOOM_BROWSER_PROOF ${JSON.stringify({ reports, qualification: "isolated real React/CSS/transport with synthetic data; not Next/native Safari/QA/provider proof" })}`);
  } finally { t.signal.removeEventListener("abort", abort); await close(); }
});

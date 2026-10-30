import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium, webkit, firefox, expect, type Browser } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { TOUCHLINE_ENGLAND_CLUBS_BY_RANK, findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import { resolveTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";
import type { TouchlineCoach } from "../lib/football-data/types.ts";
import type { TouchlineFantasySnapshot } from "../lib/touchlineFantasy/server.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";

// Real product component, card zoom, canonical plan dialog and CSS. Synthetic
// CUSTOMER fixture only: every request is intercepted; every write is rejected.
const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://beta-locks.test";
const allowedClub = findTouchLineClub("22")!;
const blockedClub = findTouchLineClub("19")!;
const accountId = "30000000-0000-4000-8000-000000000001";
const seasonId = "30000000-0000-4000-8000-000000000003";
function fixture(plan: "beta" | "standard" = "beta", active = true) {
  const access = resolveTouchlineFantasyMarketAccess(plan); assert.ok(access);
  const now = Date.now();
  const round = { id: "synthetic-locks-round", number: 7, state: "MARKET_OPEN" as const,
    marketOpensAt: new Date(now - 3600000).toISOString(), locksAt: new Date(now + 3600000).toISOString(),
    firstFixtureAt: new Date(now + 3600000).toISOString(), lastFixtureAt: new Date(now + 7200000).toISOString() };
  const coach: TouchlineCoach = { id: "synthetic-locks-coach", providerId: "synthetic-locks-coach", provider: "sportmonks",
    name: "Synthetic Coach", displayName: "Synthetic Coach", teamId: allowedClub.teamId, nationality: "England",
    source: { provider: "sportmonks", providerId: "synthetic-locks-coach", lastSyncedAt: new Date(now).toISOString() } };
  const snapshot: TouchlineFantasySnapshot = { userId: accountId, entitlementActive: active, marketAccess: access,
    plan: { active, expiresAt: null }, config: { seasonId, budgetEur: access.budgetEur!, maxPlayersPerClub: 11, lockOffsetMinutes: 0 },
    gameweeks: [round], activeGameweek: round, selections: [],
    userGameweek: { id: "synthetic-locks-lineup", formationCode: "4-3-3", state: "DRAFT", selectedCoachId: coach.id, totalMarketValueEur: 0, carriedFromPrevious: false },
    catalogue: TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club, index) => ({ id: `synthetic-keeper-${club.teamId}`, canonicalPlayerId: `synthetic-keeper-${club.teamId}`,
      name: `Synthetic Keeper ${club.shortCode}`, shortName: `Keeper ${club.shortCode}`, role: "goalkeeper", position: "Goalkeeper", primaryPositionDetail: "Goalkeeper",
      clubName: club.name, shirtNumber: index + 1, countryCode3: "ENG", marketValue: "", marketValueState: "verified", touchlinePoints: 0, seasonTotalRating: null,
      editorialCard: { tierKey: "radiant-gold", marketValueEur: club.teamId === blockedClub.teamId ? 90_000_000 : 1_000_000, marketValueState: "verified", cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-30T00:00:00Z" } })),
    coaches: [{ id: coach.id, coach, slot: createTouchlineArenaCoachSlot(coach, null, "radiant-gold"), clubId: allowedClub.teamId,
      clubName: allowedClub.name, clubLogoUrl: null, countryCode3: "ENG", competition: null }],
    formationRegistry: TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY, lineupAlerts: [], gameweekScore: 0, seasonScore: 0, matchHistory: [], gameweekRanking: [], seasonRanking: [] };
  const state: ClubAcquisitionState = { revision: 1, seasonId, plan, balanceEur: access.budgetEur! - 25_000_000,
    formationCode: "4-3-3", coach: { id: coach.id, tier: "radiant-gold", valueEur: 25_000_000 }, players: [], receipts: [] };
  return { snapshot, state };
}
const bundle = () => bundleIsolatedBrowserFixture({ entryPath: "app/fantasy/FantasyGameweekClient.tsx",
  additionalEntryPaths: ["components/touchline/fantasy/ClubCollectionContext.tsx"],
  requiredSources: ["app/fantasy/FantasyGameweekClient.tsx", "app/fantasy/fantasy.module.css", "components/touchline/cards/TouchlineCardZoom.tsx",
    "components/touchline/ClubOwnerPlanOnboarding.tsx", "components/touchline/a11y/TouchlineDialog.tsx"],
  mountScript: `const Fantasy=loadEntry().default;const Provider=loadAdditionalEntry("components/touchline/fantasy/ClubCollectionContext.tsx").ClubCollectionProvider;flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Provider,null,React.createElement(Fantasy,window.fixtureProps)))));window.unmountFixture=()=>flushSync(()=>root.unmount());` });
async function mount(browser: Browser, product: ReturnType<typeof bundle>, locale: "en-GB" | "pt-BR", width: number,
  options: { plan?: "beta" | "standard"; active?: boolean; unknown?: boolean } = {}) {
  const { snapshot, state } = fixture(options.plan, options.active);
  if (options.unknown) snapshot.marketAccess = null;
  const context = await browser.newContext({ viewport: { width, height: width < 900 ? 390 : 900 }, hasTouch: width < 900, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(10000);
  const errors: string[] = [], consoleErrors: string[] = [], unexpected: string[] = [], writes: string[] = [];
  const expectedHttpErrors = new Map<string, number>();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const url = message.location().url, remaining = expectedHttpErrors.get(url) ?? 0;
    if (remaining > 0 && message.text() === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)") expectedHttpErrors.set(url, remaining - 1);
    else consoleErrors.push(message.text());
  });
  const props = { initialSnapshot: snapshot, locale, embedded: true, marketPage: true, collectionEnabled: true, initialPlayerClubTeamId: allowedClub.teamId };
  const safe = (value: string) => value.replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#020907;color:#f8fafc;font-family:Arial,sans-serif}button,input{font:inherit}#root{max-width:1440px;margin:auto;padding:16px}${product.css}</style></head><body><div id="root"></div><script>window.fixtureProps=${safe(JSON.stringify(props))};</script><script>${safe(product.script)}</script></body></html>`;
  const publicRoot = realpathSync(path.join(root, "public"));
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") { writes.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
    if (url.origin !== origin) { unexpected.push(`external:${url.hostname}`); await route.abort(); return; }
    if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html", body: html }); return; }
    if (["/api/touchline-fantasy/collection", "/api/touchline-fantasy/collection/read"].includes(url.pathname)) {
      await route.fulfill({ json: { ok: true, state, accountId, seasonId } }); return;
    }
    if (url.pathname === "/api/touchline-fantasy/state") { await route.fulfill({ json: { ok: true, ...snapshot } }); return; }
    if (url.pathname === "/api/touchline-arena/live-presentation-state") {
      await route.fulfill({ json: { version: 1, available: false, playerRankingSnapshotId: null, coachRankingSnapshotId: null, livePresentationSnapshotId: null, mode: "idle", pollAfterMs: null, resumeAt: null } }); return;
    }
    if (["/api/touchline-awards/golden-boot", "/api/touchline-arena/card-ranking/active", "/api/football-data/fantasy/livescores"].includes(url.pathname)) {
      expectedHttpErrors.set(request.url(), (expectedHttpErrors.get(request.url()) ?? 0) + 1); await route.fulfill({ status: 503, json: { ok: false } }); return;
    }
    const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    if (/\.(png|webp|svg|jpg|jpeg|woff2?|json)$/i.test(url.pathname) && file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) {
      const mime: Record<string,string> = { ".png":"image/png", ".webp":"image/webp", ".svg":"image/svg+xml", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".woff":"font/woff", ".woff2":"font/woff2", ".json":"application/json" };
      await route.fulfill({ contentType: mime[path.extname(file).toLowerCase()], body: readFileSync(file) }); return;
    }
    unexpected.push(url.pathname); await route.abort();
  });
  await page.goto(origin + "/fixture", { waitUntil: "domcontentloaded" });
  return { page, state, snapshot, async clean() { assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpected, []); assert.deepEqual(writes, []); },
    async close() { await page.evaluate("window.unmountFixture()").catch(()=>{}); await context.close(); } };
}

test("Beta card locks: browse all clubs, inspect zoom and unlock canonical plans without mutation", {
  skip: process.env.TOUCHLINE_RUN_BETA_CARD_LOCKS_BROWSER !== "1", timeout: 180_000,
}, async t => {
  const engineName = process.env.TOUCHLINE_CARD_LOCKS_ENGINE ?? "chromium";
  assert.ok(["chromium", "webkit", "firefox"].includes(engineName));
  const engines = { chromium, webkit, firefox };
  const engine = engines[engineName as keyof typeof engines];
  const product = bundle(), browser = await engine.launch({ headless: true, timeout: 15_000 });
  const captureDir = process.env.TOUCHLINE_CARD_LOCKS_CAPTURE_DIR;
  if (captureDir) mkdirSync(captureDir, { recursive: true });
  try {
    for (const [locale,width] of [["en-GB",1280],["pt-BR",844],["pt-BR",1024]] as const) await t.test(`${engineName} ${locale} ${width}`, async () => {
      const f = await mount(browser,product,locale,width);
      try {
        const { page } = f, list = page.locator("#my-club-player-selection"), unlock = locale === "pt-BR" ? "Desbloquear" : "Unlock";
        const opening = page.locator('button[data-guided-action="true"]').first(); await expect(opening).toBeEnabled(); await opening.click();
        const destination = list.locator("[data-collection-market-destination]"); await expect(destination).toHaveAttribute("data-collection-market-destination","starters:0");
        const clubs = list.getByRole("group").first(); await expect(clubs.getByRole("button")).toHaveCount(20);
        await expect(clubs.locator("[data-market-club-locked]")).toHaveCount(14);
        for (const club of TOUCHLINE_ENGLAND_CLUBS_BY_RANK) {
          const button = clubs.locator("button").filter({ has: page.locator("img") }).nth(TOUCHLINE_ENGLAND_CLUBS_BY_RANK.indexOf(club));
          await button.click(); await expect(button).toHaveAttribute("aria-pressed","true");
          const card = list.locator("article[data-market-tier-frame]"); await expect(card).toHaveCount(1); await expect(card).toContainText(club.name);
          const locked = !f.snapshot.marketAccess!.allowedClubTeamIds!.includes(club.teamId);
          await expect(card.getByRole("button",{name:unlock,exact:true})).toHaveCount(locked?1:0);
          await expect(card.locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(1);
          await expect(card.locator("[data-market-card-lock]")).toHaveCount(locked?1:0);
          if(locked) { await expect(card).toHaveAttribute("data-market-plan-locked","true"); await expect(card).not.toHaveAttribute("data-market-budget-locked","true"); }
        }
        await clubs.getByRole("button",{name:new RegExp(`^${blockedClub.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")} ·`)}).click();
        const card = list.locator("article[data-market-plan-locked]"); const inline = card.getByRole("button",{name:unlock,exact:true});
        const search = list.locator("input"); await search.fill("not-a-player"); await expect(list.locator("article[data-market-tier-frame]")).toHaveCount(0);
        await expect(list).toContainText(locale==="pt-BR"?"Nenhum card corresponde":"No cards match"); await search.fill("");
        await expect(inline).toHaveCSS("border-radius", "999px");
        assert.ok((await inline.boundingBox())!.height >= 44);
        if(captureDir) await list.screenshot({path:`${captureDir}/locks-${engineName}-${width}-${locale}.png`,animations:"disabled"});
        await inline.click(); const plans = page.locator('dialog[data-plan-onboarding="true"]'); await expect(plans).toBeVisible();
        await expect(plans.locator('[data-plan-gallery] > article')).toHaveCount(4);
        assert.equal(await plans.evaluate(el=>el.matches(":modal")),true);
        await page.keyboard.press("Escape"); await expect(plans).toHaveCount(0); await expect(inline).toBeFocused();
        const zoomTrigger=card.locator('[data-touchline-card-zoom="trigger"]').getByRole("button"); await zoomTrigger.click();
        const zoom=page.locator('[role="dialog"]').filter({has:page.locator('[data-zoom-signing-actions="true"]')}); await expect(zoom).toHaveCount(1);
        const zoomUnlock=zoom.getByRole("button",{name:unlock,exact:true}); await expect(zoomUnlock).toBeEnabled();
        await expect(zoom).toContainText(locale==="pt-BR"?"Mude de plano para desbloquear.":"Upgrade your plan to unlock.");
        if(captureDir) await page.screenshot({path:`${captureDir}/zoom-${engineName}-${width}-${locale}.png`,animations:"disabled"});
        await zoomUnlock.click(); await expect(plans).toBeVisible(); assert.equal(await zoom.evaluate(el=>el.inert),true);
        for(let n=0;n<18;n++) { await page.keyboard.press(n<9?"Tab":"Shift+Tab"); assert.equal(await plans.evaluate(el=>el.contains(document.activeElement)),true); }
        await plans.getByRole("button", { name: locale === "pt-BR" ? "Ver benefícios: Standard" : "View benefits: Standard", exact: true }).click(); await expect(plans.locator('[data-plan-detail="standard"]')).toBeVisible();
        if(captureDir) await page.screenshot({path:`${captureDir}/plans-${engineName}-${width}-${locale}.png`,animations:"disabled"});
        await page.keyboard.press("Escape"); await expect(plans).toHaveCount(0); await expect(zoom).toHaveCount(1); await expect(zoomUnlock).toBeFocused();
        assert.equal(await zoom.evaluate(el=>el.inert),false);
        await page.keyboard.press("Escape"); await expect(zoom).toHaveCount(0); await expect(zoomTrigger).toBeFocused();
        await expect(clubs.getByRole("button",{name:new RegExp(`^${blockedClub.name}`)})).toHaveAttribute("aria-pressed","true");
        await expect(destination).toHaveAttribute("data-collection-market-destination","starters:0");
        assert.equal(f.state.balanceEur,75_000_000); assert.equal(f.state.players.length,0); await f.clean();
      } finally { await f.close(); }
    });
    for(const scenario of [{plan:"standard" as const},{active:false},{unknown:true}]) await t.test(`${engineName} authority ${JSON.stringify(scenario)}`,async()=>{
      const f=await mount(browser,product,"en-GB",1280,scenario);
      try {
        if(scenario.unknown) { await expect(f.page.locator('[data-fantasy-context="my-club"]')).toContainText("unavailable",{ignoreCase:true}); await expect(f.page.locator('#my-club-player-selection')).toHaveCount(0); }
        else {
          const list=f.page.locator('#my-club-player-selection');
          await expect(list).toBeVisible(); await expect(f.page.getByRole("button",{name:"Unlock",exact:true})).toHaveCount(0);
          if(scenario.plan === "standard") {
            await f.page.locator('button[data-guided-action="true"]').first().click();
            await list.getByRole("group").first().getByRole("button",{name:blockedClub.name,exact:true}).click();
            const card=list.locator('article[data-market-tier-frame]'); await expect(card).toHaveCount(1);
            const sign=card.getByRole("button",{name:"Sign",exact:true}); await expect(sign).toBeEnabled(); await sign.click();
            await expect(card.getByRole("button",{name:"Confirm signing",exact:true})).toBeEnabled();
            assert.equal(f.state.players.length,0,"staging never acquires a card");
          }
        }
        await expect(f.page.locator('[data-plan-onboarding]')).toHaveCount(0); await f.clean();
      } finally {await f.close();}
    });
  } finally {await browser.close();}
});

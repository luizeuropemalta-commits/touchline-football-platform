import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { bundleIsolatedBrowserFixture, transpileFixtureModule } from "./helpers/touchline-isolated-browser-bundle.mts";
import { chromium, webkit, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
import { findTouchLineClub, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import { validateTouchlineFantasyLineup } from "../lib/touchlineFantasy/domain.ts";
import { touchlineMarketPositionBucket, type TouchlineRosterRole } from "../lib/touchlineArena/position-eligibility.ts";
import type { TouchlineCoach } from "../lib/football-data/types.ts";
import type { TouchlineFantasySnapshot } from "../lib/touchlineFantasy/server.ts";
import { resolvePlayerAvailabilityBadge } from "../lib/touchlineArena/player-availability-badge.ts";
import { getTouchlineFantasyMarketBudgetCopy } from "../lib/touchlineFantasy/market-budget-i18n.ts";
import { isTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";
import { acquireClubPlayer, type ClubAcquisitionState, type ClubAcquisitionCommand } from "../lib/touchlineFantasy/club-acquisition.ts";
import { clubPlayerPosition } from "../lib/touchlineFantasy/club-position.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/club-position-plan.ts";

// Finite, opt-in DOM proof only. No server, credentials, real account, provider,
// DB, Next build or remote assets. All requests are fulfilled/aborted locally.
// The complete product component/children/CSS/domain are used, not copied handlers.
const enabled = process.env.TOUCHLINE_RUN_XI_BROWSER_TESTS === "1";
function parseXiKeyboardMode(value: string | undefined): "normal" | "diagnostic" | "all" {
  if (value === undefined || value === "0") return "normal";
  if (value === "1") return "diagnostic";
  assert.equal(value, "all", "Unrecognized TOUCHLINE_DIAGNOSE_XI_KEYBOARD");
  return "all";
}
const keyboardMode = parseXiKeyboardMode(process.env.TOUCHLINE_DIAGNOSE_XI_KEYBOARD);
function parseXiScope(value: string | undefined): "full" | "webkit-en-focus" {
  if (value === undefined || value === "full") return "full";
  assert.equal(value, "webkit-en-focus", "Unrecognized TOUCHLINE_XI_BROWSER_SCOPE");
  return "webkit-en-focus";
}
const browserScope = parseXiScope(process.env.TOUCHLINE_XI_BROWSER_SCOPE);
function validateXiKeyboardScope(mode: ReturnType<typeof parseXiKeyboardMode>, scope: ReturnType<typeof parseXiScope>) {
  assert.ok(mode === "normal" || scope === "full", "Keyboard diagnostic cannot be combined with a partial scenario scope");
}
validateXiKeyboardScope(keyboardMode, browserScope);
const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://xi.test";
const geometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"];
const club = findTouchLineClub("Arsenal")!;
const targetSlot = geometry.slots.find(slot => slot.allowedPositions.includes("centre-forward"))!;
const positionNames = {
  goalkeeper: "Goalkeeper", "centre-back": "Centre Back", "right-back": "Right Back", "left-back": "Left Back",
  "defensive-midfield": "Defensive Midfield", midfield: "Central Midfield", attacker: "Winger", "centre-forward": "Centre Forward",
} as const;

function fixtureSnapshot(locked = false, formationCode = "4-3-3"): TouchlineFantasySnapshot {
  assert.ok(club); assert.ok(targetSlot);
  const lineupGeometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY[formationCode];
  assert.ok(lineupGeometry, `unknown synthetic fixture formation ${formationCode}`);
  const now = Date.now();
  const round = { id: "xi-fixture-round", number: 7, state: locked ? "LOCKED" as const : "MARKET_OPEN" as const,
    marketOpensAt: new Date(now - 3_600_000).toISOString(), locksAt: new Date(now + 3_600_000).toISOString(),
    firstFixtureAt: new Date(now + 3_600_000).toISOString(), lastFixtureAt: new Date(now + 7_200_000).toISOString() };
  const coach: TouchlineCoach = { id: "xi-coach", providerId: "xi-coach", provider: "sportmonks",
    name: "Synthetic XI Coach", displayName: "Synthetic XI Coach", teamId: club.teamId, nationality: "England",
    source: { provider: "sportmonks", providerId: "synthetic-xi-coach", lastSyncedAt: new Date(now).toISOString() } };
  // Explicitly synthetic football/card data, confined to this intercepted page.
  const catalogue: ClubOwnerSquadCard[] = lineupGeometry.slots.map((slot, index) => ({
    id: `xi-player-${index}`, canonicalPlayerId: `xi-player-${index}`, name: `Synthetic ${slot.id} Player`, shortName: `Fixture ${slot.id}`,
    role: slot.role, position: positionNames[slot.allowedPositions[0]], clubName: club.name, shirtNumber: index + 1,
    countryCode3: "ENG", marketValue: "", marketValueState: "verified", touchlinePoints: 0, seasonTotalRating: null,
    editorialCard: { tierKey: "radiant-gold", marketValueEur: 1_000_000, marketValueState: "verified",
      cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-03T00:00:00Z" },
  }));
  const replacementIndex = Math.max(0, lineupGeometry.slots.findIndex(slot => slot.allowedPositions.includes("centre-forward")));
  const original = catalogue[replacementIndex];
  catalogue.push({ ...original, id: "xi-replacement", canonicalPlayerId: "xi-replacement", name: "Synthetic Replacement", shortName: "Replacement" });
  const selections = lineupGeometry.slots.map((slot, index) => ({ slotId: slot.id, playerId: `xi-player-${index}` }));
  const valid = validateTouchlineFantasyLineup({ selections, geometry: lineupGeometry,
    players: catalogue.map(card => ({ playerId: card.id, clubId: card.clubName, marketValueEur: 1_000_000,
      positionBucket: touchlineMarketPositionBucket(card.position, card.role as TouchlineRosterRole) as Exclude<ReturnType<typeof touchlineMarketPositionBucket>, "outfield"> })),
    budgetEur: 400_000_000, maxPlayersPerClub: 11, requireComplete: true });
  assert.equal(valid.valid, true, "synthetic fixture must satisfy the real eligibility validator before mounting");
  return { userId: "synthetic-local-owner", entitlementActive: true,
    marketAccess: { planKey: "standard", budgetEur: 400_000_000, allowedClubTeamIds: null },
    plan: { active: true, expiresAt: null },
    config: { budgetEur: 400_000_000, maxPlayersPerClub: 11, lockOffsetMinutes: 0 }, gameweeks: [round], activeGameweek: round,
    userGameweek: { id: "xi-fixture-lineup", formationCode, state: "DRAFT", totalMarketValueEur: 11_000_000, carriedFromPrevious: false, selectedCoachId: coach.id },
    selections, catalogue, coaches: [{ id: coach.id, coach, slot: createTouchlineArenaCoachSlot(coach, null, "radiant-gold"),
      clubId: club.teamId, clubName: club.name, clubLogoUrl: null, countryCode3: "ENG", competition: null }],
    formationRegistry: TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY, lineupAlerts: [], gameweekScore: 0, seasonScore: 0,
    matchHistory: [], gameweekRanking: [], seasonRanking: [] };
}

type Bundle = { script: string; css: string; sources: string[] };
function exhaustedBetaSnapshot(): TouchlineFantasySnapshot {
  const snapshot = fixtureSnapshot();
  const betaClub = findTouchLineClub("22")!;
  const selectedIds = new Set([...snapshot.selections.slice(0, 4), snapshot.selections.find(selection => selection.slotId === targetSlot.id)!].map(selection => selection.playerId));
  const catalogue = snapshot.catalogue.map(card => ({ ...card, clubName: betaClub.name,
    editorialCard: { ...card.editorialCard!, marketValueEur: card.id === "xi-replacement" ? 5_000_000 : 10_000_000 } }));
  const expensive = catalogue.find(card => card.id === "xi-replacement")!;
  catalogue.push({ ...expensive, id: "xi-expensive", canonicalPlayerId: "xi-expensive", name: "Synthetic Expensive", shortName: "Expensive",
    editorialCard: { ...expensive.editorialCard!, marketValueEur: 11_000_000 } });
  const selections = snapshot.selections.filter(selection => selectedIds.has(selection.playerId));
  return { ...snapshot, marketAccess: { planKey: "beta", budgetEur: 50_000_000, allowedClubTeamIds: ["22", "117", "116", "52"] },
    config: { ...snapshot.config, budgetEur: 50_000_000 }, catalogue, selections,
    userGameweek: { ...snapshot.userGameweek!, totalMarketValueEur: 50_000_000 },
    coaches: snapshot.coaches.map(entry => ({ ...entry, clubId: betaClub.teamId, clubName: betaClub.name,
      coach: { ...entry.coach, teamId: betaClub.teamId } })) };
}

test("XI browser fixtures use recognized Standard 400M and exact Beta five-player 50M budgets", () => {
  for (const [snapshot, expectedPlan, expectedTotal, expectedRemaining] of [
    [fixtureSnapshot(), "standard", 11_000_000, 389_000_000],
    [exhaustedBetaSnapshot(), "beta", 50_000_000, 0],
  ] as const) {
    assert.equal(isTouchlineFantasyMarketAccess(snapshot.marketAccess), true);
    assert.equal(snapshot.marketAccess?.planKey, expectedPlan);
    assert.equal(snapshot.entitlementActive, true);
    assert.equal(snapshot.plan.active, true);
    assert.equal(snapshot.config.budgetEur, snapshot.marketAccess?.budgetEur);
    const validation = validateTouchlineFantasyLineup({ selections: snapshot.selections, geometry,
      players: snapshot.catalogue.map(card => ({ playerId: card.canonicalPlayerId ?? card.id, clubId: card.clubName,
        marketValueEur: card.editorialCard!.marketValueEur,
        positionBucket: touchlineMarketPositionBucket(card.position, card.role as TouchlineRosterRole) as Exclude<ReturnType<typeof touchlineMarketPositionBucket>, "outfield"> })),
      budgetEur: snapshot.marketAccess!.budgetEur, maxPlayersPerClub: 11, requireComplete: false });
    assert.equal(validation.valid, true);
    assert.equal(validation.totalMarketValueEur, expectedTotal);
    assert.equal(validation.budgetRemainingEur, expectedRemaining);
    assert.equal(snapshot.userGameweek?.totalMarketValueEur, expectedTotal);
  }
});

test("fixture module lowering initializes ESM dependencies before body in source order", async () => {
  const execute = (source: string, fileName: string, dependencies: Record<string, unknown>) => {
    const fixtureModule = { exports: {} as Record<string, unknown> };
    runInNewContext(transpileFixtureModule(source, fileName), { module: fixtureModule, exports: fixtureModule.exports, require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unmapped regression dependency: ${name}`);
      return dependencies[name];
    } }, { timeout: 1_000 });
    return fixtureModule.exports;
  };
  // The real source intentionally has an import after a top-level initializer.
  // Native ESM is the control; no product source is rearranged for this fixture.
  const native = await import("../lib/touchlineArena/country-flags.ts");
  const countryPath = path.join(root, "lib/touchlineArena/country-flags.ts");
  const country = execute(readFileSync(countryPath, "utf8"), countryPath, {
    "./iso-alpha3-to-alpha2.generated.ts": await import("../lib/touchlineArena/iso-alpha3-to-alpha2.generated.ts"),
  }) as typeof native;
  assert.equal(native.normalizeTouchlineCountryCode3("ZA"), "ZAF");
  assert.equal(country.normalizeTouchlineCountryCode3("ZA"), "ZAF");
  assert.equal(country.touchlineCountryFlagUrl("ENG"), "/touchlineArena/shared/country-flags-4x3/gb-eng.svg");
  assert.equal(country.touchlineCountryFlagUrl("ZAF"), "/touchlineArena/shared/country-flags-4x3/za.svg");

  const order: string[] = [];
  const dependency = { value: 7 };
  const fixtureModule = { exports: {} as { initial?: number; read?: () => number; forwarded?: number } };
  const lowered = transpileFixtureModule(`"use client";
    record('body'); export const initial=value; export function read(){return value;}
    import './side-effect'; import {value} from './value'; export {forwarded} from './forwarded';
  `, "dependency-order.ts");
  assert.ok(lowered.indexOf('"use client"') < lowered.indexOf('require("./side-effect")'));
  runInNewContext(lowered, { module: fixtureModule, exports: fixtureModule.exports, record: (value: string) => order.push(value), require(name: string) {
    order.push(name);
    if (name === "./side-effect") return {};
    if (name === "./value") return dependency;
    assert.equal(name, "./forwarded"); return { forwarded: 9 };
  } }, { timeout: 1_000 });
  assert.deepEqual(order, ["./side-effect", "./value", "./forwarded", "body"]);
  assert.equal(fixtureModule.exports.initial, 7); assert.equal(fixtureModule.exports.forwarded, 9);
  dependency.value = 11; assert.equal(fixtureModule.exports.read?.(), 11, "named import must remain a live property read");
});

function bundleProduct(): Bundle {
  return bundleIsolatedBrowserFixture({
    entryPath: "app/fantasy/FantasyGameweekClient.tsx",
    requiredSources: ["app/fantasy/FantasyGameweekClient.tsx", "app/fantasy/fantasy.module.css",
      "lib/touchlineFantasy/domain.ts", "components/touchline/fantasy/TouchlineGameweekCard.tsx",
      "components/touchline/cards/TouchlineCardZoom.tsx", "components/touchline/cards/TouchlineEliteExactCard.tsx",
      "components/touchline/pitch/TouchlinePitchSurface.tsx"],
    mountScript: `
      function markPhase(phase){window.fixtureMountPhase=phase;console.info('XI_MOUNT_PHASE '+JSON.stringify({phase,atMs:Math.round(performance.now())}));}
      markPhase('module-load');
      const Fantasy=loadEntry().default;
      window.fixtureScrolls=[];const nativeScroll=Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView=function(options){window.fixtureScrolls.push({id:this.id,behavior:options?.behavior});return nativeScroll.call(this,options);};
      window.unmountFixture=()=>flushSync(()=>root.unmount());
      markPhase('render-start');
      flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Fantasy,window.fixtureProps))));
      markPhase('render-returned');
    `,
  });
}

type Mode = { locale: "en-GB" | "pt-BR"; touch: boolean; reduced: boolean };
const modes: Mode[] = [{ locale: "en-GB", touch: false, reduced: false }, { locale: "pt-BR", touch: true, reduced: true }];
test("original market mounted: explicit destination cancellation delayed confirmation", {
  skip: process.env.TOUCHLINE_RUN_ORIGINAL_MARKET_BROWSER !== "1", timeout: 180_000,
}, async t => {
  const bundle = bundleProduct();
  const engine = process.env.TOUCHLINE_MARKET_ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  try {
    for (const area of ["starters", "reserves", "outside"] as const) await t.test(`${engine.name()} ${area}`, async () => {
      const fixture = await openFixture(browser, bundle, { locale: "en-GB", touch: area === "outside", reduced: true }, {
        collection: true, holdCollection: true, marketVacancy: area,
        viewport: area === "outside" ? { width: 844, height: 390 } : { width: 1280, height: 900 },
      });
      try {
        const { page, list } = fixture;
        if(area === "reserves") assert.ok(fixture.collection?.players.every(p => p.primaryDetail === undefined), "legacy fixture must NOT backfill stored contracts");
        const opening = page.locator('button[data-guided-action="true"]').first();
        await expect(opening).toBeEnabled(); await opening.click();
        const destination = list.locator("[data-collection-market-destination]");
        await expect(destination).toHaveAttribute("data-collection-market-destination", `${area}:0`);
        await expect(list).toBeFocused();
        await expect(list.locator("img")).not.toHaveCount(0);
        await expect(list.locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(1);
        await expect(page.getByRole("dialog", { name: "Select player", exact: true })).toHaveCount(0);
        await list.getByRole("button", { name: "Sign", exact: true }).click();
        const signingConfirmation = list.locator("[data-collection-signing-confirmation]");
        await expect(signingConfirmation).toHaveCount(1);
        await expect(signingConfirmation).toHaveAttribute("data-collection-signing-confirmation", `fictional-${area}-0`);
        await expect(destination.getByRole("button", { name: "Confirm signing", exact: true })).toHaveCount(0);
        await expect(signingConfirmation.getByRole("button", { name: "Confirm signing", exact: true })).toBeEnabled();
        if (process.env.TOUCHLINE_MARKET_CAPTURE_DIR) await list.screenshot({ path: `${process.env.TOUCHLINE_MARKET_CAPTURE_DIR}/original-market-${engine.name()}-${area}.png`, animations: "disabled" });
        assert.equal(fixture.collectionWrites.length, 0, "staging is not a purchase");
        await list.getByRole("button", { name: /Back to pitch/i }).click();
        await expect(destination).toHaveCount(0);
        assert.equal(fixture.collectionWrites.length, 0, "cancel before confirmation has no write");
        await opening.click();
        await list.getByRole("button", { name: "Sign", exact: true }).click();
        await signingConfirmation.getByRole("button", { name: "Confirm signing", exact: true }).click();
        await expect.poll(() => fixture.collectionWrites.length).toBe(1);
        assert.deepEqual([fixture.collectionWrites[0].area, fixture.collectionWrites[0].slot, fixture.collectionWrites[0].expectedRevision], [area, 0, 34]);
        assert.equal(fixture.collection?.players.length, 34, "no optimistic contract before receipt");
        await expect(signingConfirmation.getByRole("button", { name: "Confirm signing", exact: true })).toBeDisabled();
        if (area === "outside") {
          await list.getByRole("button", { name: /Back to pitch/i }).click();
          await expect(destination).toHaveCount(0);
          // Cancellation schedules its own legitimate focus/scroll in RAF.
          // Observe that before measuring navigation caused by the late receipt.
          await expect(fixture.pitch).toBeFocused();
          await page.evaluate("window.fixtureScrolls=[]");
        }
        fixture.releaseCollection();
        await expect.poll(() => fixture.collection?.players.length).toBe(35);
        await expect(page.locator("output").filter({ hasText: "Squad balance" })).toContainText("474,000,000");
        await expect(destination).toHaveCount(0);
        assert.equal(fixture.collectionWrites.length, 1);
        assert.equal(fixture.collection?.balanceEur, 474_000_000);
        assert.equal(fixture.collection?.players.filter(p => p.area === area && p.slot === 0).length, 1);
        if(area === "reserves") assert.equal(fixture.collection?.players.filter(p => p.primaryDetail === undefined).length, 34, "confirmed signing must preserve original legacy contracts");
        if (area === "outside") assert.deepEqual(await page.evaluate("window.fixtureScrolls"), [], "cancelled intent must not navigate on late receipt");
        else await expect(fixture.pitch).toBeFocused();
        await fixture.assertClean();
      } finally { await fixture.close(); }
    });
  } finally { await browser.close(); }
});
test("original market zoom signing mounted: staged confirmation only", {
  skip: process.env.TOUCHLINE_RUN_MARKET_ZOOM_SIGNING_BROWSER !== "1", timeout: 90_000,
}, async () => {
  const bundle = bundleProduct();
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  try {
    const fixture = await openFixture(browser, bundle, { locale: "en-GB", touch: false, reduced: true }, {
      collection: true, holdCollection: true, marketVacancy: "reserves", viewport: { width: 1280, height: 900 },
    });
    try {
      const { page, list } = fixture;
      const noWrites = () => { assert.equal(fixture.collectionWrites.length, 0); assert.equal(fixture.writes.length, 0); };
      assert.equal(fixture.collection?.players.length, 34);
      assert.ok(fixture.collection?.players.every(player => player.primaryDetail === undefined));
      noWrites();
      await page.locator('button[data-guided-action="true"]').first().click();
      const destination = list.locator("[data-collection-market-destination]");
      await expect(destination).toHaveAttribute("data-collection-market-destination", "reserves:0");
      await list.locator('[data-touchline-card-zoom="trigger"]').click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveCount(1);
      const actions = dialog.locator('[data-zoom-signing-actions="true"]');
      await expect(actions).toHaveCount(1);
      await expect(actions.getByRole("button", { name: "Confirm signing", exact: true })).toHaveCount(0);
      noWrites();
      await actions.getByRole("button", { name: "Sign", exact: true }).click();
      const confirm = actions.getByRole("button", { name: "Confirm signing", exact: true });
      await expect(confirm).toBeEnabled();
      const inline = list.locator("[data-collection-signing-confirmation]");
      await expect(inline).toHaveCount(1);
      await expect(inline).toHaveAttribute("data-collection-signing-confirmation", "fictional-reserves-0");
      await expect(destination.getByRole("button", { name: "Confirm signing", exact: true, includeHidden: true })).toHaveCount(0);
      noWrites();
      await confirm.click();
      await expect.poll(() => fixture.collectionWrites.length).toBe(1);
      const command = fixture.collectionWrites[0];
      assert.deepEqual([command.playerId, command.area, command.slot, command.expectedRevision], ["fictional-reserves-0", "reserves", 0, 34]);
      assert.equal(command.expectedAccountId, fixture.snapshot.userId);
      assert.equal(command.expectedSeasonId, fixture.collection?.seasonId);
      assert.equal(fixture.collection?.players.length, 34, "held receipt must not create an optimistic contract");
      assert.equal(fixture.collection?.balanceEur, 475_000_000);
      assert.equal(fixture.writes.length, 0, "signing must not submit a lineup");
      await expect(confirm).toBeDisabled();
      fixture.releaseCollection();
      await expect.poll(() => fixture.collection?.players.length).toBe(35);
      await expect(page.locator("output").filter({ hasText: "Squad balance" })).toContainText("474,000,000");
      assert.equal(fixture.collection?.balanceEur, 474_000_000);
      assert.equal(fixture.collection?.players.filter(player => player.area === "reserves" && player.slot === 0 && player.playerId === "fictional-reserves-0").length, 1);
      assert.equal(fixture.collection?.players.filter(player => player.primaryDetail === undefined).length, 34);
      assert.equal(fixture.collectionWrites.length, 1, "only one intercepted confirmation is allowed");
      assert.equal(fixture.writes.length, 0);
      await fixture.assertClean();
    } finally { await fixture.close(); }
  } finally { await browser.close(); }
});
type SaveRequest = { gameweekId: string; selectedCoachId: string; formationCode: string; selections: Array<{ playerId: string; slotId: string }>; action: string; idempotencyKey: string };
async function openFixture(browser: Browser, bundle: Bundle, mode: Mode, options: { marketVacancy?: "starters" | "reserves" | "outside"; emptyAccount?: boolean; expiredDeadline?: boolean; structure?: boolean; collection?: boolean; filledBench?: boolean; holdCollection?: boolean; locked?: boolean; divergent?: boolean; indicators?: boolean; budgetExhausted?: boolean; viewport?: { width: number; height: number }; formationCode?: string } = {}) {
  const snapshot = options.budgetExhausted ? exhaustedBetaSnapshot() : fixtureSnapshot(options.locked, options.formationCode);
  if (options.emptyAccount) { snapshot.userGameweek = null; snapshot.selections = []; }
  if (options.expiredDeadline && snapshot.activeGameweek) snapshot.activeGameweek.locksAt = new Date(Date.now() - 60_000).toISOString();
  let collection: ClubAcquisitionState | undefined;
  const collectionWrites: ClubAcquisitionCommand[] = [];
  if (options.collection && options.emptyAccount) {
    snapshot.userId = "30000000-0000-4000-8000-000000000001";
    snapshot.config = { ...snapshot.config, seasonId: "30000000-0000-4000-8000-000000000003" };
  }
  if (options.collection && !options.emptyAccount) {
    snapshot.userId = "30000000-0000-4000-8000-000000000001";
    // The round snapshot still carries legacy XI policy; the enabled collection
    // supplies its separate confirmed 500M total. Do not invent a server DTO.
    snapshot.config = { ...snapshot.config, seasonId: "30000000-0000-4000-8000-000000000003" };
    snapshot.selections = [];
    snapshot.userGameweek = { ...snapshot.userGameweek!, totalMarketValueEur: 0 };
    collection = { revision: 0, seasonId: snapshot.config.seasonId!, plan: "standard", balanceEur: 475_000_000, formationCode: "4-3-3",
      coach: { id: snapshot.coaches[0].id, tier: "radiant-gold", valueEur: 25_000_000 }, players: [], receipts: [] };
    // Isolated layout fixture only: nine confirmed contracts through the real
    // transition, never inserted into the customer's account or catalogue.
    if (options.filledBench) for (const [slot, card] of snapshot.catalogue.filter(card => clubPlayerPosition(card.position) !== null).slice(0, 9).entries()) {
      const position = clubPlayerPosition(card.position); assert.ok(position);
      collection = acquireClubPlayer(collection, { playerId: card.id, area: "reserves", slot,
        expectedRevision: collection.revision, idempotencyKey: `filled_bench_${slot}` }, {
        marketOpen: true, allowedClubIds: null, offer: { playerId: card.id,
          clubId: `synthetic-club-${Math.floor(slot / 3)}`, position, valueEur: 1_000_000, published: true },
      }).state;
    }
  }
  if (options.marketVacancy) {
    assert.ok(collection);
    const plan = collectionSlotPlan(geometry); assert.ok(plan);
    const details = { GK: "Goalkeeper", CB: "Centre Back", RB: "Right Back", LB: "Left Back", DM: "Defensive Midfield", MID: "Central Midfield", RW: "Right Wing", LW: "Left Wing", CF: "Centre Forward" };
    const all = (["starters", "reserves", "outside"] as const).flatMap(area => plan[area].map((position, slot) => ({
      playerId: `fictional-${area}-${slot}`, area, slot, position, primaryDetail: details[position], clubId: club.teamId, valueEur: 1_000_000,
    })));
    snapshot.catalogue = all.map(p => ({ ...snapshot.catalogue[0], id: p.playerId, canonicalPlayerId: p.playerId,
      name: `Fictional ${p.area} ${p.slot}`, shortName: `Fictional ${p.position}`, position: details[p.position], primaryPositionDetail: details[p.position] }));
    collection = { ...collection, revision: 34, players: all.filter(p => p.area !== options.marketVacancy || p.slot !== 0) };
    // Real legacy shape: all existing contracts lack detail. Only catalogue is
    // authoritative. This MUST remain missing to catch market-intent P2 again.
    if(options.marketVacancy === "reserves") collection = { ...collection, players: collection.players.map(p => {
      const { primaryDetail: omitted, ...legacy } = p; void omitted; return legacy;
    }) };
    snapshot.selections = collection.players.filter(p => p.area === "starters").map(p => ({ playerId: p.playerId, slotId: geometry.slots[p.slot].id }));
  }
  const initialSelections = JSON.stringify(snapshot.selections);
  if (options.indicators) {
    const playerId = snapshot.selections[0].playerId;
    const badge = resolvePlayerAvailabilityBadge({ source: "sportmonks", fixtureId: "991", playerId,
      confirmed: true, reason: "injury" }, "991", playerId);
    assert.ok(badge);
    snapshot.playerAvailabilityIndicators = [{ playerId, fixtureId: "991", badge }];
    snapshot.matchCardIndicators = [{ playerId, fixtureId: "991", eventId: "synthetic-yellow", kind: "yellow" }];
  }
  let stateUnavailable = false, stateReads = 0;
  const context = await browser.newContext({ viewport: options.viewport ?? (mode.touch ? { width: 844, height: 390 } : { width: 1280, height: 900 }),
    hasTouch: mode.touch, reducedMotion: mode.reduced ? "reduce" : "no-preference", serviceWorkers: "block" });
  let page: Page | undefined;
  const errors: string[] = [], consoleErrors: string[] = [], unexpected: string[] = [];
  const expectedHttpErrors = new Map<string, number>();
  const unexpectedConsoleErrors: string[] = [];
  let pageErrorCount = 0, consoleErrorCount = 0;
  const mountStartedAt = performance.now();
  const resourceTiming = { started: 0, finished: 0, failed: 0, lastEventMs: 0 };
  const mountPhases: string[] = [];
  const pendingResources = new Map<string, number>();
  const capture = (messages: string[], message: string) => { if (messages.length < 6) messages.push(message.slice(0, 1_000)); };
  const heldSaves = new Set<() => void>();
  try {
    page = await context.newPage(); page.setDefaultTimeout(5_000); page.setDefaultNavigationTimeout(10_000);
    if (options.indicators) await page.clock.install();
    const mountedPage = page;
    page.on("request", request => {
      resourceTiming.started++;
      resourceTiming.lastEventMs = Math.round(performance.now() - mountStartedAt);
      pendingResources.set(new URL(request.url()).pathname, resourceTiming.lastEventMs);
    });
    page.on("requestfinished", request => {
      resourceTiming.finished++;
      resourceTiming.lastEventMs = Math.round(performance.now() - mountStartedAt);
      pendingResources.delete(new URL(request.url()).pathname);
    });
    page.on("requestfailed", request => {
      resourceTiming.failed++;
      pendingResources.delete(new URL(request.url()).pathname);
    });
    const writes: SaveRequest[] = [];
    page.on("pageerror", error => { pageErrorCount++; capture(errors, error.stack ?? error.message); });
    page.on("console", message => {
      if (message.text().startsWith("XI_MOUNT_PHASE ") && mountPhases.length < 4) mountPhases.push(message.text().slice(0, 180));
      if (message.type() === "error") {
        consoleErrorCount++; capture(consoleErrors, message.text());
        const url = message.location().url;
        const remaining = expectedHttpErrors.get(url) ?? 0;
        if (message.text() === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)" && remaining > 0)
          expectedHttpErrors.set(url, remaining - 1);
        else capture(unexpectedConsoleErrors, message.text());
      }
    });
    let releaseSave: (() => void) | undefined, committed: SaveRequest | undefined, readsAfterSave = 0;
    let releaseCollection: (() => void) | undefined;
    const publicRoot = realpathSync(path.join(root, "public"));
    const props = { initialSnapshot: snapshot, locale: mode.locale, embedded: true, marketPage: true, collectionEnabled: !!options.collection, collectionStructureVisible: !!options.structure, initialPlayerClubTeamId: options.budgetExhausted ? "22" : club.teamId };
    const safeScript = (value: string) => value.replace(/<\/script/gi, "<\\/script");
    const html = `<!doctype html><html lang="${mode.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}body{margin:0;background:#020907;color:#f8fafc;font-family:Arial,sans-serif}button,input,select{font:inherit}#root{max-width:1440px;margin:auto;padding:16px}
      ${bundle.css}</style></head><body><div id="root"></div><script>window.fixtureMountPhase='script-start';window.fixtureProps=${safeScript(JSON.stringify(props))};</script><script>${safeScript(bundle.script)}</script></body></html>`;
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (url.origin !== origin) { unexpected.push(`${method} external:${url.hostname}`); await route.abort("blockedbyclient"); return; }
      if (url.pathname === "/fixture" && method === "GET") { await route.fulfill({ contentType: "text/html", body: html }); return; }
      if (options.emptyAccount && url.pathname === "/api/touchline-fantasy/prepare" && method === "POST") {
        // A missing round remains unconfirmed. Its warning must not replace the shell.
        await route.fulfill({ json: { ok: false } }); return;
      }
      if (options.emptyAccount && options.collection && url.pathname.startsWith("/api/touchline-fantasy/collection")) {
        if (method !== "GET") { unexpected.push(`${method} ${url.pathname}`); await route.abort(); return; }
        if (options.locked) {
          expectedHttpErrors.set(request.url(), (expectedHttpErrors.get(request.url()) ?? 0) + 1);
          await route.fulfill({ status: 503, json: { ok: false } });
        } else await route.fulfill({ json: { ok: true, state: null, accountId: snapshot.userId, seasonId: snapshot.config.seasonId } });
        return;
      }
      // Transport-only fixture: actual component/hook and acquisition domain;
      // SQL persistence is proved separately, never represented as a remote call.
      if (options.collection && ["/api/touchline-fantasy/collection", "/api/touchline-fantasy/collection/read"].includes(url.pathname) && (method === "GET" || method === "POST")) {
        if (method === "POST") {
          const command = request.postDataJSON();
          assert.equal(command.expectedAccountId, snapshot.userId);
          assert.equal(command.expectedSeasonId, collection!.seasonId);
          const card = snapshot.catalogue.find(card => card.id === command.playerId)!;
          assert.ok(card);
          const position = clubPlayerPosition(card.position); assert.ok(position);
          collectionWrites.push(command);
          if (options.holdCollection) await new Promise<void>(resolve => {
            const release = () => { heldSaves.delete(release); resolve(); };
            heldSaves.add(release); releaseCollection = release;
          });
          collection = acquireClubPlayer(collection!, command, { marketOpen: true, allowedClubIds: null,
            offer: { playerId: card.id, clubId: club.teamId, position, primaryDetail: card.primaryPositionDetail ?? undefined, valueEur: card.editorialCard!.marketValueEur, published: true } }).state;
        }
        await route.fulfill({ json: { ok: true, state: collection, accountId: snapshot.userId, seasonId: collection!.seasonId } }); return;
      }
      if (url.pathname === "/api/touchline-fantasy/lineup" && method === "POST") {
        const body = request.postDataJSON() as SaveRequest; writes.push(body);
        await new Promise<void>(resolve => {
          const release = () => { heldSaves.delete(release); resolve(); };
          heldSaves.add(release); releaseSave = release;
        });
        committed = body;
        await route.fulfill({ json: { ok: true } }).catch(() => {}); return;
      }
      if (url.pathname === "/api/touchline-fantasy/state" && method === "GET") {
        stateReads++;
        if (stateUnavailable) {
          expectedHttpErrors.set(request.url(), (expectedHttpErrors.get(request.url()) ?? 0) + 1);
          await route.fulfill({ status: 503, json: { ok: false } }); return;
        }
        if (committed) readsAfterSave++;
        await route.fulfill({ json: { ok: true, ...snapshot, ...(committed && !options.divergent ? {
          selections: committed.selections, userGameweek: { ...snapshot.userGameweek, selectedCoachId: committed.selectedCoachId,
            formationCode: committed.formationCode, state: committed.action === "confirm" ? "CONFIRMED" : "DRAFT" },
        } : {}) } }); return;
      }
      // Real read-only hooks remain mounted; no award/ranking authority is fabricated.
      if (method === "GET" && ["/api/touchline-awards/golden-boot", "/api/touchline-arena/card-ranking/active", "/api/football-data/fantasy/livescores"].includes(url.pathname)) {
        expectedHttpErrors.set(request.url(), (expectedHttpErrors.get(request.url()) ?? 0) + 1);
        await route.fulfill({ status: 503, json: { ok: false } }); return;
      }
      if (method === "GET" && /\.(?:png|webp|svg|jpg|jpeg|woff2?|json)$/i.test(url.pathname)) {
        const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) {
          const contentType = ({ ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json" } as Record<string, string>)[path.extname(file).toLowerCase()];
          await route.fulfill({ contentType, body: readFileSync(file) }); return;
        }
      }
      unexpected.push(`${method} ${url.pathname}`); await route.abort("blockedbyclient");
    });
    const original = snapshot.catalogue[geometry.slots.indexOf(targetSlot)];
    const removeName = `${mode.locale === "pt-BR" ? "Retirar do XI" : "Remove from XI"}: ${original.name} · ${targetSlot.id}`;
    const pitch = page.locator("#my-club-xi-pitch"), list = page.locator("#my-club-player-selection");
    const confirm = page.getByRole("button", { name: mode.locale === "pt-BR" ? "Confirmar XI" : "Confirm XI", exact: true });
    // This is a workflow oracle, not an all-assets performance budget. Wait
    // for the actual mounted XI; unrelated offscreen artwork may finish later.
    await page.goto(`${origin}/fixture`, { waitUntil: "domcontentloaded" });
    await expect(pitch).toBeVisible();
    await expect(pitch.locator("[data-touchline-pitch-surface]")).toHaveCount(1);
    await expect(pitch.locator("[data-touchline-pitch-surface]")).toHaveAttribute("data-touchline-pitch-surface", "smoked-glass");
    // The coach now belongs to the pitch section but remains outside its playing
    // surface. Count the actual XI, not every card in the enclosing section.
    await expect(pitch.locator('[data-touchline-pitch-surface] [data-touchline-card-zoom="trigger"]')).toHaveCount(snapshot.selections.length);
    if (process.env.TOUCHLINE_XI_CAPTURE_PREFIX) await pitch.screenshot({ path: `${process.env.TOUCHLINE_XI_CAPTURE_PREFIX}-${browser.browserType().name()}-${mode.locale}-${options.budgetExhausted ? "beta-budget" : options.locked ? "locked" : "open"}.png`, animations: "disabled" });
    console.log(`XI_FIXTURE_READY ${JSON.stringify({ engine: browser.browserType().name(), elapsedMs: Math.round(performance.now() - mountStartedAt), scriptBytes: Buffer.byteLength(bundle.script), cssBytes: Buffer.byteLength(bundle.css), mountPhases, resourceTiming })}`);
    return { page, snapshot, writes, errors, unexpected, pitch, list, confirm, removeName, collectionWrites,
      get collection() { return collection; },
      releaseCollection() { assert.ok(releaseCollection, "purchase confirmation must be held"); releaseCollection(); releaseCollection = undefined; },
      setStateUnavailable(value: boolean) { stateUnavailable = value; },
      get stateReads() { return stateReads; },
      get readsAfterSave() { return readsAfterSave; },
      release() { assert.ok(releaseSave, "POST receipt must be held"); releaseSave(); releaseSave = undefined; },
      async assertClean() { assert.deepEqual(errors, []); assert.deepEqual(unexpectedConsoleErrors, [], "Unexpected browser console errors"); assert.deepEqual(unexpected, []); assert.equal(JSON.stringify(snapshot.selections), initialSelections); },
      async close() { for (const release of heldSaves) release(); await mountedPage.evaluate("window.unmountFixture()").catch(() => {}); await context.close(); },
    };
  } catch (error) {
    // This page contains only synthetic fixture data and blocked/intercepted HTTP.
    // Capture bounded evidence BEFORE closing the context; never dump the bundle,
    // full HTML, console arguments, cookies, headers or browser storage.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dom: unknown = { unavailable: true };
    try {
      if (page && !page.isClosed()) dom = await Promise.race([
        page.evaluate(() => ({
          readyState: document.readyState,
          phase: String((window as Window & { fixtureMountPhase?: string }).fixtureMountPhase ?? "not-started").slice(0, 80),
          rootChildren: document.getElementById("root")?.childElementCount ?? null,
          pitchCount: document.querySelectorAll("#my-club-xi-pitch").length,
          pitchRect: (() => { const rect = document.getElementById("my-club-xi-pitch")?.getBoundingClientRect(); return rect ? { width: rect.width, height: rect.height } : null; })(),
          text: (document.getElementById("root")?.innerText ?? document.body?.innerText ?? "").slice(0, 2_000),
        })).catch(() => ({ unavailable: true })),
        new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), 1_000); }),
      ]);
    } finally {
      clearTimeout(timer);
      for (const release of heldSaves) release();
      await context.close();
    }
    throw new Error(`XI_FIXTURE_MOUNT_FAILED ${JSON.stringify({
      engine: browser.browserType().name(), mode, locked: Boolean(options.locked), divergent: Boolean(options.divergent),
      failure: (error instanceof Error ? error.message : String(error)).slice(0, 1_500),
      pageErrorCount, pageErrors: errors, consoleErrorCount, consoleErrors,
      mountPhases, resourceTiming, pendingResources: [...pendingResources].slice(0, 12),
      unexpected: unexpected.slice(0, 8).map(value => value.slice(0, 200)), dom,
    })}`);
  }
}

async function activate(locator: Locator, mode: Mode) {
  if (mode.touch) await locator.tap();
  else { await locator.focus(); await expect(locator).toBeFocused(); await locator.press("Enter"); }
}

async function recordKeyboardProbe(page: Page, key: "Tab" | "Alt+Tab", expected?: Locator) {
  const before = await page.evaluate(() => {
    const describe = (node: EventTarget | null) => node instanceof HTMLElement ? {
      tag: node.tagName, id: node.id.slice(0, 100), text: (node.textContent ?? "").trim().slice(0, 120),
      tabIndex: node.tabIndex, disabled: "disabled" in node ? Boolean(node.disabled) : false,
    } : null;
    // Read defaultPrevented after dispatch has finished, not in a capture-phase
    // microtask that might run before the product's delegated event listeners.
    const records: Array<() => object> = [];
    const listener = (event: Event) => {
      if (records.length >= 12) return;
      const target = describe(event.target);
      records.push(() => ({ type: event.type, target, defaultPrevented: event.defaultPrevented,
        key: event instanceof KeyboardEvent ? event.key : null,
        altKey: event instanceof KeyboardEvent ? event.altKey : null }));
    };
    const events = ["keydown", "keyup", "focusin"];
    for (const event of events) window.addEventListener(event, listener, true);
    const host = window as Window & { fixtureKeyboardProbe?: { read: () => object; stop: () => void } };
    host.fixtureKeyboardProbe = {
      read: () => ({ activeElement: describe(document.activeElement), documentFocused: document.hasFocus(), events: records.map(read => read()) }),
      stop: () => { for (const event of events) window.removeEventListener(event, listener, true); delete host.fixtureKeyboardProbe; },
    };
    return { activeElement: describe(document.activeElement), documentFocused: document.hasFocus() };
  });
  let failure: unknown;
  try {
    await page.keyboard.press(key);
    if (expected) await expect(expected).toBeFocused();
  } catch (error) { failure = error; }
  const after = await page.evaluate(() => {
    const probe = (window as Window & { fixtureKeyboardProbe?: { read: () => object; stop: () => void } }).fixtureKeyboardProbe;
    try { return probe?.read() ?? { unavailable: true }; } finally { probe?.stop(); }
  }).catch(error => { failure ??= error; return { unavailable: true }; });
  return { evidence: { key, before, after }, failure };
}

type KeyboardKey = "Tab" | "Alt+Tab";
type KeyboardObservation = {
  documentFocused: boolean;
  activeElement: { tag: string; id: string } | null;
  events: Array<{ type: string; key: string | null; defaultPrevented: boolean }>;
};
type NativeObservation = { key: KeyboardKey; beforeFocused: boolean; after: KeyboardObservation };
function assertKeyboardObservation(observation: NativeObservation) {
  assert.equal(observation.beforeFocused, true, "Document must be focused before keyboard navigation");
  assert.equal(observation.after.documentFocused, true, "Document lost focus during keyboard navigation");
  assert.ok(Array.isArray(observation.after.events), "Keyboard event evidence missing");
  assert.ok(observation.after.events.some(event => event.type === "keydown" && event.key === "Tab"), "Tab keydown missing");
  assert.ok(observation.after.events.some(event => event.type === "keyup" && event.key === "Tab"), "Tab keyup missing");
  assert.ok(observation.after.events.every(event => event.defaultPrevented === false), "Keyboard navigation was cancelled");
}
function checkedKeyboardProbe(probe: Awaited<ReturnType<typeof recordKeyboardProbe>>): NativeObservation {
  if (probe.failure) throw probe.failure;
  const after = probe.evidence.after as KeyboardObservation;
  const observation = { key: probe.evidence.key, beforeFocused: probe.evidence.before.documentFocused, after };
  assertKeyboardObservation(observation);
  return { ...observation, after: { ...after,
    activeElement: after.activeElement ? { tag: after.activeElement.tag, id: after.activeElement.id } : null } };
}
function selectNativeKeyboardKey(engine: string, tab: NativeObservation, alternate?: NativeObservation): KeyboardKey {
  assert.ok(engine === "chromium" || engine === "webkit", "Uncalibrated engine");
  assert.equal(tab.key, "Tab"); assertKeyboardObservation(tab);
  const target = tab.after.activeElement;
  if (target?.tag === "BUTTON" && target.id === "native-button") return "Tab";
  assert.equal(engine, "webkit", "Chromium must reach a native button using Tab");
  assert.deepEqual(target, { tag: "INPUT", id: "native-input" }, "WebKit native Tab has an unexpected target");
  assert.ok(alternate, "WebKit alternate-key control required");
  assert.equal(alternate.key, "Alt+Tab"); assertKeyboardObservation(alternate);
  assert.deepEqual(alternate.after.activeElement, { tag: "BUTTON", id: "native-button" }, "WebKit Alt+Tab must reach the native button");
  return "Alt+Tab";
}

test("native keyboard oracle is calibrated independently and fails closed; browser scope is explicit", () => {
  const observation = (key: KeyboardKey, tag: string, id: string): NativeObservation => ({ key, beforeFocused: true,
    after: { documentFocused: true, activeElement: { tag, id }, events: [
      { type: "keydown", key: "Tab", defaultPrevented: false }, { type: "keyup", key: "Tab", defaultPrevented: false },
    ] } });
  const button = observation("Tab", "BUTTON", "native-button"), input = observation("Tab", "INPUT", "native-input");
  const alternate = observation("Alt+Tab", "BUTTON", "native-button");
  assert.equal(selectNativeKeyboardKey("chromium", button), "Tab");
  assert.equal(selectNativeKeyboardKey("webkit", button), "Tab");
  assert.equal(selectNativeKeyboardKey("webkit", input, alternate), "Alt+Tab");
  assert.throws(() => selectNativeKeyboardKey("chromium", input, alternate));
  assert.throws(() => selectNativeKeyboardKey("webkit", input));
  assert.throws(() => selectNativeKeyboardKey("webkit", observation("Tab", "DIV", "keeper"), alternate));
  assert.throws(() => selectNativeKeyboardKey("webkit", input, observation("Alt+Tab", "INPUT", "native-input")));
  assert.throws(() => selectNativeKeyboardKey("webkit", { ...input, beforeFocused: false }, alternate));
  assert.throws(() => selectNativeKeyboardKey("webkit", input, { ...alternate, after: { ...alternate.after, documentFocused: false } }));
  assert.throws(() => selectNativeKeyboardKey("chromium", { ...button, after: { ...button.after, events: [] } }));
  assert.throws(() => selectNativeKeyboardKey("chromium", { ...button, after: { ...button.after,
    events: button.after.events.map(event => ({ ...event, defaultPrevented: true })) } }));
  assert.equal(parseXiScope(undefined), "full"); assert.equal(parseXiScope("full"), "full");
  assert.equal(parseXiScope("webkit-en-focus"), "webkit-en-focus");
  for (const invalid of ["", "webkit", "all", "webkit-en-focus "]) assert.throws(() => parseXiScope(invalid));
  assert.equal(parseXiKeyboardMode(undefined), "normal");
  assert.equal(parseXiKeyboardMode("0"), "normal");
  assert.equal(parseXiKeyboardMode("1"), "diagnostic");
  assert.equal(parseXiKeyboardMode("all"), "all");
  for (const invalid of ["", "true", "ALL", "all ", "unknown"]) assert.throws(() => parseXiKeyboardMode(invalid));
  for (const mode of ["normal", "diagnostic", "all"] as const) assert.doesNotThrow(() => validateXiKeyboardScope(mode, "full"));
  assert.doesNotThrow(() => validateXiKeyboardScope("normal", "webkit-en-focus"));
  for (const mode of ["diagnostic", "all"] as const) assert.throws(() => validateXiKeyboardScope(mode, "webkit-en-focus"));
});

async function calibrateNativeKeyboard(browser: Browser): Promise<KeyboardKey> {
  const control = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  try {
    const unexpected: string[] = [];
    await control.route("**/*", async route => { unexpected.push(route.request().method()); await route.abort("blockedbyclient"); });
    const page = await control.newPage(); page.setDefaultTimeout(5_000);
    await page.setContent('<!doctype html><html lang="en"><body><section id="native-start" tabindex="-1"><button id="native-button" type="button">Native button</button><input id="native-input" aria-label="Native input"></section></body></html>');
    const start = page.locator("#native-start");
    await start.focus(); await expect(start).toBeFocused();
    const tabProbe = await recordKeyboardProbe(page, "Tab");
    const tab = checkedKeyboardProbe(tabProbe);
    let alternate: NativeObservation | undefined;
    let alternateProbe: Awaited<ReturnType<typeof recordKeyboardProbe>> | undefined;
    if (browser.browserType().name() === "webkit" && tab.after.activeElement?.tag === "INPUT" && tab.after.activeElement.id === "native-input") {
      await start.focus(); await expect(start).toBeFocused();
      alternateProbe = await recordKeyboardProbe(page, "Alt+Tab");
      alternate = checkedKeyboardProbe(alternateProbe);
    }
    const key = selectNativeKeyboardKey(browser.browserType().name(), tab, alternate);
    console.log(`XI_KEYBOARD_CALIBRATION ${JSON.stringify({ engine: browser.browserType().name(), platform: process.platform,
      scope: browserScope, selectedKey: key, tab: tabProbe.evidence, alternate: alternateProbe?.evidence ?? null })}`);
    assert.deepEqual(unexpected, []);
    return key;
  } finally { await control.close(); }
}

async function assertCalibratedKeyboardReachability(page: Page, pitch: Locator, target: Locator, key: KeyboardKey) {
  // The product already focused the pitch; do not focus the target or choose a
  // fallback in response to product behavior. Calibration predates its mount.
  const plain = await recordKeyboardProbe(page, "Tab");
  console.log(`XI_KEYBOARD_REACHABILITY ${JSON.stringify({ phase: "plain-Tab", selectedKey: key, scope: browserScope, evidence: plain.evidence })}`);
  checkedKeyboardProbe(plain);
  if (key === "Alt+Tab") {
    // Reset only the same section for the independently predetermined key.
    await pitch.focus(); await expect(pitch).toBeFocused();
    const selected = await recordKeyboardProbe(page, key, target);
    console.log(`XI_KEYBOARD_REACHABILITY ${JSON.stringify({ phase: "calibrated-key", selectedKey: key, scope: browserScope, evidence: selected.evidence })}`);
    checkedKeyboardProbe(selected);
  }
  await expect(target).toBeVisible(); await expect(target).toBeEnabled(); await expect(target).toBeFocused();
}

async function diagnoseRealTab(page: Page, pitch: Locator, target: Locator, selectedKey: KeyboardKey) {
  // Selection comes exclusively from the native control before product mount.
  // Retain both raw observations; never choose a fallback from product behavior.
  const tab = await recordKeyboardProbe(page, "Tab", selectedKey === "Tab" ? target : undefined);
  const targetFocusedAfterTab = await target.evaluate(node => document.activeElement === node);
  const targetState = await target.evaluate(node => {
    const button = node as HTMLButtonElement, rect = button.getBoundingClientRect(), style = getComputedStyle(button);
    return { tag: button.tagName, text: (button.textContent ?? "").slice(0, 120), tabIndex: button.tabIndex,
      disabled: button.disabled, inertAncestor: Boolean(button.closest("[inert]")),
      display: style.display, visibility: style.visibility, width: rect.width, height: rect.height };
  }).catch(() => ({ unavailable: true }));
  let alternate: unknown = { unavailable: true };
  let alternateProbe: Awaited<ReturnType<typeof recordKeyboardProbe>> | undefined;
  let alternateFailure: unknown;
  try {
    // Reset ONLY the starting section for the paired probe. Never focus the
    // target button, change tabindex, intercept Tab, or alter engine preferences.
    await pitch.focus(); await expect(pitch).toBeFocused();
    const probe = await recordKeyboardProbe(page, "Alt+Tab", selectedKey === "Alt+Tab" ? target : undefined);
    alternateProbe = probe;
    alternate = { ...probe.evidence, keyOrCollectionFailed: Boolean(probe.failure) };
  } catch (error) { alternateFailure = error; alternate = { unavailable: true }; }
  console.log(`XI_KEYBOARD_DIAGNOSTIC ${JSON.stringify({ surface: "real-xi", target: targetState, tab: tab.evidence,
    alternate, selectedKey, originalTabAssertion: targetFocusedAfterTab ? "passed" : "failed" })}`);
  checkedKeyboardProbe(tab);
  if (alternateFailure) throw alternateFailure;
  assert.ok(alternateProbe, "Paired alternate probe must be collected");
  checkedKeyboardProbe(alternateProbe);
  await expect(target).toBeVisible(); await expect(target).toBeEnabled();
}

async function replacePlayer(fixture: Awaited<ReturnType<typeof openFixture>>, mode: Mode, keyboardDiagnostic = false, keyboardKey?: KeyboardKey) {
  const { page, pitch, list } = fixture;
  await openReplacement(fixture, mode);
  await expect(pitch.locator("header strong")).toHaveText("11/11 · 4-3-3");
  await expect(list).toBeFocused();
  await expect(list).toContainText(`${mode.locale === "pt-BR" ? "Vaga do XI" : "XI slot"}: ${targetSlot.id}`);
  const results = page.locator("#my-club-position-results");
  await expect(results.locator("article")).toHaveCount(4);
  assert.deepEqual(await results.locator("article > div > strong").allTextContents(), ["Synthetic RW Player", "Synthetic ST Player", "Synthetic LW Player", "Synthetic Replacement"]);
  await expect(results).not.toContainText("Synthetic GK Player");
  const replacement = results.locator("article").filter({ has: page.locator("strong", { hasText: /^Synthetic Replacement$/ }) });
  await expect(replacement).toHaveCount(1);
  await activate(replacement.getByRole("button", { name: `${mode.locale === "pt-BR" ? "Substituir" : "Replace"} · ${targetSlot.id}`, exact: true }), mode);
  await expect(pitch.locator("header strong")).toHaveText("11/11 · 4-3-3");
  await expect(pitch).toBeFocused();
  await expect(pitch.getByRole("button", { name: /Synthetic Replacement/ })).toHaveCount(1);
  await expect.poll(() => pitch.evaluate(node => { const box = node.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0; })).toBe(true);
  const scrolls = await page.evaluate("window.fixtureScrolls") as Array<{ id: string; behavior: string }>;
  assert.deepEqual(scrolls.slice(-2), ["my-club-player-selection", "my-club-xi-pitch"].map(id => ({ id, behavior: mode.reduced ? "instant" : "smooth" })));
  if (!mode.touch) {
    // The approved technical-area layout puts the coach before the Arena
    // control. Verify both through native keyboard traversal, never focus them.
    const target = pitch.getByRole("button", { name: "Open Synthetic XI Coach coach card", exact: true });
    if (keyboardDiagnostic) {
      assert.ok(keyboardKey, "Native keyboard calibration must precede the diagnostic product scenario");
      await diagnoseRealTab(page, pitch, target, keyboardKey);
    }
    else {
      assert.ok(keyboardKey, "Native keyboard calibration must precede the product scenario");
      await assertCalibratedKeyboardReachability(page, pitch, target, keyboardKey);
      const arena = pitch.getByRole("button", { name: "Arena mode", exact: true });
      await page.keyboard.press(keyboardKey);
      await expect(pitch.locator("summary")).toBeFocused();
      await page.keyboard.press(keyboardKey);
      await expect(arena).toBeFocused();
      await expect(arena).toBeEnabled();
    }
  }
  assert.equal(fixture.writes.length, 0, "local XI changes never save automatically");
}

async function openReplacement(fixture: Awaited<ReturnType<typeof openFixture>>, mode: Mode) {
  const original = fixture.snapshot.catalogue[geometry.slots.indexOf(targetSlot)];
  await activate(fixture.pitch.getByRole("button", { name: new RegExp(original.name) }), mode);
  const dialog = fixture.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The dialog installs initial focus on the next animation frame. Visibility
  // alone does not prove keyboard readiness, especially in WebKit.
  await expect(dialog.getByRole("button", { name: mode.locale === "pt-BR" ? "Fechar card" : "Close card", exact: true })).toBeFocused();
  await activate(dialog.getByRole("button", { name: `${mode.locale === "pt-BR" ? "Trocar" : "Replace"} · ${original.name}`, exact: true }), mode);
  await expect(dialog).toHaveCount(0);
  await expect(fixture.list).toBeFocused();
  assert.equal(fixture.writes.length, 0);
}

test("real Beta budget DOM: five players spend 50M, locks credit replacements and comparison never upgrades", {
  skip: process.env.TOUCHLINE_XI_BUDGET_PROOF !== "1", timeout: 90_000,
}, async t => {
  const engineName = process.env.TOUCHLINE_XI_BUDGET_ENGINE ?? "chromium";
  assert.ok(engineName === "chromium" || engineName === "webkit", "Unknown budget proof engine");
  const bundle = bundleProduct();
  const browser = await (engineName === "webkit" ? webkit : chromium).launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close().catch(() => {}); };
  t.signal.addEventListener("abort", abort, { once: true });
  try {
    for (const mode of modes) {
      const h = await openFixture(browser, bundle, mode, { budgetExhausted: true });
      try {
        const copy = getTouchlineFantasyMarketBudgetCopy(mode.locale);
        const notice = h.page.locator('[data-market-budget-notice="exhausted"]');
        await expect(notice).toContainText(copy.exhausted);
        await expect(h.pitch.locator("header strong")).toHaveText("5/11 · 4-3-3");
        const unchangedUrl = h.page.url();
        const comparison = notice.locator(":scope > details");
        const comparisonToggle = comparison.locator(":scope > summary");
        await expect(comparisonToggle).toHaveText(copy.compare);
        await comparisonToggle.click();
        await expect(comparison).toHaveAttribute("open", "");
        await expect(notice.locator('[data-plan-state="inactive"]')).toBeVisible();
        await expect(notice).toContainText(copy.previewOnly);
        assert.equal(h.page.url(), unchangedUrl); assert.equal(h.writes.length, 0);
        await comparisonToggle.click();

        await expect(notice.getByRole("button", { name: copy.reviewXI, exact: true })).toBeVisible();
        await expect(notice.getByRole("button", { name: copy.upgrade, exact: true })).toBeVisible();

        // An empty slot has no outgoing value to credit. When the budget is
        // exhausted, the pitch itself makes this explicit before the market is
        // opened, while the recovery controls remain non-mutating.
        const empty = geometry.slots.find(slot => !h.snapshot.selections.some(selection => selection.slotId === slot.id))!;
        const lockedSlot = h.pitch.getByRole("button", { name: `${copy.exhausted} · ${empty.id}`, exact: true });
        await expect(lockedSlot).toBeDisabled();
        await activate(notice.getByRole("button", { name: copy.reviewXI, exact: true }), mode);
        await expect(h.pitch.locator("header strong")).toHaveText("5/11 · 4-3-3");
        assert.equal(h.writes.length, 0);

        // A selected player still credits the outgoing value, so replacement
        // remains available even while an empty slot stays budget-locked.
        await openReplacement(h, mode);
        const expensive = h.page.locator("#my-club-position-results article").filter({ has: h.page.locator("strong", { hasText: /^Synthetic Expensive$/ }) });
        await expect(expensive.getByRole("button", { name: copy.insufficient })).toHaveAttribute("aria-disabled", "true");
        const cheap = h.page.locator("#my-club-position-results article").filter({ has: h.page.locator("strong", { hasText: /^Synthetic Replacement$/ }) });
        const cheaperSwap = cheap.getByRole("button", { name: `${mode.locale === "pt-BR" ? "Substituir" : "Replace"} · ${targetSlot.id}`, exact: true });
        await expect(cheaperSwap).not.toHaveAttribute("aria-disabled", "true");
        await activate(cheaperSwap, mode);
        await expect(h.page.locator("[data-market-budget-notice]")).toHaveCount(0);
        await expect(h.pitch.locator("header strong")).toHaveText("5/11 · 4-3-3");
        await expect(h.pitch.getByRole("button", { name: /Synthetic Replacement/ })).toHaveCount(1);

        // Removing the cheaper player releases 5M more, enabling the original
        // 10M player without changing coach or issuing any automatic save.
        await activate(h.pitch.getByRole("button", { name: /Synthetic Replacement/ }), mode);
        const dialog = h.page.getByRole("dialog");
        await expect(dialog.getByRole("button", { name: mode.locale === "pt-BR" ? "Fechar card" : "Close card", exact: true })).toBeFocused();
        await activate(dialog.getByRole("button", { name: `${mode.locale === "pt-BR" ? "Remover" : "Remove"} · Synthetic Replacement`, exact: true }), mode);
        await expect(dialog).toHaveCount(0);
        await expect(h.pitch.locator("header strong")).toHaveText("4/11 · 4-3-3");
        const original = h.snapshot.catalogue[geometry.slots.indexOf(targetSlot)];
        const originalArticle = h.page.locator("#my-club-position-results article").filter({ has: h.page.locator("strong", { hasText: new RegExp(`^${original.name}$`) }) });
        await activate(originalArticle.getByRole("button", { name: `${mode.locale === "pt-BR" ? "Escolher" : "Choose"} · ${targetSlot.id}`, exact: true }), mode);
        await expect(h.pitch.locator("header strong")).toHaveText("5/11 · 4-3-3");
        await expect(h.page.locator('[data-market-budget-notice="exhausted"]')).toBeVisible();
        assert.equal(h.writes.length, 0); await h.assertClean();
      } finally { await h.close(); }
    }
  } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});

test("real XI indicator integration: geometry, tooltip, Arena and failed-read recovery", {
  skip: process.env.TOUCHLINE_XI_INDICATOR_PROOF !== "1", timeout: 55_000,
}, async t => {
  const bundle = bundleProduct();
  for (const source of ["components/touchline/cards/TouchlinePlayerAvailabilityBadge.tsx", "components/touchline/cards/TouchlineMatchCardBadge.tsx"])
    assert.ok(bundle.sources.includes(source), `Real component required: ${source}`);
  const engineName = process.env.TOUCHLINE_XI_INDICATOR_ENGINE ?? "chromium";
  assert.ok(engineName === "chromium" || engineName === "webkit", "Unknown XI indicator engine");
  const modeScope = process.env.TOUCHLINE_XI_INDICATOR_MODE ?? "all";
  assert.ok(["all", "en-GB", "pt-BR"].includes(modeScope), "Unknown XI indicator mode");
  const selectedModes = modes.filter(mode => modeScope === "all" || mode.locale === modeScope);
  console.log(`XI_INDICATOR_SCOPE ${JSON.stringify({ engineName, modeScope, modes: selectedModes.map(mode => mode.locale) })}`);
  const browser = await (engineName === "webkit" ? webkit : chromium).launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close().catch(() => {}); };
  t.signal.addEventListener("abort", abort, { once: true });
  try {
    for (const mode of selectedModes) {
      const fixture = await openFixture(browser, bundle, mode, { indicators: true });
      try {
        const { page, pitch } = fixture;
        const injury = pitch.locator('[data-player-availability-badge="injury"] button');
        const yellow = pitch.locator('[data-match-card="yellow"] button');
        await expect(injury).toHaveCount(1); await expect(yellow).toHaveCount(1);
        await injury.scrollIntoViewIfNeeded();
        const first = await injury.boundingBox(), second = await yellow.boundingBox();
        assert.ok(first && second);
        console.log(`XI_INDICATOR_GEOMETRY ${JSON.stringify({ locale: mode.locale, injury: first, yellow: second })}`);
        if (process.env.TOUCHLINE_XI_INDICATOR_SCREENSHOTS === "1")
          await page.screenshot({ path: path.join(root, `outputs/xi-indicator-${mode.locale}-20261010.png`) });
        assert.ok(first.x + first.width <= second.x || second.x + second.width <= first.x
          || first.y + first.height <= second.y || second.y + second.height <= first.y,
        "injury and ordinary yellow must have distinct, nonoverlapping hit targets");
        if (mode.touch) await injury.tap(); else await injury.focus();
        await expect(injury).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("tooltip")).toHaveText(mode.locale === "pt-BR"
          ? "Lesionado — fora desta partida" : "Injured — unavailable for this match");
        const tip = await page.getByRole("tooltip").boundingBox();
        assert.ok(tip && tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= page.viewportSize()!.width
          && tip.y + tip.height <= page.viewportSize()!.height, "tooltip must stay within viewport");
        if (process.env.TOUCHLINE_XI_INDICATOR_SCREENSHOTS === "1")
          await page.screenshot({ path: path.join(root, `outputs/xi-indicator-${mode.locale}-20261010.png`) });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("tooltip")).toHaveCount(0);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        assert.equal(fixture.writes.length, 0, "indicator interaction cannot save or replace XI");
        const arenaButton = page.getByRole("button", { name: mode.locale === "pt-BR" ? "Modo Arena" : "Arena mode", exact: true });
        await arenaButton.scrollIntoViewIfNeeded();
        const controlBox = await arenaButton.boundingBox(), fieldBox = await pitch.locator('[data-touchline-pitch-surface]').boundingBox();
        assert.ok(controlBox && fieldBox && controlBox.y + controlBox.height <= fieldBox.y,
          "Arena control must remain entirely above the interactive grass");
        console.log(`XI_ARENA_CONTROL ${JSON.stringify({ locale: mode.locale, button: await arenaButton.boundingBox(),
          field: await pitch.locator('[data-touchline-pitch-surface]').boundingBox() })}`);
        if (process.env.TOUCHLINE_XI_INDICATOR_SCREENSHOTS === "1")
          await page.screenshot({ path: path.join(root, `outputs/xi-control-${mode.locale}-20261010.png`) });
        await arenaButton.click();
        await expect(injury).toHaveCount(1); await expect(yellow).toHaveCount(1);
        await expect(injury).toBeVisible(); await expect(yellow).toBeVisible();
        await injury.scrollIntoViewIfNeeded();
        const arenaInjury = await injury.boundingBox(), arenaYellow = await yellow.boundingBox();
        assert.ok(arenaInjury && arenaYellow);
        assert.ok(arenaInjury.x + arenaInjury.width <= arenaYellow.x || arenaYellow.x + arenaYellow.width <= arenaInjury.x
          || arenaInjury.y + arenaInjury.height <= arenaYellow.y || arenaYellow.y + arenaYellow.height <= arenaInjury.y,
        "Arena must preserve distinct injury and ordinary card hit targets");
        if (mode.touch) await injury.tap(); else await injury.focus();
        await expect(injury).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("tooltip")).toHaveText(mode.locale === "pt-BR"
          ? "Lesionado — fora desta partida" : "Injured — unavailable for this match");
        const arenaTip = await page.getByRole("tooltip").boundingBox();
        assert.ok(arenaTip && arenaTip.x >= 0 && arenaTip.y >= 0
          && arenaTip.x + arenaTip.width <= page.viewportSize()!.width
          && arenaTip.y + arenaTip.height <= page.viewportSize()!.height);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("tooltip")).toHaveCount(0);
        await expect(page.getByRole("button", { name: mode.locale === "pt-BR" ? "Fechar Arena" : "Close Arena", exact: true })).toBeVisible();
        await page.getByRole("button", { name: mode.locale === "pt-BR" ? "Fechar Arena" : "Close Arena", exact: true }).click();
        const readsBefore = fixture.stateReads;
        fixture.setStateUnavailable(true);
        await page.clock.fastForward(20_001);
        await expect.poll(() => fixture.stateReads).toBeGreaterThan(readsBefore);
        await expect(injury).toHaveCount(0); await expect(yellow).toHaveCount(0);
        await expect(pitch.locator('[data-touchline-pitch-surface] [data-touchline-card-zoom="trigger"]')).toHaveCount(11);
        fixture.setStateUnavailable(false);
        await page.clock.fastForward(20_001);
        await expect(injury).toHaveCount(1); await expect(yellow).toHaveCount(1);
        assert.equal(fixture.writes.length, 0);
        await fixture.assertClean();
        console.log(`XI_INDICATOR_PROOF ${JSON.stringify({ locale: mode.locale, touch: mode.touch, reads: fixture.stateReads,
          injury: first, yellow: second, tooltip: tip, arenaInjury, arenaYellow, arenaTip, writes: fixture.writes.length })}`);
      } finally { await fixture.close(); }
    }
  } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});

test("Arena overlay keeps its coach off the touchline, canonical formation and all XI slots aligned at desktop and landscape sizes", {
  // 55 separate mounts cover every canonical formation at five device sizes.
  // This is the matrix budget, not a relaxed per-page interaction deadline.
  skip: process.env.TOUCHLINE_XI_ARENA_LAYOUT_PROOF !== "1", timeout: 300_000,
}, async t => {
  const bundle = bundleProduct();
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close().catch(() => {}); };
  t.signal.addEventListener("abort", abort, { once: true });
  try {
    // Portrait gameplay is intentionally blocked by the established rotation
    // boundary, so the measured layout matrix contains landscape viewports.
    const scenarios = [
      { name: "desktop", mode: modes[0], viewport: { width: 1280, height: 900 }, locked: false },
      { name: "phone-landscape", mode: modes[1], viewport: { width: 844, height: 390 }, locked: true },
      { name: "small-phone-landscape", mode: modes[1], viewport: { width: 667, height: 375 }, locked: false },
      { name: "tablet-landscape", mode: modes[1], viewport: { width: 1024, height: 768 }, locked: false },
      { name: "tv", mode: modes[0], viewport: { width: 1920, height: 1080 }, locked: false },
    ];
    for (const { name, mode, viewport, locked } of scenarios) for (const [formationCode, geometry] of Object.entries(TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY)) {
      const fixture = await openFixture(browser, bundle, mode, { locked, viewport, formationCode });
      try {
        const { page } = fixture;
        const open = page.getByRole("button", { name: mode.locale === "pt-BR" ? "Modo Arena" : "Arena mode", exact: true });
        if (mode.touch) await open.click(); else { await open.focus(); await open.press("Enter"); }
        const dialog = page.getByRole("dialog");
        const field = dialog.locator('[data-touchline-pitch-surface]');
        const coach = dialog.locator('[data-arena-coach="true"]');
        const formation = dialog.locator('[data-arena-formation="true"]');
        const summary = formation.locator("summary");
        const choices = formation.locator("button[aria-pressed]");
        const points = dialog.locator('[data-arena-round-points="true"]');
        const close = dialog.getByRole("button", { name: mode.locale === "pt-BR" ? "Fechar Arena" : "Close Arena", exact: true });
        await expect(field).toBeVisible(); await expect(coach).toBeVisible();
        await expect(formation).toBeVisible(); await expect(points).toBeVisible(); await expect(close).toBeVisible();
        await expect(close).toBeFocused();
        await expect(choices).toHaveCount(Object.keys(TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY).length);
        for (const choice of await choices.all()) assert.equal(await choice.isDisabled(), locked);
        const [fieldBox, coachBox, formationBox, pointsBox, closeBox] = await Promise.all([field, coach, formation, points, close].map(locator => locator.boundingBox()));
        assert.ok(fieldBox && coachBox && formationBox && pointsBox && closeBox);
        for (const [label, box] of [["field", fieldBox], ["coach", coachBox], ["formation", formationBox], ["points", pointsBox], ["close", closeBox]] as const) {
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1
            && box.y + box.height <= viewport.height + 1, `${label} clipped outside ${name} viewport`);
        }
        assert.ok(Math.abs(coachBox.x + coachBox.width / 2 - fieldBox.x - fieldBox.width / 2) <= 6,
          "coach must align to the canonical halfway line");
        assert.ok(coachBox.y + coachBox.height <= fieldBox.y + 2, "coach must stay outside the grass above its touchline");
        assert.ok(formationBox.y + formationBox.height <= fieldBox.y + 2, "formation must stay above the grass");
        assert.ok(pointsBox.y + pointsBox.height <= fieldBox.y + 2, "round score must stay above the grass");
        assert.ok(closeBox.y + closeBox.height <= pointsBox.y, "Arena control must be above round points");
        assert.ok(Math.abs(formationBox.y + formationBox.height - pointsBox.y - pointsBox.height) <= 6,
          "formation selector and round points must share a bottom line");
        const cardTriggers = dialog.locator('[data-arena-slot] [data-touchline-card-zoom="trigger"]');
        await expect(cardTriggers).toHaveCount(11);
        const cardBoxes = await cardTriggers.evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }));
        for (let first = 0; first < cardBoxes.length; first++) for (let second = first + 1; second < cardBoxes.length; second++) {
          const a = cardBoxes[first], b = cardBoxes[second];
          assert.ok(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1
            || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1,
          `cards ${first}/${second} collide in ${name}`);
        }
        for (const slot of geometry.slots) {
          const box = await dialog.locator(`[data-arena-slot="${slot.id}"]`).boundingBox();
          assert.ok(box, `missing ${slot.id}`);
          const x = 100 * (box.x + box.width / 2 - fieldBox.x) / fieldBox.width;
          const y = 100 * (box.y + box.height / 2 - fieldBox.y) / fieldBox.height;
          assert.ok(Math.abs(x - Math.min(89, Math.max(11, slot.x))) <= 4, `${slot.id} x ${x}`);
          assert.ok(Math.abs(y - Math.min(86, Math.max(14, slot.y))) <= 4, `${slot.id} y ${y}`);
        }
        if (formationCode === "4-3-3" && ["tv", "small-phone-landscape"].includes(name)) {
          await page.screenshot({ path: `/private/tmp/touchline-arena-resume-${name}-20261011.png` });
        }
        if (!locked) {
          await summary.focus();
          await expect(summary).toBeFocused();
          await summary.press("Enter");
          const next = choices.filter({ hasText: "4-4-2" });
          await expect(next).toBeVisible();
          await next.click();
          await expect(next).toHaveAttribute("aria-pressed", "true");
          assert.equal(fixture.writes.length, 0, "changing an editable formation is only a local draft until save");
        }
        assert.equal(fixture.writes.length, 0, "viewing Arena cannot write a lineup");
        await close.click();
        await expect(dialog).toHaveCount(0);
        await expect(open).toBeFocused();
        console.log(`XI_ARENA_LAYOUT ${JSON.stringify({ name, formationCode, locale: mode.locale, viewport: page.viewportSize(), locked, field: fieldBox, coach: coachBox, formation: formationBox, points: pointsBox, close: closeBox, slots: geometry.slots.length })}`);
        await fixture.assertClean();
      } finally { await fixture.close(); }
    }
  } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});

test("diagnostic: repeated Chromium mount without interaction", { skip: process.env.TOUCHLINE_XI_MOUNT_DIAGNOSTIC !== "1", timeout: 45_000 }, async t => {
  const bundle = bundleProduct();
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close().catch(() => {}); };
  t.signal.addEventListener("abort", abort, { once: true });
  try {
    for (let index = 0; index < 2; index++) {
      console.log(`XI_MOUNT_CONTROL ${index + 1}`);
      const fixture = await openFixture(browser, bundle, modes[0]);
      try { await fixture.assertClean(); } finally { await fixture.close(); }
    }
  } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});

test("diagnostic: WebKit EN native and real XI keyboard navigation", { skip: !enabled || keyboardMode === "normal", timeout: 45_000 }, async t => {
  const browser = await webkit.launch({ headless: true, timeout: 15_000 });
  const abortBrowser = () => { void browser.close().catch(() => {}); };
  t.signal.addEventListener("abort", abortBrowser, { once: true });
  try {
    let selectedKey: KeyboardKey;
    const control = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    try {
      // No server, URL fetch, app bundle, CSS or event handlers in the control.
      // Routing still blocks every request if the supposedly static page tries one.
      const unexpected: string[] = [];
      await control.route("**/*", async route => { unexpected.push(route.request().method()); await route.abort("blockedbyclient"); });
      const page = await control.newPage(); page.setDefaultTimeout(5_000);
      await page.setContent('<!doctype html><html lang="en"><body><section id="native-start" tabindex="-1"><button id="native-button" type="button">Native button</button><input id="native-input" aria-label="Native input"></section></body></html>');
      const start = page.locator("#native-start");
      const evidence = [];
      const observations: NativeObservation[] = [];
      for (const key of ["Tab", "Alt+Tab"] as const) {
        await start.focus(); await expect(start).toBeFocused();
        const probe = await recordKeyboardProbe(page, key);
        if (probe.failure) throw probe.failure;
        evidence.push(probe.evidence);
        observations.push(checkedKeyboardProbe(probe));
      }
      selectedKey = selectNativeKeyboardKey("webkit", observations[0], observations[1]);
      console.log(`XI_KEYBOARD_DIAGNOSTIC ${JSON.stringify({ surface: "native-control", engine: "webkit", platform: process.platform, selectedKey, evidence })}`);
      assert.deepEqual(unexpected, []);
    } finally { await control.close(); }
    const h = await openFixture(browser, bundleProduct(), modes[0]);
    try { await replacePlayer(h, modes[0], true, selectedKey); await h.assertClean(); }
    finally { await h.close(); }
  } finally { t.signal.removeEventListener("abort", abortBrowser); await browser.close(); }
});

test("empty ClubOwner preserves pitch, bench, outside slots, Exchange and embedded Live even when recovery fails", {
  skip: process.env.TOUCHLINE_RUN_COLLECTION_BROWSER_TESTS !== "1", timeout: 120_000,
}, async () => {
  const bundle = bundleProduct();
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true, timeout: 15_000 });
    try {
      for (const scenario of [{locked:false,expiredDeadline:false},{locked:true,expiredDeadline:false},{locked:false,expiredDeadline:true}]) {
        const { locked, expiredDeadline } = scenario;
        const h = await openFixture(browser, bundle, modes[0], { emptyAccount: true, structure: true, collection: true, ...scenario });
        try {
          await expect(h.pitch.locator('[data-touchline-pitch-surface] button')).toHaveCount(11);
          await expect(h.page.locator('[data-collection-area="reserves"] button')).toHaveCount(9);
          await expect(h.page.locator('[data-collection-area="outside"] button')).toHaveCount(15);
          await expect(h.page.getByRole('region', { name: 'ClubOwner Exchange', exact: true })).toHaveCount(1);
          await expect(h.page.getByRole('complementary', { name: 'Fixtures', exact: true })).toHaveCount(1);
          await expect(h.confirm).toBeDisabled();
          for (const button of await h.page.locator('[data-collection-area] button').all()) await expect(button).toBeDisabled();
          if (!locked && !expiredDeadline) await h.pitch.locator('[data-touchline-pitch-surface] button').first().click();
          else for (const button of await h.pitch.locator('[data-touchline-pitch-surface] button').all()) await expect(button).toBeDisabled();
          if (!locked && !expiredDeadline) await expect(h.page.locator('[data-fantasy-continuity="unconfirmed"]')).toBeVisible();
          else await expect(h.page.locator('[data-fantasy-continuity]')).toHaveCount(0);
          assert.equal(h.writes.length, 0);
          assert.equal(h.collectionWrites.length, 0);
          assert.equal(h.snapshot.userGameweek, null);
          await h.assertClean();
        } finally { await h.close(); }
      }
    } finally { await browser.close(); }
  }
});

test("collection structure: visible without activating ownership or purchases", {
  skip: process.env.TOUCHLINE_RUN_COLLECTION_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const bundle = bundleProduct();
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true, timeout: 15_000 });
    try {
      for (const mode of modes) await t.test(`${engine.name()} ${mode.locale}`, async () => {
        const fixture = await openFixture(browser, bundle, mode, { structure: true });
        try {
          const { page } = fixture;
          const groups = page.locator('[data-collection-area="reserves"]');
          await expect(groups).toHaveCount(2);
          await expect(groups.nth(0).getByRole("button")).toHaveCount(4);
          await expect(groups.nth(1).getByRole("button")).toHaveCount(5);
          await expect(groups.locator("small")).toHaveCount(0);
          const measured = await groups.nth(0).evaluate(left => {
            const row = left.parentElement!;
            const coach = row.children[1] as HTMLElement;
            const rowBox = row.getBoundingClientRect();
            const coachBox = coach.getBoundingClientRect();
            const lineBox = row.nextElementSibling!.getBoundingClientRect();
            const buttons = Array.from(row.querySelectorAll('[data-collection-placeholder]')).map(el => el.getBoundingClientRect());
            return {
              centerError: Math.abs(coachBox.x + coachBox.width / 2 - rowBox.x - rowBox.width / 2),
              gapToLine: lineBox.bottom - rowBox.bottom,
              green: getComputedStyle(row.querySelector('[data-collection-placeholder]')!).color,
              coachHeight: row.querySelector('[data-coach-card-art]')!.getBoundingClientRect().height,
              coachWidth: row.querySelector('[data-coach-card-art]')!.getBoundingClientRect().width,
              separated: buttons.every((b, i) => !i || b.x >= buttons[i - 1].right + 3),
            };
          });
          assert.ok(measured.centerError < 1, `coach center error: ${measured.centerError}`);
          assert.ok(measured.separated, "reserve controls must not touch each other");
          assert.ok(measured.gapToLine > 0 && measured.gapToLine <= 10, `technical line gap: ${measured.gapToLine}`);
          assert.equal(measured.green, "rgb(170, 255, 62)");
          const toolbar = page.locator('[data-formation-toolbar="true"]');
          await expect(toolbar.locator("details")).toHaveCount(1);
          const alignment = await toolbar.evaluate(el => {
            const children = Array.from(el.children).map(child => child.getBoundingClientRect());
            return Math.max(...children.map(b => b.y + b.height / 2)) - Math.min(...children.map(b => b.y + b.height / 2));
          });
          assert.ok(alignment <= 2, `formation toolbar alignment: ${alignment}`);
          await expect.poll(async () => page.locator('[data-market-starting-xi="true"]').evaluate(el => {
            const coachWidth = el.querySelector('[data-coach-card-art]')!.getBoundingClientRect().width;
            const playerWidth = el.querySelector('[data-arena-slot] .touchline-card-surface')!.getBoundingClientRect().width;
            return Math.abs(coachWidth / playerWidth - 1.1);
          })).toBeLessThan(.01);
          const outside = page.locator('[data-collection-area="outside"]');
          await expect(outside.getByRole("button")).toHaveCount(15);
          for (const button of await page.locator('[data-collection-area] button').all()) await expect(button).toBeDisabled();
          await expect(page.getByRole("heading", { name: "ClubOwner Exchange", exact: true })).toBeVisible();
          assert.equal(fixture.collectionWrites.length, 0);
          assert.equal(fixture.writes.length, 0);
          assert.equal(fixture.collection, undefined, "presentation must not create a wallet or ownership state");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          await page.screenshot({ path: `/tmp/touchline-structure-${engine.name()}-${mode.locale}.png`, fullPage: true, animations: "disabled" });
          await fixture.assertClean();
        } finally { await fixture.close(); }
      });
    } finally { await browser.close(); }
  }
});

test("collection filled bench: nine original cards stay separated from coach and each other", {
  skip: process.env.TOUCHLINE_RUN_COLLECTION_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const bundle = bundleProduct();
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true, timeout: 15_000 });
    try {
      for (const mode of modes) await t.test(`${engine.name()} ${mode.locale}`, async () => {
        const fixture = await openFixture(browser, bundle, mode, { collection: true, filledBench: true });
        try {
          const groups = fixture.page.locator('[data-collection-area="reserves"]');
          await expect(groups.nth(0).locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(4);
          await expect(groups.nth(1).locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(5);
          const layout = await groups.nth(0).evaluate(left => {
            const row = left.parentElement!;
            const cards = Array.from(row.querySelectorAll('.touchline-card-surface, [data-coach-card-art]'))
              .map(card => card.getBoundingClientRect()).sort((a, b) => a.left - b.left);
            const buttons = Array.from(row.querySelectorAll('[data-collection-area] > div > button'))
              .map(button => button.getBoundingClientRect()).sort((a, b) => a.left - b.left);
            return { count: cards.length, separated: cards.every((card, i) => !i || card.left - cards[i - 1].right >= 3),
              controlsSeparated: buttons.length === 9 && buttons.every((button, i) => button.width >= 44 && button.height >= 44
                && (!i || button.left - buttons[i - 1].right >= 3)),
              overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
          });
          assert.equal(layout.count, 10);
          assert.equal(layout.separated, true, "filled cards must retain a visible gap");
          assert.equal(layout.controlsSeparated, true, "change controls must not overlap or shrink below touch size");
          assert.equal(layout.overflow, false);
          assert.equal(fixture.collectionWrites.length, 0);
          await fixture.pitch.screenshot({ path: `/tmp/touchline-filled-bench-${engine.name()}-${mode.locale}.png`, animations: "disabled" });
          await fixture.assertClean();
        } finally { await fixture.close(); }
      });
    } finally { await browser.close(); }
  }
});

test("collection DOM: original plus slots 4+5 and 15, purchase confirmed before card and budget update", {
  skip: process.env.TOUCHLINE_RUN_COLLECTION_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const bundle = bundleProduct();
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true, timeout: 15_000 });
    try {
      for (const mode of modes) await t.test(`${engine.name()} ${mode.locale}`, async () => {
        const fixture = await openFixture(browser, bundle, mode, { collection: true, holdCollection: true });
        try {
          const { page } = fixture;
          const reserveGroups = page.locator('[data-collection-area="reserves"]');
          await expect(reserveGroups).toHaveCount(2);
          await expect(reserveGroups.nth(0).getByRole("button")).toHaveCount(4);
          await expect(reserveGroups.nth(1).getByRole("button")).toHaveCount(5);
          const outside = page.locator('[data-collection-area="outside"]');
          await expect(outside.getByRole("button")).toHaveCount(15);
          const pt = mode.locale === "pt-BR";
          const opening = reserveGroups.nth(0).getByRole("button").first();
          await opening.click();
          let dialog = page.getByRole("dialog", { name: pt ? "Selecionar jogador" : "Select player", exact: true });
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("textbox")).toBeFocused();
          await dialog.getByRole("textbox").fill(fixture.snapshot.catalogue.find(card => card.position === "Goalkeeper")!.name);
          if (process.env.TOUCHLINE_COLLECTION_CAPTURE_PREFIX) await page.screenshot({
            path: `${process.env.TOUCHLINE_COLLECTION_CAPTURE_PREFIX}-${engine.name()}-${mode.locale}-picker.png`, animations: "disabled",
          });
          await dialog.getByRole("button", { name: pt ? "Contratar" : "Sign", exact: true }).click();
          await expect.poll(() => fixture.collectionWrites.length).toBe(1);
          await expect(dialog.getByRole("button", { name: pt ? "Contratar" : "Sign", exact: true })).toBeDisabled();
          await expect(reserveGroups.nth(0).locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(0);
          await expect(page.locator("output").filter({ hasText: pt ? "Saldo do elenco" : "Squad balance" })).toContainText("475");
          fixture.releaseCollection();
          await expect(dialog).toHaveCount(0);
          await expect(reserveGroups.nth(0).locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(1);
          assert.equal(fixture.collectionWrites.length, 1);
          assert.equal(fixture.collection?.balanceEur, 474_000_000);
          assert.deepEqual(fixture.collection?.players.map(p => [p.area, p.slot]), [["reserves", 0]]);

          await outside.getByRole("button").first().click();
          dialog = page.getByRole("dialog", { name: pt ? "Selecionar jogador" : "Select player", exact: true });
          await dialog.getByRole("button", { name: "TouchLine Markt Transfer", exact: true }).click();
          await dialog.getByRole("textbox").fill("Synthetic Replacement");
          await dialog.getByRole("button", { name: pt ? "Contratar" : "Sign", exact: true }).click();
          await expect.poll(() => fixture.collectionWrites.length).toBe(2);
          await expect(outside.locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(0);
          fixture.releaseCollection();
          await expect(dialog).toHaveCount(0);
          await expect(outside.locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(1);
          assert.equal(fixture.collectionWrites.length, 2);
          assert.equal(fixture.collection?.balanceEur, 473_000_000);
          await expect(page.locator("output").filter({ hasText: pt ? "Saldo do elenco" : "Squad balance" })).toContainText("473");
          for (const group of [reserveGroups.nth(0), reserveGroups.nth(1), outside]) {
            const violations = await group.evaluate(element => {
              const rects = [...element.children].map(slot => {
                const first = slot.firstElementChild as HTMLElement;
                const bounds = first.getBoundingClientRect();
                const container = slot.getBoundingClientRect();
                return { bounds, container, empty: first.tagName === "BUTTON" && first.textContent === "+" };
              });
              return rects.filter(({ bounds, container, empty }) => bounds.left < container.left - 1
                || bounds.right > container.right + 1 || (empty && (Math.abs(bounds.width - 44) > 1 || Math.abs(bounds.height - 44) > 1)))
                .map(({ bounds, container, empty }) => ({ bounds: bounds.toJSON(), container: container.toJSON(), empty }));
            });
            assert.deepEqual(violations, [], "original 70px cards must fit their slots and original plus remain 44px circles");
          }
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          assert.equal(overflow, false, "collection must not overflow the viewport");
          if (process.env.TOUCHLINE_COLLECTION_CAPTURE_PREFIX) await fixture.pitch.screenshot({
            path: `${process.env.TOUCHLINE_COLLECTION_CAPTURE_PREFIX}-${engine.name()}-${mode.locale}.png`, animations: "disabled",
          });
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(reserveGroups.nth(0).locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(1);
          await expect(outside.locator('[data-touchline-card-zoom="trigger"]')).toHaveCount(1);
          await expect(page.locator("output").filter({ hasText: pt ? "Saldo do elenco" : "Squad balance" })).toContainText("473");
          assert.equal(fixture.collectionWrites.length, 2, "reload must read confirmed ownership, never repurchase");
          await fixture.assertClean();
        } finally { await fixture.close(); }
      });
    } finally { await browser.close(); }
  }
});

test("real My Club XI DOM: replace, focus, explicit save and readback", { skip: !enabled || keyboardMode === "diagnostic", timeout: 180_000 }, async t => {
  const bundle = bundleProduct();
  let mountFailure: unknown;
  let activeFixture: Awaited<ReturnType<typeof openFixture>> | undefined;
  async function open(browser: Browser, mode: Mode, options: { locked?: boolean; divergent?: boolean } = {}) {
    try { activeFixture = await openFixture(browser, bundle, mode, options); return activeFixture; }
    catch (error) { mountFailure = error; throw error; }
  }
  async function scenario(name: string, options: { timeout: number }, run: () => Promise<void>) {
    let cancelled = false;
    let cleanup: Promise<void> | undefined;
    await t.test(name, options, async child => {
      const abort = () => {
        cancelled = true;
        cleanup = activeFixture?.close().catch(() => {});
      };
      child.signal.addEventListener("abort", abort, { once: true });
      try { await run(); }
      finally { child.signal.removeEventListener("abort", abort); }
    });
    await cleanup;
    activeFixture = undefined;
    // node:test cancellation does not stop an async browser callback by itself.
    // Fail fast rather than stacking another scenario over a timed-out one.
    assert.equal(cancelled, false, `Cancelled browser scenario: ${name}`);
    // node:test does not reject this await when a child test fails. Abort the
    // parent explicitly after a broken mount, so the same shared precondition
    // is not retried through all 14 scenarios/engines or reported as coverage.
    if (mountFailure) throw mountFailure;
  }
  const focusOnly = browserScope === "webkit-en-focus";
  console.log(`XI_BROWSER_SCOPE ${JSON.stringify({ scope: browserScope, productScenarios: focusOnly ? 2 : 14 })}`);
  for (const engine of focusOnly ? [webkit] : [chromium, webkit]) {
    const browser = await engine.launch({ headless: true, timeout: 15_000 });
    t.signal.addEventListener("abort", () => { void browser.close().catch(() => {}); }, { once: true });
    try {
      const keyboardKey = await calibrateNativeKeyboard(browser);
      for (const mode of focusOnly ? [modes[0]] : modes) {
        const prefix = `${engine.name()}/${mode.locale}/${mode.touch ? "touch-reduced" : "keyboard"}`;
        await scenario(`${prefix}: zoom → eligible slot → replacement → focus → one held save → matching readback`, { timeout: 30_000 }, async () => {
          const h = await open(browser, mode);
          try {
            await replacePlayer(h, mode, false, keyboardKey);
            await activate(h.confirm, mode);
            await expect.poll(() => h.writes.length).toBe(1);
            await expect(h.confirm).toBeDisabled();
            const removeButtons = h.pitch.locator('button[aria-label^="Remove from XI:"],button[aria-label^="Retirar do XI:"]');
            assert.equal(await removeButtons.count(), 0);
            await activate(h.pitch.getByRole("button", { name: /Synthetic Replacement/ }), mode);
            const dialog = h.page.getByRole("dialog");
            await expect(dialog.getByRole("button", { name: mode.locale === "pt-BR" ? "Fechar card" : "Close card", exact: true })).toBeFocused();
            await expect(dialog.getByRole("button", { name: /(?:Replace|Trocar) · Synthetic Replacement/ })).toBeDisabled();
            await h.page.keyboard.press("Escape");
            await expect(dialog).toHaveCount(0);
            assert.equal(h.readsAfterSave, 0, "no verification before the POST receipt");
            const sent = h.writes[0];
            assert.deepEqual(Object.keys(sent).sort(), ["action", "formationCode", "gameweekId", "idempotencyKey", "selectedCoachId", "selections"]);
            assert.equal(sent.action, "confirm"); assert.equal(sent.gameweekId, h.snapshot.activeGameweek!.id);
            assert.equal(sent.selectedCoachId, "xi-coach"); assert.equal(sent.formationCode, "4-3-3");
            assert.match(sent.idempotencyKey, /^fantasy:confirm:[0-9a-f-]{36}$/);
            const expected = h.snapshot.selections.map(selection => selection.slotId === targetSlot.id ? { ...selection, playerId: "xi-replacement" } : selection);
            assert.deepEqual(sent.selections.toSorted((a, b) => a.slotId.localeCompare(b.slotId)), expected.toSorted((a, b) => a.slotId.localeCompare(b.slotId)));
            h.release();
            await expect(h.page.getByRole("status").filter({ hasText: mode.locale === "pt-BR" ? "XI confirmado, gravado e verificado no TouchLine." : "XI confirmed, persisted and verified in TouchLine." }).first()).toBeVisible();
            assert.equal(h.readsAfterSave, 1); assert.equal(h.writes.length, 1); await expect(h.confirm).toBeDisabled();
            await h.assertClean();
          } finally { await h.close(); }
        });
        // Do not even register the other 12 previously passing scenarios in
        // this bounded retry. The default full matrix remains unchanged.
        if (focusOnly) continue;
        await scenario(`${prefix}: unmatched search keeps catalogue and clearing restores eligible cards`, { timeout: 20_000 }, async () => {
          const h = await open(browser, mode);
          try {
            await openReplacement(h, mode);
            const search = h.page.getByRole("textbox", { name: mode.locale === "pt-BR" ? "Pesquisar jogador" : "Search player" });
            await search.fill("not-a-fixture-player");
            await expect(h.page.locator("#my-club-position-results article")).toHaveCount(0);
            await expect(h.list).toContainText(mode.locale === "pt-BR" ? "Cards nesta posição: 0" : "Cards in this position: 0");
            await expect(h.list).toContainText(mode.locale === "pt-BR" ? "Nenhum card corresponde a esta seleção ou busca." : "No cards match this selection or search.");
            await expect(h.pitch.locator("header strong")).toHaveText("11/11 · 4-3-3");
            await search.fill(""); await expect(h.page.locator("#my-club-position-results article")).toHaveCount(4);
            await expect(h.pitch.locator("header strong")).toHaveText("11/11 · 4-3-3"); assert.equal(h.writes.length, 0); await h.assertClean();
          } finally { await h.close(); }
        });
        await scenario(`${prefix}: locked XI has no remove or select mutation`, { timeout: 20_000 }, async () => {
          const h = await open(browser, mode, { locked: true });
          try {
            await expect(h.pitch.locator("header strong")).toHaveText("11/11 · 4-3-3");
            await expect(h.page.getByRole("button", { name: h.removeName, exact: true })).toHaveCount(0);
            await expect(h.confirm).toBeDisabled();
            await expect(h.page.locator("#my-club-position-results article > div > button")).toHaveCount(0);
            assert.equal(h.writes.length, 0); await h.assertClean();
          } finally { await h.close(); }
        });
      }
      await scenario(`${engine.name()}: divergent readback never claims the XI was saved`, { timeout: 25_000 }, async () => {
        const mode = modes[0], h = await open(browser, mode, { divergent: true });
        try {
          await replacePlayer(h, mode, false, keyboardKey); await activate(h.confirm, mode);
          await expect.poll(() => h.writes.length).toBe(1); h.release();
          await expect(h.page.getByRole("status").filter({ hasText: "The server received the save, but verification has not returned yet." }).first()).toBeVisible();
          assert.equal(h.readsAfterSave, 3); assert.equal(h.writes.length, 1);
          await expect(h.page.getByText("XI confirmed, persisted and verified in TouchLine.", { exact: true })).toHaveCount(0);
          await expect(h.pitch.locator("header strong")).toHaveText("11/11 · 4-3-3"); await h.assertClean();
        } finally { await h.close(); }
      });
    } finally { await browser.close(); }
  }
});

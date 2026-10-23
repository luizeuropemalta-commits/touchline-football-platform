import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { buildTouchlineCardLeadershipValue, type TouchlineCardLeadershipAuthority } from "../lib/touchlineArena/card-leadership-authority.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import type { TouchLineLocale } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchLineRankingsCopy } from "../lib/touchlineArena/rankings-i18n.ts";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const componentPath = "components/touchline/TouchlinePlayerCardRankingsPublication.tsx";
const playerId = (index: number) => `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const providerId = (index: number) => String(1000 + index);

function card(index: number): ClubOwnerSquadCard {
  return {
    id: playerId(index), canonicalPlayerId: playerId(index), providerPlayerId: providerId(index),
    name: `Player ${index}`, shortName: `P${index}`, clubName: "Arsenal FC", role: "ST", position: "Striker",
    shirtNumber: index, countryCode3: "ENG", marketValue: "€1m", touchlinePoints: 999,
    seasonTotalRating: 100 - index, matchRating: 7.2, matchStats: { goals: 1 }, seasonStats: { goals: 5 },
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" },
    publishedRanking: { snapshotId: "old", providerPlayerId: providerId(index), totalRating: 100 - index, minutesPlayed: 10, appearances: 1 },
  };
}

function ranking(snapshotId = "A", totals: Array<number | null> = Array.from({ length: 25 }, (_, index) => 100 - index)): TouchlineActiveRankingState {
  return {
    ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked", snapshotId, seasonId: "season-2026", roundId: "8",
    scoringVersion: "player_scoring_v4", coverageStatus: "complete_for_scoring", publishedAt: "2026-10-23T10:00:00Z",
    players: totals.map((totalRating, index) => ({
      playerId: playerId(index), providerPlayerId: providerId(index), totalRating,
      minutesPlayed: 90, appearances: 1, positionGroup: "striker", positionRank: index + 1,
      groupSize: totals.length, tierKey: "diamond-gold", priceTc: 999999,
    })),
  };
}

// Render the real client projection and all presentation builders. Card/Zoom
// artwork is replaced only by observable leaf markers; no browser claim here.
function fixture() {
  let authority: TouchlineCardLeadershipAuthority | null = null;
  let hookIndex = 0;
  const state: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let refIndex = 0;
  const cache = new Map<string, unknown>();
  const h = React.createElement;
  type ExactProps = React.ComponentProps<typeof import("../components/touchline/cards/TouchlineEliteExactCard.tsx").default>;
  type ZoomProps = React.ComponentProps<typeof import("../components/touchline/cards/TouchlineCardZoom.tsx").default>;
  const zooms: ZoomProps[] = [];
  const mocks: Record<string, unknown> = {
    react: { ...React,
      useState(initial: unknown) {
        const index = hookIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next: unknown) => { state[index] = next; }];
      },
      useRef(initial: unknown) {
        const index = refIndex++;
        return refs[index] ?? (refs[index] = { current: initial });
      },
    },
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => authority },
    "@/components/touchline/TouchlineClubPerimeterTrace": { __esModule: true, default: () => null },
    "@/components/touchline/cards/TouchlineEliteExactCard": { __esModule: true, default: ({ player, runtimeLocaleOverride, draftLocalesEnabled }: ExactProps) => h("i", {
      "data-card-id": player.canonicalPlayerId, "data-total": player.totalRating ?? "missing",
      "data-history": player.matchRating, "data-tier": player.editorialCard?.tierKey,
      "data-price": player.editorialCard?.cardPrice?.amountMinor,
      "data-card-locale": runtimeLocaleOverride, "data-draft": String(draftLocalesEnabled),
    }) },
    "@/components/touchline/cards/TouchlineCardZoom": { __esModule: true, default: (props: ZoomProps) => {
      zooms.push(props);
      const { children, expandedContent, details, presentationMode, open } = props;
      return h("section", {
        "data-zoom-mode": presentationMode, "data-zoom-open": String(open),
        "data-zoom-name": open ? details?.title : undefined,
        "data-zoom-total": open ? details?.fields?.find(field => field.kind === "rating-total")?.value : undefined,
        "data-zoom-history": open ? details?.fields?.find(field => field.kind === "rating-last")?.value : undefined,
        "data-engine": open ? details?.cardEngineHref ?? "" : "",
      }, presentationMode === "trigger-only" ? children : open ? h(React.Fragment, null, expandedContent, props.detailsContent) : null);
    } },
  };
  function load(spec: string, parent: string): unknown {
    if (mocks[spec]) return mocks[spec];
    if (!spec.startsWith(".") && !spec.startsWith("@/")) return require(spec);
    const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(parent), spec);
    const file = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    assert.ok(file, `Missing local dependency: ${base}`);
    if (file.endsWith(".ts")) return require(file);
    if (cache.has(file)) return cache.get(file);
    const exports: Record<string, unknown> = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    runInNewContext(code, { exports, require: (name: string) => load(name, file), console, process: { env: {} } });
    return exports;
  }
  const Component = (load(`@/${componentPath}`, path.join(root, "fixture.ts")) as typeof import("../components/touchline/TouchlinePlayerCardRankingsPublication.tsx")).default;
  return {
    zooms,
    setAuthority(value: TouchlineCardLeadershipAuthority | null) { authority = value; },
    open(index: number, surface: "featured" | "table" = "featured") {
      const trigger = zooms.filter(props => props.presentationMode === "trigger-only"
        && (props.children as React.ReactElement<ExactProps>).props.player.canonicalPlayerId === playerId(index))[surface === "featured" ? 0 : 1];
      assert.ok(trigger, `${surface} trigger for Player ${index} must exist`);
      const element = { isConnected: true } as HTMLElement;
      trigger.onOpenChange?.(true, element);
      return element;
    },
    close() {
      const host = zooms.find(props => props.presentationMode === "dialog-only");
      assert.ok(host);
      host.onOpenChange?.(false, null);
    },
    render(catalogue: readonly ClubOwnerSquadCard[], seedRanking: TouchlineActiveRankingState, locale: TouchLineLocale = "en-GB", canEditCardEngine = false) {
      hookIndex = 0; refIndex = 0; zooms.length = 0;
      return renderToStaticMarkup(h(Component, { catalogue, seedRanking, locale, draftLocalesEnabled: true, canEditCardEngine }));
    },
  };
}

const featuredIds = (html: string) => [...html.matchAll(/<article id="([^"]+)" data-ranking-tier-frame=/g)].map(match => match[1]);
const rowIds = (html: string) => [...html.matchAll(/<article id="row-([^"]+)"/g)].map(match => match[1]);
const htmlText = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));

test("one publication moves names, top3, top20 and 23 visible cards A -> B -> A with one closed Zoom host", () => {
  const view = fixture();
  const catalogue = Array.from({ length: 25 }, (_, index) => card(index));
  const before = JSON.stringify(catalogue);
  const a = ranking();
  const b = ranking("B");
  b.players = b.players.map((row, index) => index === 20 ? { ...row, totalRating: 120 } : row);
  b.publishedAt = "2026-10-23T11:00:00Z";
  for (const publication of [a, b, a]) {
    view.setAuthority(buildTouchlineCardLeadershipValue(publication, null));
    const html = view.render(catalogue, a);
    const isB = publication === b;
    const leader = isB ? 20 : 0;
    assert.match(html, /data-ranking-publication="ready"/);
    assert.deepEqual(featuredIds(html), (isB ? [20, 0, 1] : [0, 1, 2]).map(playerId));
    assert.equal(rowIds(html).length, 20);
    assert.equal(rowIds(html)[0], playerId(leader));
    assert.equal(rowIds(html).includes(playerId(20)), isB);
    assert.ok(html.includes(`<strong>Player ${leader}</strong>`));
    assert.ok(html.includes(`<strong>${isB ? "2240.00" : "2200.00"}</strong>`));
    assert.ok(html.includes(`<strong>25</strong>`));
    assert.equal((html.match(new RegExp(`data-card-id="${playerId(leader)}" data-total="${isB ? 120 : 100}"`, "g")) ?? []).length, 2, "leader appears in featured and table only");
    assert.doesNotMatch(html, /data-zoom-name=/, "closed host does not render expanded artwork or details");
    assert.equal((html.match(/data-tier="ruby-red" data-price="1500"/g) ?? []).length, featuredIds(html).length + rowIds(html).length);
    assert.equal(view.zooms.filter(props => props.presentationMode === "trigger-only").length, 23);
    assert.equal(view.zooms.filter(props => props.presentationMode === "dialog-only").length, 1);
    assert.ok(view.zooms.every(props => props.open === false));
    assert.doesNotMatch(html, /data-tier="diamond-gold"|data-price="999999"/);
    assert.equal(JSON.stringify(catalogue), before, "projection cannot mutate identity, economy or historical facts");
  }
});

test("unknown candidate withholds the whole list until the same publication gets a complete refreshed catalogue", () => {
  const view = fixture();
  const catalogue = Array.from({ length: 25 }, (_, index) => card(index));
  const seed = ranking();
  const next = ranking("C", [...Array.from({ length: 25 }, (_, index) => 100 - index), 200]);
  view.setAuthority(buildTouchlineCardLeadershipValue(next, null));
  const pending = view.render(catalogue, seed);
  assert.match(pending, /data-ranking-publication="incomplete"/);
  assert.match(pending, /role="status"/);
  assert.deepEqual(rowIds(pending), []);
  assert.deepEqual(featuredIds(pending), []);
  assert.equal((pending.match(/<strong>—<\/strong>/g) ?? []).length, 2);
  assert.doesNotMatch(pending, /data-card-id=|Top 20/);
  const complete = view.render([...catalogue, card(25)], seed);
  assert.match(complete, /data-ranking-publication="ready"/);
  assert.equal(featuredIds(complete)[0], playerId(25));
  assert.equal(rowIds(complete)[0], playerId(25));
  assert.ok(complete.includes(`data-card-id="${playerId(25)}" data-total="200"`));
  const mismatch = view.render([...catalogue, { ...card(25), providerPlayerId: "wrong" }], seed);
  assert.match(mismatch, /data-ranking-publication="incomplete"/);
  assert.deepEqual(rowIds(mismatch), []);
});

test("zero is eligible, null is not a synthetic score, and withdrawal cannot resurrect the SSR seed", () => {
  const view = fixture();
  const catalogue = [card(0), card(1)];
  const seed = ranking("seed", [10, 9]);
  assert.equal(rowIds(view.render(catalogue, seed)).length, 2, "only an absent authority uses SSR");
  view.setAuthority(buildTouchlineCardLeadershipValue(ranking("zero", [null, 0]), null));
  const zero = view.render(catalogue, seed);
  assert.deepEqual(rowIds(zero), [playerId(1)]);
  assert.ok(zero.includes(`data-card-id="${playerId(1)}" data-total="0"`));
  assert.ok(zero.includes('<strong>0.00</strong>'));
  for (const withdrawal of [null, TOUCHLINE_PRESEASON_RANKING_STATE]) {
    view.setAuthority(buildTouchlineCardLeadershipValue(withdrawal, null));
    const withdrawn = view.render(catalogue, seed);
    assert.match(withdrawn, /data-ranking-publication="withdrawn"/);
    assert.deepEqual(rowIds(withdrawn), []);
    assert.doesNotMatch(withdrawn, /data-card-id=|<strong>0\.00<\/strong>/);
  }
});

test("all eight approved locales reach ready and pending presentations without exposing owner controls to guests", () => {
  const view = fixture();
  const catalogue = [card(0)];
  const seed = ranking("seed", [10]);
  const locales: TouchLineLocale[] = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
  for (const locale of locales) {
    view.setAuthority(buildTouchlineCardLeadershipValue(seed, null));
    const ready = view.render(catalogue, seed, locale);
    assert.ok(ready.includes(htmlText(getTouchLineRankingsCopy(locale, true).rankingTitle)));
    assert.equal((ready.match(new RegExp(`data-card-locale="${locale}" data-draft="true"`, "g")) ?? []).length, 2);
    assert.doesNotMatch(ready, /data-engine="[^"]+/);
    view.open(0);
    const selected = view.render(catalogue, seed, locale);
    assert.equal((selected.match(new RegExp(`data-card-locale="${locale}" data-draft="true"`, "g")) ?? []).length, 3, "two visible cards plus the single selected expanded card");
    assert.equal(view.zooms.filter(props => props.presentationMode === "dialog-only" && props.open).length, 1);
    assert.doesNotMatch(selected, /data-engine="[^"]+/);
    const owner = view.render(catalogue, seed, locale, true);
    assert.match(owner, /data-engine="[^"]+/);
    view.close();
    view.setAuthority(buildTouchlineCardLeadershipValue(ranking("new", [10, 20]), null));
    const pending = view.render(catalogue, seed, locale);
    assert.ok(pending.includes(htmlText(getTouchlineExactCardCopy(locale, true).pending)));
    assert.ok(pending.includes(htmlText(getTouchLineRankingsCopy(locale, true).rankingPendingDescription)));
  }
});

test("actual trigger callbacks retain one selected identity across list departure, withdrawal and return, and close clears both states", () => {
  const view = fixture();
  const catalogue = Array.from({ length: 25 }, (_, index) => card(index));
  const a = ranking();
  view.setAuthority(buildTouchlineCardLeadershipValue(a, null));
  view.render(catalogue, a);
  const triggerElement = view.open(0, "table");
  const selected = view.render(catalogue, a);
  assert.equal(view.zooms.filter(props => props.presentationMode === "trigger-only" && props.open).length, 1, "only the invoking surface is expanded");
  assert.equal(view.zooms.filter(props => props.presentationMode === "trigger-only")[3].open, true, "the table trigger, not the featured duplicate, owns selection");
  const firstHost = view.zooms.find(props => props.presentationMode === "dialog-only")!;
  assert.equal(firstHost.returnFocusRef?.current, triggerElement);
  assert.ok(firstHost.returnFocusFallbackRef);
  assert.equal((selected.match(/data-card-id=/g) ?? []).length, 24);
  const b = ranking("B", [-10, ...Array.from({ length: 24 }, (_, index) => 99 - index)]);
  view.setAuthority(buildTouchlineCardLeadershipValue(b, null));
  const departed = view.render(catalogue, a);
  assert.equal(rowIds(departed).includes(playerId(0)), false);
  assert.equal(featuredIds(departed).includes(playerId(0)), false);
  assert.match(departed, /data-zoom-name="Player 0" data-zoom-total="-10" data-zoom-history="7.2"/);
  assert.equal(view.zooms.find(props => props.presentationMode === "dialog-only")!.returnFocusRef, firstHost.returnFocusRef);
  const incomplete = ranking("C", [-10, ...Array.from({ length: 24 }, (_, index) => 99 - index), 500]);
  view.setAuthority(buildTouchlineCardLeadershipValue(incomplete, null));
  const withheld = view.render(catalogue, a);
  assert.match(withheld, /data-ranking-publication="incomplete"/);
  assert.deepEqual(rowIds(withheld), []);assert.deepEqual(featuredIds(withheld), []);
  assert.equal(view.zooms.length, 1, "an unrelated unknown candidate removes the list, not the selected identity host");
  assert.match(withheld, /data-zoom-name="Player 0" data-zoom-total="-10"/);
  view.setAuthority(buildTouchlineCardLeadershipValue(null, null));
  const withdrawn = view.render(catalogue, a);
  assert.match(withdrawn, /data-zoom-name="Player 0" data-zoom-total="—" data-zoom-history="7.2"/);
  assert.equal(view.zooms.length, 1);
  assert.equal(view.zooms[0].open, true);
  assert.equal((withdrawn.match(/data-card-id=/g) ?? []).length, 1, "withdrawal clears season points but preserves the selected editorial card and history");
  assert.ok(withdrawn.includes(`data-card-id="${playerId(0)}" data-total="missing"`));
  const removed = view.render(catalogue.slice(1), a);
  assert.match(removed, /data-ranking-zoom-unavailable="true"/);
  assert.doesNotMatch(removed, /data-card-id=|data-zoom-name=/);
  assert.equal(view.zooms[0].open, true, "removed identity preserves the unavailable dialog for deliberate dismissal");
  view.setAuthority(buildTouchlineCardLeadershipValue(a, null));
  assert.match(view.render(catalogue, a), /data-zoom-name="Player 0" data-zoom-total="100"/);
  view.close();
  const closed = view.render(catalogue, a);
  assert.ok(view.zooms.every(props => props.open === false));
  assert.doesNotMatch(closed, /data-zoom-name=/);
  view.open(0, "featured");
  view.render(catalogue, a);
  assert.equal(view.zooms.filter(props => props.presentationMode === "trigger-only" && props.open).length, 1);
  assert.equal(view.zooms[0].open, true, "reopening uses the new invoking surface");
});

test("page retains server authentication, one full catalogue and the existing shared refresh boundary", () => {
  const page = readFileSync(path.join(root, "app/touchline-player-card-rankings/page.tsx"), "utf8");
  const client = readFileSync(path.join(root, componentPath), "utf8");
  assert.equal((page.match(/loadTouchLineRankedCardCatalog\(activeRanking\)/g) ?? []).length, 1);
  assert.equal((page.match(/catalogue=\{rosterCards\}/g) ?? []).length, 1);
  assert.match(page, /value=\{buildTouchlineCardLeadershipValue\(activeRanking, null\)\} livePlayerUpdates/);
  assert.match(page, /<TouchlineLivePresentationRefresh\s+initialPlayerRankingSnapshotId=\{activeRanking.snapshotId\}/);
  assert.match(page, /const viewer = await authentication/);
  assert.match(page, /const canEditCardEngine = Boolean\(user && isOwnerEmail\(user.email\)\)/);
  assert.doesNotMatch(page, /rosterCards\.slice|rosterCards\.sort/);
  assert.equal((client.match(/projectTouchlinePublishedRankingCatalog\(catalogue, ranking\)/g) ?? []).length, 1);
  assert.match(client, /rankedCards\.slice\(0, 3\)/);
  assert.match(client, /rankedCards\.slice\(0, 20\)/);
  assert.doesNotMatch(client, /fetch\(|setInterval\(|setTimeout\(|router\.refresh|createClient|createAdminClient|server-only/);
  assert.doesNotMatch(page + client, /key=\{[^}]*snapshot/i);
  assert.match(client, /activeContractCard: null/);
  assert.match(client, /activeContractPrice: undefined/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as domain from "../lib/touchlineFantasy/domain.ts";
import { nextGuidedChoice } from "../lib/touchlineFantasy/next-guided-choice.ts";
import { CLUB_ROSTER_CAPACITY } from "../lib/touchlineFantasy/club-roster.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
import { findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";
import { touchlineMarketPositionBucket } from "../lib/touchlineArena/position-eligibility.ts";
import { isTouchlineFantasyMarketClubAllowed as canBrowseMarketClub } from "../lib/touchlineFantasy/market-plan-policy.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { TOUCHLINE_FANTASY_MARKET_BUDGET_COPY, TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY, getClubCollectionBudgetCopy, getTouchlineFantasyMarketBudgetCopy, formatTouchlineFantasyBudgetAmount } from "../lib/touchlineFantasy/market-budget-i18n.ts";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("market.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
const style = new Proxy({}, { get: (_target, key) => String(key) });
function productionFunction(name: string, context: Record<string, unknown>) {
  assert.ok(declarations.has(name));
  return vm.runInNewContext(ts.transpileModule(`${declarations.get(name)}\n${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, context);
}
const noticeContext = { React, styles: style, controls: { link: "canonical-link" },
  getTouchlineFantasyMarketBudgetCopy, formatTouchlineFantasyBudgetAmount, CLUB_ROSTER_CAPACITY,
  ClubOwnerPlanShowcase: ({ remainingMarketPower, collectionEnabled }: { remainingMarketPower: string | null; collectionEnabled: boolean }) =>
    React.createElement("div", { "data-comparison-preview": true, "data-comparison-budget": remainingMarketPower, "data-collection-copy": collectionEnabled }) };

test("actual notice persists for an incomplete zero-budget XI; comparison is informational and shared", () => {
  const notice = productionFunction("FantasyBudgetNotice", noticeContext);
  const base = { editable: true, remainingBudget: 0, selectedCount: 5, attemptedOverBudget: false, locale: "pt-BR" };
  const html = renderToStaticMarkup(notice(base));
  assert.match(html, /data-market-budget-notice="exhausted"/);
  assert.match(html, /O orçamento do seu XI acabou/);
  assert.match(html, /Escolha jogadores mais baratos/);
  assert.match(html, /<summary class="canonical-link">Conhecer e comparar planos<\/summary>/);
  assert.match(html, />Revisar e trocar jogadores<\/button>/);
  assert.match(html, />Mudar de plano<\/button>/);
  assert.match(html, /não muda seu plano nem faz uma cobrança/);
  assert.match(html, /data-comparison-preview="true"/);
  assert.doesNotMatch(html, /<form|<a |checkout|subscribe/);
  for (const changes of [{ editable: false }, { remainingBudget: null }, { remainingBudget: 1 }, { selectedCount: 11 }])
    assert.equal(notice({ ...base, ...changes }), null);
  assert.match(renderToStaticMarkup(notice({ ...base, remainingBudget: 2, attemptedOverBudget: true })), /data-market-budget-notice="exceeded"/);
});

test("collection notice uses confirmed cash and all 35 slots, never the value held outside the XI", () => {
  const notice = productionFunction("FantasyBudgetNotice", noticeContext);
  const collectionState = { balanceEur: 0, players: Array.from({ length: 20 }, (_, slot) => ({
    playerId: `owned-${slot}`, area: slot < 11 ? "starters" : "outside", slot: slot < 11 ? slot : slot - 11, valueEur: 50_000_000,
  })) };
  const base = { editable: true, remainingBudget: 450_000_000, selectedCount: 11, attemptedOverBudget: false,
    locale: "pt-BR", collectionEnabled: true, collectionReady: true, collectionState };
  const html = renderToStaticMarkup(notice(base));
  assert.match(html, /data-market-budget-notice="exhausted"/);
  assert.match(html, /Seu saldo para contratações acabou/);
  assert.match(html, /Retirar um atleta da escalação não devolve créditos/);
  assert.match(html, /confirmação da multa rescisória/);
  assert.match(html, />Revisar elenco<\/button>/);
  assert.match(html, /data-comparison-budget="0"/);
  assert.match(html, /data-collection-copy="true"/);
  assert.doesNotMatch(html, /treinadores continuam gratuitos|orçamento do seu XI|450M/);
  assert.equal(notice({ ...base, collectionReady: false }), null, "unconfirmed or pending money cannot authorize this notice");
  assert.equal(notice({ ...base, collectionState: null }), null);
  assert.equal(notice({ ...base, remainingBudget: 0, collectionState: { ...collectionState, balanceEur: 1 } }), null,
    "positive club cash cannot be replaced by an exhausted XI valuation");
  const full = { ...collectionState, players: Array.from({ length: 35 }, (_, slot) => ({ playerId: `owned-${slot}` })) };
  assert.equal(notice({ ...base, collectionState: full }), null, "completed 35-player squad has no incomplete-roster warning");
  assert.match(renderToStaticMarkup(notice({ ...base, collectionState: full, attemptedOverBudget: true })), /Saldo insuficiente para esta contratação/);
  assert.match(source, /collectionEnabled=\{collectionEnabled\} collectionState=\{collection\.state\} collectionReady=\{collectionSlotsEditable\}/);
});

test("collection football copy covers eight locales without changing legacy XI rules or locale gates", () => {
  const keys = Object.keys(TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY["en-GB"]).sort();
  assert.deepEqual(Object.keys(TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY), Object.keys(TOUCHLINE_FANTASY_MARKET_BUDGET_COPY));
  for (const [locale, copy] of Object.entries(TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY)) {
    assert.deepEqual(Object.keys(copy).sort(), keys);
    for (const value of Object.values(copy)) assert.ok(value.trim());
    assert.equal(getClubCollectionBudgetCopy(locale, true), copy);
    const active = getTouchlineFantasyMarketBudgetCopy(locale, true, true);
    assert.equal(active.advice, copy.advice); assert.equal(active.rule, copy.rule);
    assert.equal(active.reviewXI, copy.reviewXI); assert.equal(active.exceeded, copy.exceeded);
    assert.equal(getTouchlineFantasyMarketBudgetCopy(locale, true), TOUCHLINE_FANTASY_MARKET_BUDGET_COPY[locale as keyof typeof TOUCHLINE_FANTASY_MARKET_BUDGET_COPY]);
  }
  assert.equal(getClubCollectionBudgetCopy("ar-SA"), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY["en-GB"]);
  assert.equal(getTouchlineFantasyMarketBudgetCopy("ar-SA", false, true).advice, TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY["en-GB"].advice);
  assert.equal(getClubCollectionBudgetCopy("pt-BR").signingBudget, "Saldo para contratações");
  assert.equal(getClubCollectionBudgetCopy("en-GB").signingBudget, "Signing budget");
});

test("budget notices and insufficient-budget locks cover eight locales without removing the draft locale gate", () => {
  const keys = Object.keys(TOUCHLINE_FANTASY_MARKET_BUDGET_COPY["en-GB"]).sort();
  for (const [locale, copy] of Object.entries(TOUCHLINE_FANTASY_MARKET_BUDGET_COPY)) {
    assert.deepEqual(Object.keys(copy).sort(), keys);
    for (const value of Object.values(copy)) assert.ok(value.trim().length > 0);
    assert.equal(getTouchlineFantasyMarketBudgetCopy(locale, true), copy);
    const html = renderToStaticMarkup(productionFunction("FantasyBudgetNotice", noticeContext)({ editable: true,
      remainingBudget: 0, selectedCount: 5, attemptedOverBudget: false, locale, draftLocalesEnabled: true }));
    assert.ok(html.includes(copy.exhausted));
  }
  assert.equal(getTouchlineFantasyMarketBudgetCopy("ar-SA", false), TOUCHLINE_FANTASY_MARKET_BUDGET_COPY["en-GB"]);
  assert.equal(getTouchlineFantasyMarketBudgetCopy("pt-BR").insufficient, "Saldo insuficiente");
  assert.equal(formatTouchlineFantasyBudgetAmount(50_000_000, "en-GB"), "50M");
  assert.equal(formatTouchlineFantasyBudgetAmount(Number.NaN, "en-GB"), "—");
});

function harness() {
  const geometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"];
  const club = findTouchLineClub("22")!;
  const players = geometry.slots.map((slot, index) => ({ playerId: `synthetic-${index}`, clubId: club.name,
    marketValueEur: 10_000_000, positionBucket: touchlineMarketPositionBucket(slot.allowedPositions[0], slot.role) }));
  players.push({ ...players[0], playerId: "synthetic-cheap", marketValueEur: 5_000_000 },
    { ...players[0], playerId: "synthetic-equal" }, { ...players[0], playerId: "synthetic-expensive", marketValueEur: 11_000_000 });
  const selections = geometry.slots.slice(0, 5).map((slot, index) => ({ slotId: slot.id, playerId: players[index].playerId }));
  const changes: unknown[] = [], feedback: unknown[] = [];
  const context: Record<string, unknown> & { selections: typeof selections; eligiblePlayers: typeof players } = { ...domain, geometry, eligiblePlayers: players, selections, activeSlot: geometry.slots[5],
    collectionEnabled: false, collection: { state: null }, marketPage: false, visualIntentEpoch: { current: 0 }, nextGuidedChoice,
    editable: true, saving: false, marketBudgetEur: 50_000_000, snapshot: { config: { maxPlayersPerClub: 11 } },
    marketPolicy: { planKey: "beta", budgetEur: 50_000_000, allowedClubTeamIds: ["22", "117", "116", "52"] },
    workflowCopy: getTouchlineFantasyMarketWorkflowCopy("en-GB"), canBrowseMarketClub, findTouchLineClub,
    setSelections(value: unknown) { context.selections = typeof value === "function" ? value(context.selections) : value; changes.push(context.selections); },
    setFeedback(value: unknown) { feedback.push(value); }, setVisibleStep() {}, setActiveSlotId() {},
  };
  const card = (playerId: string) => ({ id: playerId, canonicalPlayerId: playerId, clubName: club.name });
  return { geometry, context, changes, feedback, card,
    add: productionFunction("addPlayer", context), remove: productionFunction("removePlayer", context),
    locked: productionFunction("playerExceedsBudget", context),
    remaining: () => domain.validateTouchlineFantasyLineup({ selections: context.selections, players: context.eligiblePlayers,
      geometry, budgetEur: 50_000_000, maxPlayersPerClub: 11, requireComplete: false }).budgetRemainingEur };
}

test("actual budget lock and add guard refuse player six above 50M without changing the five-player draft", async () => {
  const h = harness(); const before = JSON.stringify(h.context.selections);
  assert.equal(h.remaining(), 0);
  assert.equal(h.locked(h.card("synthetic-5")), true);
  assert.equal(await h.add(h.card("synthetic-5")), false);
  assert.equal(JSON.stringify(h.context.selections), before);
  assert.equal(h.changes.length, 0);
  assert.deepEqual(h.feedback, [getTouchlineFantasyMarketWorkflowCopy("en-GB").budgetExceeded]);
});

test("actual affordability credits the outgoing slot: cheap and equal swaps remain available, expensive does not", async () => {
  const h = harness(); h.context.activeSlot = h.geometry.slots[0];
  assert.equal(h.locked(h.card("synthetic-cheap")), false);
  assert.equal(h.locked(h.card("synthetic-equal")), false);
  assert.equal(h.locked(h.card("synthetic-expensive")), true);
  assert.equal(await h.add(h.card("synthetic-equal")), true);
  assert.equal(h.remaining(), 0); assert.equal(h.context.selections.length, 5);
  assert.equal(await h.add(h.card("synthetic-cheap")), true);
  assert.equal(h.remaining(), 5_000_000); assert.equal(h.context.selections.length, 5);
});

test("actual removal frees funds and a valid replacement consumes only them; closed or saving drafts cannot mutate", async () => {
  const h = harness(); await h.remove("synthetic-0");
  assert.equal(h.context.selections.length, 4); assert.equal(h.remaining(), 10_000_000);
  assert.equal(h.locked(h.card("synthetic-5")), false);
  assert.equal(await h.add(h.card("synthetic-5")), true);
  assert.equal(h.context.selections.length, 5); assert.equal(h.remaining(), 0);
  for (const flag of ["editable", "saving"]) {
    const block = harness(); block.context[flag] = flag === "saving";
    await block.remove("synthetic-0"); assert.equal(await block.add(block.card("synthetic-cheap")), false);
    assert.equal(block.changes.length, 0);
  }
});

test("both actual Market presentations mount the notice, net-affordability locks and canonical smoked glass", () => {
  assert.equal((source.match(/<FantasyBudgetNotice editable=\{editable\}/g) ?? []).length, 2);
  assert.equal((source.match(/surfaceVariant="smoked-glass"/g) ?? []).length, 2);
  assert.equal((source.match(/data-market-budget-locked=/g) ?? []).length, 2);
  assert.match(source, /aria-disabled=\{overBudget \|\| undefined\}/);
  assert.equal((source.match(/aria-disabled=\{overBudget \|\| undefined\}/g) ?? []).length, 2);
  assert.match(source, /rule\.replace\("\{budget\}", marketBudgetEur === null \? "∞" : formatTouchlineFantasyBudgetAmount\(marketBudgetEur/);
  const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
  assert.match(css, /article\[data-market-budget-locked=true\]/);
  assert.match(css, /button\[aria-disabled=true\][^{]*\{[^}]*background:#302916/);
  assert.match(css, /button\[aria-disabled=true\]:focus-visible/);
});

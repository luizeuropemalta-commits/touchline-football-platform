import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { TOUCHLINE_ENGLAND_CLUBS_BY_RANK, findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";
import { isTouchlineFantasyMarketAccess, isTouchlineFantasyMarketClubAllowed as canBrowseMarketClub } from "../lib/touchlineFantasy/market-plan-policy.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { getTouchlineFantasyMarketPlanLockCopy, TOUCHLINE_FANTASY_MARKET_PLAN_LOCK_COPY } from "../lib/touchlineFantasy/market-access-i18n.ts";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("market.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map<string, string>();
const variables = new Map<string, string>();
const clubSelectors: ts.JsxSelfClosingElement[] = [];
let unavailableGuard = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(tree));
  if (ts.isVariableDeclaration(node)) variables.set(node.name.getText(tree), node.getText(tree));
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "CompactClubSelector") clubSelectors.push(node);
  if (ts.isIfStatement(node) && node.expression.getText(tree).includes("!snapshot")
    && node.thenStatement.getText(tree).includes("styles.unavailable")) unavailableGuard = node.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
const beta = { planKey: "beta" as const, budgetEur: 50_000_000, allowedClubTeamIds: ["22", "117", "116", "52"] };
const base = { React, TOUCHLINE_ENGLAND_CLUBS_BY_RANK, findTouchLineClub, canBrowseMarketClub, isTouchlineFantasyMarketAccess,
  getTouchlineFantasyMarketWorkflowCopy, Image: "img", LockKeyhole: "svg",
  styles: new Proxy({}, { get: (_target, key) => String(key) }) };
function execute(expression: string, context: Record<string, unknown> = {}) {
  const script = ts.transpileModule(expression, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(script, { ...base, ...context });
}
function actualFunction(name: string, context: Record<string, unknown> = {}) {
  assert.ok(functions.has(name), `${name} exists in the production component`);
  return execute(`${functions.get(name)}\n${name};`, context);
}
function actualVariable(name: string, context: Record<string, unknown>) {
  assert.ok(variables.has(name), `${name} exists in the production component`);
  return execute(`const ${variables.get(name)};\n${name};`, context);
}
type Rendered = React.ReactElement<Record<string, unknown>>;
function buttons(element: Rendered): Rendered[] {
  return (element.props.children as Rendered[]).filter(child => child.type === "button");
}

test("Beta renders all 20 club buttons with 16 locks, without selecting a locked club", () => {
  const selected: string[] = [], notices: string[] = [];
  const label = getTouchlineFantasyMarketPlanLockCopy("pt-BR");
  const selector = actualFunction("CompactClubSelector");
  const rendered = selector({ selectedTeamId: "22", locale: "pt-BR", marketAccess: beta, lockedLabel: label,
    onSelect: (club: { teamId: string }) => selected.push(club.teamId), onLockedSelect: () => notices.push(label) });
  const controls = buttons(rendered);
  assert.equal(controls.length, 20);
  assert.equal(controls.filter(button => button.props["aria-disabled"] === true).length, 16);
  for (const [index, button] of controls.entries()) {
    const teamId = TOUCHLINE_ENGLAND_CLUBS_BY_RANK[index].teamId;
    const locked = !beta.allowedClubTeamIds.includes(teamId);
    assert.equal(Boolean(button.props["data-market-club-locked"]), locked);
    assert.equal(String(button.props["aria-label"]).includes(label), locked);
    (button.props.onClick as () => void)();
  }
  assert.deepEqual(selected.sort(), [...beta.allowedClubTeamIds].sort());
  assert.equal(notices.length, 16);
});

test("the selector allows every club only for a recognized unrestricted plan", () => {
  for (const marketAccess of [{ planKey: "standard", budgetEur: 400_000_000, allowedClubTeamIds: null }]) {
    let selected = 0;
    const selector = actualFunction("CompactClubSelector");
    const rendered = selector({ selectedTeamId: "19", locale: "en-GB", marketAccess, onSelect: () => selected++ });
    for (const button of buttons(rendered)) {
      assert.notEqual(button.props["aria-disabled"], true);
      (button.props.onClick as () => void)();
    }
    assert.equal(selected, 20);
  }
});

test("coach selection remains free across all clubs while player selection fails closed", () => {
  const selector = actualFunction("CompactClubSelector");
  const selected: string[] = [];
  const coachButtons = buttons(selector({ mode: "coach", selectedTeamId: "22", locale: "pt-BR", marketAccess: null,
    onSelect: (club: { teamId: string }) => selected.push(club.teamId) }));
  assert.equal(coachButtons.length, 20);
  for (const button of coachButtons) {
    assert.notEqual(button.props["aria-disabled"], true);
    (button.props.onClick as () => void)();
  }
  assert.deepEqual(selected, Array.from(TOUCHLINE_ENGLAND_CLUBS_BY_RANK, club => club.teamId));
  const playerButtons = buttons(selector({ mode: "player", selectedTeamId: "22", locale: "pt-BR", marketAccess: null,
    onSelect: () => assert.fail("No-plan player selection must remain locked") }));
  assert.equal(playerButtons.filter(button => button.props["aria-disabled"] === true).length, 20);
  assert.equal(source.match(/<CompactClubSelector mode="coach"/g)?.length, 2);
  assert.equal(source.match(/<CompactClubSelector selectedTeamId=\{selectedPlayerClub/g)?.length, 1);
  // ClubOwner now shares one selector between coaches and players; its player
  // mode must retain the same authoritative plan policy and locked notice.
  const shared = clubSelectors.filter(node => node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
    && attribute.name.getText(tree) === "mode" && attribute.initializer?.getText(tree) === '{browsingCoaches ? "coach" : "player"}'));
  assert.equal(shared.length, 1);
  for (const [name, initializer] of [["marketAccess", "{marketPolicy}"], ["lockedLabel", "{marketPlanLockCopy}"]]) {
    assert.ok(shared[0].attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && attribute.name.getText(tree) === name && attribute.initializer?.getText(tree) === initializer));
  }
});

test("Beta initial selection uses an allowed club but preserves a locked deep link for its notice", () => {
  const resolve = actualFunction("initialMarketClub");
  assert.ok(beta.allowedClubTeamIds.includes(resolve(null, beta)));
  assert.equal(resolve("19", beta), "19");
  assert.equal(resolve("22", beta), "22");
  assert.ok(beta.allowedClubTeamIds.includes(resolve("invalid", beta)));
  assert.equal(resolve(null, null), "");
});

test("both actual Market filters exclude restricted clubs even through search and slot entry", () => {
  const makeCard = (clubTeamId: string) => ({ id: clubTeamId, canonicalPlayerId: clubTeamId, name: "Synthetic player",
    clubName: TOUCHLINE_ENGLAND_CLUBS_BY_RANK.find(club => club.teamId === clubTeamId)!.name, position: "GK", role: "goalkeeper" });
  const catalogue = [makeCard("19"), makeCard("22")];
  for (const marketPage of [false, true]) {
    for (const teamId of ["19", "22"]) {
      const context = { snapshot: { catalogue }, selections: [], marketPolicy: beta, activeSlot: { id: "GK" }, collectionEnabled: false,
        marketSlotAccepts: () => true, marketPage, browsingPosition: "goalkeeper", touchlineMarketPositionBucket: () => "goalkeeper",
        canonicalRosterRole: (value: string) => value, selectedPlayerClub: { teamId }, normalizedQuery: "synthetic" };
      for (const name of ["filtered", "browseCards"]) {
        const cards = actualVariable(name, context) as Array<{ id: string }>;
        assert.deepEqual(Array.from(cards, card => card.id), teamId === "22" ? ["22"] : []);
      }
    }
  }
});

test("the actual addPlayer guard refuses a restricted card before any draft mutation", async () => {
  const notices: string[] = [];
  const add = actualFunction("addPlayer", { editable: true, geometry: { slots: [] }, saving: false, collectionEnabled: false, marketPolicy: beta,
    marketPlanLockCopy: "locked", setFeedback: (value: string) => notices.push(value) });
  assert.equal(await add({ id: "synthetic", clubName: findTouchLineClub("19")!.name }), false);
  assert.deepEqual(notices, ["locked"]);
});

test("the actual save guard cannot submit a restricted existing XI as a new draft or confirmation", async () => {
  const notices: string[] = [], requests: unknown[] = [];
  const selections = Object.freeze([{ playerId: "synthetic", slotId: "GK" }]);
  const save = actualFunction("save", { collectionEnabled: false, activeGameweek: { id: "gameweek" }, roundEditable: true, selectedCoachId: "coach", formationCode: "4-3-3",
    selections, marketPolicy: beta, catalogueById: new Map([["synthetic", { clubName: findTouchLineClub("19")!.name }]]),
    marketPlanLockCopy: "locked", setFeedback: (value: string) => notices.push(value), fetch: (...args: unknown[]) => requests.push(args) });
  await save("draft"); await save("confirm");
  assert.deepEqual(notices, ["locked", "locked"]);
  assert.deepEqual(requests, []);
  assert.equal(selections[0].playerId, "synthetic");
});

test("budget presentation uses the server's policy and never a selected plan preview", () => {
  assert.equal(actualVariable("marketBudgetEur", { collectionEnabled: false, marketPolicy: beta, snapshot: { config: { budgetEur: 777_000_000 } } }), 50_000_000);
  assert.equal(actualVariable("marketBudgetEur", { collectionEnabled: false, marketPolicy: undefined, snapshot: { config: { budgetEur: 777_000_000 } } }), 0);
  assert.doesNotMatch(source, /planPreview/);
});

test("explicit missing or malformed policy cannot unlock clubs or expose a fallback budget", () => {
  assert.ok(unavailableGuard, "the actual component has an unavailable boundary");
  for (const marketAccess of [null, {}, { ...beta, budgetEur: -1 }, { ...beta, allowedClubTeamIds: [null] }]) {
    const selected: unknown[] = [];
    const selector = actualFunction("CompactClubSelector");
    const rendered = selector({ selectedTeamId: "22", locale: "en-GB", marketAccess, onSelect: (club: unknown) => selected.push(club) });
    for (const button of buttons(rendered)) {
      assert.equal(button.props["aria-disabled"], true);
      (button.props.onClick as () => void)();
    }
    assert.deepEqual(selected, []);
    assert.equal(actualVariable("marketBudgetEur", { collectionEnabled: false, marketPolicy: marketAccess, snapshot: { config: { budgetEur: 777_000_000 } } }), 0);
    const unavailable = execute(`(() => { ${unavailableGuard} return "available"; })()`, {
      snapshot: {}, marketPolicy: marketAccess, embedded: true, locale: "en-GB", draftLocalesEnabled: false,
      getTouchlineFantasyMarketStateCopy: () => ({ unavailableTitle: "Unavailable", unavailableMessage: "Unavailable" }),
    });
    assert.equal(unavailable.type, "section");
    assert.equal(unavailable.props.className, "unavailable");
  }
});

test("the lock notice is localized for all eight languages without changing public rollout gates", () => {
  const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
  assert.deepEqual(Object.keys(TOUCHLINE_FANTASY_MARKET_PLAN_LOCK_COPY), locales);
  for (const locale of locales) {
    const copy = getTouchlineFantasyMarketPlanLockCopy(locale, true);
    assert.ok(copy.includes("Standard"));
    assert.ok(copy.trim());
    if (locale !== "en-GB") assert.notEqual(copy, getTouchlineFantasyMarketPlanLockCopy("en-GB"));
  }
  assert.equal(getTouchlineFantasyMarketPlanLockCopy("pt-BR"), "Disponível no Standard ou superior");
});

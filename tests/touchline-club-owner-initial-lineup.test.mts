import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createElement, useMemo, useState, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { confirmedCollectionBootstrap } from "../lib/touchlineFantasy/club-collection-bootstrap.ts";
import { parseClubCommandAuthority } from "../lib/touchlineFantasy/club-command-authority.ts";
import { clubStarterSelections } from "../lib/touchlineFantasy/club-allocation.ts";
import { clubPrimaryPositionIndex } from "../lib/touchlineFantasy/club-primary-position-index.ts";
import { collectionSlotPlan } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
import type { ClubAcquisitionState, ClubOwnedPlayer } from "../lib/touchlineFantasy/club-acquisition.ts";

type Lineup = { selectedCoachId: string | null; formationCode: string | null; selections: Array<{ playerId: string; slotId: string }> };
type Props = { initialSnapshot: unknown; initialCollectionRead: unknown; collectionEnabled: boolean; marketPage: boolean; observe: (lineup: Lineup) => void };

// Render the actual component's first-render initializers with React SSR. Keep
// unrelated card/media components out of this small, network-free regression.
const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("FantasyGameweekClient.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helper = file.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "initialClubOwnerLineup");
const component = file.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "FantasyGameweekClient");
assert.ok(helper && component?.body);
const names = new Set(["initialLineup", "selectedCoachId", "formationCode", "selections"]);
const initializers = component.body.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration => {
    const name = ts.isArrayBindingPattern(declaration.name) ? declaration.name.elements[0]?.getText(file) : declaration.name.getText(file);
    return name !== undefined && names.has(name);
  }));
assert.equal(initializers.length, 4, "exercise all actual lineup state initializers");
const exports = {} as { FirstRender: ComponentType<Props> };
const script = `${helper.getText(file)}
  exports.FirstRender = function FirstRender({ initialSnapshot, initialCollectionRead, collectionEnabled, marketPage, observe }) {
    ${initializers.map(node => node.getText(file)).join("\n")}
    observe({ selectedCoachId, formationCode, selections });
    return createElement("output", { "data-count": selections.length, "data-coach": selectedCoachId ?? "" });
  };`;
runInNewContext(ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
  { exports, createElement, useMemo, useState, confirmedCollectionBootstrap, parseClubCommandAuthority, clubStarterSelections, clubPrimaryPositionIndex });

const accountId = "30000000-0000-4000-8000-000000000001";
const seasonId = "30000000-0000-4000-8000-000000000003";
const otherId = "30000000-0000-4000-8000-000000000099";
const registry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY;
const geometry = registry["4-3-3"];
const details: Record<ClubOwnedPlayer["position"], string> = {
  GK: "Goalkeeper", CB: "Centre Back", RB: "Right Back", LB: "Left Back", DM: "Defensive Midfield",
  MID: "Central Midfield", RW: "Right Wing", LW: "Left Wing", CF: "Centre Forward",
};
const plan = collectionSlotPlan(geometry)!;
const players: ClubOwnedPlayer[] = (["starters", "reserves", "outside"] as const).flatMap(area => plan[area].map((position, slot) => ({
  playerId: `${area}-${slot}`, clubId: "club", position, primaryDetail: details[position], valueEur: 1_000_000, area, slot,
})));
const owned: ClubAcquisitionState = {
  revision: 17, seasonId, plan: "vip", balanceEur: 2_960_000_000, formationCode: "4-3-3",
  coach: { id: "owned-coach", tier: "ruby-red", valueEur: 5_000_000 }, players, receipts: [],
};
const confirmed = { status: "confirmed", accountId, seasonId, state: owned, initialBudget: null, releaseAvailable: false };
const snapshot = {
  userId: accountId, entitlementActive: true, config: { seasonId }, qaClubMarketOpen: true,
  activeGameweek: { id: "round", state: "LIVE" }, userGameweek: null, selections: [], formationRegistry: registry,
  catalogue: players.map(player => ({ id: player.playerId, canonicalPlayerId: player.playerId, primaryPositionDetail: player.primaryDetail })),
};
const lockedSelections = [{ playerId: "locked-player", slotId: geometry.slots[0].id }];
const lockedSnapshot = { ...snapshot, userGameweek: { state: "LOCKED", selectedCoachId: "locked-coach", formationCode: "4-3-3" }, selections: lockedSelections };
const locked: Lineup = { selectedCoachId: "locked-coach", formationCode: "4-3-3", selections: lockedSelections };
function firstRender(initialSnapshot: unknown = snapshot, initialCollectionRead: unknown = confirmed,
  options: { collectionEnabled?: boolean; marketPage?: boolean } = {}) {
  let observed: Lineup | undefined;
  const html = renderToStaticMarkup(createElement(exports.FirstRender, {
    initialSnapshot, initialCollectionRead, collectionEnabled: options.collectionEnabled ?? true,
    marketPage: options.marketPage ?? true, observe: value => { observed = structuredClone(value); },
  }));
  assert.ok(observed);
  return { html, lineup: observed };
}

test("open ClubOwner first render has all 11 owned starters and coach before effects or polls", () => {
  const before = structuredClone({ snapshot, confirmed });
  for (const initialSnapshot of [snapshot, { ...snapshot, qaClubMarketOpen: false, activeGameweek: { id: "round", state: "MARKET_OPEN" } }]) {
    const result = firstRender(initialSnapshot);
    assert.equal(result.lineup.selectedCoachId, "owned-coach");
    assert.equal(result.lineup.formationCode, "4-3-3");
    assert.deepEqual(result.lineup.selections, clubStarterSelections(owned, geometry, clubPrimaryPositionIndex(snapshot.catalogue)));
    assert.match(result.html, /data-count="11"/);
    assert.match(result.html, /data-coach="owned-coach"/);
    assert.equal(firstRender(JSON.parse(JSON.stringify(initialSnapshot)), JSON.parse(JSON.stringify(confirmed))).html, result.html);
  }
  assert.deepEqual({ snapshot, confirmed }, before, "no contract, wallet, round or identity mutation");
});

test("closed or unconfirmed opening preserves the locked round on the first render", () => {
  for (const qaClubMarketOpen of [false, undefined, null, "true"]) {
    assert.deepEqual(firstRender({ ...lockedSnapshot, qaClubMarketOpen }).lineup, locked);
  }
  assert.deepEqual(firstRender({ ...lockedSnapshot, entitlementActive: false }).lineup, locked);
  assert.deepEqual(firstRender(lockedSnapshot, confirmed, { collectionEnabled: false }).lineup, locked);
  assert.deepEqual(firstRender(lockedSnapshot, confirmed, { marketPage: false }).lineup, locked);
});

test("same account and season must be confirmed before collection can seed the first render", () => {
  for (const read of [null, { status: "unavailable", error: "CLUB_STORAGE_UNAVAILABLE", httpStatus: 503 },
    { ...confirmed, accountId: otherId }, { ...confirmed, seasonId: otherId },
    { ...confirmed, state: { ...owned, seasonId: otherId } }, { ...confirmed, state: undefined }]) {
    assert.deepEqual(firstRender(lockedSnapshot, read).lineup, locked);
  }
  for (const patch of [{ userId: otherId }, { userId: "invalid" }, { config: { seasonId: otherId } }, { config: {} }]) {
    assert.deepEqual(firstRender({ ...lockedSnapshot, ...patch }).lineup, locked);
  }
});

test("invalid formation or current position authority never fabricates an empty owned XI", () => {
  assert.deepEqual(firstRender({ ...lockedSnapshot, formationRegistry: {} }).lineup, locked);
  assert.deepEqual(firstRender({ ...lockedSnapshot, catalogue: [] }).lineup, locked);
  assert.deepEqual(firstRender(lockedSnapshot, { ...confirmed, state: { ...owned, revision: -1 } }).lineup, locked);
  assert.deepEqual(firstRender(null).lineup, { selectedCoachId: null, formationCode: null, selections: [] });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { touchlineMarketPositionBucket } from "../lib/touchlineArena/position-eligibility.ts";
import { touchlineFantasySlotAcceptsPlayer } from "../lib/touchlineFantasy/domain.ts";
import { isTouchlineFantasyMarketClubAllowed as canBrowseMarketClub } from "../lib/touchlineFantasy/market-plan-policy.ts";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
const tree = ts.createSourceFile("client.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlerNames = ["openTacticalSelector", "replaceMyClubPlayer", "selectMyClubPlayer"];
const handlerDeclarations: string[] = [];
function collectHandlers(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && handlerNames.includes(node.name.getText(tree))) handlerDeclarations.push(`const ${node.getText(tree)};`);
  ts.forEachChild(node, collectHandlers);
}
collectHandlers(tree);
assert.equal(handlerDeclarations.length, handlerNames.length);
const handlers = handlerDeclarations.join("\n");
let marketSlotAcceptance = "";
function collectAcceptance(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "marketSlotAccepts") marketSlotAcceptance = node.getText(tree);
  ts.forEachChild(node, collectAcceptance);
}
collectAcceptance(tree);
assert.ok(marketSlotAcceptance);

function selectionHarness({ accepted = true, marketPage = true, compatibleBrowse = true } = {}) {
  const events: unknown[] = [];
  const record = (name: string) => (value: unknown) => events.push([name, value]);
  const bindings = {
    marketPage,
    collectionEnabled: false, // Legacy selection path; collection behavior is tested separately.
    selections: [], guidedChoice: { area: "starters", slot: "ST" }, selectedCoach: { id: "coach" },
    geometry: { formationCode: "4-3-3" }, visualIntentEpoch: { current: 0 },
    activeSlot: { id: "ST" },
    browseSlot: { id: compatibleBrowse ? "ST" : "GK" },
    setActiveSlotId: record("slot"), setBrowsePosition: record("browse"),
    setVisibleStep: record("step"), setSquadView: record("view"), setQuery: record("query"),
    setArenaOpen: record("arena"),
    scrollToLineupSection: record("scroll"),
    addPlayer: (card: unknown) => { events.push(["add", card]); return accepted; },
  };
  const actions = runInNewContext(`${stripTypeScriptTypes(handlers)}; ({ openTacticalSelector, selectMyClubPlayer });`, bindings);
  return { actions, events };
}

test("slot selection clears search and scrolls to the same-page player list", () => {
  for (const marketPage of [true, false]) {
    const { actions, events } = selectionHarness({ marketPage });
    actions.openTacticalSelector("ST");
    assert.deepEqual(events, [["arena", false], ["slot", "ST"], ["browse", null], ["step", "players"], ["view", "tactical"], ["query", ""], ["scroll", "my-club-player-selection"]]);
  }
});

test("insertion returns to pitch only after the existing add/validation path accepts", async () => {
  const card = { id: "canonical-player" };
  for (const marketPage of [true, false]) {
    const passed = selectionHarness({ marketPage });
    await passed.actions.selectMyClubPlayer(card);
    assert.deepEqual(passed.events, [["add", card], ["browse", null], ["view", "tactical"], ["scroll", "my-club-xi-pitch"]]);
    const rejected = selectionHarness({ marketPage, accepted: false });
    await rejected.actions.selectMyClubPlayer(card);
    assert.deepEqual(rejected.events, [["add", card]]);
  }
  const incompatible = selectionHarness({ marketPage: false, compatibleBrowse: false });
  await incompatible.actions.selectMyClubPlayer(card);
  assert.deepEqual(incompatible.events, []);
});

test("section scroll moves keyboard focus without double scrolling and honors reduced motion", () => {
  const helper = source.slice(source.indexOf("function scrollToLineupSection("), source.indexOf("function statusCopy("));
  for (const reducedMotion of [true, false]) {
    const events: unknown[] = [];
    const scroll = runInNewContext(`${stripTypeScriptTypes(helper)}; scrollToLineupSection;`, {
      document: { getElementById: (id: string) => ({
        focus: (options: unknown) => events.push([id, "focus", JSON.parse(JSON.stringify(options))]),
        scrollIntoView: (options: unknown) => events.push([id, "scroll", JSON.parse(JSON.stringify(options))]),
      }) },
      window: { requestAnimationFrame: (callback: () => void) => callback(), matchMedia: () => ({ matches: reducedMotion }) },
    });
    scroll("my-club-xi-pitch");
    assert.deepEqual(events, [["my-club-xi-pitch", "focus", { preventScroll: true }], ["my-club-xi-pitch", "scroll", { behavior: reducedMotion ? "instant" : "smooth", block: "start" }]]);
  }
});

test("zoom distinguishes draft removal from collection allocation and keeps guarded open-market slots", () => {
  const removal = source.slice(source.indexOf("  async function removePlayer("), source.indexOf("  async function loadPersistedLineup("));
  assert.match(removal, /if \(!editable \|\| saving \|\| \(collectionEnabled && !collectionSlotsEditable\)\) return/);
  assert.match(removal, /removeTouchlineFantasyPlayerFromSlot\(current, removed.slotId\)/);
  assert.doesNotMatch(removal, /fetch|DELETE|save\(|scrollToLineupSection|openTacticalSelector/);
  assert.doesNotMatch(source, /className=\{styles.pitchRemove\}/);
  assert.match(source, /replacementAction=\{selection \? \{[^\n]*disabled: !editable \|\| saving \|\| \(collectionEnabled && !collectionSlotsEditable\), onSelect: \(\) => replaceMyClubPlayer\(selection.playerId, slot.id\)/);
  assert.match(source, /removalAction=\{selection \? \{[^\n]*disabled: !editable \|\| saving \|\| \(collectionEnabled && !collectionSlotsEditable\), onSelect: \(\) => removePlayer\(selection.playerId\)/);
  assert.match(source, /lockedReason=\{selection && !editable \? lockedZoomReason : undefined\}/);
  assert.match(source, /function addPlayer[^]*?if \(saving \|\| \(collectionEnabled && !collectionSlotsEditable\)\) return false/);
  assert.match(source, /: marketPage \|\| marketOpen \? budgetExhausted \? <button[^\n]*className=\{styles.emptyPosition\} disabled[^\n]*<LockKeyhole[^\n]*: <button[^\n]*className=\{styles.emptyPosition\}[^\n]*>\+<\/button> : null/);
  assert.match(source, /disabled=\{!editable \|\| saving \|\| !selectedCoach \|\| !geometry \|\| \(collectionEnabled && !collectionSlotsEditable\) \|\| \(marketPage && !\(guidedChoice\?\.area === "starters" && guidedChoice.slot === slot.id\)\)\}/);
  assert.doesNotMatch(source, /TouchlinePositionPicker|data-slot-action/);
  assert.equal((source.match(/aria-haspopup=/g) ?? []).length, (source.match(/data-market-plan-unlock="true" aria-haspopup="dialog"/g) ?? []).length);
  assert.match(css, /\.pitchRemove[^}]*width: 44px; height: 44px; min-height: 44px/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /:focus-within > \.pitchRemove/);
  assert.match(css, /@media \(any-hover: none\), \(any-pointer: coarse\)/);
});

test("zoom replacement preserves selection and cannot mutate or scroll while locked/saving", () => {
  assert.match(handlers, /const replaceMyClubPlayer =/);
  for (const state of [
    { editable: true, saving: false, slotId: "ST", accepted: true },
    { editable: false, saving: false, slotId: "ST", accepted: false },
    { editable: true, saving: true, slotId: "ST", accepted: false },
    { editable: true, saving: false, slotId: "GK", accepted: false },
  ]) {
    const events: unknown[] = [];
    const record = (name: string) => (value: unknown) => events.push([name, value]);
    const remove = runInNewContext(`${stripTypeScriptTypes(handlers)}; replaceMyClubPlayer;`, {
      ...state, selections: [{ playerId: "player", slotId: "ST" }],
      marketPage: true, collectionEnabled: false, selectedCoach: { id: "coach" }, geometry: { formationCode: "4-3-3" }, visualIntentEpoch: { current: 0 },
      removePlayer: record("remove"), setActiveSlotId: record("slot"), setBrowsePosition: record("browse"),
      setVisibleStep: record("step"), setSquadView: record("view"), setQuery: record("query"),
      setArenaOpen: record("arena"),
      scrollToLineupSection: record("scroll"),
    });
    remove("player", state.slotId);
    assert.deepEqual(events, state.accepted
      ? [["arena", false], ["slot", "ST"], ["browse", null], ["step", "players"], ["view", "tactical"], ["query", ""], ["scroll", "my-club-player-selection"]]
      : []);
  }
});

test("the Market inline list excludes players ineligible for the removed position", () => {
  const eligibility = source.slice(source.indexOf("function canonicalRosterRole("), source.indexOf("function verticalPitchPosition("));
  const listing = source.slice(source.indexOf("  const browseCards = snapshot.catalogue.filter("), source.indexOf("  const currentAlerts ="));
  const catalogue = [
    { id: "striker", name: "Striker", position: "ST", role: "forward", clubName: "Club" },
    { id: "keeper", name: "Keeper", position: "GK", role: "goalkeeper", clubName: "Club" },
    { id: "defender", name: "Defender", position: "CB", role: "defender", clubName: "Club" },
    { id: "winger", name: "Winger", position: "RW", role: "forward", clubName: "Club" },
  ];
  const result = runInNewContext(`${stripTypeScriptTypes(eligibility + marketSlotAcceptance + listing)}; browseCards.map(card => card.id);`, {
    collectionEnabled: false,
    touchlineMarketPositionBucket, touchlineFantasySlotAcceptsPlayer,
    snapshot: { catalogue }, marketPage: true, activeSlot: { id: "ST", allowedPositions: ["centre-forward"] },
    selectedPlayerClub: { teamId: "club" }, findTouchLineClub: () => ({ teamId: "club" }), normalizedQuery: "",
    canBrowseMarketClub, marketPolicy: { planKey: "standard", budgetEur: 400_000_000, allowedClubTeamIds: null },
  });
  assert.deepEqual(Array.from(result), ["striker"]);
});

test("locked or saving lineups reject additions and removals before any selection write", async () => {
  const mutationHandlers = source.slice(source.indexOf("  async function addPlayer("), source.indexOf("  async function loadPersistedLineup("));
  for (const state of [{ editable: false, saving: false }, { editable: true, saving: true }]) {
    let writes = 0;
    const actions = runInNewContext(`${stripTypeScriptTypes(mutationHandlers)}; ({ addPlayer, removePlayer });`, {
      ...state, collectionEnabled: false, geometry: { slots: [] }, setSelections: () => { writes += 1; },
    });
    assert.equal(await actions.addPlayer({ id: "player" }), false);
    await actions.removePlayer("player");
    assert.equal(writes, 0);
  }
});

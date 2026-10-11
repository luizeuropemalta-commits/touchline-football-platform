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

function selectionHarness({ accepted = true, marketPage = true, compatibleBrowse = true } = {}) {
  const events: unknown[] = [];
  const record = (name: string) => (value: unknown) => events.push([name, value]);
  const bindings = {
    marketPage,
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

test("insertion returns to pitch only after the existing add/validation path accepts", () => {
  const card = { id: "canonical-player" };
  for (const marketPage of [true, false]) {
    const passed = selectionHarness({ marketPage });
    passed.actions.selectMyClubPlayer(card);
    assert.deepEqual(passed.events, [["add", card], ["browse", null], ["view", "tactical"], ["scroll", "my-club-xi-pitch"]]);
    const rejected = selectionHarness({ marketPage, accepted: false });
    rejected.actions.selectMyClubPlayer(card);
    assert.deepEqual(rejected.events, [["add", card]]);
  }
  const incompatible = selectionHarness({ marketPage: false, compatibleBrowse: false });
  incompatible.actions.selectMyClubPlayer(card);
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

test("zoom replaces without a field X; explicit list removal stays local and open-market slots retain +", () => {
  const removal = source.slice(source.indexOf("  function removePlayer("), source.indexOf("  async function loadPersistedLineup("));
  assert.match(removal, /if \(!editable \|\| saving\) return/);
  assert.match(removal, /removeTouchlineFantasyPlayerFromSlot\(current, removed.slotId\)/);
  assert.doesNotMatch(removal, /fetch|DELETE|save\(|scrollToLineupSection|openTacticalSelector/);
  assert.doesNotMatch(source, /className=\{styles.pitchRemove\}/);
  assert.match(source, /replacementAction=\{editable && selection \? \{[^\n]*disabled: saving, onSelect: \(\) => replaceMyClubPlayer\(selection.playerId, slot.id\)/);
  assert.match(source, /function addPlayer[^]*?if \(saving\) return false/);
  assert.match(source, /: marketOpen \? <button[^\n]*className=\{styles.emptyPosition\}[^\n]*>\+<\/button> : null/);
  assert.doesNotMatch(source, /TouchlinePositionPicker|data-slot-action|aria-haspopup/);
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
  const result = runInNewContext(`${stripTypeScriptTypes(eligibility + listing)}; browseCards.map(card => card.id);`, {
    touchlineMarketPositionBucket, touchlineFantasySlotAcceptsPlayer,
    snapshot: { catalogue }, marketPage: true, activeSlot: { id: "ST", allowedPositions: ["centre-forward"] },
    selectedPlayerClub: { teamId: "club" }, findTouchLineClub: () => ({ teamId: "club" }), normalizedQuery: "",
    canBrowseMarketClub, marketPolicy: { planKey: "standard", budgetEur: 500_000_000, allowedClubTeamIds: null },
  });
  assert.deepEqual(Array.from(result), ["striker"]);
});

test("locked or saving lineups reject additions and removals before any selection write", () => {
  const mutationHandlers = source.slice(source.indexOf("  function addPlayer("), source.indexOf("  async function loadPersistedLineup("));
  for (const state of [{ editable: false, saving: false }, { editable: true, saving: true }]) {
    let writes = 0;
    const actions = runInNewContext(`${stripTypeScriptTypes(mutationHandlers)}; ({ addPlayer, removePlayer });`, {
      ...state, geometry: { slots: [] }, setSelections: () => { writes += 1; },
    });
    assert.equal(actions.addPlayer({ id: "player" }), false);
    actions.removePlayer("player");
    assert.equal(writes, 0);
  }
});

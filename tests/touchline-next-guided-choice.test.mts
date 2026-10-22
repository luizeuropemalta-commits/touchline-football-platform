import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canChooseGuidedSlot, nextGuidedChoice } from "../lib/touchlineFantasy/next-guided-choice.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations } from "../lib/touchlineArena/formation-geometry.ts";

test("guidance follows goalkeeper, centre backs, full backs, midfield, wings and strikers without changing geometry", () => {
  const entries = formations["4-3-3"].slots.map(slot => ({ slot, selection: null as object | null }));
  const originalIds = entries.map(entry => entry.slot.id);
  const visited: string[] = [];
  while (visited.length < entries.length) {
    const next = nextGuidedChoice(entries, null);
    assert.equal(next?.area, "starters");
    const id = String(next!.slot);
    visited.push(id);
    entries.find(entry => entry.slot.id === id)!.selection = {};
  }
  assert.deepEqual(visited, ["GK", "RCB", "LCB", "RB", "LB", "RCM", "CM", "LCM", "RW", "LW", "ST"]);
  assert.deepEqual(entries.map(entry => entry.slot.id), originalIds);
  const threeBacks = formations["3-5-2"].slots.map(slot => ({ slot, selection: slot.allowedPositions.includes("goalkeeper") ? {} : null }));
  for (let index = 0; index < 3; index++) {
    const next = nextGuidedChoice(threeBacks, null);
    const entry = threeBacks.find(entry => entry.slot.id === next?.slot)!;
    assert.ok(entry.slot.allowedPositions.includes("centre-back"));
    entry.selection = {};
  }
});

const starters = (filled: number) => Array.from({ length: 11 }, (_, i) => ({ slot: { id: String(i) }, selection: i < filled ? {} : null }));
test("next empty starter advances and returns when a slot is emptied", () => {
  assert.deepEqual(nextGuidedChoice(starters(0), null), { area: "starters", slot: "0" });
  assert.deepEqual(nextGuidedChoice(starters(1), null), { area: "starters", slot: "1" });
  const slots = starters(11); slots[3].selection = null;
  assert.deepEqual(nextGuidedChoice(slots, null), { area: "starters", slot: "3" });
});

test("catalogue recruitment cannot skip centre backs after signing the goalkeeper", () => {
  const entries = formations["4-3-3"].slots.map(slot => ({ slot, selection: slot.id === "GK" ? {} : null }));
  const next = nextGuidedChoice(entries, { players: [] });
  assert.deepEqual(next, { area: "starters", slot: "RCB" });
  assert.equal(canChooseGuidedSlot(next, { area: "starters", slot: "RB" }, false), false);
  assert.equal(canChooseGuidedSlot(next, { area: "starters", slot: "RCB" }, false), true);
  assert.equal(canChooseGuidedSlot(next, { area: "starters", slot: "GK" }, true), true);
  assert.equal(canChooseGuidedSlot(next, { area: "reserves", slot: 0 }, false), false);
  assert.equal(canChooseGuidedSlot(null, { area: "outside", slot: 0 }, false), false);
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(marketPage && !canChooseGuidedSlot\(nextGuidedChoice/);
  assert.match(source, /setActiveSlotId\(nextChoice\?\.area === "starters" \? nextChoice.slot : null\)/);
  const confirm = source.slice(source.indexOf("const confirmCollectionMarket = async () =>"), source.indexOf("const reviewBudgetRecovery ="));
  assert.match(confirm, /!canUseCollectionDestination\(intent\)/);
  assert.match(confirm, /!collectionMarketIntentCurrent\(intent, collection.state, geometry, snapshot.userId, primaryDetails\)/);
  assert.match(confirm, /!collectionMarketPlayerFits\(intent, collection.state, geometry, playerId, primaryDetails\[playerId\], primaryDetails\)\) return;/);
  assert.match(confirm, /collection\.purchase\(playerId, \{area:intent.area,slot:intent.slot\}\)/);
  assert.match(confirm, /collectionMarketPurchaseConfirmed\(intent, collectionMarketIntentRef.current, collection.getConfirmedState\(\), playerId, snapshot.userId\)/);
  assert.match(source, /onSelect: confirmCollectionMarket/);
});

test("only the next empty slot accepts a click; owned slots remain independently manageable", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const slots = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx", import.meta.url), "utf8");
  assert.match(source, /disabled=\{[^}]+\(marketPage && !\(guidedChoice\?\.area === "starters" && guidedChoice.slot === slot.id\)\)\}/);
  assert.match(source, /if \(marketPage && !selections.some\(entry => entry.slotId === slotId\)[\s\S]*?guidedChoice.slot === slotId\)\) return;/);
  assert.match(slots, /disabled=\{!enabled \|\| !state \|\| guidedSlot !== slot\}/);
  assert.match(slots, /if \(enabled && state && guidedSlot === slot\) onChoose/);
  assert.match(slots, /owned \? <button[^>]+disabled=\{!enabled \|\| !state\}/);
});
test("collection guidance follows XI, crosses both reserve rows and ends at 35", () => {
  const players: { area: string; slot: number }[] = [];
  for (const [area, count] of [["reserves", 9], ["outside", 15]] as const) {
    for (let slot = 0; slot < count; slot++) {
      assert.deepEqual(nextGuidedChoice(starters(11), { players }), { area, slot });
      players.push({ area, slot });
    }
  }
  assert.equal(nextGuidedChoice(starters(11), { players }), null);
  assert.equal(nextGuidedChoice([], { players: [] }), null);
  assert.equal(nextGuidedChoice(starters(11), null), null);
});
test("neon is border-only, automatic, reduced-motion aware, and never a hover envelope", () => {
  const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
  const rule = css.match(/\.emptyPosition\[data-guided-action="true"\]:not\(:disabled\),\s*\.formationPicker\[data-guided-action="true"\] > summary \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /padding-box/);
  assert.match(rule, /conic-gradient[\s\S]+border-box/);
  assert.match(rule, /animation: touchlineNeonOrbit 3s linear infinite/);
  assert.match(rule, /box-shadow: none/);
  assert.doesNotMatch(css, /clubGuideGlow/);
  assert.match(css, /:hover > span:has\(> \.emptyPosition\)\s*\{\s*filter: none;\s*transform: none;/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]+data-guided-action[\s\S]+animation: none/);
});

test("uncertain collection command disables new slot guidance while preserving explicit retry", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const guard = source.match(/const collectionSlotsEditable = ([^;]+);/)?.[1];
  assert.ok(guard);
  assert.match(guard, /collection\.ready/);
  assert.match(guard, /!collection\.busy/);
  assert.match(guard, /!collection\.hasPending/);
  const remove = source.slice(source.indexOf("async function removePlayer(playerId: string)"), source.indexOf("async function loadPersistedLineup("));
  assert.match(remove, /if \(collectionEnabled\) \{\s*if \(editable && !saving && collectionSlotsEditable\) setSquadSwap\(\{ playerId, outsideOnly: true \}\);\s*return;\s*\}/);
  assert.match(remove, /if \(!editable \|\| saving \|\| \(collectionEnabled && !collectionSlotsEditable\)\) return;/);
  assert.doesNotMatch(remove, /collection\.(?:release|purchase|allocate)\(/);
  assert.match(source, /const replaceMyClubPlayer = [\s\S]*?if \(!editable \|\| saving \|\| \(collectionEnabled && !collectionSlotsEditable\)/);
  assert.match(source, /collection\.hasPending \? <button[^>]+disabled=\{collection\.busy \|\| !collection\.ready\}[\s\S]*?onClick=\{collection\.retryPending\}/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { groupCollectionSlots, collectionPositionName, collectionGroupName, COLLECTION_POSITION_GROUPS } from "../lib/touchlineFantasy/collection-position-display.ts";
import { TOUCHLINE_POSITION_LABEL_CATALOGUES } from "../lib/touchlineArena/position-labels.ts";
import type { ExchangePosition } from "../lib/touchlineFantasy/exchange-eligibility.ts";

test("football groups preserve every persisted slot identity, including unassigned vacancies", () => {
  const positions: (ExchangePosition | null)[] = ["RW", "RB", "GK", "DM", "CB", "MID", "LB", "LW", "CF", null, null, null, null, null, null];
  const slots = positions.map((position, slot) => ({ slot, position, playerId: position ? `athlete-${slot}` : null }));
  const before = structuredClone(slots);
  const result = groupCollectionSlots(slots);
  assert.deepEqual(result.groups.map(group => group.slots.map(slot => slot.position)), [["GK"], ["CB", "RB", "LB"], ["DM", "MID"], ["RW", "LW", "CF"]]);
  const all = [...result.groups.flatMap(group => group.slots), ...result.unassigned];
  assert.equal(all.length, 15);
  assert.equal(new Set(all.map(slot => slot.slot)).size, 15);
  for (const entry of all) assert.strictEqual(entry, slots[entry.slot]);
  assert.deepEqual(slots, before);
});

test("empty positions are not invented and the guided destination retains its original identity", () => {
  const result = groupCollectionSlots([{ slot: 11, position: "CB" as const }, { slot: 0, position: "GK" as const }, { slot: 7, position: null }]);
  assert.equal(result.groups[1].slots[0].slot, 11);
  assert.deepEqual(result.unassigned, [{ slot: 7, position: null }]);
  assert.equal(groupCollectionSlots([]).groups.length, 4);
});

test("six opt-in draft descriptors map all nine IDs without changing published literals or grouping", () => {
  const mapping = { GK: "goalkeeper", CB: "centreBack", RB: "rightBack", LB: "leftBack", DM: "defensiveMidfielder", MID: "midfielder", RW: "rightWing", LW: "leftWing", CF: "striker" } as const;
  const published = {
    GK: ["Goleiro", "Goalkeeper"], CB: ["Zagueiro", "Centre-back"], RB: ["Lateral direito", "Right-back"], LB: ["Lateral esquerdo", "Left-back"],
    DM: ["Volante", "Defensive midfielder"], MID: ["Meio-campista", "Midfielder"], RW: ["Ponta direita", "Right winger"], LW: ["Ponta esquerda", "Left winger"], CF: ["Centroavante", "Centre-forward"],
  } as const;
  const slots = Object.keys(mapping).map((position, slot) => ({ position: position as ExchangePosition, slot }));
  const before = groupCollectionSlots(slots);
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const) {
    for (const position of Object.keys(mapping) as ExchangePosition[]) {
      assert.equal(collectionPositionName(position, locale, true), TOUCHLINE_POSITION_LABEL_CATALOGUES[locale][mapping[position]]);
      assert.equal(collectionPositionName(position, locale), published[position][1]);
      assert.equal(collectionPositionName(position, locale, false), published[position][1]);
    }
    for (const group of COLLECTION_POSITION_GROUPS) {
      assert.ok(collectionGroupName(group.id, locale, true).trim());
      assert.equal(collectionGroupName(group.id, locale), group.en);
      assert.equal(collectionGroupName(group.id, locale, false), group.en);
    }
  }
  for (const gate of [false, true]) {
    for (const position of Object.keys(mapping) as ExchangePosition[]) {
      assert.equal(collectionPositionName(position, "pt-BR", gate), published[position][0]);
      assert.equal(collectionPositionName(position, "pt-PT", gate), published[position][0]);
      assert.equal(collectionPositionName(position, "en-GB", gate), published[position][1]);
      assert.equal(collectionPositionName(position, "unknown", gate), published[position][1]);
    }
    for (const group of COLLECTION_POSITION_GROUPS) {
      assert.equal(collectionGroupName(group.id, "pt-BR", gate), group.pt);
      assert.equal(collectionGroupName(group.id, "en-GB", gate), group.en);
      assert.equal(collectionGroupName(group.id, "unknown", gate), group.en);
    }
  }
  assert.deepEqual(groupCollectionSlots(slots), before);
});

test("position badges have explicit football descriptions in both published languages", () => {
  assert.equal(collectionPositionName("DM", "pt-BR"), "Volante");
  assert.equal(collectionPositionName("CB", "pt-BR"), "Zagueiro");
  assert.equal(collectionPositionName("RW", "en-GB"), "Right winger");
  assert.equal(collectionPositionName("LW", "pt-BR"), "Ponta esquerda");
});

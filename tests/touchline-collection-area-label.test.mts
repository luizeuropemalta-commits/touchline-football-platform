import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectionAreaLabel } from "../lib/touchlineFantasy/collection-area-label.ts";
import { getAllocationDialogCopy } from "../lib/touchlineFantasy/allocation-dialog-i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";

test("area labels reuse gated catalogues without modifying destinations", () => {
  const destinations = [{area: "starters", slot: 0}, {area: "reserves", slot: 4}, {area: "outside", slot: 14}] as const;
  const before = structuredClone(destinations);
  for (const locale of ["en-GB","pt-BR","es-ES","it-IT","fr-FR","ar-SA","tr-TR","de-DE"]) {
    for (const gate of [false, true]) {
      assert.equal(collectionAreaLabel("starters", locale, gate), getTouchlineFantasyMarketWorkflowCopy(locale, gate).startingXI);
      assert.equal(collectionAreaLabel("reserves", locale, gate), getAllocationDialogCopy(locale, gate).reserves);
      assert.equal(collectionAreaLabel("outside", locale, gate), getAllocationDialogCopy(locale, gate).outside);
      for (const destination of destinations) assert.ok(collectionAreaLabel(destination.area, locale, gate));
    }
  }
  assert.deepEqual(destinations, before);
  assert.deepEqual(destinations.map(d => d.area + ":" + d.slot), ["starters:0", "reserves:4", "outside:14"]);
  assert.deepEqual(destinations.map(d => collectionAreaLabel(d.area, "pt-BR")), ["ELENCO TITULAR", "Reservas", "Fora da partida"]);
  assert.deepEqual(destinations.map(d => collectionAreaLabel(d.area, "en-GB")), ["STARTING XI", "Substitutes", "Outside match squad"]);
  assert.equal(collectionAreaLabel("starters", "de-DE"), "STARTING XI");
  assert.equal(collectionAreaLabel("starters", "de-DE", true), "STARTELF XI");
});

test("technical attributes retain raw IDs while both visible labels use helper", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.equal(source.split("collectionAreaLabel(collectionDestination.area, locale, draftLocalesEnabled)").length - 1, 2);
  assert.ok(source.includes("data-collection-market-destination={`${collectionDestination.area}:${collectionDestination.slot}`}"));
  assert.ok(source.includes("data-market-target-slot={collectionDestination ? `${collectionDestination.area}:${collectionDestination.slot}` : marketTargetSlot?.id}"));
  assert.ok(source.includes("{collectionDestination.slot + 1} · {collectionDestination.position}"));
});

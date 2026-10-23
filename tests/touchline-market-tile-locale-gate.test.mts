import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { localizedPositionLabel } from "../lib/touchlineArena/position-labels.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/touchline/market/TouchlineMarketPlayerTile.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;

test("market tile forwards only the opt-in presentation gate to card and position copy", () => {
  for (const gate of [undefined, false, true]) {
    const cards: Record<string, unknown>[] = [];
    const card = { id: "hermetic-player", name: "Fixture Player", clubName: "Fixture Club", position: "Goalkeeper" };
    const before = structuredClone(card);
    const modules: Record<string, unknown> = {
      "react/jsx-runtime": require("react/jsx-runtime"),
      "@/components/touchline/fantasy/TouchlineGameweekCard": { __esModule: true, default: (props: Record<string, unknown>) => { cards.push(props); return null; } },
      "@/components/touchline/TouchlineClubPerimeterTrace": { __esModule: true, default: () => null },
      "@/lib/touchlineArena/card-rules": { touchlineCardTierPalette: () => { throw new Error("No editorial tier in this fixture"); } },
      "@/lib/touchlineArena/position-labels": { localizedPositionLabel },
    };
    const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
    runInNewContext(code, { exports, require(name: string) {
      assert.ok(Object.hasOwn(modules, name), name);
      return modules[name];
    } });
    const html = renderToStaticMarkup(React.createElement(exports.default!, {
      card, locale: "de-DE", ...(gate === undefined ? {} : { draftLocalesEnabled: gate }),
    }, React.createElement("span", null, "Fixture action")));
    assert.equal(cards.length, 1);
    assert.equal(cards[0].card, card);
    assert.equal(cards[0].draftLocalesEnabled, gate ?? false);
    assert.equal(cards[0].locale, "de-DE");
    assert.equal(cards[0].displayWidth, 126);
    assert.equal(cards[0].fitContainer, true);
    assert.ok(html.includes(gate ? "Torwart" : "Goalkeeper"));
    assert.ok(html.includes("Fixture action"));
    assert.deepEqual(card, before);
  }
});

test("the three mounted collection callers pass the gate; the picker retains its deliberately closed locale surface", () => {
  const parent = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const callers = [...parent.matchAll(/<ClubOwnerCollectionSlots\b[\s\S]*?\/>/g)];
  assert.equal(callers.length, 3);
  for (const [caller] of callers) assert.match(caller, /draftLocalesEnabled=\{draftLocalesEnabled\}/);
  const slots = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx", import.meta.url), "utf8");
  const swap = slots.slice(slots.indexOf("export function ClubOwnerSquadSwapDialog"), slots.indexOf("export function ClubOwnerCollectionSlots"));
  assert.match(swap, /<TouchlineMarketPlayerTile[^>]*draftLocalesEnabled=\{draftLocalesEnabled\}/);
  const picker = slots.slice(slots.indexOf("export function ClubOwnerCollectionPicker"));
  assert.match(picker, /<TouchlineMarketPlayerTile liveSeasonRating=\{liveSeasonRating\} key=\{card\.id\} card=\{card\} locale=\{locale\}>/);
  assert.doesNotMatch(picker, /draftLocalesEnabled=/);
});

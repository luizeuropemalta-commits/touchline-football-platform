import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import ts from "typescript";
import vm from "node:vm";

test("signing confirmation lives only beside the selected canonical player; Sign only arms it", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const destination = source.slice(source.indexOf('data-collection-market-destination='), source.indexOf('<label className={styles.myClubSearch}'));
  assert.ok(!destination.includes("onClick={confirmCollectionMarket}"));
  const results = source.slice(source.indexOf('{browseCards.map((card)'), source.indexOf('{!selectedPlayerClubLocked && browseCards.length'));
  assert.ok(results.includes('collectionMarketPlayer === (card.canonicalPlayerId ?? card.id)'));
  assert.equal((source.match(/onClick=\{confirmCollectionMarket\}/g) ?? []).length, 1);
  assert.ok(results.includes('data-collection-signing-confirmation={card.canonicalPlayerId ?? card.id}'));
  assert.ok(results.includes('disabled={!canUseCollectionDestination(collectionDestination) || !collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails)} onClick={confirmCollectionMarket}'));
  const signHandler = results.slice(results.indexOf('onClick={() => { if (!overBudget'), results.indexOf('{overBudget ? getTouchlineFantasyMarketBudgetCopy'));
  assert.ok(signHandler.includes('setCollectionMarketPlayer(card.canonicalPlayerId ?? card.id)'));
  assert.ok(!/purchase|confirmCollectionMarket|submit|fetch/.test(signHandler));
  assert.ok(results.includes('collection.busy || collection.hasPending'));
});

test("actual zoom action fragment only confirms explicitly and respects disabled state", () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
  const fragment = source.slice(source.indexOf("const signingButtons ="), source.indexOf("const lineupActions ="));
  let selected = 0, confirmed = 0;
  const actions: { select: { label: string; disabled: boolean; onSelect: () => void }; confirm?: { label: string; disabled: boolean; onSelect: () => void }; status?: string }
    = { select: { label: "Sign", disabled: false, onSelect: () => { selected++; } } };
  const render = () => vm.runInNewContext(ts.transpileModule(`${fragment}\nsigningButtons;`, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText, { React, styles: {}, signingActions: actions });
  let tree = render();
  assert.equal(tree.props.children[1], null);
  tree.props.children[0].props.onClick();
  assert.equal(selected, 1); assert.equal(confirmed, 0);
  actions.confirm = { label: "Confirm", disabled: true, onSelect: () => { confirmed++; } };
  tree = render(); tree.props.children[1].props.onClick(); assert.equal(confirmed, 0);
  actions.confirm.disabled = false;
  tree = render(); tree.props.children[1].props.onClick(); assert.equal(confirmed, 1);
  actions.select.disabled = true;
  render().props.children[0].props.onClick(); assert.equal(selected, 1);
  const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.ok(client.includes('confirm: collectionMarketPlayer === (card.canonicalPlayerId ?? card.id) ?'));
  assert.ok(client.includes('onSelect: confirmCollectionMarket'));
});

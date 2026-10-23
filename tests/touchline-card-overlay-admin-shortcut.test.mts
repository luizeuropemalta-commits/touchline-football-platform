import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import { touchlineCardEnginePlayerHref } from "../lib/touchlineArena/card-engine-links.ts";
import { getTouchlinePlayerZoomIdentityCopy } from "../lib/touchlineArena/player-zoom-identity-i18n.ts";

const CANONICAL_PLAYER_ID = "d9428888-122b-11e1-b85c-61cd3cbb3210";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Card Engine deep links accept only the exact canonical player UUID", () => {
  assert.equal(
    touchlineCardEnginePlayerHref(CANONICAL_PLAYER_ID, "en-GB"),
    `/admin/manual-card-editorial?playerId=${CANONICAL_PLAYER_ID}&lang=en-GB#manual-card-editor`,
  );
  assert.equal(touchlineCardEnginePlayerHref("19722198", "en-GB"), null);
  assert.equal(touchlineCardEnginePlayerHref("Bruno Guimarães", "pt-BR"), null);
  assert.equal(touchlineCardEnginePlayerHref("not-a-canonical-id", "en-GB"), null);
  assert.equal(touchlineCardEnginePlayerHref(null, "en-GB"), null);
});

test("the shared overlay exposes the Card Engine action only when a server-approved href exists", () => {
  const zoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const details = source("lib/touchlineArena/card-zoom-details.ts");

  assert.match(zoom, /details\.cardEngineHref \? \(/);
  assert.match(zoom, /href=\{details\.cardEngineHref\}/);
  assert.match(details, /cardEngineHref: input\.cardEngineHref \?\? undefined/);
  assert.match(details, /cardEngineLabel: copy\.cardEngine/);
  assert.equal(getTouchlinePlayerZoomIdentityCopy("en-GB").cardEngine, "EDIT IN CARD ENGINE");
});

test("public card pages derive Card Engine visibility from the authenticated server user", () => {
  const serverSurfaces = [
    "app/touchline-clubs/[club]/page.tsx",
    "app/touchline-player-card-rankings/page.tsx",
    "app/touchline-players/[player]/page.tsx",
    "app/rankings/page.tsx",
  ].map(source);

  for (const serverSurface of serverSurfaces) {
    assert.match(serverSurface, /isOwnerEmail\(/);
  }
  assert.doesNotMatch(source("components/touchline/fantasy/TouchlineGameweekCard.tsx"), /cardEngineHref|touchlineCardEnginePlayerHref/);
});

test("Market keeps customer authentication and denies owner/admin shortcuts", () => {
  const marketRoute = source("app/clubowner/page.tsx");

  assert.match(marketRoute, /if \(isOwnerEmail\(user\.email\)\) redirect\(touchLineAuthEntryHref\("\/admin", locale\)\)/);
  assert.doesNotMatch(marketRoute, /(?:redirect\(|href=)[^\n]*\/admin\//);
  assert.match(marketRoute, /if \(!user\) redirect\(touchLineAuthEntryHref\("\/login", locale, destination, draftLocalesEnabled\)\)/);
  assert.match(marketRoute, /const destination = `\/clubowner\?lang=/);
  assert.doesNotMatch(marketRoute, /contractPlayer|contractName|contractClub/, "unused legacy contract context is not carried into ClubOwner");


});

test("Market keeps card zoom on the Starting XI without rendering a substitute bench", () => {
  const builder = source("app/fantasy/FantasyGameweekClient.tsx");
  const card = source("components/touchline/fantasy/TouchlineGameweekCard.tsx");
  assert.match(builder, /data-market-starting-xi="true"/);
  const tree = ts.createSourceFile("FantasyGameweekClient.tsx", builder, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hasAttribute = (attributes: ts.JsxAttributes, name: string, value?: string) => attributes.properties.some((property) => {
    if (!ts.isJsxAttribute(property) || property.name.text !== name) return false;
    return value === undefined || property.initializer?.getText(tree) === value;
  });
  let startingXi: ts.JsxElement | undefined;
  const locateStartingXi = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && hasAttribute(node.openingElement.attributes, "data-market-starting-xi", '"true"')) startingXi ??= node;
    ts.forEachChild(node, locateStartingXi);
  };
  locateStartingXi(tree);
  assert.ok(startingXi, "the market Starting XI host must exist");
  let gameweekCard: ts.JsxSelfClosingElement | undefined;
  const locateCard = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "TouchlineGameweekCard"
      && hasAttribute(node.attributes, "card", "{card}")) gameweekCard ??= node;
    ts.forEachChild(node, locateCard);
  };
  locateCard(startingXi);
  assert.ok(gameweekCard, "the Starting XI host itself must render the selected card");
  assert.match(card, /<TouchlineCardZoom/);
  assert.match(card, /expandedContent=\{<TouchlineEliteExactCard/);
  assert.doesNotMatch(builder, /Matchday bench/);
  assert.doesNotMatch(builder, /remainingSquad\.map|className=\{styles\.bench\}/);
  assert.doesNotMatch(builder, /className=\{styles\.pitchRemove\}/);
  assert.match(builder, /replacementAction=\{selection \? \{[^\n]*disabled: !editable \|\| saving \|\| \(collectionEnabled && !collectionSlotsEditable\), onSelect: \(\) => replaceMyClubPlayer\(selection\.playerId, slot\.id\)/);
  assert.match(builder, /className=\{styles\.emptyPosition\}[^>]*onClick=\{\(\) => openTacticalSelector\(slot\.id\)\}/);
  const styles = source("app/fantasy/fantasy.module.css");
  assert.match(styles, /\.myClubPitchViewport \.myClubTacticalSlot > \.pitchRemove \{[^}]*width: 44px; height: 44px; min-height: 44px/);
  assert.match(styles, /\.pitchRemove:focus-visible \{[^}]*outline:/);
  // The approved embedded flow now selects in the permanent page section,
  // rather than mounting the retired modal/inline picker abstraction.
  assert.match(builder, /if \(embedded\) \{/);
  assert.match(builder, /<aside className=\{styles\.myClubMarket\} id="my-club-player-selection" tabIndex=\{-1\} data-open="true" data-inline-selection="true"/);
  assert.match(builder, /const targetSlot = marketPage \? activeSlot : browseSlot/);
  assert.match(builder, /targetSlot && targetSlot\.id === activeSlot\?\.id && selectedCoach/);
  assert.match(builder, /<button type="button" disabled=\{saving \|\| \(collectionEnabled && !collectionSlotsEditable\) \|\| \(marketPage && !canChooseGuidedSlot\(guidedChoice, \{area:"starters",slot:targetSlot\.id\}, selections\.some\(entry=>entry\.slotId===targetSlot\.id\)\)\)\} aria-disabled=\{overBudget \|\| undefined\}[^\n]*onClick=\{\(\) => selectMyClubPlayer\(card\)\}/);
  assert.match(builder, /if \(!activeSlot \|\| \(!marketPage && browseSlot\?\.id !== activeSlot\.id\)\) return/);
  assert.match(builder, /scrollToLineupSection\("my-club-xi-pitch"\)/);
});

test("the destination remains owner-gated and resolves the requested canonical player", () => {
  const editorPage = source("app/(app)/admin/manual-card-editorial/page.tsx");
  const editorRoute = source("app/api/admin/manual-card-editorial/route.ts");

  assert.match(editorPage, /isOwnerEmail/);
  assert.match(editorPage, /requestedPlayerId/);
  assert.match(editorRoute, /isOwnerEmail/);
  assert.match(editorRoute, /playerId/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

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

  assert.match(marketRoute, /if \(isOwnerEmail\(user\.email\)\) notFound\(\)/);
  assert.doesNotMatch(marketRoute, /(?:redirect\(|href=)[^\n]*\/admin\//);
  assert.match(marketRoute, /if \(!user\) redirect\(touchLineAuthEntryHref\("\/login", locale, destination, draftLocalesEnabled\)\)/);
  assert.match(marketRoute, /const destination = `\/clubowner\?lang=/);
  assert.doesNotMatch(marketRoute, /contractPlayer|contractName|contractClub/, "unused legacy contract context is not carried into ClubOwner");


});

test("Market keeps card zoom on the Starting XI without rendering a substitute bench", () => {
  const builder = source("app/fantasy/FantasyGameweekClient.tsx");
  const card = source("components/touchline/fantasy/TouchlineGameweekCard.tsx");
  assert.match(builder, /data-market-starting-xi="true"/);
  assert.match(builder, /<TouchlineGameweekCard card=\{card\}/);
  assert.match(card, /<TouchlineCardZoom/);
  assert.match(card, /expandedContent=\{<TouchlineEliteExactCard/);
  assert.doesNotMatch(builder, /Matchday bench/);
  assert.doesNotMatch(builder, /remainingSquad\.map|className=\{styles\.bench\}/);
  assert.match(builder, /card && selection && editable \? <button[^>]*className=\{styles\.pitchRemove\}[^>]*disabled=\{saving\}/);
  assert.match(builder, /onClick=\{\(\) => removeMyClubPlayer\(selection\.playerId, slot\.id\)\}/);
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
  assert.match(builder, /<button type="button" disabled=\{saving\} onClick=\{\(\) => selectMyClubPlayer\(card\)\}/);
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

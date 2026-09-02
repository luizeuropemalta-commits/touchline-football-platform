import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { touchlineCardEnginePlayerHref } from "../lib/touchlineArena/card-engine-links.ts";

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
  assert.match(details, /EDIT IN CARD ENGINE/);
});

test("public card pages derive Card Engine visibility from the authenticated server user", () => {
  const serverSurfaces = [
    "app/arena/page.tsx",
    "app/market-transfer/page.tsx",
    "app/touchline-clubs/[club]/page.tsx",
    "app/touchline-player-card-rankings/page.tsx",
    "app/touchline-players/[player]/page.tsx",
    "app/touchline-tables/page.tsx",
    "components/touchline/club-owner/ClubOwnerProfileRenderer.tsx",
  ].map(source);

  for (const serverSurface of serverSurfaces) {
    assert.match(serverSurface, /isOwnerEmail\(/);
  }
  assert.match(source("app/arena/ArenaClient.tsx"), /canEditCardEngine = false/);
  assert.match(source("components/touchline/market/TouchlineSquadBuilderStage.tsx"), /canEditCardEngine = false/);
});

test("Market keeps card zoom on the Starting XI without rendering a substitute bench", () => {
  const builder = source("components/touchline/market/TouchlineSquadBuilderStage.tsx");

  assert.match(builder, /function SquadPlayerCardZoom/);
  assert.equal(builder.match(/<SquadPlayerCardZoom/g)?.length, 1);
  assert.doesNotMatch(builder, /Matchday bench/);
  assert.doesNotMatch(builder, /remainingSquad\.map[\s\S]*?<SquadPlayerCardZoom/);
  assert.match(builder, /const squadCandidates = useMemo\([\s\S]*?\[\.\.\.bench, \.\.\.remainingSquad\]/);
  assert.match(builder, /className=\{styles\.changePlayer\}/);
});

test("the destination remains owner-gated and resolves the requested canonical player", () => {
  const editorPage = source("app/(app)/admin/manual-card-editorial/page.tsx");
  const editorRoute = source("app/api/admin/manual-card-editorial/route.ts");

  assert.match(editorPage, /isOwnerEmail/);
  assert.match(editorPage, /requestedPlayerId/);
  assert.match(editorRoute, /isOwnerEmail/);
  assert.match(editorRoute, /playerId/);
});

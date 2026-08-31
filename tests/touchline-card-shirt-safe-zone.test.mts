import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cardSource = readFileSync(
  new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
  "utf8",
);
const masterLayout = JSON.parse(readFileSync(
  new URL("../public/touchlineArena/card-layouts/master-shirt-back-layout.json", import.meta.url),
  "utf8",
)) as { layout: { shirtClub: { x: number; y: number; scale: number } } };

test("all official player cards render club crests twenty percent smaller", () => {
  assert.match(cardSource, /const CLUB_CREST_VISUAL_SCALE = 0\.8;/);
  assert.match(cardSource, /data-club-crest-visual-scale=\{CLUB_CREST_VISUAL_SCALE\}/);
  assert.match(cardSource, /width: `\$\{CLUB_CREST_VISUAL_SCALE \* 100\}%`/);
  assert.match(cardSource, /height: `\$\{CLUB_CREST_VISUAL_SCALE \* 100\}%`/);
});

test("shirt names keep their full text inside a crest-aware safe zone", () => {
  assert.match(cardSource, /function shirtNameSafePadding\(/);
  assert.match(cardSource, /shirtNameSafePadding\(layout, Boolean\(resolvedClubLogoUrl\)\)/);
  assert.match(cardSource, /paddingLeft: shirtNamePadding\.left/);
  assert.match(cardSource, /paddingRight: shirtNamePadding\.right/);
  assert.match(cardSource, /textOverflow: "clip"/);
  assert.match(cardSource, /whiteSpace: "nowrap"/);
  assert.match(
    cardSource,
    /data-full-player-name=\{shirtPlayerName\}[\s\S]{0,700}overflow: "visible"/,
  );
  assert.doesNotMatch(cardSource, /data-shirt-name=\{shirtPlayerName\}[\s\S]{0,500}textOverflow: "ellipsis"/);
});

test("crest protection remains symmetric so every shirt name stays centered", () => {
  assert.match(cardSource, /return \{ left: symmetricPadding, right: symmetricPadding \};/);
  assert.doesNotMatch(cardSource, /return \{\s*\.\.\.base,\s*right:/);
  assert.doesNotMatch(cardSource, /return \{\s*\.\.\.base,\s*left:/);
});

test("font measurement uses only the shirt width left free by the crest", () => {
  assert.match(
    cardSource,
    /mask\.clientWidth - shirtNamePadding\.left - shirtNamePadding\.right/,
  );
  assert.match(cardSource, /context\.measureText\(shirtPlayerName\.toUpperCase\(\)\)/);
  assert.match(cardSource, /Math\.max\(3\.5, fittedSize\)/);
});

test("shirt names use one readable, unclipped official treatment", () => {
  assert.match(cardSource, /const SHIRT_NAME_READABILITY_MULTIPLIER = 1\.2;/);
  assert.match(cardSource, /shirtClub: \{ width: 246, height: 42 \}/);
  assert.match(cardSource, /MIN_SHIRT_NAME_HORIZONTAL_SCALE = 0\.78/);
  assert.match(cardSource, /transform: shirtPlayerNameFit\.horizontalScale === 1/);
  assert.match(cardSource, /fitShirtBackNameSize\(shirtPlayerName\) \* shirtClubScale \* SHIRT_NAME_READABILITY_MULTIPLIER/);
  assert.deepEqual(masterLayout.layout.shirtClub, { x: 74, y: 173, scale: 1.14 });
});

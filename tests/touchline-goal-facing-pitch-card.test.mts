import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";

const root = new URL("../", import.meta.url);

test("Club Hub consumes the shared orientation-aware compact pitch card", async () => {
  const [wrapper, styles, lineup] = await Promise.all([
    readFile(new URL("components/touchline/cards/TouchlineGoalFacingPitchCard.tsx", root), "utf8"),
    readFile(new URL("components/touchline/cards/TouchlineGoalFacingPitchCard.module.css", root), "utf8"),
    readFile(new URL("components/touchline/ClubHubOfficialLineup.tsx", root), "utf8"),
  ]);

  assert.match(wrapper, /orientation = "attack-right"/);
  assert.match(wrapper, /data-touchline-pitch-card-orientation=\{orientation\}/);
  assert.match(styles, /rotate\(90deg\)/);
  assert.match(styles, /\[data-arena-match-rating="true"\][\s\S]*rotate\(-90deg\)/);
  assert.match(styles, /\.shellAttackUp > \*[\s\S]*?transform: translate\(-50%, -50%\);/);
  assert.match(lineup, /<TouchlineGoalFacingPitchCard className=\{styles\.pitchCard\} orientation="upright">[\s\S]*?<TouchlineCardZoom/);
});

test("pitch cards open upright without a second floating player-name box", async () => {
  const [market, lineup] = await Promise.all([
    readFile(new URL("components/touchline/fantasy/TouchlineGameweekCard.tsx", root), "utf8"),
    readFile(new URL("components/touchline/ClubHubOfficialLineup.tsx", root), "utf8"),
  ]);

  assert.match(market, /<TouchlineCardZoom/);
  assert.doesNotMatch(market, /styles\.playerName/);
  assert.doesNotMatch(lineup, /styles\.playerName/);
  assert.match(lineup, /const zoomCopy = getTouchlineCardZoomCopy\(locale, draftLocalesEnabled\)/);
  assert.match(lineup, /ariaLabel=\{zoomCopy\.expandCard\.replace\("\{playerName\}", \(\) => card\.name\)\}/);
  assert.equal(getTouchlineCardZoomCopy("pt-BR").expandCard, "Ampliar card de {playerName}");
  assert.match(market, /expandedContent=\{<TouchlineEliteExactCard/);
  assert.match(lineup, /expandedContent=\{\([\s\S]*?<TouchlineEliteExactCard/);
});

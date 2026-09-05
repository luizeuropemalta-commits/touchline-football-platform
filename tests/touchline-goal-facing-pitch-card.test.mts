import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Market and Club Hub share one orientation-aware compact pitch card", async () => {
  const [wrapper, styles, market, lineup] = await Promise.all([
    readFile(new URL("components/touchline/cards/TouchlineGoalFacingPitchCard.tsx", root), "utf8"),
    readFile(new URL("components/touchline/cards/TouchlineGoalFacingPitchCard.module.css", root), "utf8"),
    readFile(new URL("components/touchline/market/TouchlineSquadBuilderStage.tsx", root), "utf8"),
    readFile(new URL("components/touchline/ClubHubOfficialLineup.tsx", root), "utf8"),
  ]);

  assert.match(wrapper, /orientation = "attack-right"/);
  assert.match(wrapper, /data-touchline-pitch-card-orientation=\{orientation\}/);
  assert.match(styles, /rotate\(90deg\)/);
  assert.match(styles, /\[data-arena-match-rating="true"\][\s\S]*rotate\(-90deg\)/);
  assert.match(styles, /\.shellAttackUp > \*[\s\S]*?transform: translate\(-50%, -50%\);/);
  assert.match(market, /<TouchlineGoalFacingPitchCard className=\{styles\.playerCardZoom\} orientation="attack-up">[\s\S]*?<SquadPlayerCardZoom/);
  assert.match(lineup, /<TouchlineGoalFacingPitchCard className=\{styles\.pitchCard\} orientation="upright">[\s\S]*?<TouchlineCardZoom/);
});

test("pitch labels stay outside the rotated card and expanded cards remain upright", async () => {
  const [market, lineup] = await Promise.all([
    readFile(new URL("components/touchline/market/TouchlineSquadBuilderStage.tsx", root), "utf8"),
    readFile(new URL("components/touchline/ClubHubOfficialLineup.tsx", root), "utf8"),
  ]);

  assert.match(market, /<\/TouchlineGoalFacingPitchCard>[\s\S]*?<strong>\{player\.shortName\}<\/strong>/);
  assert.match(lineup, /<span className=\{styles\.playerName\}>\{card\.name\}<\/span>[\s\S]*?<TouchlineGoalFacingPitchCard/);
  assert.match(market, /expandedContent=\{\([\s\S]*?<TouchlineEliteExactCard/);
  assert.match(lineup, /expandedContent=\{\([\s\S]*?<TouchlineEliteExactCard/);
});

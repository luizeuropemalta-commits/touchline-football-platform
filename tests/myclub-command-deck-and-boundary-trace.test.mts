import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file: string) => readFile(path.join(root, file), "utf8");

test("authenticated My Club uses the command deck and keeps controls with the owner identity", async () => {
  const [profile, social, css] = await Promise.all([
    source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx"),
    source("components/touchline/social/TouchlineSocial.tsx"),
    source("components/touchline/social/TouchlineSocial.module.css"),
  ]);

  assert.match(profile, /coverVariant=\{showPrivateClubControl \? "command" : "standard"\}/);
  assert.match(profile, /actionsPlacement=\{showPrivateClubControl \? "avatar" : "default"\}/);
  assert.match(profile, /\.filter\(\(detail\) => Boolean\(detail\.value && detail\.value !== "—"\)\)/);
  assert.match(social, /coverVariant\?: "standard" \| "stadium" \| "command"/);
  assert.match(social, /actionsPlacement\?: "default" \| "avatar"/);
  assert.match(social, /actionsPlacement === "avatar"/);
  assert.match(css, /\.coverCommand/);
  assert.doesNotMatch(css.match(/\.coverCommand \{[^}]+\}/)?.[0] ?? "", /official-live-pitch/);
});

test("the XI pitch traces only its real perimeter and never renders the market marquee", async () => {
  const [market, pitch, pitchCss] = await Promise.all([
    source("components/touchline/market/TouchlineSquadBuilderStage.tsx"),
    source("components/touchline/pitch/TouchlinePitchSurface.tsx"),
    source("components/touchline/pitch/TouchlinePitchSurface.module.css"),
  ]);

  assert.match(market, /<TouchlinePitchSurface\s+boundaryTrace/);
  assert.doesNotMatch(market, /TOUCHLINE_MARKET_HOUSE_CAMPAIGN|advertisingCampaign=/);
  assert.match(pitch, /boundaryTrace\?: boolean/);
  assert.match(pitch, /className=\{styles\.boundaryTraceRunner\}/);
  assert.match(pitchCss, /\.boundaryTraceRunner/);
  assert.match(pitchCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.boundaryTraceRunner \{ animation: none/);
});

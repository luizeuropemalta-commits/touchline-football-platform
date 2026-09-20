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
  assert.match(social, /<TouchlineClubPerimeterTrace accent=\{accent\} className=\{styles\.commandPerimeterTrace\}/);
  assert.match(social, /coverVariant === "command" \? styles\.commandHeader/);
  assert.match(css, /\.coverCommand/);
  assert.match(css, /clubowner-arena-neon-cover\.png/);
  assert.doesNotMatch(css, /tl-shield-lime\.svg/);
  assert.doesNotMatch(css, /@keyframes touchlineScoreboardNeon/);
  assert.match(css, /\.commandHeader/);
  assert.match(css, /\.commandPerimeterTrace/);
  assert.doesNotMatch(css.match(/\.coverCommand \{[^}]+\}/)?.[0] ?? "", /official-live-pitch/);
});

test("My Club styles define one approved stadium background on the shared header", async () => {
  const css = await source("components/touchline/social/TouchlineSocial.module.css");
  const stadiumAsset = "/touchlineArena/my-club/clubowner-arena-neon-cover.png";
  assert.equal(css.split(stadiumAsset).length - 1, 1);
  assert.match(css, /\.commandHeader\s*\{[^}]*background:[^}]*clubowner-arena-neon-cover\.png[^}]*no-repeat/);
  assert.match(css, /\.coverCommand\s*\{[^}]*background: transparent;/);
  assert.match(css, /\.coverCommand::before,\s*\.coverCommand::after\s*\{\s*display:\s*none;/);
  assert.match(css, /\.commandHeader \.socialIdentity::before/);
});

test("the separate market pitch keeps its perimeter while My Club stays calm", async () => {
  const [market, myClub, pitch, pitchCss] = await Promise.all([
    source("components/touchline/market/TouchlineSquadBuilderStage.tsx"),
    source("app/fantasy/FantasyGameweekClient.tsx"),
    source("components/touchline/pitch/TouchlinePitchSurface.tsx"),
    source("components/touchline/pitch/TouchlinePitchSurface.module.css"),
  ]);

  assert.match(market, /<TouchlinePitchSurface\s+boundaryTrace/);
  assert.doesNotMatch(market, /TOUCHLINE_MARKET_HOUSE_CAMPAIGN|advertisingCampaign=/);
  assert.doesNotMatch(myClub, /<TouchlinePitchSurface boundaryTrace className=\{styles\.myClubTacticalPitch\}/);
  assert.match(pitch, /boundaryTrace\?: boolean/);
  assert.match(pitchCss, /\.boundaryTraceRunner/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Market uses the premium vertical stadium surface and an admin-ready campaign boundary", async () => {
  const [stage, pitch] = await Promise.all([
    source("components/touchline/market/TouchlineSquadBuilderStage.tsx"),
    source("components/touchline/pitch/TouchlinePitchSurface.tsx"),
  ]);

  assert.match(stage, /orientation="vertical"/);
  assert.match(stage, /surfaceVariant="premium-stadium"/);
  assert.match(stage, /advertisingCampaign=\{TOUCHLINE_MARKET_HOUSE_CAMPAIGN\}/);
  assert.match(pitch, /data-touchline-advertising-campaign-id/);
  assert.match(pitch, /THIS IS NOT FANTASY\. THIS IS REALITY\./);
  assert.match(pitch, /FOLLOW THE GAME\. FOLLOW TOUCHLINE\./);
  assert.match(pitch, /FOLLOW US ON INSTAGRAM/);
  assert.match(pitch, /FOLLOW US ON FACEBOOK/);
  assert.match(pitch, /ADVERTISE WITH TOUCHLINE/);
});

test("stadium pilot keeps only the original camera-facing LED board behind the goal", async () => {
  const [pitch, styles] = await Promise.all([
    source("components/touchline/pitch/TouchlinePitchSurface.tsx"),
    source("components/touchline/pitch/TouchlinePitchSurface.module.css"),
  ]);

  assert.match(pitch, /styles\.ledGoalBoard/);
  assert.match(pitch, /styles\.ledGoalScreen/);
  assert.doesNotMatch(pitch, /styles\.ledContinuousBoard/);
  assert.doesNotMatch(pitch, /styles\.ledBoardLeft/);
  assert.doesNotMatch(pitch, /styles\.ledBoardBottom/);
  assert.match(styles, /\.ledGoalBoard\s*\{/);
  assert.match(styles, /border:\s*clamp\(3px, \.3vw, 6px\) solid #030403/);
  assert.match(styles, /\.ledGoalBoard\s*\{[\s\S]*?right:\s*\.4%[\s\S]*?left:\s*\.4%/);
  assert.match(styles, /\.ledGoalBoard\s*\{[\s\S]*?transform:\s*none/);
  assert.doesNotMatch(styles, /\.ledGoalBoard\s*\{[\s\S]*?0 14px 24px/);
  assert.match(styles, /\.ledGoalScreen\s*\{[\s\S]*?\/ 2px 2px/);
  assert.match(styles, /\.ledTrack b\s*\{[\s\S]*?text-rendering:\s*geometricPrecision[\s\S]*?-webkit-font-smoothing:\s*antialiased/);
  assert.doesNotMatch(styles, /\.ledTrack b\s*\{[\s\S]*?text-shadow:[\s\S]*?0 0 15px/);
  assert.match(styles, /touchline-premium-goal-net-v1\.png/);
  assert.match(styles, /touchline-premium-grass-clean-horizontal-v1\.png/);
  assert.doesNotMatch(pitch, /styles\.cornerFlag/);
});

test("the proportional pitch has equal grass runoffs and an external LED apron", async () => {
  const styles = await source("components/touchline/pitch/TouchlinePitchSurface.module.css");

  assert.match(styles, /--premium-grass-top:\s*5%/);
  assert.match(styles, /--premium-pitch-top-runoff:\s*10%/);
  assert.match(styles, /--premium-goal-top-height:\s*5\.2%/);
  assert.match(styles, /--premium-goal-top-offset:\s*5\.5%/);
  assert.match(styles, /--premium-goal-bottom-height:\s*var\(--premium-goal-top-height\)/);
  assert.match(styles, /--premium-goal-bottom-offset:\s*\.5%/);
  assert.match(styles, /--premium-led-top:\s*\.4%/);
  assert.match(styles, /--premium-led-height:\s*4\.6%/);
  assert.match(styles, /linear-gradient\(180deg, #020403 0 4\.72%, rgba\(2, 4, 3, \.98\) 4\.88%, transparent 5\.12%\)/);
  assert.match(styles, /\.surfacePremiumStadium\.surfaceVertical \.boundary\s*\{[\s\S]*?top:\s*var\(--premium-pitch-top-runoff\)[\s\S]*?right:\s*7\.5%[\s\S]*?bottom:\s*5%[\s\S]*?left:\s*7\.5%/);
  assert.match(styles, /\.surfacePremiumStadium\.surfaceVertical \.halfway\s*\{[\s\S]*?right:\s*7\.5%[\s\S]*?left:\s*7\.5%/);
  assert.match(styles, /\.surfacePremiumStadium\.surfaceVertical \.goalStart\s*\{[\s\S]*?top:\s*var\(--premium-goal-top-offset\)[\s\S]*?height:\s*var\(--premium-goal-top-height\)/);
  assert.match(styles, /\.surfacePremiumStadium\.surfaceVertical \.goalEnd\s*\{[\s\S]*?bottom:\s*var\(--premium-goal-bottom-offset\)[\s\S]*?height:\s*var\(--premium-goal-bottom-height\)[\s\S]*?scaleY\(-1\)/);
  assert.match(styles, /\.ledGoalBoard\s*\{[\s\S]*?top:\s*var\(--premium-led-top, \.4%\)/);
});

test("Market formation rotates attack-right coordinates upwards and keeps every card upright", async () => {
  const [stage, orientation, orientationStyles] = await Promise.all([
    source("components/touchline/market/TouchlineSquadBuilderStage.tsx"),
    source("components/touchline/cards/TouchlineGoalFacingPitchCard.tsx"),
    source("components/touchline/cards/TouchlineGoalFacingPitchCard.module.css"),
  ]);

  assert.match(stage, /function verticalPitchPosition/);
  assert.match(stage, /100 - slot\.x/);
  assert.match(stage, /orientation="attack-up"/);
  assert.match(orientation, /"attack-right" \| "attack-up" \| "upright"/);
  assert.match(orientationStyles, /\.shellAttackUp > \*/);
  assert.match(orientationStyles, /transform:\s*translate\(-50%, -50%\);/);
});

test("the Market pitch shows the coach and Starting XI without a substitute bench", async () => {
  const [stage, styles] = await Promise.all([
    source("components/touchline/market/TouchlineSquadBuilderStage.tsx"),
    source("components/touchline/market/TouchlineSquadBuilderStage.module.css"),
  ]);

  assert.match(stage, /className=\{styles\.technicalArea\}/);
  assert.match(stage, /className=\{styles\.coachBrief\}/);
  assert.doesNotMatch(stage, /touchline-market-dugout-title/);
  assert.doesNotMatch(stage, /Matchday bench|Banco da partida|Substitutes|Reservas/);
  assert.doesNotMatch(stage, /key: "bench"/);
  assert.match(styles, /\.pitchColumn\s*\{[\s\S]*?--market-technical-width:\s*clamp\(360px, 40%, 720px\)/);
  assert.match(styles, /\.pitchColumn\s*\{[\s\S]*?width:\s*100%/);
  assert.match(styles, /\.pitch\s*\{[\s\S]*?min-height:\s*0/);
});

test("visual fixture is unambiguously local and non-publishable", async () => {
  const page = await source("app/visual-qa/market-premium-pitch/page.tsx");
  assert.match(page, /GEOMETRY QA · LOCAL ONLY · NOT PUBLISHABLE/);
  assert.match(page, /readVisualQaMarketCatalogue/);
  assert.match(page, /No partial catalogue is shown/);
  assert.doesNotMatch(page, /CLUB_OWNER_SQUAD_CARDS|visual-qa-\$\{card\.id\}/);
  assert.doesNotMatch(page, /LINE-UP CONFIRMED/);
});

test("visual Market reads every club from a local canonical snapshot and fails closed", async () => {
  const [reader, sync] = await Promise.all([
    source("app/visual-qa/market-premium-pitch/catalogue.ts"),
    source("scripts/qa/sync-touchline-market-visual-catalogue.mts"),
  ]);

  assert.match(reader, /TOUCHLINE_ENGLAND_CLUBS\.map/);
  assert.match(reader, /readFile\(SNAPSHOT_PATH, "utf8"\)/);
  assert.match(reader, /catalogue\.snapshot\.json/);
  assert.match(reader, /MIN_COMPLETE_MARKET_CLUB_CARDS = 20/);
  assert.match(reader, /publicPremierSquadPlayerToCard/);
  assert.match(reader, /canonical-squad-incomplete/);
  assert.match(reader, /canonical-catalogue-identity-conflict/);
  assert.doesNotMatch(reader, /fetch\(|https?:|sportmonks|api\.sportmonks|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/i);
  assert.match(sync, /api\/football-data\/premier-squad/);
  assert.match(sync, /MIN_COMPLETE_MARKET_CLUB_CARDS = 20/);
  assert.match(sync, /TOUCHLINE_ENGLAND_CLUBS\.map/);
});

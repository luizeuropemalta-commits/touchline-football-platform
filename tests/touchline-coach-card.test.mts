import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createTouchlineArenaCoachSlot,
  TOUCHLINE_COACH_RANKING_SIZE,
  TOUCHLINE_COACH_TIER_BANDS,
  TOUCHLINE_COACH_CARD_ART,
  touchlineCoachCardArtForTier,
  touchlineCoachTierForRankingPosition,
  touchlineCoachScoreCanBePublished,
  type TouchlineArenaCoachSlot,
} from "../lib/touchlineArena/coach-card.ts";
import type { TouchlineCoach } from "../lib/football-data/types.ts";
import {
  TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT,
  TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA,
  TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY,
  TOUCHLINE_COACH_CARD_LAYOUT_VERSION,
  normalizeTouchlineCoachCardLayout,
} from "../lib/touchlineArena/coach-card-layout.ts";

const verifiedCoach: TouchlineCoach = {
  id: "sportmonks:coach:1",
  providerId: "1",
  provider: "sportmonks",
  name: "Verified Coach",
  displayName: "Verified Coach",
  teamId: "42",
  source: { provider: "sportmonks", providerId: "1", raw: { id: 1 } },
};

test("keeps an empty coach slot scoreless until provider identity is verified", () => {
  const slot = createTouchlineArenaCoachSlot();

  assert.equal(slot.entityType, "coach");
  assert.equal(slot.rankingGroup, "coach");
  assert.equal(slot.status, "awaiting-verified-coach");
  assert.equal(slot.touchlinePoints, null);
  assert.equal(slot.cardTier, "ruby-red");
  assert.equal(slot.rankingPosition, null);
  assert.equal(slot.apparel, "official-coach-photo-art");
  assert.equal(slot.cardPriceTc, 1);
  assert.equal(touchlineCoachScoreCanBePublished(slot), false);
});

test("maps the exclusive table of 20 coaches across the same seven player tiers", () => {
  const expected = [
    "diamond-gold",
    "clear-diamond", "clear-diamond", "clear-diamond",
    "emerald-green", "emerald-green",
    "radiant-gold", "radiant-gold",
    "amethyst-purple", "amethyst-purple", "amethyst-purple", "amethyst-purple", "amethyst-purple",
    "sapphire-blue", "sapphire-blue", "sapphire-blue",
    "ruby-red", "ruby-red", "ruby-red", "ruby-red",
  ];
  assert.equal(TOUCHLINE_COACH_RANKING_SIZE, 20);
  assert.equal(TOUCHLINE_COACH_TIER_BANDS.length, 7);
  assert.deepEqual(Array.from({ length: 20 }, (_, index) => touchlineCoachTierForRankingPosition(index + 1)), expected);
  assert.equal(touchlineCoachTierForRankingPosition(null), "ruby-red");
  assert.equal(touchlineCoachTierForRankingPosition(21), "ruby-red");
  assert.equal(createTouchlineArenaCoachSlot(verifiedCoach, 1).cardPriceTc, 50);
  assert.equal(Object.keys(TOUCHLINE_COACH_CARD_ART).length, 7);
  assert.equal(touchlineCoachCardArtForTier("ruby-red"), "/touchlineArena/cards/coaches/02_red_coach.png");
  assert.equal(touchlineCoachCardArtForTier("diamond-gold"), "/touchlineArena/cards/coaches/07_golddiamond_coach.png");
});

test("keeps a verified coach scoreless until verified match evidence arrives", () => {
  const slot = createTouchlineArenaCoachSlot(verifiedCoach);

  assert.equal(slot.clubProviderId, "42");
  assert.equal(slot.status, "awaiting-match-evidence");
  assert.equal(slot.touchlinePoints, null);
  assert.equal(touchlineCoachScoreCanBePublished(slot), false);
});

test("only publishes audited points backed by provider events and a scoring version", () => {
  const slot: TouchlineArenaCoachSlot = {
    ...createTouchlineArenaCoachSlot(verifiedCoach),
    touchlinePoints: 8,
    status: "audited",
    scoreEvidence: {
      provider: "sportmonks",
      providerEventIds: ["fixture:123:coach:1"],
      scoringVersion: "coach-points-v1",
    },
  };

  assert.equal(touchlineCoachScoreCanBePublished(slot), true);
  assert.equal(touchlineCoachScoreCanBePublished({ ...slot, scoreEvidence: null }), false);
});

test("keeps one normalized editable master layout for every coach-card surface", () => {
  const edited = normalizeTouchlineCoachCardLayout({
    ...TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT,
    neonStrength: 1.5,
    nameSize: 6.2,
    layers: {
      ...TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT.layers,
      portrait: { x: 8, y: 12, w: 84, h: 50 },
    },
  });

  assert.equal(edited.neonStrength, 1.5);
  assert.equal(edited.nameSize, 6.2);
  assert.deepEqual(edited.layers.portrait, { x: 8, y: 12, w: 84, h: 50 });
  assert.equal(normalizeTouchlineCoachCardLayout({ neonStrength: 99 }).neonStrength, 1.8);
});

test("ships the editable coach-card master layout as the active programming default", () => {
  const masterLayout = JSON.parse(fs.readFileSync("public/touchlineArena/card-layouts/coach-card-layout.json", "utf8"));

  assert.equal(masterLayout.version, TOUCHLINE_COACH_CARD_LAYOUT_VERSION);
  assert.equal(masterLayout.storageKey, TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY);
  assert.equal(TOUCHLINE_COACH_CARD_LAYOUT_VERSION, 6);
  assert.equal(TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY, "touchline:coach-card:master-layout:v6");
  assert.ok(masterLayout.layout.nationality);
  assert.ok(masterLayout.layout.clubCrest);
  assert.ok(masterLayout.layout.portrait);
  assert.ok(masterLayout.layout.nameplate);
  assert.ok(masterLayout.layout.stats);
  assert.ok(masterLayout.layout.footer);
  assert.equal(masterLayout.layout.topline, undefined);
  assert.deepEqual(masterLayout.layout.nameplate, TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT.layers.nameplate);
  assert.deepEqual(masterLayout.layout.stats, TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT.layers.stats);
  assert.equal(masterLayout.layout.nameplate.y, 52);
  assert.equal(masterLayout.layout.stats.y, 65.5);
  assert.ok(masterLayout.layout.stats.y - masterLayout.layout.nameplate.y >= 12);
});

test("keeps the two editable coach groups inside the shared pre-stone safe area", () => {
  const coachCard = fs.readFileSync("components/touchline/cards/TouchlineCoachCard.tsx", "utf8");
  const coachCardStyles = fs.readFileSync("components/touchline/cards/TouchlineCoachCard.module.css", "utf8");
  const editor = fs.readFileSync("app/visual-qa/coach-card/page.tsx", "utf8");

  assert.deepEqual(TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA, { left: 2, right: 98, top: 2, bottom: 75 });
  assert.ok(TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT.layers.stats.y < TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA.bottom);
  assert.match(editor, /editableLayers=\{\["nameplate", "stats"\]\}/);
  assert.doesNotMatch(editor, /editableLayers=\{\["clubCrest"\]\}/);
  assert.match(coachCard, /TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA\.bottom - drag\.renderedHeightPercent/);
  assert.match(coachCard, /TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA\.right - drag\.renderedWidthPercent/);
  assert.match(coachCardStyles, /\[data-coach-layer\]\[data-coach-layer-active="true"\] \{\s*cursor: grabbing;/);
  assert.match(coachCardStyles, /\[data-coach-layer\] \{[\s\S]*?outline: 0;/);
});

test("normalizes the square emerald coach export through lightweight runtime derivatives", () => {
  const coachCard = fs.readFileSync("components/touchline/cards/TouchlineCoachCard.tsx", "utf8");
  const coachCardStyles = fs.readFileSync("components/touchline/cards/TouchlineCoachCard.module.css", "utf8");
  const dimensions = Object.entries(TOUCHLINE_COACH_CARD_ART).map(([tier, publicPath]) => {
    const png = fs.readFileSync(`public${publicPath}`);
    return [tier, { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }] as const;
  });
  const dimensionsByTier = Object.fromEntries(dimensions);

  assert.deepEqual(dimensionsByTier["emerald-green"], { width: 1254, height: 1254 });
  for (const tier of Object.keys(dimensionsByTier).filter((key) => key !== "emerald-green")) {
    assert.deepEqual(dimensionsByTier[tier], { width: 1086, height: 1448 }, tier);
  }
  assert.match(coachCard, /"--coach-art-scale": "1"/);
  assert.match(coachCard, /templates\/live-compact\/coaches/);
  assert.match(coachCard, /templates\/zoom\/coaches/);
  assert.match(coachCard, /replace\(\/\\\.png\$\/i, "\.webp"\)/);
  assert.match(coachCardStyles, /\.frame \{[\s\S]*?transform: scale\(var\(--coach-art-scale, 1\)\)/);
  assert.doesNotMatch(coachCardStyles, /\.frame \{[\s\S]*?transform: scale\(1\);/);
});

test("keeps the approved live compact player and coach sizes across desktop and mobile", () => {
  const arenaClient = fs.readFileSync("app/arena/ArenaClient.tsx", "utf8");

  assert.match(arenaClient, /\.arena-live-moving-card \{[\s\S]*?width: clamp\(27px, 3vw, 42px\)/);
  assert.match(arenaClient, /\.arena-live-coach-card-art \{[\s\S]*?width: clamp\(35px, 3\.9vw, 55px\)/);
  assert.match(arenaClient, /@media \(max-width: 900px\)[\s\S]*?\.arena-live-coach-card-art \{[\s\S]*?width: clamp\(30px, 7\.4vw, 42px\)/);
  assert.match(arenaClient, /@media \(max-width: 760px\)[\s\S]*?\.arena-live-moving-card \{[\s\S]*?width: clamp\(30px, 7\.8vw, 38px\)/);

  assert.ok(35 / 27 >= 1.29);
  assert.ok(55 / 42 >= 1.3);
});

test("keeps live coach zoom isolated and renders the full card instead of compact content", () => {
  const arenaClient = fs.readFileSync("app/arena/ArenaClient.tsx", "utf8");
  const liveCoachSpotlightStart = arenaClient.indexOf('className="arena-coach-spotlight arena-live-card-spotlight arena-live-coach-spotlight"');
  const liveCoachSpotlightSource = arenaClient.slice(liveCoachSpotlightStart, liveCoachSpotlightStart + 2800);

  assert.ok(liveCoachSpotlightStart >= 0);
  assert.match(liveCoachSpotlightSource, /className="arena-live-coach-spotlight-card"/);
  assert.match(liveCoachSpotlightSource, /forceNeonActive/);
  assert.doesNotMatch(liveCoachSpotlightSource, /displayMode="compact"/);
  assert.match(
    arenaClient,
    /\.arena-stage\[data-coach-spotlight="open"\] \.field-player-layer,[\s\S]*?visibility: hidden;[\s\S]*?pointer-events: none/,
  );
  assert.match(
    arenaClient,
    /\.arena-coach-spotlight \{[\s\S]*?position: fixed;[\s\S]*?z-index: 1305;[\s\S]*?isolation: isolate;[\s\S]*?overflow: hidden/,
  );
});

test("reveals every coach card as one decoded product instead of exposing floating layers", () => {
  const coachCard = fs.readFileSync("components/touchline/cards/TouchlineCoachCard.tsx", "utf8");
  const coachCardStyles = fs.readFileSync("components/touchline/cards/TouchlineCoachCard.module.css", "utf8");

  assert.match(coachCard, /const \[isFrameReady, setIsFrameReady\] = useState\(false\)/);
  assert.match(coachCard, /data-coach-frame-ready=\{isFrameReady \? "true" : "false"\}/);
  assert.match(coachCard, /waitForDecodedImage\(frameRef\.current\)/);
  assert.match(coachCard, /waitForDecodedImage\(flagRef\.current\)/);
  assert.match(coachCard, /waitForDecodedImage\(crestRef\.current\)/);
  assert.match(coachCardStyles, /\.shell\[data-coach-frame-ready="true"\] \.inner \{\s*opacity: 1;/);
  assert.match(coachCardStyles, /\.shell\[data-coach-frame-ready="true"\] \.frame \{\s*opacity: 1;/);
  assert.doesNotMatch(coachCardStyles, /\.inner \{[\s\S]*?transition: opacity/);
  assert.doesNotMatch(coachCardStyles, /\.frame \{[\s\S]*?transition: opacity/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TOUCHLINE_ENGLAND_CLUBS, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import type { TouchlineRankedPlayer } from "../lib/touchlineArena/card-ranking.ts";
import { buildTouchlineMatchPreviewCaption } from "../lib/touchlineArena/social-match-preview-caption.ts";
import { selectTouchlineMatchPreviewSides } from "../lib/touchlineArena/social-match-preview-contract.ts";
import { checksumTouchlineMatchPreviewRenderSource } from "../lib/touchlineArena/social-match-preview-render-source.ts";
import {
  isTouchlineSocialContentTypeEnabledInModule,
  touchlineSocialContentDefinition,
} from "../lib/touchlineArena/social-content-registry.ts";
import {
  TOUCHLINE_SOCIAL_ARENA_GLASS,
  TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
  touchlineSocialArenaGlassMinimumTransmission,
} from "../lib/touchlineArena/social-visual-tokens.ts";
import { readTouchlineSocialTemplateRegistry } from "../lib/touchlineArena/social-template-policy-server.ts";

const villa = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === "15")!;
const arsenal = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === "19")!;

function card(input: Readonly<{
  id: string;
  canonicalPlayerId: string;
  name: string;
  clubName: string;
  rating: number | null;
  tier?: ClubOwnerSquadCard["cardTier"];
  published?: boolean;
}>): ClubOwnerSquadCard {
  const tier = input.tier ?? "diamond-gold";
  return {
    id: input.id,
    canonicalPlayerId: input.canonicalPlayerId,
    name: input.name,
    shortName: input.name,
    role: "midfielder",
    position: "Central Midfield",
    clubName: input.clubName,
    shirtNumber: 8,
    countryCode3: "ENG",
    marketValue: "Verified",
    cardTier: tier,
    editorialCard: input.published === false ? null : { tierKey: tier } as NonNullable<ClubOwnerSquadCard["editorialCard"]>,
    touchlinePoints: 0,
    seasonTotalRating: input.rating,
  };
}

function ranked(input: Readonly<{
  playerId: string;
  providerPlayerId: string;
  name: string;
  clubName: string;
  rating: number | null;
  minutes?: number;
}>): TouchlineRankedPlayer {
  return {
    playerId: input.playerId,
    providerPlayerId: input.providerPlayerId,
    name: input.name,
    clubName: input.clubName,
    position: "Central Midfield",
    role: "midfielder",
    totalRating: input.rating,
    minutesPlayed: input.minutes ?? 90,
    appearances: 1,
    positionGroup: "midfielder",
    positionRank: 1,
    groupSize: 2,
    tierKey: "diamond-gold",
    priceTc: 0,
  };
}

const odegaardId = "0418d8c4-9755-432d-bdd7-30a0021cac97";
const martinezId = "7bc78ff4-e9a2-4357-a221-0f75895c503f";
const arsenalOtherId = "11111111-1111-4111-8111-111111111111";
const villaOtherId = "22222222-2222-4222-8222-222222222222";

function validInput() {
  return {
    homeClub: villa,
    awayClub: arsenal,
    homeSquad: [
      card({ id: "1343", canonicalPlayerId: martinezId, name: "Emiliano Martínez", clubName: villa.name, rating: 7.25 }),
      card({ id: "1500", canonicalPlayerId: villaOtherId, name: "Villa Player", clubName: villa.name, rating: 6.5 }),
    ],
    awaySquad: [
      card({ id: "26823", canonicalPlayerId: odegaardId, name: "Martin Ødegaard", clubName: arsenal.name, rating: 8.08 }),
      card({ id: "26824", canonicalPlayerId: arsenalOtherId, name: "Arsenal Player", clubName: arsenal.name, rating: 7.5 }),
    ],
    tableRows: [
      { providerTeamId: "15", sportsRank: 17, displayPosition: 17, isTied: false, played: 1, goalDifference: -4, points: 0 },
      { providerTeamId: "19", sportsRank: 9, displayPosition: 9, isTied: false, played: 1, goalDifference: 3, points: 3 },
    ],
    rankingPlayers: [
      ranked({ playerId: odegaardId, providerPlayerId: "26823", name: "Martin Ødegaard", clubName: arsenal.name, rating: 8.08 }),
      ranked({ playerId: arsenalOtherId, providerPlayerId: "26824", name: "Arsenal Player", clubName: arsenal.name, rating: 7.5 }),
      ranked({ playerId: martinezId, providerPlayerId: "1343", name: "Emiliano Martínez", clubName: villa.name, rating: 7.25 }),
      ranked({ playerId: villaOtherId, providerPlayerId: "1500", name: "Villa Player", clubName: villa.name, rating: 6.5 }),
    ],
  } as const;
}

test("041 registry is isolated from frozen LINEUP and exposes only the Feed contract", () => {
  assert.deepEqual(touchlineSocialContentDefinition("MATCH_PREVIEW"), {
    module: "041",
    placement: "INSTAGRAM_FEED",
    width: 1080,
    height: 1350,
    scope: "FIXTURE",
  });
  assert.equal(isTouchlineSocialContentTypeEnabledInModule("MATCH_PREVIEW", "041"), true);
  assert.equal(isTouchlineSocialContentTypeEnabledInModule("LINEUP", "041"), false);
});

test("041 owner-approved artwork is locked to the executable template identity", async () => {
  const approval = readFileSync(
    new URL("../docs/touchline-arena/social-publishing-playbook/041_MATCH_PREVIEW_OWNER_ART_APPROVAL.md", import.meta.url),
    "utf8",
  );
  const registry = await readTouchlineSocialTemplateRegistry(new URL("..", import.meta.url).pathname);
  const matchPreview = registry.find((row) => row.templateVersion === "touchline-match-preview-feed-v1");
  assert.ok(matchPreview);
  assert.match(approval, new RegExp(matchPreview.visualTemplateChecksum.replace(":", "\\:")));
  assert.match(approval, new RegExp(matchPreview.templateIdentityChecksum.replace(":", "\\:")));
  assert.match(approval, /Caption approval: \*\*PENDING/);
  assert.match(approval, /Outbound: \*\*DISABLED/);
});

function relativeLuminance(channel: number) {
  const linear = channel / 255;
  return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
}

function contrastAgainstForeground(background: readonly [number, number, number]) {
  const foreground = [248, 255, 240] as const;
  const luminance = (rgb: readonly [number, number, number]) => (
    0.2126 * relativeLuminance(rgb[0])
    + 0.7152 * relativeLuminance(rgb[1])
    + 0.0722 * relativeLuminance(rgb[2])
  );
  const light = luminance(foreground);
  const dark = luminance(background);
  return (light + 0.05) / (dark + 0.05);
}

test("shared Arena glass token keeps the venue visible while preserving text contrast", () => {
  const transmission = touchlineSocialArenaGlassMinimumTransmission();
  const expectedWorstCaseTransmission = (
    1 - Math.max(
      TOUCHLINE_SOCIAL_ARENA_GLASS.outerStartAlpha,
      TOUCHLINE_SOCIAL_ARENA_GLASS.outerEndAlpha,
    )
  ) * (
    1 - Math.max(
      TOUCHLINE_SOCIAL_ARENA_GLASS.innerStartAlpha,
      TOUCHLINE_SOCIAL_ARENA_GLASS.innerEndAlpha,
    )
  );
  assert.equal(transmission, expectedWorstCaseTransmission);
  assert.ok(transmission >= TOUCHLINE_SOCIAL_ARENA_GLASS.minimumArenaTransmission);
  assert.ok(transmission < 0.5);

  const outerRgb = [0, 8, 7] as const;
  const innerRgb = [0, 7, 6] as const;
  const alphaPairs = [
    [TOUCHLINE_SOCIAL_ARENA_GLASS.outerStartAlpha, TOUCHLINE_SOCIAL_ARENA_GLASS.innerStartAlpha],
    [TOUCHLINE_SOCIAL_ARENA_GLASS.outerStartAlpha, TOUCHLINE_SOCIAL_ARENA_GLASS.innerEndAlpha],
    [TOUCHLINE_SOCIAL_ARENA_GLASS.outerEndAlpha, TOUCHLINE_SOCIAL_ARENA_GLASS.innerStartAlpha],
    [TOUCHLINE_SOCIAL_ARENA_GLASS.outerEndAlpha, TOUCHLINE_SOCIAL_ARENA_GLASS.innerEndAlpha],
  ] as const;

  for (const [outerAlpha, innerAlpha] of alphaPairs) {
    const outerComposite = outerRgb.map((channel) => (
      255 * (1 - outerAlpha) + channel * outerAlpha
    )) as unknown as [number, number, number];
    const finalComposite = innerRgb.map((channel, index) => (
      outerComposite[index] * (1 - innerAlpha) + channel * innerAlpha
    )) as unknown as [number, number, number];
    assert.ok(
      (1 - outerAlpha) * (1 - innerAlpha)
        >= TOUCHLINE_SOCIAL_ARENA_GLASS.minimumArenaTransmission,
    );
    assert.ok(
      contrastAgainstForeground(finalComposite)
        >= TOUCHLINE_SOCIAL_ARENA_GLASS.minimumContrastRatio,
    );
  }
  assert.match(TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES["--touchline-social-glass-outer-filter"], /blur\(10px\)/);
  assert.match(TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES["--touchline-social-glass-inner-filter"], /blur\(8px\)/);
});

test("selects one verified current-club leader per side from the same complete ranking", () => {
  const result = selectTouchlineMatchPreviewSides(validInput());
  assert.ok(result);
  assert.equal(result.home.leader.card.name, "Emiliano Martínez");
  assert.equal(result.home.leader.totalRating, 7.25);
  assert.equal(result.home.leader.overallRank, 3);
  assert.equal(result.away.leader.card.name, "Martin Ødegaard");
  assert.equal(result.away.leader.totalRating, 8.08);
  assert.equal(result.away.leader.overallRank, 1);
  assert.equal(result.home.table.displayPosition, 17);
  assert.equal(result.away.table.displayPosition, 9);
});

test("fails closed for unpublished leaders, rating drift, duplicate identities and missing table identity", () => {
  const unpublished = validInput();
  assert.equal(selectTouchlineMatchPreviewSides({
    ...unpublished,
    homeSquad: unpublished.homeSquad.map((entry) => ({ ...entry, editorialCard: null })),
  }), null);

  const drift = validInput();
  assert.equal(selectTouchlineMatchPreviewSides({
    ...drift,
    awaySquad: drift.awaySquad.map((entry) => ({
      ...entry,
      seasonTotalRating: Number(entry.seasonTotalRating) - 0.01,
    })),
  }), null);

  const duplicate = validInput();
  assert.equal(selectTouchlineMatchPreviewSides({
    ...duplicate,
    homeSquad: [...duplicate.homeSquad, { ...duplicate.homeSquad[0] }],
  }), null);

  const missingTable = validInput();
  assert.equal(selectTouchlineMatchPreviewSides({ ...missingTable, tableRows: missingTable.tableRows.slice(0, 1) }), null);
});

test("selects the highest ranked eligible published card when a higher row is not public", () => {
  const input = validInput();
  const result = selectTouchlineMatchPreviewSides({
    ...input,
    awaySquad: input.awaySquad.map((entry) => entry.id === "26823"
      ? { ...entry, editorialCard: null }
      : entry),
  });
  assert.ok(result);
  assert.equal(result.away.leader.card.name, "Arsenal Player");
  assert.equal(result.away.leader.totalRating, 7.5);
  assert.equal(result.away.leader.overallRank, 2);
});

test("caption is fixture-specific British English, disclosure-safe and contains exactly five hashtags", () => {
  const result = buildTouchlineMatchPreviewCaption({
    homeName: "Aston Villa",
    awayName: "Arsenal FC",
    homePosition: 17,
    awayPosition: 9,
    homeLeaderName: "Emiliano Martínez",
    awayLeaderName: "Martin Ødegaard",
    homeTotalRating: 7.25,
    awayTotalRating: 8.08,
    venueName: "Villa Park",
    gameweekNumber: 2,
    kickOffLabel: "Monday 31 August · 20:00",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.caption, /Aston Villa v Arsenal FC/);
  assert.match(result.caption, /Aston Villa are 17th; Arsenal FC are 9th/);
  assert.match(result.caption, /leading TouchLine cards in the current ranking/);
  assert.match(result.caption, /Who comes out on top\?/);
  assert.match(result.caption, /TouchLine Verified Match Data/);
  assert.match(result.caption, /COMING SOON • CURRENTLY IN TESTING/);
  assert.doesNotMatch(result.caption, /sportmonks|\bapi\b|\bprovider\b|\bpipeline\b/i);
  const hashtags = result.caption.match(/#[A-Za-z0-9]+/g) ?? [];
  assert.equal(hashtags.length, 5);
  assert.equal(new Set(hashtags).size, 5);
});

test("one canonical factual payload yields one order-independent SHA-256 source checksum", () => {
  const first = checksumTouchlineMatchPreviewRenderSource({ fixtureId: "19722192", ranking: { id: "snapshot-1" }, clubs: ["15", "19"] });
  const reordered = checksumTouchlineMatchPreviewRenderSource({ clubs: ["15", "19"], ranking: { id: "snapshot-1" }, fixtureId: "19722192" });
  const changed = checksumTouchlineMatchPreviewRenderSource({ fixtureId: "19722192", ranking: { id: "snapshot-2" }, clubs: ["15", "19"] });
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("audit-only refresh timestamps do not create a new MATCH_PREVIEW generation identity", () => {
  const base = {
    fixtureId: "19722192",
    home: { teamId: "15", tablePosition: 17, totalRating: 7.25 },
    away: { teamId: "19", tablePosition: 9, totalRating: 8.08 },
    sourceSnapshotAt: "2026-08-31T08:00:00.000Z",
    tableAsOf: "2026-08-31T08:00:00.000Z",
  };
  const refreshed = {
    ...base,
    sourceSnapshotAt: "2026-08-31T08:01:00.000Z",
    tableAsOf: "2026-08-31T08:01:00.000Z",
  };
  const factsChanged = {
    ...refreshed,
    away: { ...refreshed.away, totalRating: 8.09 },
  };

  assert.equal(
    checksumTouchlineMatchPreviewRenderSource(base),
    checksumTouchlineMatchPreviewRenderSource(refreshed),
  );
  assert.notEqual(
    checksumTouchlineMatchPreviewRenderSource(base),
    checksumTouchlineMatchPreviewRenderSource(factsChanged),
  );
});

test("reader and template are persisted-only, revision-fenced and contain no XI data surface", () => {
  const reader = readFileSync(new URL("../lib/touchlineArena/social-match-preview-draft-server.ts", import.meta.url), "utf8");
  const fixtureStore = readFileSync(new URL("../lib/football-data/fixture-schedule-store.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/social/TouchlineSocialMatchPreviewDraft.tsx", import.meta.url), "utf8");
  const componentStyles = readFileSync(new URL("../components/touchline/social/TouchlineSocialMatchPreviewDraft.module.css", import.meta.url), "utf8");
  const scoreboard = readFileSync(new URL("../components/touchline/social/TouchlineSocialFixtureScoreboard.tsx", import.meta.url), "utf8");
  const scoreboardStyles = readFileSync(new URL("../components/touchline/social/TouchlineSocialFixtureScoreboard.module.css", import.meta.url), "utf8");
  const duelFrame = readFileSync(new URL("../components/touchline/social/TouchlineSocialDuelFrame.tsx", import.meta.url), "utf8");
  const publicCard = readFileSync(new URL("../components/touchline/social/TouchlineSocialPublicExactCard.tsx", import.meta.url), "utf8");
  const duelFrameStyles = readFileSync(new URL("../components/touchline/social/TouchlineSocialDuelFrame.module.css", import.meta.url), "utf8");
  const cardComponent = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/visual-qa/social-match-preview/page.tsx", import.meta.url), "utf8");
  assert.match(reader, /readPublicCompetitionFixtureByProviderId/);
  assert.doesNotMatch(reader, /readPublicCompetitionFixtures\(\{ includeHistorical/);
  const exactReader = fixtureStore.slice(
    fixtureStore.indexOf("export async function readPublicCompetitionFixtureByProviderId"),
    fixtureStore.indexOf("/** Server-only schedule read shared by ClubHub"),
  );
  assert.match(exactReader, /\.eq\("provider_fixture_id", providerFixtureId\)/);
  assert.match(exactReader, /\.limit\(2\)/);
  assert.doesNotMatch(exactReader, /MAX_LIMIT|includeHistorical|order\("starts_at"/);
  assert.match(reader, /loadTouchlineOfficialLeagueTable/);
  assert.match(reader, /readActivePublishedRanking/);
  assert.match(reader, /readTouchlineSocialSourceRevisionCheckpoint/);
  assert.match(reader, /source-revision-changed-during-read/);
  const candidates = readFileSync(new URL("../scripts/qa/touchline-social-match-preview-candidates.mts", import.meta.url), "utf8");
  const generator = readFileSync(new URL("../scripts/qa/generate-touchline-social-match-preview-draft.mts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/qa/041_touchline_qa_social_match_preview.sql", import.meta.url), "utf8");
  assert.doesNotMatch(reader, /firstObservedAt/);
  assert.match(candidates, /const observedAt = new Date\(now\)\.toISOString\(\)/);
  assert.match(candidates, /firstObservedAt: observedAt/);
  assert.match(migration, /coalesce\(min\(first_observed_at\), p_first_observed_at\)/);
  assert.match(migration, /v_first_observed_at, p_starts_at/);
  assert.match(generator, /touchline_social_match_preview_generation_jobs/);
  assert.match(generator, /\.select\("first_observed_at,starts_at,job_state"\)/);
  assert.doesNotMatch(generator, /element\.dataset\.firstObservedAt/);
  assert.match(reader, /`league-table:\$\{String\(canonicalFixture\.competition_id\)/);
  assert.match(reader, /dependencyPlayerIds\.map\(\(playerId\) => `player:/);
  assert.match(reader, /\.from\("football_squad_members"\)/);
  assert.match(reader, /\.eq\("competition_id", String\(canonicalFixture\.competition_id\)\)/);
  assert.match(reader, /\.eq\("status", "active"\)/);
  assert.match(reader, /\.limit\(120\)/);
  assert.match(reader, /dependencyPlayerIds = dependencyMemberships\.map/);
  assert.match(reader, /projectedPlayerIds\.some\(\(playerId\) => !dependencyPlayerIdSet\.has\(playerId\)\)/);
  assert.doesNotMatch(reader, /fetch\s*\(/);
  assert.doesNotMatch(reader, /readTouchlineSocialLineupDraft|officialTeamSheet|formationPosition/);
  assert.match(component, /data-content-type="MATCH_PREVIEW"/);
  assert.doesNotMatch(component, /data-fixture-id/);
  assert.match(component, /data-lineup-fields="absent"/);
  assert.match(component, /data-source-revision-checksum/);
  assert.match(component, /data-home-team-key=\{draft\.home\.club\.shortCode\}/);
  assert.match(component, /data-away-team-key=\{draft\.away\.club\.shortCode\}/);
  assert.doesNotMatch(component, /data-(?:home|away)-team-id/);
  assert.match(component, /TouchlineSocialFixtureScoreboard/);
  assert.match(component, /mode="versus"/);
  assert.match(scoreboard, /<b className=\{styles\.versus\}>VS<\/b>/);
  assert.doesNotMatch(scoreboard, /<b[^>]*>V<\/b>/);
  assert.match(scoreboard, /data-touchline-fixture-scoreboard="041-standard"/);
  assert.match(scoreboardStyles, /grid-template-columns: minmax\(0,1fr\) 228px minmax\(0,1fr\)/);
  assert.match(component, /TouchlineSocialDuelFrame/);
  assert.match(duelFrame, /TouchlineSocialPublicExactCard/);
  assert.match(duelFrame, /data-preview-contender="true"/);
  assert.doesNotMatch(duelFrame, /data-preview-(?:team|player|canonical-player)-id/);
  assert.doesNotMatch(duelFrame, /side\.card\.id/);
  assert.match(duelFrame, /function publicPresentationPlayer/);
  assert.match(duelFrame, /sportmonksPlayerId: _providerPlayerId/);
  assert.match(duelFrame, /canonicalPlayerId: _canonicalPlayerId/);
  assert.match(duelFrame, /formationPlayerId: _formationPlayerId/);
  assert.match(duelFrame, /player=\{publicPresentationPlayer\(side\)\}/);
  assert.doesNotMatch(duelFrame, /player=\{squadCardToExactPlayer\(side\.card/);
  assert.match(publicCard, /^"use client";/);
  assert.match(publicCard, /"sportmonksPlayerId" \| "canonicalPlayerId" \| "formationPlayerId"/);
  assert.match(publicCard, /sportmonksPlayerId: `public:\$\{player\.clubName\}:\$\{player\.name\}`/);
  assert.match(publicCard, /ensureStaticNameFit/);
  assert.match(generator, /querySelectorAll<HTMLElement>\('\[data-preview-contender="true"\]'\)/);
  assert.match(generator, /dataset\.previewPlayerKey/);
  assert.match(component, /TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES/);
  assert.match(duelFrameStyles, /var\(--touchline-social-glass-outer-start\)/);
  assert.match(duelFrameStyles, /var\(--touchline-social-glass-inner-end\)/);
  assert.doesNotMatch(duelFrameStyles, /\.duel\s*\{[^}]*background:\s*(?:#000|black)/s);
  assert.match(cardComponent, /function initialStaticShirtNameFit/);
  assert.match(cardComponent, /data-static-name-fit=\{ensureStaticNameFit \? "true" : undefined\}/);
  assert.match(generator, /metadata\.namesComplete/);
  assert.match(generator, /item\.dataset\.staticNameFit !== "true"/);
  assert.doesNotMatch(componentStyles, /\.stadium\s*\{[^}]*transform\s*:/s);
  assert.doesNotMatch(component, /FIXTURE \{draft\.fixtureId\}/);
  assert.match(component, />TOUCHLINE VERIFIED MATCH DATA</);
  assert.match(page, /VERCEL_ENV === "production"/);
});

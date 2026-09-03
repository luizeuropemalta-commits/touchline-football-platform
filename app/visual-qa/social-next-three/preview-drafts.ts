import "server-only";

import { createHash } from "node:crypto";

import type { TouchlineSocialRankingArtworkDraft } from "@/components/touchline/social/TouchlineSocialRankingDraft";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";

const capturedAt = "2026-08-31T21:11:14.430Z";

function checksum(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function frozenCard(input: Readonly<{
  id: string;
  canonicalPlayerId: string;
  name: string;
  shortName: string;
  clubName: string;
  role: ClubOwnerSquadCard["role"];
  position: string;
  shirtNumber: number;
  countryCode3: string;
  marketValue: string;
  cardTier: ClubOwnerSquadCard["cardTier"];
  totalRating: number;
  matchRating?: number | null;
  seasonStats?: ClubOwnerSquadCard["seasonStats"];
}>): ClubOwnerSquadCard {
  return {
    ...input,
    editorialCard: { tierKey: input.cardTier } as NonNullable<ClubOwnerSquadCard["editorialCard"]>,
    marketValueSource: "verified-cache",
    marketValueState: "verified",
    classificationState: "verified",
    touchlinePoints: 0,
    seasonTotalRating: input.totalRating,
  };
}

const podium = [
  {
    card: frozenCard({
      id: "129602", canonicalPlayerId: "3e88af63-6f28-467f-9e8f-530dddba772e",
      name: "Bruno Fernandes", shortName: "Fernandes", clubName: "Manchester United",
      role: "midfielder", position: "Attacking Midfield", shirtNumber: 8, countryCode3: "POR",
      marketValue: "€35m", cardTier: "emerald-green", totalRating: 17.16,
      matchRating: 10,
      seasonStats: { goals: 3, assists: 0, defense: 7, cleanSheets: 0, yellowCards: 0, redCards: 0 },
    }),
    totalRating: 17.16, overallRank: 1, positionRank: 1, positionGroup: "midfielder", officialMatchRating: 10,
  },
  {
    card: frozenCard({
      id: "21072805", canonicalPlayerId: "87539e31-c753-44e5-a4c3-4941d0a2dbc3",
      name: "Rayan Cherki", shortName: "Cherki", clubName: "Manchester City",
      role: "midfielder", position: "Attacking Midfield", shirtNumber: 10, countryCode3: "FRA",
      marketValue: "€90m", cardTier: "diamond-gold", totalRating: 16.53,
    }),
    totalRating: 16.53, overallRank: 2, positionRank: 2, positionGroup: "midfielder", officialMatchRating: null,
  },
  {
    card: frozenCard({
      id: "28931574", canonicalPlayerId: "c2c119c3-3394-4e54-8388-bdc0e1ece6c0",
      name: "João Pedro", shortName: "Pedro", clubName: "Chelsea",
      role: "forward", position: "Centre Forward", shirtNumber: 9, countryCode3: "BRA",
      marketValue: "€80m", cardTier: "diamond-gold", totalRating: 16.45,
    }),
    totalRating: 16.45, overallRank: 3, positionRank: 1, positionGroup: "striker", officialMatchRating: null,
  },
] as const;

type RankingVisualQaContentType = TouchlineSocialRankingArtworkDraft["contentType"];

const fixtureClubs = {
  home: {
    teamId: "14",
    name: "Manchester United",
    shortCode: "MUN",
    logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-united.png",
  },
  away: {
    teamId: "18",
    name: "Chelsea",
    shortCode: "CHE",
    logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/chelsea.png",
  },
} as const;

const hatTrickFixtureClubs = {
  home: {
    teamId: "14",
    name: "Manchester United",
    shortCode: "MUN",
    logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-united.png",
  },
  away: {
    teamId: "116",
    name: "Ipswich Town",
    shortCode: "IPS",
    logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/ipswich-town.png",
  },
} as const;

function rankingCards(contentType: RankingVisualQaContentType) {
  if (contentType === "PLAYER_DUEL") return [podium[0], podium[2]];
  if (contentType === "GAMEWEEK_HERO") return [podium[0]];
  if (contentType === "TOP_PERFORMER") {
    return [{ ...podium[0], officialMatchRating: 9.1 }];
  }
  if (contentType === "HAT_TRICK_HERO") {
    return [{ ...podium[0], officialMatchRating: 10 }];
  }
  return podium;
}

export function createRankingVisualQaPreview(
  contentType: RankingVisualQaContentType,
): TouchlineSocialRankingArtworkDraft {
  const gameweekOpen = contentType === "GAMEWEEK_RANKING_PREVIEW" || contentType === "HAT_TRICK_HERO";
  const cards = rankingCards(contentType);
  const hasFixture = ["PLAYER_DUEL", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(contentType);
  const playerScoped = ["GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(contentType);
  const gameweekScoped = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "GAMEWEEK_HERO"].includes(contentType);
  const confirmedGoals = contentType === "HAT_TRICK_HERO" ? 3 : null;
  const confirmedGoalMoments = contentType === "HAT_TRICK_HERO" ? [
    { kind: "goal" as const, minute: 40, extraMinute: null },
    { kind: "penalty" as const, minute: 61, extraMinute: null },
    { kind: "goal" as const, minute: 68, extraMinute: null },
  ] : null;
  const fixtureScore = contentType === "HAT_TRICK_HERO"
    ? { home: 5, away: 2 }
    : contentType === "TOP_PERFORMER" ? { home: 2, away: 1 } : null;
  const visualFixture = contentType === "HAT_TRICK_HERO" ? hatTrickFixtureClubs : fixtureClubs;
  const venueName = contentType === "HAT_TRICK_HERO" ? "Old Trafford" : "Emirates Stadium";
  const sourceChecksum = checksum({ contentType, cards, gameweekOpen, confirmedGoals, confirmedGoalMoments, fixtureScore, venueName });
  return {
    sourceProvenance: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    visualQa: { sampleData: true, label: "VISUAL QA · FROZEN QA DATA" },
    contentType,
    fixtureId: `local-${contentType.toLowerCase().replaceAll("_", "-")}`,
    scopeId: gameweekScoped ? "244001" : null,
    playerId: playerScoped ? cards[0]!.card.id : null,
    firstObservedAt: capturedAt,
    sourceSnapshotAt: capturedAt,
    sourceVersion: "touchline-social-ranking-family-v1",
    sourceChecksum,
    sourceRevisionManifest: { localVisualQa: 1 },
    sourceRevisionChecksum: sourceChecksum,
    gameweekNumber: 2,
    gameweekOpen,
    arenaImageUrl: contentType === "HAT_TRICK_HERO"
      ? "/touchlineArena/stadiums/interiors/16-manchester-united-old-trafford-interior.webp"
      : "/touchlineArena/stadiums/interiors/01-arsenal-emirates-stadium-live.webp",
    venueName,
    caption: "LOCAL VISUAL QA ONLY · LIVE COPY REQUIRES A VERIFIED 044 RANKING REVISION",
    rankingSnapshotId: "player-rating:1e83121b-b778-459b-b9a0-7cf1eaff5729:eb5382ca",
    home: hasFixture ? visualFixture.home : null,
    away: hasFixture ? visualFixture.away : null,
    fixtureScore,
    cards,
    confirmedGoals,
    confirmedGoalMoments,
  };
}

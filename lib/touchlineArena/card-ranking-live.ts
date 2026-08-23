import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  TOUCHLINE_CARD_STARTING_TIER_KEY,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import type {
  TouchlinePositionRankingGroup,
  TouchlineRankedPlayer,
} from "./card-ranking.ts";
import { TOUCHLINE_POSITION_RANKING_GROUPS } from "./card-ranking.ts";

export const TOUCHLINE_ENGLAND_LEAGUE_KEY = "touchline-england";

export type TouchlineActiveRankingPlayer = Pick<
  TouchlineRankedPlayer,
  | "playerId"
  | "providerPlayerId"
  | "positionGroup"
  | "positionRank"
  | "groupSize"
  | "touchlinePoints"
  | "roundPoints"
  | "tierKey"
  | "priceTc"
>;

export type TouchlineActiveRankingState = {
  phase: "preseason" | "ranked";
  leagueKey: string;
  snapshotId: string | null;
  roundId: string | null;
  publishedAt: string | null;
  priceTableVersion: string;
  scoringVersion: "player_scoring_v1" | "player_scoring_v2" | "player_scoring_v3" | null;
  coverageStatus: "complete" | "complete_for_scoring" | null;
  seasonId: string | null;
  fixtureIds: readonly string[];
  expectedFixtureIds: readonly string[];
  totalScorePoints: number | null;
  players: readonly TouchlineActiveRankingPlayer[];
};

export type TouchlineResolvedCardCompetition = {
  phase: "preseason" | "ranked";
  ranked: boolean;
  tierKey: TouchlineCardTierKey;
  priceTc: number;
  touchlinePoints: number;
  roundPoints: number;
  positionGroup: TouchlinePositionRankingGroup | null;
  positionRank: number | null;
  snapshotId: string | null;
};

export const TOUCHLINE_PRESEASON_RANKING_STATE: TouchlineActiveRankingState = Object.freeze({
  phase: "preseason",
  leagueKey: TOUCHLINE_ENGLAND_LEAGUE_KEY,
  snapshotId: null,
  roundId: null,
  publishedAt: null,
  priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  scoringVersion: null,
  coverageStatus: null,
  seasonId: null,
  fixtureIds: Object.freeze([]),
  expectedFixtureIds: Object.freeze([]),
  totalScorePoints: null,
  players: Object.freeze([]),
});

const POSITION_GROUPS = new Set<TouchlinePositionRankingGroup>(TOUCHLINE_POSITION_RANKING_GROUPS);

function normalizePlayerId(value?: string | number | null) {
  return String(value ?? "").trim().toLowerCase();
}

function isCanonicalFixtureIdArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((fixtureId) => typeof fixtureId === "string" && /^[A-Za-z0-9_-]+$/.test(fixtureId))
    && new Set(value).size === value.length;
}

function isRankingPlayer(value: unknown): value is TouchlineActiveRankingPlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<TouchlineActiveRankingPlayer>;
  const tier = touchlineArenaTierForKey(player.tierKey);

  return Boolean(
    normalizePlayerId(player.playerId)
      && normalizePlayerId(player.providerPlayerId)
      && tier
      && tier.retailPriceTc === player.priceTc
      && Number.isInteger(player.positionRank)
      && Number(player.positionRank) > 0
      && Number.isInteger(player.groupSize)
      && Number(player.groupSize) > 0
      && Number(player.positionRank) <= Number(player.groupSize)
      && POSITION_GROUPS.has(player.positionGroup as TouchlinePositionRankingGroup)
      && typeof player.touchlinePoints === "number"
      && Number.isFinite(player.touchlinePoints)
      && (player.roundPoints === undefined || (
        typeof player.roundPoints === "number"
        && Number.isFinite(player.roundPoints)
      ))
  );
}

export function parseTouchlineActiveRankingState(value: unknown): TouchlineActiveRankingState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TouchlineActiveRankingState>;

  if (candidate.phase === "preseason") return TOUCHLINE_PRESEASON_RANKING_STATE;
  if (
    candidate.phase !== "ranked"
    || candidate.leagueKey !== TOUCHLINE_ENGLAND_LEAGUE_KEY
    || !normalizePlayerId(candidate.snapshotId)
    || !normalizePlayerId(candidate.roundId)
    || !candidate.publishedAt
    || !Number.isFinite(Date.parse(candidate.publishedAt))
    || candidate.priceTableVersion !== TOUCHLINE_CARD_PRICE_TABLE_VERSION
    || (candidate.scoringVersion !== "player_scoring_v1" && candidate.scoringVersion !== "player_scoring_v2" && candidate.scoringVersion !== "player_scoring_v3")
    || (candidate.coverageStatus !== "complete" && candidate.coverageStatus !== "complete_for_scoring")
    || !normalizePlayerId(candidate.seasonId)
    || !isCanonicalFixtureIdArray(candidate.fixtureIds)
    || !isCanonicalFixtureIdArray(candidate.expectedFixtureIds)
    || [...candidate.fixtureIds].sort().join("\n") !== [...candidate.expectedFixtureIds].sort().join("\n")
    || typeof candidate.totalScorePoints !== "number"
    || !Number.isFinite(candidate.totalScorePoints)
    || !Array.isArray(candidate.players)
    || candidate.players.length === 0
    || !candidate.players.every(isRankingPlayer)
  ) {
    return null;
  }

  const identifiers = new Set<string>();
  const groupRanks = new Map<TouchlinePositionRankingGroup, Set<number>>();
  for (const player of candidate.players) {
    const playerId = `player:${normalizePlayerId(player.playerId)}`;
    const providerId = `provider:${normalizePlayerId(player.providerPlayerId)}`;
    if (identifiers.has(playerId) || identifiers.has(providerId)) return null;
    identifiers.add(playerId);
    identifiers.add(providerId);

    const ranks = groupRanks.get(player.positionGroup) ?? new Set<number>();
    if (ranks.has(player.positionRank)) return null;
    ranks.add(player.positionRank);
    groupRanks.set(player.positionGroup, ranks);
  }

  for (const group of TOUCHLINE_POSITION_RANKING_GROUPS) {
    const players = candidate.players.filter((player) => player.positionGroup === group);
    const ranks = groupRanks.get(group);
    if (
      players.length === 0
      || !ranks
      || players.some((player) => player.groupSize !== players.length)
      || ranks.size !== players.length
      || !players.every((player) => ranks.has(player.positionRank))
    ) {
      return null;
    }
  }
  if (candidate.players.reduce((total, player) => total + player.touchlinePoints, 0) !== candidate.totalScorePoints) {
    return null;
  }

  return {
    phase: "ranked",
    leagueKey: candidate.leagueKey,
    snapshotId: candidate.snapshotId!,
    roundId: candidate.roundId!,
    publishedAt: candidate.publishedAt,
    priceTableVersion: candidate.priceTableVersion,
    scoringVersion: candidate.scoringVersion,
    coverageStatus: candidate.coverageStatus,
    seasonId: candidate.seasonId!,
    fixtureIds: candidate.fixtureIds,
    expectedFixtureIds: candidate.expectedFixtureIds,
    totalScorePoints: candidate.totalScorePoints,
    players: candidate.players,
  };
}

export function resolveTouchlineCardCompetition(input: {
  state?: TouchlineActiveRankingState | null;
  playerId?: string | number | null;
  providerPlayerId?: string | number | null;
}): TouchlineResolvedCardCompetition {
  const startingTier = touchlineArenaTierForKey(TOUCHLINE_CARD_STARTING_TIER_KEY)!;
  const state = parseTouchlineActiveRankingState(input.state) ?? TOUCHLINE_PRESEASON_RANKING_STATE;

  if (state.phase !== "ranked") {
    return {
      phase: "preseason",
      ranked: false,
      tierKey: startingTier.key,
      priceTc: startingTier.retailPriceTc,
      touchlinePoints: 0,
      roundPoints: 0,
      positionGroup: null,
      positionRank: null,
      snapshotId: null,
    };
  }

  const playerId = normalizePlayerId(input.playerId);
  const providerPlayerId = normalizePlayerId(input.providerPlayerId);
  const entry = state.players.find((player) => (
    (playerId && normalizePlayerId(player.playerId) === playerId)
      || (providerPlayerId && normalizePlayerId(player.providerPlayerId) === providerPlayerId)
  ));

  if (!entry) {
    return {
      phase: "ranked",
      ranked: false,
      tierKey: startingTier.key,
      priceTc: startingTier.retailPriceTc,
      touchlinePoints: 0,
      roundPoints: 0,
      positionGroup: null,
      positionRank: null,
      snapshotId: state.snapshotId,
    };
  }

  return {
    phase: "ranked",
    ranked: true,
    tierKey: entry.tierKey,
    priceTc: entry.priceTc,
    touchlinePoints: entry.touchlinePoints,
    roundPoints: entry.roundPoints ?? 0,
    positionGroup: entry.positionGroup,
    positionRank: entry.positionRank,
    snapshotId: state.snapshotId,
  };
}

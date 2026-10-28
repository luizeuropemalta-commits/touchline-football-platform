import { parseCoachCatalogueTransport } from "./coach-catalogue-contract.ts";
import { parseTouchlineActiveRankingState, type TouchlineActiveRankingState } from "./card-ranking-live.ts";
import type { TouchLineCoachRankingState, TouchLineCoachRankingRow } from "./coach-ranking-server";
import type { TouchlineCoachRecord } from "./coach-scoring";
import { parseTouchlinePublicFixtures } from "../football-data/public-fixture-client.ts";
import type { TouchlinePublicFixture } from "../football-data/public-fixture";

/** Only facts already stored in immutable publications; not private fantasy state or full player stats. */
export type TouchlineSportsPublication = Readonly<{
  version: 1;
  scopeKey: "touchline-england";
  publication: Readonly<{
    snapshotId: string;
    contentDigest: string;
    publishedAt: string;
    playerRankingSnapshotId: string | null;
    coachRankingSnapshotId: string | null;
    liveScoreSnapshotDigest: string;
  }>;
  playerRanking: TouchlineActiveRankingState | null;
  coachRanking: TouchLineCoachRankingState | null;
  live: Readonly<{ fetchedAt: string; fixtures: readonly TouchlinePublicFixture[] }>;
}>;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 160;
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

function coachRecord(value: unknown): TouchlineCoachRecord | null {
  const row = object(value);
  if (!row || !integer(row.wins) || row.wins < 0 || !integer(row.draws) || row.draws < 0
    || !integer(row.losses) || row.losses < 0 || !integer(row.touchlinePoints)) return null;
  return { wins: row.wins, draws: row.draws, losses: row.losses, touchlinePoints: row.touchlinePoints };
}

function coachRanking(value: unknown): TouchLineCoachRankingState | null {
  const input = object(value);
  if (!input || input.phase !== "ranked" || !text(input.snapshotId) || !text(input.seasonId)
    || input.scoringVersion !== "coach_scoring_v2" || !timestamp(input.generatedAt)
    || !Array.isArray(input.fixtureIds) || !input.fixtureIds.every(text)
    || new Set(input.fixtureIds).size !== input.fixtureIds.length || !Array.isArray(input.rows)) return null;
  const catalogue = input.catalogue === undefined ? undefined : parseCoachCatalogueTransport(input.catalogue);
  if (catalogue === null || catalogue?.phase === "unavailable") return null;
  const rows: TouchLineCoachRankingRow[] = [];
  const ids = new Set<string>();
  for (const value of input.rows) {
    const row = object(value);
    const home = coachRecord(row?.home); const away = coachRecord(row?.away);
    if (!row || !home || !away || row.rank !== rows.length + 1 || !text(row.coachProviderId)
      || ids.has(row.coachProviderId) || !text(row.coachName) || !text(row.clubName)
      || row.wins !== home.wins + away.wins || row.draws !== home.draws + away.draws
      || row.losses !== home.losses + away.losses || row.awayWins !== away.wins
      || row.touchlinePoints !== home.touchlinePoints + away.touchlinePoints) return null;
    ids.add(row.coachProviderId);
    rows.push({ rank: rows.length + 1, coachProviderId: row.coachProviderId, coachName: row.coachName,
      clubName: row.clubName, wins: home.wins + away.wins, draws: home.draws + away.draws,
      losses: home.losses + away.losses, awayWins: away.wins,
      touchlinePoints: home.touchlinePoints + away.touchlinePoints, home, away });
  }
  return { phase: "ranked", ...(catalogue ? { catalogue } : {}), snapshotId: input.snapshotId, seasonId: input.seasonId,
    scoringVersion: "coach_scoring_v2", fixtureIds: [...input.fixtureIds], generatedAt: input.generatedAt, rows };
}

/** All-or-nothing validation. Never fill a missing member from a newer active pointer. */
export function parseTouchlineSportsPublication(value: unknown): TouchlineSportsPublication | null {
  const input = object(value); const publication = object(input?.publication); const live = object(input?.live);
  if (!input || input.version !== 1 || input.scopeKey !== "touchline-england" || !publication || !live
    || typeof publication.snapshotId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(publication.snapshotId)
    || !digest(publication.contentDigest) || !digest(publication.liveScoreSnapshotDigest)
    || !timestamp(publication.publishedAt) || !timestamp(live.fetchedAt)
    || !(publication.playerRankingSnapshotId === null || text(publication.playerRankingSnapshotId))
    || !(publication.coachRankingSnapshotId === null || text(publication.coachRankingSnapshotId))) return null;
  const player = input.playerRanking === null ? null : parseTouchlineActiveRankingState(input.playerRanking);
  const rawPlayer = object(input.playerRanking);
  const coach = input.coachRanking === null ? null : coachRanking(input.coachRanking);
  const fixtures = parseTouchlinePublicFixtures(live.fixtures);
  if (!fixtures || new Set(fixtures.map(row => row.id)).size !== fixtures.length
    || (rawPlayer?.cardGoals != null && !player?.cardGoals)
    || (publication.playerRankingSnapshotId === null ? input.playerRanking !== null
      : !player || player.phase !== "ranked" || player.scoringVersion !== "player_scoring_v4" || player.snapshotId !== publication.playerRankingSnapshotId)
    || (publication.coachRankingSnapshotId === null ? input.coachRanking !== null
      : !coach || coach.snapshotId !== publication.coachRankingSnapshotId)
    || (player && coach && player.seasonId !== coach.seasonId)) return null;
  return {
    version: 1, scopeKey: "touchline-england",
    publication: { snapshotId: publication.snapshotId, contentDigest: publication.contentDigest,
      publishedAt: publication.publishedAt, playerRankingSnapshotId: publication.playerRankingSnapshotId,
      coachRankingSnapshotId: publication.coachRankingSnapshotId, liveScoreSnapshotDigest: publication.liveScoreSnapshotDigest },
    playerRanking: player, coachRanking: coach,
    live: { fetchedAt: live.fetchedAt, fixtures },
  };
}

/** A scoped sports projection cannot alter editorial tier/price, contract or lineup state. */
export function touchlinePublishedPlayerFacts(publication: TouchlineSportsPublication, playerId: string) {
  const ranking = publication.playerRanking;
  if (!ranking) return null;
  const normalizedId = playerId.trim().toLowerCase();
  const player = ranking.players.find(row => row.playerId.toLowerCase() === normalizedId);
  const goals = ranking.cardGoals?.rows.find(row => row.playerId.toLowerCase() === normalizedId);
  if (!player && !goals) return null;
  return { playerId: player?.playerId ?? goals!.playerId, seasonId: ranking.seasonId,
    snapshotId: ranking.snapshotId, totalRating: player?.totalRating ?? null,
    positionRank: player?.positionRank ?? null, goals: goals?.goals ?? null };
}

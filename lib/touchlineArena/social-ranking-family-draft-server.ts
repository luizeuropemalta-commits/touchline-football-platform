import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readPublicCompetitionFixtureByProviderId } from "@/lib/football-data/fixture-schedule-store";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  compareTouchlineRankingPlayers,
  type TouchlineRankedPlayer,
} from "@/lib/touchlineArena/card-ranking";
import {
  parseTouchlineActiveRankingState,
  TOUCHLINE_ENGLAND_LEAGUE_KEY,
} from "@/lib/touchlineArena/card-ranking-live";
import type { TouchlinePublishedRankingSnapshot } from "@/lib/touchlineArena/card-ranking-pipeline";
import { loadTouchLineRankedCardCatalog } from "@/lib/touchlineArena/ranked-card-catalog-server";
import { resolveTouchlineFixtureVenue } from "@/lib/touchlineArena/stadium-catalog";
import { readTouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";
import { readTouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";
import { buildTouchlineRankingFamilyCaption } from "@/lib/touchlineArena/social-ranking-family-caption";
import {
  countTouchlineConfirmedHatTrickGoals,
  selectTouchlineSocialRankingTopThree,
  selectTouchlineTopPerformer,
  touchlineConfirmedHatTrickGoalFact,
  touchlineGameweekIsFinal,
  type TouchlineSocialRankingCard,
  type TouchlineSocialRankingContentType,
} from "@/lib/touchlineArena/social-ranking-family-contract";
import { checksumTouchlineRankingFamilyRenderSource } from "@/lib/touchlineArena/social-ranking-family-render-source";
import { readTouchlineSocialSourceRevisionCheckpoint } from "@/lib/touchlineArena/social-source-revision-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SOURCE_VERSION = "touchline-social-ranking-family-v1";
export const TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION = "touchline-social-ranking-feed-v1";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;

export type TouchlineSocialRankingDraftCard = TouchlineSocialRankingCard & Readonly<{
  officialMatchRating: number | null;
}>;

export type TouchlineSocialRankingGoalMoment = Readonly<{
  kind: "goal" | "penalty";
  minute: number;
  extraMinute: number | null;
}>;

export type TouchlineSocialRankingFamilyDraft = Readonly<{
  sourceProvenance: "PERSISTED_VERIFIED_RANKING_FAMILY";
  contentType: TouchlineSocialRankingContentType;
  fixtureId: string;
  scopeId: string | null;
  playerId: string | null;
  firstObservedAt: string;
  sourceSnapshotAt: string;
  sourceVersion: typeof SOURCE_VERSION;
  sourceChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
  gameweekNumber: number;
  gameweekOpen: boolean;
  arenaImageUrl: string;
  venueName: string | null;
  caption: string;
  rankingSnapshotId: string;
  home: Readonly<{ teamId: string; name: string; shortCode: string; logoUrl: string }> | null;
  away: Readonly<{ teamId: string; name: string; shortCode: string; logoUrl: string }> | null;
  fixtureScore: Readonly<{ home: number; away: number }> | null;
  cards: readonly TouchlineSocialRankingDraftCard[];
  confirmedGoals: number | null;
  confirmedGoalMoments: readonly TouchlineSocialRankingGoalMoment[] | null;
}>;

export type TouchlineSocialRankingFamilyDraftResult =
  | Readonly<{ ok: true; data: TouchlineSocialRankingFamilyDraft }>
  | Readonly<{ ok: false; reason: string }>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown) {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function integer(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

async function readActiveRankingBundle(admin: Admin) {
  const active = await admin.from("touchline_card_ranking_active_snapshots")
    .select("snapshot_id").eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY).maybeSingle();
  const snapshotId = text(active.data?.snapshot_id);
  if (active.error || !snapshotId) return null;
  const record = await admin.from("touchline_card_ranking_snapshots")
    .select("snapshot_id,league_key,season_id,round_id,source,status,published_at,price_table_version,expected_player_count,actual_player_count,scoring_version,coverage_status,fixture_ids,expected_fixture_ids,total_score_points,ranking_payload")
    .eq("snapshot_id", snapshotId).eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY).maybeSingle();
  if (record.error || !record.data) return null;
  const row = record.data as Row;
  const payload = row.ranking_payload as TouchlinePublishedRankingSnapshot | null;
  const players = Array.isArray(payload?.players) ? payload.players : [];
  const state = parseTouchlineActiveRankingState({
    phase: "ranked", leagueKey: row.league_key, snapshotId: row.snapshot_id,
    roundId: row.round_id, publishedAt: row.published_at, priceTableVersion: row.price_table_version,
    scoringVersion: row.scoring_version, coverageStatus: row.coverage_status, seasonId: row.season_id,
    fixtureIds: row.fixture_ids, expectedFixtureIds: row.expected_fixture_ids,
    totalScorePoints: row.total_score_points,
    players: players.map((player) => ({
      playerId: player.playerId, providerPlayerId: player.providerPlayerId,
      positionGroup: player.positionGroup, positionRank: player.positionRank,
      groupSize: player.groupSize, totalRating: player.totalRating,
      tierKey: player.tierKey, priceTc: player.priceTc,
    })),
  });
  if (!state || state.phase !== "ranked" || row.source !== "sportmonks-audited"
    || row.status !== "published" || state.scoringVersion !== "player_scoring_v3"
    || !["complete", "complete_for_scoring"].includes(String(state.coverageStatus))
    || players.length !== Number(row.expected_player_count)
    || players.length !== Number(row.actual_player_count)
    || players.some((player) => !UUID.test(player.playerId)
      || !NUMERIC_ID.test(String(player.providerPlayerId ?? ""))
      || player.totalRating === null || !Number.isFinite(player.totalRating))) return null;
  const cards = await loadTouchLineRankedCardCatalog(state, admin);
  const topThree = selectTouchlineSocialRankingTopThree({
    rankingPlayers: players as readonly TouchlineRankedPlayer[], cards,
  });
  if (!topThree) return null;
  return {
    state,
    players: players as readonly TouchlineRankedPlayer[],
    cards,
    topThree,
    publishedAt: timestamp(row.published_at)!,
  } as const;
}

async function readRoundContext(admin: Admin, scopeId: string, seasonId: string) {
  const round = await admin.from("football_rounds")
    .select("id,provider_round_id,name").eq("provider", "sportmonks")
    .eq("provider_round_id", scopeId).maybeSingle();
  const roundId = text(round.data?.id);
  if (round.error || !roundId || !UUID.test(roundId)) return null;
  const fixtures = await admin.from("football_fixtures")
    .select("id,provider_fixture_id,competition_id,season_id,round_id,home_club_id,away_club_id,starts_at,status,source_updated_at")
    .eq("provider", "sportmonks").eq("round_id", roundId).eq("season_id", seasonId)
    .order("starts_at", { ascending: true }).limit(11);
  if (fixtures.error || !Array.isArray(fixtures.data) || fixtures.data.length !== 10) return null;
  const rows = fixtures.data as Row[];
  const providerIds = rows.map((row) => text(row.provider_fixture_id));
  const clubIds = rows.flatMap((row) => [text(row.home_club_id), text(row.away_club_id)]);
  if (providerIds.some((id) => !id || !NUMERIC_ID.test(id))
    || new Set(providerIds).size !== 10
    || clubIds.some((id) => !id || !UUID.test(id))
    || new Set(clubIds).size !== 20
    || rows.some((row) => !UUID.test(String(row.id ?? ""))
      || String(row.round_id) !== roundId || String(row.season_id) !== seasonId)) return null;
  const gameweekMatch = String(round.data?.name ?? "").match(/\d+/);
  const gameweekNumber = gameweekMatch ? Number(gameweekMatch[0]) : NaN;
  if (!Number.isInteger(gameweekNumber) || gameweekNumber < 1) return null;
  return { roundId, rows, providerIds: providerIds as string[], gameweekNumber } as const;
}

function cardWithRating(card: TouchlineSocialRankingCard, officialMatchRating: number | null = null) {
  return { ...card, officialMatchRating } satisfies TouchlineSocialRankingDraftCard;
}

/**
 * Read-only 044 source. Every variant is built from the same active V3 ranking
 * revision and exact fixture/round fences. Public copy and artwork receive no
 * upstream/provider identity.
 */
export async function readTouchlineSocialRankingFamilyDraft(input: Readonly<{
  contentType: TouchlineSocialRankingContentType;
  fixtureId: string;
  scopeId?: string | null;
  playerId?: string | null;
  now?: number;
}>): Promise<TouchlineSocialRankingFamilyDraftResult> {
  const fixtureId = input.fixtureId.trim();
  const scopeId = input.scopeId?.trim() || null;
  const playerId = input.playerId?.trim() || null;
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  if (!NUMERIC_ID.test(fixtureId)) return { ok: false, reason: "invalid-fixture-id" };
  const gameweekScoped = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "GAMEWEEK_HERO"].includes(input.contentType);
  const playerScoped = ["GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(input.contentType);
  if (gameweekScoped !== Boolean(scopeId) || (scopeId && !NUMERIC_ID.test(scopeId))) {
    return { ok: false, reason: "gameweek-scope-invalid" };
  }
  if (playerScoped !== Boolean(playerId) || (playerId && !NUMERIC_ID.test(playerId))) {
    return { ok: false, reason: "player-scope-invalid" };
  }
  const sourceStart = await readTouchlineSocialSourceRevisionCheckpoint([]);
  const admin = createAdminClient();
  if (!sourceStart || !admin) return { ok: false, reason: "qa-read-model-unavailable" };
  const ranking = await readActiveRankingBundle(admin);
  if (!ranking) return { ok: false, reason: "active-v3-ranking-unavailable" };

  let anchorFixtureId = fixtureId;
  let gameweekNumber = 0;
  let gameweekOpen = true;
  let arenaImageUrl = "";
  let venueName: string | null = null;
  let home: TouchlineSocialRankingFamilyDraft["home"] = null;
  let away: TouchlineSocialRankingFamilyDraft["away"] = null;
  let cards: TouchlineSocialRankingDraftCard[] = [];
  let confirmedGoals: number | null = null;
  let confirmedGoalMoments: TouchlineSocialRankingGoalMoment[] | null = null;
  let fixtureScore: TouchlineSocialRankingFamilyDraft["fixtureScore"] = null;
  const sourceKeys = new Set<string>(["card-ranking:touchline-england"]);
  const timestamps = [ranking.publishedAt];

  if (gameweekScoped) {
    const round = await readRoundContext(admin, scopeId!, ranking.state.seasonId!);
    if (!round || !round.providerIds.includes(fixtureId)) return { ok: false, reason: "canonical-gameweek-unavailable" };
    const first = round.rows[0]!;
    const last = round.rows[round.rows.length - 1]!;
    anchorFixtureId = input.contentType === "GAMEWEEK_RANKING_PREVIEW"
      ? String(first.provider_fixture_id) : String(last.provider_fixture_id);
    if (fixtureId !== anchorFixtureId) return { ok: false, reason: "gameweek-anchor-fixture-mismatch" };
    gameweekNumber = round.gameweekNumber;
    for (const row of round.rows) {
      sourceKeys.add(`fixture-provider:${String(row.provider_fixture_id)}`);
      sourceKeys.add(`fixture:${String(row.id).toLowerCase()}`);
      const updatedAt = timestamp(row.source_updated_at);
      if (updatedAt) timestamps.push(updatedAt);
    }
    sourceKeys.add(`round:${round.roundId.toLowerCase()}`);
    sourceKeys.add(`season:${ranking.state.seasonId!.toLowerCase()}`);
    const fixtureStateRows = round.rows.map((row) => ({ id: String(row.id), status: String(row.status ?? "") }));
    const fixtureUuids = round.rows.map((row) => String(row.id));
    const settlements = await admin.from("touchline_player_fixture_score_settlements")
      .select("fixture_id,settlement_status").eq("scoring_version", "player_scoring_v3")
      .in("fixture_id", fixtureUuids).limit(2000);
    if (settlements.error || !Array.isArray(settlements.data) || settlements.data.length >= 2000) {
      return { ok: false, reason: "gameweek-settlement-coverage-unavailable" };
    }
    const isFinal = touchlineGameweekIsFinal({
      fixtures: fixtureStateRows,
      settlements: settlements.data.map((row) => ({ fixtureId: String(row.fixture_id), status: String(row.settlement_status) })),
    });
    gameweekOpen = !isFinal;
    if (input.contentType === "GAMEWEEK_RANKING_PREVIEW") {
      const firstStartsAt = Date.parse(String(first.starts_at ?? ""));
      if (!Number.isFinite(firstStartsAt) || now >= firstStartsAt) return { ok: false, reason: "ranking-preview-window-closed" };
      cards = ranking.topThree.map((card) => cardWithRating(card));
    } else if (input.contentType === "GAMEWEEK_RANKING_FINAL") {
      if (!isFinal || ranking.state.roundId !== scopeId) return { ok: false, reason: "gameweek-not-final" };
      cards = ranking.topThree.map((card) => cardWithRating(card));
    } else {
      const hero = ranking.topThree[0]!;
      if (hero.card.id !== playerId || (isFinal && ranking.state.roundId !== scopeId)) {
        return { ok: false, reason: "gameweek-hero-identity-mismatch" };
      }
      cards = [cardWithRating(hero)];
    }
    const publicAnchor = await readPublicCompetitionFixtureByProviderId(anchorFixtureId, { providedAdmin: admin });
    const venue = publicAnchor ? resolveTouchlineFixtureVenue(publicAnchor) : null;
    arenaImageUrl = venue?.interiorImageUrl ?? "";
    venueName = venue?.name ?? null;
  } else if (input.contentType === "PLAYER_DUEL") {
    const preview = await readTouchlineSocialMatchPreviewDraft({ fixtureId, now });
    if (!preview.ok) return { ok: false, reason: `player-duel-${preview.reason}` };
    gameweekNumber = preview.data.gameweekNumber;
    arenaImageUrl = preview.data.venue.interiorImageUrl;
    venueName = preview.data.venue.name;
    home = { teamId: preview.data.home.club.teamId, name: preview.data.home.club.name, shortCode: preview.data.home.club.shortCode, logoUrl: preview.data.home.club.logoUrl };
    away = { teamId: preview.data.away.club.teamId, name: preview.data.away.club.name, shortCode: preview.data.away.club.shortCode, logoUrl: preview.data.away.club.logoUrl };
    cards = [cardWithRating(preview.data.home.leader), cardWithRating(preview.data.away.leader)];
    Object.keys(preview.data.sourceRevisionManifest).forEach((key) => sourceKeys.add(key));
    timestamps.push(preview.data.sourceSnapshotAt);
  } else {
    const finalResult = await readTouchlineSocialFinalScoreDraft(fixtureId);
    if (!finalResult.ok) return { ok: false, reason: `final-result-${finalResult.reason}` };
    gameweekNumber = finalResult.data.gameweekNumber;
    gameweekOpen = false;
    arenaImageUrl = finalResult.data.venue.interiorImageUrl;
    venueName = finalResult.data.venue.name;
    home = { teamId: finalResult.data.home.teamId, name: finalResult.data.home.name, shortCode: finalResult.data.home.shortCode, logoUrl: finalResult.data.home.logoUrl };
    away = { teamId: finalResult.data.away.teamId, name: finalResult.data.away.name, shortCode: finalResult.data.away.shortCode, logoUrl: finalResult.data.away.logoUrl };
    fixtureScore = finalResult.data.score;
    Object.keys(finalResult.data.sourceRevisionManifest).forEach((key) => sourceKeys.add(key));
    timestamps.push(finalResult.data.sourceSnapshotAt);
    const canonical = await admin.from("football_fixtures").select("id")
      .eq("provider", "sportmonks").eq("provider_fixture_id", fixtureId).maybeSingle();
    const canonicalFixtureId = text(canonical.data?.id);
    if (canonical.error || !canonicalFixtureId || !UUID.test(canonicalFixtureId)) {
      return { ok: false, reason: "canonical-fixture-unavailable" };
    }
    const settlements = await admin.from("touchline_player_fixture_score_settlements")
      .select("football_player_id,rating,minutes_played,settlement_status")
      .eq("fixture_id", canonicalFixtureId).eq("scoring_version", "player_scoring_v3").eq("settlement_status", "final");
    if (settlements.error || !Array.isArray(settlements.data) || !settlements.data.length) {
      return { ok: false, reason: "final-v3-settlements-unavailable" };
    }
    const providerByCanonical = new Map(ranking.cards.map((card) => [String(card.canonicalPlayerId), card.id] as const));
    const settlementCandidates = settlements.data.flatMap((row) => {
      const canonicalPlayerId = String(row.football_player_id ?? "");
      const providerPlayerId = providerByCanonical.get(canonicalPlayerId);
      return providerPlayerId ? [{
        playerId: canonicalPlayerId, providerPlayerId,
        officialMatchRating: Number(row.rating), minutesPlayed: Number(row.minutes_played ?? 0),
        settlementStatus: "final" as const,
      }] : [];
    });
    const globallyRanked = [...ranking.players].sort(compareTouchlineRankingPlayers);
    const globalRankByProviderId = new Map(globallyRanked.map((row, index) => [String(row.providerPlayerId), index + 1] as const));
    if (input.contentType === "TOP_PERFORMER") {
      const winner = selectTouchlineTopPerformer({ settlements: settlementCandidates, cards: ranking.cards, requireFinal: true });
      if (!winner || winner.card.id !== playerId) return { ok: false, reason: "top-performer-identity-mismatch" };
      cards = [cardWithRating({ ...winner, overallRank: globalRankByProviderId.get(playerId!) ?? 0 }, winner.card.matchRating ?? null)];
    } else {
      const heroCard = ranking.cards.find((card) => card.id === playerId);
      const ranked = globallyRanked.find((row) => String(row.providerPlayerId) === playerId);
      const settlement = settlementCandidates.find((row) => row.providerPlayerId === playerId);
      if (!heroCard || !ranked || !settlement || !heroCard.editorialCard) {
        return { ok: false, reason: "hat-trick-card-unavailable" };
      }
      const events = await admin.from("football_fixture_events")
        .select("provider_player_id,provider_sort_order,minute,extra_minute,event_type,event_status,info,addition")
        .eq("fixture_id", canonicalFixtureId).eq("provider", "sportmonks")
        .order("provider_sort_order", { ascending: true }).limit(64);
      if (events.error || !Array.isArray(events.data)) return { ok: false, reason: "hat-trick-events-unavailable" };
      const goalFacts = events.data.flatMap((row) => {
        const fact = touchlineConfirmedHatTrickGoalFact({
          playerId: String(row.provider_player_id ?? ""),
          type: String(row.event_type ?? ""),
          status: String(row.event_status ?? ""),
          info: String(row.info ?? ""),
          addition: String(row.addition ?? ""),
        });
        const minute = integer(row.minute);
        const extraMinute = row.extra_minute === null ? null : integer(row.extra_minute);
        return fact && minute !== null && minute >= 0
          && (row.extra_minute === null || (extraMinute !== null && extraMinute >= 1))
          ? [{ ...fact, minute, extraMinute }] : [];
      });
      confirmedGoals = countTouchlineConfirmedHatTrickGoals(goalFacts, playerId!);
      if (confirmedGoals < 3) return { ok: false, reason: "hat-trick-not-confirmed" };
      confirmedGoalMoments = goalFacts
        .filter((event) => event.playerId === playerId)
        .map(({ kind, minute, extraMinute }) => ({ kind, minute, extraMinute }));
      cards = [cardWithRating({
        card: heroCard,
        totalRating: Number(ranked.totalRating),
        overallRank: globalRankByProviderId.get(playerId!) ?? 0,
        positionRank: ranked.positionRank,
        positionGroup: ranked.positionGroup,
      }, settlement.officialMatchRating)];
    }
  }

  if (!arenaImageUrl || !cards.length || cards.some((entry) => entry.overallRank < 1)) {
    return { ok: false, reason: "ranking-art-context-unavailable" };
  }
  cards.forEach((entry) => sourceKeys.add(`player:${String(entry.card.canonicalPlayerId).toLowerCase()}`));
  const caption = buildTouchlineRankingFamilyCaption({
    contentType: input.contentType,
    gameweekNumber,
    cards: cards.map((entry) => ({ name: entry.card.name, clubName: entry.card.clubName,
      totalRating: entry.totalRating, rank: entry.overallRank })),
    homeName: home?.name,
    awayName: away?.name,
    playerName: playerId ? cards[0]?.card.name : undefined,
    officialMatchRating: cards[0]?.officialMatchRating ?? undefined,
    confirmedGoals: confirmedGoals ?? undefined,
    gameweekOpen,
  });
  if (!caption.ok) return { ok: false, reason: `caption-${caption.reason.toLowerCase()}` };
  const sourceSnapshotAt = timestamps.filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  if (!sourceSnapshotAt) return { ok: false, reason: "source-timestamp-unavailable" };
  const baseSource = {
    sourceProvenance: "PERSISTED_VERIFIED_RANKING_FAMILY" as const,
    contentType: input.contentType,
    fixtureId: anchorFixtureId,
    scopeId,
    playerId,
    firstObservedAt: ranking.publishedAt,
    sourceSnapshotAt,
    sourceVersion: SOURCE_VERSION,
    gameweekNumber,
    gameweekOpen,
    arenaImageUrl,
    venueName,
    caption: caption.caption,
    rankingSnapshotId: ranking.state.snapshotId!,
    home,
    away,
    fixtureScore,
    cards,
    confirmedGoals,
    confirmedGoalMoments,
  } as const;
  const sourceChecksum = checksumTouchlineRankingFamilyRenderSource(baseSource);
  if (!SHA256.test(sourceChecksum)) return { ok: false, reason: "source-checksum-invalid" };
  const sourceEnd = await readTouchlineSocialSourceRevisionCheckpoint([...sourceKeys]);
  if (!sourceEnd || sourceEnd.clockRevision !== sourceStart.clockRevision) {
    return { ok: false, reason: "source-revision-changed-during-read" };
  }
  return { ok: true, data: {
    ...baseSource,
    sourceChecksum,
    sourceRevisionManifest: sourceEnd.manifest,
    sourceRevisionChecksum: sourceEnd.checksum,
  } };
}

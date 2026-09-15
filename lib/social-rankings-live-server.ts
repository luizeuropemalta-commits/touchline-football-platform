import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createAdminClient } from "./supabase/admin";
import { loadTouchLineRankedCardCatalog } from "./touchlineArena/ranked-card-catalog-server";
import { loadTouchlinePublishedCardPresentations } from "./touchlineArena/card-publication-read-model";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "./touchlineArena/card-ranking-live";
import { loadRankingsLiveCardsInChunks } from "./social-rankings-live-catalog";
import type { ClubOwnerSquadCard } from "./touchlineArena/demo-data";
import { deriveRankingsLive, type RankingsLiveSource, type RankingsLiveEvidence, type RankingsLiveDerived } from "./social-rankings-live-contract";
import { applyRankingsGoldenBootEvidence, type RankingsGoldenBootEvidence } from "./social-rankings-live-golden-boot";

export type RankingsLiveRenderInput = { data: RankingsLiveDerived; cards: Record<string, ClubOwnerSquadCard>; sourceSha256: string; evidenceSha256: string; ratingFeedsSha256: string; goldenBootEvidenceSha256: string; preparedAt: string; publicCardsRevalidated: true; coachSnapshotValidated: true };
const root = () => path.join(process.cwd(), "artifacts/social-studio/rankings");
const hash = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** GET-only preparation; the foreground exporter persists the returned DTO locally. */
export async function prepareRankingsLiveRenderInput(): Promise<RankingsLiveRenderInput> {
  if (process.env.NODE_ENV !== "development") throw new Error("LOCAL_DEVELOPMENT_ONLY");
  const configuredUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) throw new Error("QA_URL_UNAVAILABLE");
  if (configuredUrl.replace(/\/+$/, "") !== "https://xgxbwqxjssxxuihuwmgy.supabase.co") throw new Error("EXACT_QA_PROJECT_REQUIRED");
  const admin = createAdminClient();
  if (!admin) throw new Error("QA_SERVICE_ROLE_UNAVAILABLE");
  const [sourceBytes, evidenceBytes, ratingFeedsBytes, goldenBootBytes, publications, activeCoach] = await Promise.all([
    readFile(path.join(root(), "snapshot-20260914.json")),
    readFile(path.join(root(), "settlement-evidence-20260914.json")),
    readFile(path.join(root(), "rating-lineup-evidence-20260914.json")),
    readFile(path.join(root(), "golden-boot-reconciliation-20260914.json")),
    admin.from("touchline_card_publications").select("player_id").eq("publication_status", "published").limit(751),
    admin.from("touchline_coach_ranking_active_snapshots").select("snapshot_id").eq("league_key", "touchline-england").maybeSingle(),
  ]);
  if (publications.error || !publications.data?.length) throw new Error("PUBLISHED_CARDS_UNAVAILABLE");
  if (publications.data.length > 750) throw new Error("PUBLICATION_READER_CAPACITY_EXCEEDED");
  // The public policy already chunks identity reads into 150 UUIDs. Do not send
  // the entire showcase's UUID list through its unbounded decoration queries:
  // PostgREST echoes that long URL in Content-Location, overflowing Node headers.
  const publishedIds = [...new Set(publications.data.map(row => String(row.player_id)))];
  const presentations = await loadTouchlinePublishedCardPresentations({ playerIds: publishedIds, providedAdmin: admin });
  if (!presentations.size) throw new Error("CANONICAL_PUBLICATION_PRESENTATIONS_UNAVAILABLE");
  const source = JSON.parse(sourceBytes.toString()) as RankingsLiveSource;
  if (activeCoach.error || activeCoach.data?.snapshot_id !== source.coachSnapshot.snapshot_id) throw new Error("RANKINGS_COACH_ACTIVE_SNAPSHOT_CHANGED");
  const currentCoach = await admin.from("touchline_coach_ranking_snapshots")
    .select("snapshot_id,season_id,league_key,scoring_version,fixture_ids,ranking_payload")
    .eq("snapshot_id", activeCoach.data.snapshot_id).eq("league_key", "touchline-england").maybeSingle();
  const coachFields = ["snapshot_id", "season_id", "league_key", "scoring_version", "fixture_ids", "ranking_payload"] as const;
  const currentCoachData = currentCoach.data;
  if (currentCoach.error || !currentCoachData || coachFields.some(key => !isDeepStrictEqual(currentCoachData[key], source.coachSnapshot[key]))) throw new Error("RANKINGS_COACH_PUBLISHED_SNAPSHOT_CHANGED");
  const evidence = JSON.parse(evidenceBytes.toString()) as RankingsLiveEvidence;
  evidence.ratingFeeds = JSON.parse(ratingFeedsBytes.toString()).feeds;
  const revision = createHash("sha256").update(sourceBytes).update(evidenceBytes).update(ratingFeedsBytes).update(goldenBootBytes).digest("hex");
  const replay = deriveRankingsLive(source, evidence, [...presentations.keys()], revision);
  const data = applyRankingsGoldenBootEvidence(replay, source, JSON.parse(goldenBootBytes.toString()) as RankingsGoldenBootEvidence);
  const selected = new Set([data.overall.playerId, data.weeklyOverall.playerId, ...data.weeklyLeaders.map((p) => p.playerId), ...data.selection.players.map((p) => p.player.playerId), ...data.weeklySelection.players.map((p) => p.player.playerId), ...data.goldenBoot.candidates.map((p) => p.playerId)]);
  const publishedCards = await loadRankingsLiveCardsInChunks({ ...TOUCHLINE_PRESEASON_RANKING_STATE,
    phase: "ranked", snapshotId: data.seasonRanking.snapshot.snapshotId, publishedAt: null,
    seasonId: source.season.id, roundId: data.round.provider_round_id, scoringVersion: "player_scoring_v3", coverageStatus: "complete_for_scoring",
    fixtureIds: data.provenance.fixtureIds, expectedFixtureIds: data.provenance.fixtureIds,
    players: data.seasonRanking.snapshot.players.filter(player => selected.has(player.playerId)),
  }, state => loadTouchLineRankedCardCatalog(state, admin));
  const cards: Record<string, ClubOwnerSquadCard> = {};
  for (const original of publishedCards.filter((c) => selected.has(c.canonicalPlayerId!))) {
    const playerId = original.canonicalPlayerId!;
    const ranking = data.seasonRanking.snapshot.players.find((p) => p.playerId === playerId);
    if (!ranking || !original.editorialCard) throw new Error("SELECTED_PUBLISHED_CARD_MISSING");
    const latest = evidence.settlements.filter((s) => s.football_player_id === playerId && ["started", "substitute"].includes(s.appearance_status)).sort((a, b) => {
      const starts = (id: string) => source.fixtures.find((f) => f.id === id)?.starts_at ?? "";
      return Date.parse(starts(b.fixture_id)) - Date.parse(starts(a.fixture_id));
    })[0];
    // Preserve the published editorial tier/price; local replay cannot reprice a card.
    cards[playerId] = { ...original, seasonTotalRating: ranking.totalRating, matchRating: latest?.rating ?? null, seasonStats: undefined, matchStats: undefined };
  }
  if (Object.keys(cards).length !== selected.size) throw new Error("SELECTED_PUBLISHED_CARD_MISSING");
  return { data, cards, sourceSha256: hash(sourceBytes), evidenceSha256: hash(evidenceBytes), ratingFeedsSha256: hash(ratingFeedsBytes), goldenBootEvidenceSha256: hash(goldenBootBytes), preparedAt: new Date().toISOString(), publicCardsRevalidated: true, coachSnapshotValidated: true };
}

export async function readRankingsLiveRenderInput(): Promise<RankingsLiveRenderInput> {
  if (process.env.NODE_ENV !== "development") throw new Error("LOCAL_DEVELOPMENT_ONLY");
  const value = JSON.parse(await readFile(path.join(root(), "render-input-20260914.json"), "utf8")) as RankingsLiveRenderInput;
  if (value.publicCardsRevalidated !== true || value.coachSnapshotValidated !== true || value.data.provenance.source !== "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED" || value.data.publishable !== false || !value.data.weeklySelection?.complete || !value.goldenBootEvidenceSha256) throw new Error("INVALID_LOCAL_REVIEW_INPUT_REPREPARE_REQUIRED");
  return value;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { compareTouchlineRankingPlayers } from "../../lib/touchlineArena/card-ranking.ts";
import type { TouchlineSocialRankingContentType } from "../../lib/touchlineArena/social-ranking-family-contract.ts";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SOURCE_KEY = /^(fixture-provider|fixture-event|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$/;
const SOURCE_READ_TIMEOUT_MS = 45_000;
const FIXTURE_DISCOVERY_LIMIT = 380;
const DUEL_WINDOW_MS = 6 * 60 * 60 * 1000;
const RECENT_FINAL_MS = 36 * 60 * 60 * 1000;

export type TouchlineSocialRankingCandidate = Readonly<{
  contentType: TouchlineSocialRankingContentType;
  fixtureId: string;
  scopeId: string | null;
  playerId: string | null;
  firstObservedAt: string;
  startsAt: string;
  inputChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
}>;

function parseRevision(payload: Record<string, unknown>) {
  const checksum = String(payload.sourceRevisionChecksum ?? "");
  const raw = payload.sourceRevisionManifest;
  if (!SHA256.test(checksum) || !raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const manifest: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const revision = Number(value);
    if (!SOURCE_KEY.test(key) || !Number.isSafeInteger(revision) || revision < 0) return null;
    manifest[key] = revision;
  }
  return Object.keys(manifest).length >= 1 && Object.keys(manifest).length <= 128
    ? { sourceRevisionManifest: Object.freeze(manifest), sourceRevisionChecksum: checksum }
    : null;
}

export async function readCurrentTouchlineRankingSource(input: Readonly<{
  base: URL;
  renderSecret: string;
  contentType: TouchlineSocialRankingContentType;
  fixtureId: string;
  scopeId?: string | null;
  playerId?: string | null;
}>) {
  const url = new URL("/api/admin/social-publications/source", input.base);
  url.searchParams.set("contentType", input.contentType);
  url.searchParams.set("fixtureId", input.fixtureId);
  if (input.scopeId) url.searchParams.set("scopeId", input.scopeId);
  if (input.playerId) url.searchParams.set("playerId", input.playerId);
  const response = await fetch(url, {
    headers: { cookie: `tl-social-render=${encodeURIComponent(input.renderSecret)}` },
    cache: "no-store", signal: AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const revision = payload ? parseRevision(payload) : null;
  const firstObservedAt = String(payload?.firstObservedAt ?? "");
  const sourceSnapshotAt = String(payload?.sourceSnapshotAt ?? "");
  const inputChecksum = String(payload?.sourceChecksum ?? "");
  if (!response.ok || payload?.ok !== true || payload.contentType !== input.contentType
    || String(payload.fixtureId ?? "") !== input.fixtureId
    || String(payload.scopeId ?? "") !== String(input.scopeId ?? "")
    || String(payload.playerId ?? "") !== String(input.playerId ?? "")
    || !Number.isFinite(Date.parse(firstObservedAt)) || !Number.isFinite(Date.parse(sourceSnapshotAt))
    || !SHA256.test(inputChecksum) || !revision) {
    throw new Error("TL_SOCIAL_RANKING_CURRENT_SOURCE_UNAVAILABLE");
  }
  return { inputChecksum, firstObservedAt, sourceSnapshotAt, ...revision };
}

function explicitIdentity(input: Readonly<{
  contentType?: string | null;
  fixtureId?: string | null;
  scopeId?: string | null;
  playerId?: string | null;
}>) {
  if (!input.contentType && !input.fixtureId && !input.scopeId && !input.playerId) return null;
  const contentType = String(input.contentType ?? "") as TouchlineSocialRankingContentType;
  const fixtureId = String(input.fixtureId ?? "");
  const scopeId = input.scopeId?.trim() || null;
  const playerId = input.playerId?.trim() || null;
  const allowed = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
    "GAMEWEEK_HERO", "TOP_PERFORMER"].includes(contentType);
  const gameweek = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "GAMEWEEK_HERO"].includes(contentType);
  const player = ["GAMEWEEK_HERO", "TOP_PERFORMER"].includes(contentType);
  if (!allowed || !NUMERIC_ID.test(fixtureId) || gameweek !== Boolean(scopeId)
    || player !== Boolean(playerId) || (scopeId && !NUMERIC_ID.test(scopeId))
    || (playerId && !NUMERIC_ID.test(playerId))) throw new Error("TL_SOCIAL_RANKING_EXPLICIT_IDENTITY_INVALID");
  return { contentType, fixtureId, scopeId, playerId };
}

/**
 * Bounded discovery reads only canonical persisted identities. Every proposed
 * item is then re-read through the 044 server-only source, which owns all
 * finality, card-publication and revision gates.
 */
export async function discoverTouchlineSocialRankingCandidates(input: Readonly<{
  admin: SupabaseClient;
  base: URL;
  renderSecret: string;
  explicitContentType?: string | null;
  explicitFixtureId?: string | null;
  explicitScopeId?: string | null;
  explicitPlayerId?: string | null;
}>): Promise<TouchlineSocialRankingCandidate[]> {
  const explicit = explicitIdentity({
    contentType: input.explicitContentType, fixtureId: input.explicitFixtureId,
    scopeId: input.explicitScopeId, playerId: input.explicitPlayerId,
  });
  const now = Date.now();
  const proposed: Array<Readonly<{
    contentType: TouchlineSocialRankingContentType; fixtureId: string;
    scopeId: string | null; playerId: string | null; startsAt: string;
  }>> = [];
  if (explicit) {
    const fixture = await input.admin.from("football_fixtures").select("starts_at")
      .eq("provider", "sportmonks").eq("provider_fixture_id", explicit.fixtureId).maybeSingle();
    const startsAt = String(fixture.data?.starts_at ?? "");
    if (fixture.error || !Number.isFinite(Date.parse(startsAt))) throw new Error("TL_SOCIAL_RANKING_EXPLICIT_FIXTURE_UNAVAILABLE");
    proposed.push({ ...explicit, startsAt });
  } else {
    const fixtures = await input.admin.from("football_fixtures")
      .select("id,provider_fixture_id,round_id,starts_at,status")
      .eq("provider", "sportmonks")
      .gte("starts_at", new Date(now - RECENT_FINAL_MS).toISOString())
      .order("starts_at", { ascending: true }).limit(FIXTURE_DISCOVERY_LIMIT + 1);
    if (fixtures.error || !Array.isArray(fixtures.data) || fixtures.data.length > FIXTURE_DISCOVERY_LIMIT) {
      throw new Error("TL_SOCIAL_RANKING_FIXTURE_DISCOVERY_FAILED");
    }
    const rows = fixtures.data as Record<string, unknown>[];
    const roundIds = [...new Set(rows.map((row) => String(row.round_id ?? "")).filter((id) => UUID_SAFE(id)))];
    const rounds = roundIds.length ? await input.admin.from("football_rounds")
      .select("id,provider_round_id").in("id", roundIds) : { data: [], error: null };
    if (rounds.error || !Array.isArray(rounds.data)) throw new Error("TL_SOCIAL_RANKING_ROUND_DISCOVERY_FAILED");
    const providerRoundById = new Map(rounds.data.map((row) => [String(row.id), String(row.provider_round_id)] as const));
    const upcoming = rows.filter((row) => Date.parse(String(row.starts_at ?? "")) > now);
    if (upcoming.length) {
      const firstRoundId = String(upcoming[0]!.round_id ?? "");
      const sameRound = upcoming.filter((row) => String(row.round_id ?? "") === firstRoundId);
      const scopeId = providerRoundById.get(firstRoundId) ?? "";
      const anchor = sameRound[0];
      if (anchor && NUMERIC_ID.test(scopeId)) proposed.push({ contentType: "GAMEWEEK_RANKING_PREVIEW",
        fixtureId: String(anchor.provider_fixture_id), scopeId, playerId: null, startsAt: String(anchor.starts_at) });
      for (const row of sameRound.filter((fixture) => Date.parse(String(fixture.starts_at ?? "")) - now <= DUEL_WINDOW_MS)) {
        proposed.push({ contentType: "PLAYER_DUEL", fixtureId: String(row.provider_fixture_id),
          scopeId: null, playerId: null, startsAt: String(row.starts_at) });
      }
    }
    const finished = rows.filter((row) => String(row.status ?? "").toLowerCase() === "finished");
    if (finished.length) {
      const fixtureIds = finished.map((row) => String(row.id));
      const settlements = await input.admin.from("touchline_player_fixture_score_settlements")
          .select("fixture_id,football_player_id,rating,minutes_played,settlement_status,football_players!inner(provider_player_id)")
          .eq("scoring_version", "player_scoring_v3").eq("settlement_status", "final")
          .in("fixture_id", fixtureIds).limit(2000);
      if (settlements.error || !Array.isArray(settlements.data) || settlements.data.length >= 2000) {
        throw new Error("TL_SOCIAL_RANKING_SETTLEMENT_DISCOVERY_FAILED");
      }
      const byFixture = new Map<string, Record<string, unknown>[]>();
      for (const row of settlements.data as Record<string, unknown>[]) {
        const key = String(row.fixture_id ?? "");
        byFixture.set(key, [...(byFixture.get(key) ?? []), row]);
      }
      for (const fixture of finished) {
        const ranked = [...(byFixture.get(String(fixture.id)) ?? [])].sort((left, right) => (
          Number(right.rating ?? -1) - Number(left.rating ?? -1)
          || Number(right.minutes_played ?? -1) - Number(left.minutes_played ?? -1)
          || String((left.football_players as Record<string, unknown> | null)?.provider_player_id ?? "")
            .localeCompare(String((right.football_players as Record<string, unknown> | null)?.provider_player_id ?? ""), "en")
        ));
        const topPlayerId = String((ranked[0]?.football_players as Record<string, unknown> | null)?.provider_player_id ?? "");
        if (NUMERIC_ID.test(topPlayerId)) proposed.push({ contentType: "TOP_PERFORMER",
          fixtureId: String(fixture.provider_fixture_id), scopeId: null, playerId: topPlayerId,
          startsAt: String(fixture.starts_at) });
      }
      const latest = finished[finished.length - 1]!;
      const latestRoundId = String(latest.round_id ?? "");
      const scopeId = providerRoundById.get(latestRoundId) ?? "";
      if (NUMERIC_ID.test(scopeId)) proposed.push({ contentType: "GAMEWEEK_RANKING_FINAL",
        fixtureId: String(latest.provider_fixture_id), scopeId, playerId: null, startsAt: String(latest.starts_at) });
      if (NUMERIC_ID.test(scopeId)) {
        const active = await input.admin.from("touchline_card_ranking_active_snapshots")
          .select("snapshot_id").eq("league_key", "touchline-england").maybeSingle();
        const snapshotId = String(active.data?.snapshot_id ?? "");
        const snapshot = !active.error && UUID_SAFE(snapshotId)
          ? await input.admin.from("touchline_card_ranking_snapshots")
            .select("round_id,ranking_payload,status,scoring_version").eq("snapshot_id", snapshotId).maybeSingle()
          : { data: null, error: new Error("active ranking unavailable") };
        const payload = snapshot.data?.ranking_payload as { players?: Record<string, unknown>[] } | null;
        const ranked = Array.isArray(payload?.players)
          ? [...payload.players].sort((left, right) => compareTouchlineRankingPlayers(left as never, right as never))
          : [];
        const leaderId = String(ranked[0]?.providerPlayerId ?? "");
        if (!snapshot.error && snapshot.data?.status === "published"
          && snapshot.data?.scoring_version === "player_scoring_v3"
          && String(snapshot.data?.round_id ?? "") === scopeId && NUMERIC_ID.test(leaderId)) {
          proposed.push({ contentType: "GAMEWEEK_HERO", fixtureId: String(latest.provider_fixture_id),
            scopeId, playerId: leaderId, startsAt: String(latest.starts_at) });
        }
      }
    }
  }
  const candidates: TouchlineSocialRankingCandidate[] = [];
  for (const identity of proposed) {
    try {
      const source = await readCurrentTouchlineRankingSource({ base: input.base, renderSecret: input.renderSecret, ...identity });
      candidates.push({ ...identity, ...source });
    } catch (error) {
      if (explicit) throw error;
    }
  }
  return candidates;
}

function UUID_SAFE(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

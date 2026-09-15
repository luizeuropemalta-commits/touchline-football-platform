import { readFile } from "node:fs/promises";
import path from "node:path";

import type { TouchlineSocialMatchPreviewArtworkDraft } from "../../components/touchline/social/TouchlineSocialApprovedMatchPreviewDraft.tsx";
import { buildTouchlineMatchPreviewLiveApprovalCaption } from "./social-match-preview-live-caption.ts";

const LEADERS_PATH = "artifacts/social-studio/rankings/match-preview-leaders-20260914.json";
const CARD_EVIDENCE_PATH = "artifacts/social-studio/rankings/match-preview-card-revalidation-20260915.json";
const FIXTURE_PATH = "artifacts/social-studio/match-preview/2026-09-14-brentford-chelsea-factual-capture.json";
const SHA256 = /^[a-f0-9]{64}$/;

type RecordValue = Record<string, unknown>;

function record(value: unknown, reason: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(reason);
  return value as RecordValue;
}

function string(value: unknown, reason: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(reason);
  return value.trim();
}

function number(value: unknown, reason: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(reason);
  return value;
}

async function readArtifact(relativePath: string) {
  const root = path.resolve(process.cwd());
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error("MATCH_PREVIEW_REPLAY_PATH_INVALID");
  return record(JSON.parse(await readFile(file, "utf8")), "MATCH_PREVIEW_REPLAY_ARTIFACT_INVALID");
}

function leaderByClub(leaders: RecordValue, clubId: string) {
  const all = leaders.leaders;
  if (!Array.isArray(all)) throw new Error("MATCH_PREVIEW_REPLAY_LEADERS_INVALID");
  const entry = all.find((candidate) => record(candidate, "MATCH_PREVIEW_REPLAY_LEADER_INVALID").clubId === clubId);
  if (!entry) throw new Error("MATCH_PREVIEW_REPLAY_CLUB_LEADER_MISSING");
  const value = record(entry, "MATCH_PREVIEW_REPLAY_LEADER_INVALID");
  const player = record(value.player, "MATCH_PREVIEW_REPLAY_PLAYER_INVALID");
  return {
    clubId: string(value.clubId, "MATCH_PREVIEW_REPLAY_CLUB_ID_INVALID"),
    clubProviderId: string(value.clubProviderId, "MATCH_PREVIEW_REPLAY_CLUB_PROVIDER_INVALID"),
    clubName: string(value.clubName, "MATCH_PREVIEW_REPLAY_CLUB_NAME_INVALID"),
    playerId: string(player.playerId, "MATCH_PREVIEW_REPLAY_PLAYER_ID_INVALID"),
    providerPlayerId: string(player.providerPlayerId, "MATCH_PREVIEW_REPLAY_PROVIDER_PLAYER_INVALID"),
    name: string(player.name, "MATCH_PREVIEW_REPLAY_PLAYER_NAME_INVALID"),
    position: string(player.position, "MATCH_PREVIEW_REPLAY_POSITION_INVALID"),
    role: string(player.role, "MATCH_PREVIEW_REPLAY_ROLE_INVALID"),
    totalRating: number(player.totalRating, "MATCH_PREVIEW_REPLAY_RATING_INVALID"),
    appearances: number(player.appearances, "MATCH_PREVIEW_REPLAY_APPEARANCES_INVALID"),
    minutesPlayed: number(player.minutesPlayed, "MATCH_PREVIEW_REPLAY_MINUTES_INVALID"),
  };
}

function publishedCard(evidence: RecordValue, playerId: string, expectedClubId: string, expectedTier: string, expectedNumber: number, expectedMarketValueEur: number) {
  const rows = evidence.rows;
  if (!Array.isArray(rows)) throw new Error("MATCH_PREVIEW_REPLAY_CARD_EVIDENCE_INVALID");
  const row = rows.map((candidate) => record(candidate, "MATCH_PREVIEW_REPLAY_CARD_ROW_INVALID"))
    .find((candidate) => candidate.id === playerId);
  if (!row
    || string(row.publication_status, "MATCH_PREVIEW_REPLAY_CARD_STATUS_INVALID") !== "published"
    || string(row.calculated_tier, "MATCH_PREVIEW_REPLAY_CARD_TIER_INVALID") !== expectedTier
    || number(row.jersey_number, "MATCH_PREVIEW_REPLAY_CARD_NUMBER_INVALID") !== expectedNumber
    || number(row.market_value_eur, "MATCH_PREVIEW_REPLAY_CARD_MARKET_VALUE_INVALID") !== expectedMarketValueEur
    || row.current_club_id !== expectedClubId || row.membership_club !== expectedClubId
    || row.current_membership_id !== row.membership_id || row.membership_status !== "active"
    || row.competition_id !== "ce833f5a-4121-47d7-86f6-2e37f2f74a2a" || row.membership_competition !== row.competition_id
    || row.effective_season !== "2026/27" || row.verified_season !== row.effective_season || row.value_status !== "verified") {
    throw new Error("MATCH_PREVIEW_REPLAY_PUBLISHED_CARD_MISMATCH");
  }
  return {
    tier: expectedTier,
    shirtNumber: expectedNumber,
    marketValue: `€${expectedMarketValueEur / 1_000_000}m`,
    clubLogoUrl: string(row.logo_url, "MATCH_PREVIEW_REPLAY_CARD_LOGO_INVALID"),
  };
}

/**
 * Approval-only local replay. It binds the date, fixture, leaders and their
 * published card attributes; no remote snapshot is promoted and no delivery
 * state can be derived from this reader.
 */
export async function readTouchlineMatchPreviewReplayApprovalDraft() {
  const [leaders, evidence, fixtureCapture] = await Promise.all([
    readArtifact(LEADERS_PATH), readArtifact(CARD_EVIDENCE_PATH), readArtifact(FIXTURE_PATH),
  ]);
  if (string(leaders.source, "MATCH_PREVIEW_REPLAY_SOURCE_INVALID") !== "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED"
    || leaders.publishable !== false
    || !SHA256.test(string(leaders.revision, "MATCH_PREVIEW_REPLAY_REVISION_INVALID"))) {
    throw new Error("MATCH_PREVIEW_REPLAY_PROVENANCE_INVALID");
  }
  const fixture = record(record(fixtureCapture.factualData, "MATCH_PREVIEW_REPLAY_FIXTURE_CAPTURE_INVALID").fixture,
    "MATCH_PREVIEW_REPLAY_FIXTURE_INVALID");
  if (string(fixture.providerFixtureId, "MATCH_PREVIEW_REPLAY_FIXTURE_ID_INVALID") !== "19722162"
    || string(fixture.status, "MATCH_PREVIEW_REPLAY_FIXTURE_STATUS_INVALID") !== "Not Started") {
    throw new Error("MATCH_PREVIEW_REPLAY_FIXTURE_MISMATCH");
  }
  const brentford = leaderByClub(leaders, "20aac0eb-5ed2-4dd4-a9a2-abe7c77e4588");
  const chelsea = leaderByClub(leaders, "c5a32bf5-60d6-4a76-8645-218b80e8ba47");
  const brentfordCard = publishedCard(evidence, brentford.playerId, brentford.clubId, "amethyst-purple", 27, 16_000_000);
  const chelseaCard = publishedCard(evidence, chelsea.playerId, chelsea.clubId, "diamond-gold", 9, 80_000_000);
  const startsAt = string(fixture.startsAt, "MATCH_PREVIEW_REPLAY_START_INVALID");
  const sourceSnapshotAt = string(leaders.asOf, "MATCH_PREVIEW_REPLAY_AS_OF_INVALID");
  const sourceRevision = string(leaders.revision, "MATCH_PREVIEW_REPLAY_REVISION_INVALID");
  const draft = {
    sourceVersion: "touchline-match-preview-local-replay-v1",
    sourceChecksum: `sha256:${sourceRevision}`,
    sourceRevisionChecksum: `sha256:${sourceRevision}`,
    sourceSnapshotAt,
    startsAt,
    caption: buildTouchlineMatchPreviewLiveApprovalCaption({
      homeClub: brentford.clubName, awayClub: chelsea.clubName, startsAt, timeZone: "Europe/Malta",
      homeLeader: { name: brentford.name, totalRating: brentford.totalRating },
      awayLeader: { name: chelsea.name, totalRating: chelsea.totalRating },
    }),
    gameweekNumber: 5,
    venue: {
      name: "Gtech Community Stadium",
      interiorImageUrl: "/touchlineArena/arena/touchline-arena-poster-20260722.jpg",
    },
    home: {
      teamId: brentford.clubProviderId, name: brentford.clubName, shortCode: "BRE", accent: "#e30613", secondaryAccent: "#ffffff",
      logoUrl: brentfordCard.clubLogoUrl,
      leader: { card: {
        id: brentford.providerPlayerId, canonicalPlayerId: brentford.playerId, name: brentford.name,
        role: brentford.role, position: brentford.position, shirtNumber: brentfordCard.shirtNumber,
        clubName: brentford.clubName, clubLogoUrl: brentfordCard.clubLogoUrl,
        cardTemplateUrl: "/touchlineArena/cards/templates/clubs/Brentford%20FC/market-tiers/amethyst-purple.png",
        marketValue: brentfordCard.marketValue, totalRating: brentford.totalRating,
        seasonStats: { appearances: brentford.appearances, minutes: brentford.minutesPlayed },
      }, totalRating: brentford.totalRating },
    },
    away: {
      teamId: chelsea.clubProviderId, name: chelsea.clubName, shortCode: "CHE", accent: "#034694", secondaryAccent: "#ffffff",
      logoUrl: chelseaCard.clubLogoUrl,
      leader: { card: {
        id: chelsea.providerPlayerId, canonicalPlayerId: chelsea.playerId, name: chelsea.name,
        role: chelsea.role, position: chelsea.position, shirtNumber: chelseaCard.shirtNumber,
        clubName: chelsea.clubName, clubLogoUrl: chelseaCard.clubLogoUrl,
        cardTemplateUrl: "/touchlineArena/cards/templates/clubs/Chelsea%20FC/market-tiers/diamond-gold.png",
        marketValue: chelseaCard.marketValue, totalRating: chelsea.totalRating,
        seasonStats: { appearances: chelsea.appearances, minutes: chelsea.minutesPlayed },
      }, totalRating: chelsea.totalRating },
    },
  } satisfies TouchlineSocialMatchPreviewArtworkDraft;
  return {
    draft,
    provenance: Object.freeze({
      fixtureId: string(fixture.providerFixtureId, "MATCH_PREVIEW_REPLAY_FIXTURE_ID_INVALID"),
      fixtureUpdatedAt: string(fixture.sourceUpdatedAt, "MATCH_PREVIEW_REPLAY_FIXTURE_UPDATED_INVALID"),
      replayAsOf: sourceSnapshotAt,
      fetchedAt: string(leaders.fetchedAt, "MATCH_PREVIEW_REPLAY_FETCHED_AT_INVALID"),
      competitionId: string(leaders.competitionId, "MATCH_PREVIEW_REPLAY_COMPETITION_INVALID"),
      seasonId: string(leaders.seasonId, "MATCH_PREVIEW_REPLAY_SEASON_INVALID"),
      replayRevision: `sha256:${sourceRevision}`,
      dispatch: "BLOCKED_REMOTE_RANKING_SNAPSHOT_STALE" as const,
      sourcePaths: Object.freeze([LEADERS_PATH, CARD_EVIDENCE_PATH, FIXTURE_PATH]),
    }),
  };
}

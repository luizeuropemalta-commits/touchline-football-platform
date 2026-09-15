import type { TouchlineSocialFinalScoreDraft } from "./social-final-score-draft-server.ts";
import {
  projectStudioFullTimeRenderedFactsV1,
  sameStudioFullTimeRenderedFacts,
  type StudioFullTimeRenderedFactsV1,
} from "./social-studio-full-time-rendered-facts.ts";
import type {
  StudioMedia,
} from "./social-studio-contract.ts";
import type {
  StudioPublishedSourceProof,
} from "./social-studio-source-gate.ts";

const SHA256 = /^sha256:[a-f0-9]{64}$/;

type IdentityRow = Readonly<{
  id: string;
  providerId: string;
}>;

export type StudioFullTimeIdentityGraph = Readonly<{
  competition: IdentityRow;
  season: IdentityRow & Readonly<{ competitionId: string }>;
  fixture: IdentityRow & Readonly<{
    competitionId: string;
    seasonId: string;
    roundId: string;
    homeClubId: string;
    awayClubId: string;
    status: string;
    homeScore: number;
    awayScore: number;
  }>;
  clubs: readonly IdentityRow[];
  players: readonly (IdentityRow & Readonly<{ currentClubId: string }>)[];
  activeMemberships: readonly Readonly<{
    id: string;
    playerId: string;
    clubId: string;
    competitionId: string;
  }>[];
  publishedCards: readonly Readonly<{
    playerId: string;
    membershipId: string;
    competitionId: string;
  }>[];
}>;

const numericId = (value: unknown) => /^[1-9]\d{0,15}$/.test(String(value ?? "").trim());
const sameSet = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length || new Set(left).size !== left.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((value, index) => value === expected[index]);
};

function factualRenderedFacts(snapshot: Record<string, unknown>): StudioFullTimeRenderedFactsV1 | null {
  const factualData = snapshot.factualData;
  if (!factualData || typeof factualData !== "object" || Array.isArray(factualData)) return null;
  if (!sameSet(Object.keys(factualData as Record<string, unknown>), ["fullTime"])) return null;
  const facts = (factualData as Record<string, unknown>).fullTime;
  return facts && typeof facts === "object" && !Array.isArray(facts)
    ? facts as StudioFullTimeRenderedFactsV1
    : null;
}

/**
 * Pure, fail-closed reconciliation for the one Studio family whose canonical
 * persisted reader is already complete. It never treats the artifact snapshot
 * as proof: the snapshot must agree with a fresh final-result read and the
 * separately fetched canonical identity/publication graph.
 */
export function buildStudioFullTimePublishedSourceProof(input: Readonly<{
  media: StudioMedia;
  snapshot: Record<string, unknown>;
  finalDraft: TouchlineSocialFinalScoreDraft;
  graph: StudioFullTimeIdentityGraph;
  now: number;
}>): StudioPublishedSourceProof | null {
  const { media, finalDraft, graph, now } = input;
  if (media.artId !== "FULL_TIME" || !Number.isFinite(now)) return null;
  const renderedFacts = factualRenderedFacts(input.snapshot);
  const canonicalFacts = projectStudioFullTimeRenderedFactsV1(finalDraft);
  if (!renderedFacts || !canonicalFacts || !sameStudioFullTimeRenderedFacts(renderedFacts, canonicalFacts)) return null;

  const fixtureIds = media.provenance.fixtureIds;
  const teamIds = media.provenance.teamIds;
  const playerIds = media.provenance.playerIds;
  const topPlayerId = finalDraft.topMatchCard.card.canonicalPlayerId;
  const homeClub = graph.clubs.find((row) => row.id === graph.fixture.homeClubId);
  const awayClub = graph.clubs.find((row) => row.id === graph.fixture.awayClubId);
  if (fixtureIds.length !== 1 || teamIds.length !== 2 || playerIds.length !== 1
    || graph.fixture.id !== fixtureIds[0]
    || graph.competition.id !== media.provenance.competitionId
    || graph.season.id !== media.provenance.seasonId
    || graph.season.competitionId !== graph.competition.id
    || graph.fixture.competitionId !== graph.competition.id
    || graph.fixture.seasonId !== graph.season.id
    || !sameSet([graph.fixture.homeClubId, graph.fixture.awayClubId], teamIds)
    || !sameSet(graph.clubs.map((row) => row.id), teamIds)
    || !sameSet(graph.players.map((row) => row.id), playerIds)
    || graph.fixture.providerId !== finalDraft.fixtureId
    || graph.season.providerId !== finalDraft.seasonProviderId
    || homeClub?.providerId !== finalDraft.home.teamId
    || awayClub?.providerId !== finalDraft.away.teamId
    || graph.fixture.homeScore !== finalDraft.score.home
    || graph.fixture.awayScore !== finalDraft.score.away
    || !/^(?:FT|FINISHED|FULL[ _-]?TIME)$/i.test(graph.fixture.status.trim())
    || !/^(?:FT|FINISHED|FULL[ _-]?TIME)$/i.test(finalDraft.status.trim())
    || topPlayerId !== renderedFacts.featured.canonicalPlayerId
    || !topPlayerId || !playerIds.includes(topPlayerId)
    || graph.players[0]?.providerId !== renderedFacts.featured.providerPlayerId
    || ![homeClub?.providerId, awayClub?.providerId].includes(renderedFacts.featured.providerTeamId)
    || !SHA256.test(finalDraft.sourceRevisionChecksum)) return null;

  const memberships = graph.activeMemberships.filter((row) => playerIds.includes(row.playerId));
  const publications = graph.publishedCards.filter((row) => playerIds.includes(row.playerId));
  if (memberships.length !== playerIds.length || publications.length !== playerIds.length
    || !playerIds.every((playerId) => {
      const membership = memberships.find((row) => row.playerId === playerId);
      const publication = publications.find((row) => row.playerId === playerId);
      const player = graph.players.find((row) => row.id === playerId);
      return Boolean(membership && publication && teamIds.includes(membership.clubId)
        && membership.competitionId === graph.competition.id
        && publication.competitionId === graph.competition.id
        && player?.currentClubId === membership.clubId
        && graph.clubs.find((club) => club.id === membership.clubId)?.providerId === renderedFacts.featured.providerTeamId
        && publication.membershipId === membership.id);
    })) return null;

  const identities = [graph.competition, graph.season, graph.fixture, ...graph.clubs, ...graph.players];
  if (identities.some((row) => !numericId(row.providerId))) return null;
  const providerIds = Object.fromEntries(identities.map((row) => [row.id, row.providerId]));
  if (Object.keys(providerIds).length !== identities.length) return null;

  const mediaUntil = Date.parse(media.provenance.validUntil);
  const validUntil = Math.min(mediaUntil, now + 60_000);
  if (!Number.isFinite(mediaUntil) || validUntil <= now) return null;
  return {
    binding: {
      source: media.provenance.source,
      snapshotSha256: media.provenance.snapshotSha256,
      competitionId: media.provenance.competitionId,
      seasonId: media.provenance.seasonId,
      fixtureIds: [...fixtureIds],
      teamIds: [...teamIds],
      playerIds: [...playerIds],
    },
    checkedAt: new Date(now).toISOString(),
    validUntil: new Date(validUntil).toISOString(),
    sourceRevisionChecksum: finalDraft.sourceRevisionChecksum,
    providerIds,
    publishedPlayerIds: [...playerIds],
    activePlayerClubs: Object.fromEntries(memberships.map((row) => [row.playerId, row.clubId])),
  };
}

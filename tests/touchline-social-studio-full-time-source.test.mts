import assert from "node:assert/strict";
import test from "node:test";

import { buildStudioFullTimePublishedSourceProof, type StudioFullTimeIdentityGraph } from "../lib/touchlineArena/social-studio-full-time-source.ts";
import { projectStudioFullTimeRenderedFactsV1 } from "../lib/touchlineArena/social-studio-full-time-rendered-facts.ts";
import type { StudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";
import type { TouchlineSocialFinalScoreDraft } from "../lib/touchlineArena/social-final-score-draft-server.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = `sha256:${"a".repeat(64)}`;
const now = Date.parse("2026-09-15T10:00:00Z");
const media = {
  artId: "FULL_TIME",
  placement: "FEED",
  provenance: {
    source: "PERSISTED_SPORTMONKS_FINAL_MATCH_REVIEW",
    snapshotSha256: sha,
    competitionId: id(1),
    seasonId: id(2),
    fixtureIds: [id(3)],
    teamIds: [id(4), id(5)],
    playerIds: [id(6)],
    validUntil: "2026-09-15T11:00:00Z",
  },
} as unknown as StudioMedia;
const finalDraft = {
  fixtureId: "19722168",
  seasonProviderId: "28083",
  sourceRevisionChecksum: sha,
  status: "Full Time",
  startsAt: "2026-09-14T15:00:00.000Z",
  gameweekNumber: 4,
  venue: { name: "Elland Road", interiorImageUrl: "/venue.webp" },
  home: { teamId: "71", name: "Leeds United", logoUrl: "/leeds.svg", accent: "#fff" },
  away: { teamId: "20", name: "Newcastle United", logoUrl: "/newcastle.svg", accent: "#000" },
  score: { home: 4, away: 1 },
  goals: [],
  topMatchCard: {
    card: {
      id: "5141", providerPlayerId: "5141", canonicalPlayerId: id(6), name: "Dominic Calvert-Lewin",
      clubName: "Leeds United", shirtNumber: 9, cardTier: "diamond-gold",
      editorialCard: { tierKey: "diamond-gold" }, marketValue: "€55m", seasonTotalRating: 20.85,
      seasonStats: { goals: 4, assists: 1, defense: 0, yellowcards: 0 },
    },
    team: { teamId: "71", name: "Leeds United" },
    officialMatchRating: 7.68,
  },
} as unknown as TouchlineSocialFinalScoreDraft;
const projected = projectStudioFullTimeRenderedFactsV1(finalDraft);
assert.ok(projected);
const snapshot = { factualData: { fullTime: projected } };
const graph = (): StudioFullTimeIdentityGraph => ({
  competition: { id: id(1), providerId: "8" },
  season: { id: id(2), providerId: "28083", competitionId: id(1) },
  fixture: {
    id: id(3), providerId: "19722168", competitionId: id(1), seasonId: id(2),
    roundId: id(7), homeClubId: id(4), awayClubId: id(5), status: "Full Time",
    homeScore: 4, awayScore: 1,
  },
  clubs: [{ id: id(4), providerId: "71" }, { id: id(5), providerId: "20" }],
  players: [{ id: id(6), providerId: "5141", currentClubId: id(4) }],
  activeMemberships: [{ id: id(8), playerId: id(6), clubId: id(4), competitionId: id(1) }],
  publishedCards: [{ playerId: id(6), membershipId: id(8), competitionId: id(1) }],
});

test("FULL_TIME proof binds exact canonical identities, publication and active membership", () => {
  const proof = buildStudioFullTimePublishedSourceProof({ media, snapshot, finalDraft, graph: graph(), now });
  assert.ok(proof);
  assert.equal(proof.providerIds[id(3)], "19722168");
  assert.deepEqual(proof.publishedPlayerIds, [id(6)]);
  assert.equal(proof.activePlayerClubs[id(6)], id(4));
  assert.equal(proof.validUntil, "2026-09-15T10:01:00.000Z", "lease is limited to 60 seconds");
});

test("FULL_TIME proof fails closed on score, provider, club, membership and publication drift", () => {
  const cases = [
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, fixture: { ...candidate.fixture, homeScore: 3 } }),
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, fixture: { ...candidate.fixture, status: "LIVE" } }),
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, clubs: [{ ...candidate.clubs[0], providerId: "999" }, candidate.clubs[1]] }),
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, players: [{ ...candidate.players[0], providerId: "999" }] }),
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, players: [{ ...candidate.players[0], currentClubId: id(5) }] }),
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, activeMemberships: [{ ...candidate.activeMemberships[0], competitionId: id(9) }] }),
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, publishedCards: [{ ...candidate.publishedCards[0], competitionId: id(9) }] }),
    (candidate: StudioFullTimeIdentityGraph) => ({ ...candidate, publishedCards: [{ ...candidate.publishedCards[0], membershipId: id(9) }] }),
  ];
  for (const mutate of cases) {
    assert.equal(buildStudioFullTimePublishedSourceProof({ media, snapshot, finalDraft, graph: mutate(graph()), now }), null);
  }
  const badSnapshot = structuredClone(snapshot);
  badSnapshot.factualData.fullTime.featured.providerPlayerId = "999";
  assert.equal(buildStudioFullTimePublishedSourceProof({ media, snapshot: badSnapshot, finalDraft, graph: graph(), now }), null);
  const liveSnapshot = structuredClone(snapshot);
  liveSnapshot.factualData.fullTime.fixture.status = "LIVE";
  assert.equal(buildStudioFullTimePublishedSourceProof({ media, snapshot: liveSnapshot, finalDraft, graph: graph(), now }), null);
  const wrongRating = structuredClone(snapshot);
  wrongRating.factualData.fullTime.featured.officialMatchRating = 9.99;
  assert.equal(buildStudioFullTimePublishedSourceProof({ media, snapshot: wrongRating, finalDraft, graph: graph(), now }), null);
  const wrongFeaturedClub = structuredClone(snapshot);
  wrongFeaturedClub.factualData.fullTime.featured.providerTeamId = "20";
  assert.equal(buildStudioFullTimePublishedSourceProof({ media, snapshot: wrongFeaturedClub, finalDraft, graph: graph(), now }), null);
  const extraUnprovenFacts = structuredClone(snapshot);
  Object.assign(extraUnprovenFacts.factualData, { settlement: { settlement_status: "provisional" } });
  assert.equal(buildStudioFullTimePublishedSourceProof({ media, snapshot: extraUnprovenFacts, finalDraft, graph: graph(), now }), null);
});

test("FULL_TIME proof rejects broader manifests and expired source leases", () => {
  const broad = structuredClone(media) as StudioMedia;
  broad.provenance.playerIds.push(id(9));
  assert.equal(buildStudioFullTimePublishedSourceProof({ media: broad, snapshot, finalDraft, graph: graph(), now }), null);
  assert.equal(buildStudioFullTimePublishedSourceProof({
    media,
    snapshot,
    finalDraft,
    graph: graph(),
    now: Date.parse(media.provenance.validUntil),
  }), null);
});

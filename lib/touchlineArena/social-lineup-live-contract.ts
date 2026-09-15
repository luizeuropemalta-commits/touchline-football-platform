export const SOCIAL_LINEUP_LIVE_LOOP_MS = 6000;
export type SocialLineupLiveMember = {
  providerPlayerId: string; canonicalPlayerId: string; name: string; officialShirt: number;
  formationPosition: number | null; position: string; starter: boolean;
  currentClubId: string; publicationClubId: string; publicationStatus: string;
  publishedShirt: number; publishedTier: string; publicationVersion: number; currentMembershipId: string;
};
export type SocialLineupLiveReference = {
  artId: "LINEUP"; version: string; mode: "RETROSPECTIVE_VISUAL_REVIEW"; fetchedAt: string; validUntil: string;
  projectRef: string; fixtureId: string; fixtureUuid: string; competitionId: string; seasonId: string;
  providerSeasonId: string; teamId: string; teamUuid: string; homeTeamId: string; awayTeamId: string;
  startsAt: string; status: string; score: { home: number; away: number }; gameweekNumber: number;
  dateLabel: string; formation: string; formationSource: string; officialReportFormation: string;
  formationAgreement: boolean; formationReview: string; firstObservedAt: string; providerPublishedAt: string | null;
  observationBasis: string; providerPublicationTimestampAvailable: boolean; sourceSyncedAt: string;
  coach: { name: string; providerId: string; teamId: string; sourceUrl: string };
  officialSources: { url: string; scope: string; articleDate: string; retrievedAt: string }[];
  members: SocialLineupLiveMember[]; caption: string; approval: Record<string, string | boolean>; metricPolicy: string;
};

/** A real retrospective preview is not a dispatch authorisation or a template approval. */
export function assessSocialLineupLiveReference(input: SocialLineupLiveReference, now: number) {
  const fail = (reason: string) => ({ reviewable: false, publishable: false, reason });
  if (!Number.isFinite(now) || input.mode !== "RETROSPECTIVE_VISUAL_REVIEW" || input.status !== "Full Time"
    || input.projectRef !== "xgxbwqxjssxxuihuwmgy" || input.providerSeasonId !== "28083"
    || input.competitionId !== "ce833f5a-4121-47d7-86f6-2e37f2f74a2a"
    || input.seasonId !== "1e83121b-b778-459b-b9a0-7cf1eaff5729") return fail("WRONG_SOURCE_SCOPE");
  const dates = [input.startsAt, input.firstObservedAt, input.fetchedAt, input.validUntil].map(Date.parse);
  if (!dates.every(Number.isFinite) || dates[0] > now || dates[1] > dates[0] || dates[2] > now || dates[3] <= now) return fail("REFERENCE_EXPIRED_OR_INVALID_TIME");
  if (![input.homeTeamId, input.awayTeamId].includes(input.teamId) || !input.coach.name
    || input.coach.teamId !== input.teamId || !input.coach.sourceUrl.startsWith("https://")) return fail("TEAM_OR_COACH_IDENTITY_INVALID");
  if (input.providerPublishedAt !== null && !input.providerPublicationTimestampAvailable) return fail("PUBLICATION_TIME_MUST_NOT_BE_INVENTED");
  const starters = input.members.filter(member => member.starter), bench = input.members.filter(member => !member.starter);
  if (starters.length !== 11 || bench.length !== 9 || new Set(input.members.map(m => m.providerPlayerId)).size !== 20
    || new Set(input.members.map(m => m.canonicalPlayerId)).size !== 20 || new Set(starters.map(m => m.formationPosition)).size !== 11
    || starters.some(m => !Number.isInteger(m.formationPosition) || m.formationPosition! < 1 || m.formationPosition! > 11)) return fail("EXACT_11_PLUS_9_REQUIRED");
  if (input.members.some(m => !/^\d+$/.test(m.providerPlayerId) || !m.canonicalPlayerId || !m.name || !m.position
    || !Number.isInteger(m.officialShirt) || m.officialShirt < 1 || m.officialShirt > 99 || m.officialShirt !== m.publishedShirt
    || m.currentClubId !== input.teamUuid || m.publicationClubId !== input.teamUuid || m.publicationStatus !== "published"
    || !m.currentMembershipId || !m.publishedTier)) return fail("PUBLISHED_CARD_MEMBERSHIP_CONFLICT");
  if (!input.formationAgreement && (!input.officialReportFormation || input.formationSource !== "PERSISTED_SPORTMONKS")) return fail("FORMATION_DISAGREEMENT_NOT_DISCLOSED");
  return { reviewable: true, publishable: false, reason: input.formationAgreement ? "RETROSPECTIVE_REVIEW_ONLY" : "REVIEW_ONLY_FORMATION_SOURCE_DISAGREEMENT" };
}

type RenderedCard = { id: string; canonicalPlayerId?: string | null; shirtNumber: number | null; cardTier?: string; editorialCard?: { tierKey: string } | null };
export function assessSocialLineupLiveRendered(input: SocialLineupLiveReference, draft: {
  fixtureId: string; seasonId: string; startsAt: string; lineupAvailableAt: string; formation: string;
  club: { teamId: string }; home: { teamId: string }; away: { teamId: string };
  score: { home: number; away: number } | null; coach: { identity: { coach: { providerId: string; name: string } } };
  players: readonly { card: RenderedCard }[]; bench: readonly RenderedCard[];
}) {
  if (draft.fixtureId !== input.fixtureId || draft.seasonId !== input.providerSeasonId || draft.club.teamId !== input.teamId
    || draft.home.teamId !== input.homeTeamId || draft.away.teamId !== input.awayTeamId || draft.formation !== input.formation
    || Date.parse(draft.startsAt) !== Date.parse(input.startsAt) || Date.parse(draft.lineupAvailableAt) !== Date.parse(input.firstObservedAt)
    || draft.score?.home !== input.score.home || draft.score?.away !== input.score.away
    || draft.coach.identity.coach.providerId !== input.coach.providerId || draft.coach.identity.coach.name !== input.coach.name) return "RENDERED_FIXTURE_OR_COACH_CONFLICT";
  for (const starter of [true, false]) {
    const expected = input.members.filter(m => m.starter === starter).sort((a, b) => (a.formationPosition ?? 0) - (b.formationPosition ?? 0));
    const cards = starter ? draft.players.map(p => p.card) : draft.bench;
    if (cards.length !== expected.length || new Set(cards.map(c => c.id)).size !== cards.length) return "RENDERED_SHEET_INCOMPLETE";
    for (const [index, card] of cards.entries()) {
      const fact = starter ? expected[index] : expected.find(m => m.providerPlayerId === card.id);
      if (!fact || card.id !== fact.providerPlayerId || card.canonicalPlayerId !== fact.canonicalPlayerId || card.shirtNumber !== fact.officialShirt
        || card.editorialCard?.tierKey !== fact.publishedTier || card.cardTier !== fact.publishedTier) return "RENDERED_CARD_OR_FORMATION_ORDER_CONFLICT";
    }
  }
  return null;
}

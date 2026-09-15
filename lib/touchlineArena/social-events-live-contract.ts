import { classifyTouchlineConfirmedMatchEvent, parseTouchlineEventScore } from "./social-confirmed-event-contract.ts";

export const EVENTS_LIVE_ART_IDS = ["GOAL_CONFIRMED", "OWN_GOAL", "HAT_TRICK_HERO", "RED_CARD_CONFIRMED", "FULL_TIME"] as const;
export type EventsLiveArtId = typeof EVENTS_LIVE_ART_IDS[number];
export const EVENTS_LIVE_LOOP_MS = 6000;
export type EventsLiveMoment = {
  eventId: string; kind: "goal" | "own-goal" | "penalty" | "red-card";
  minute: number; extraMinute: number | null;
};
export type EventsLiveEvidence = {
  artId: EventsLiveArtId; fixtureId: string; providerFixtureId: string; startsAt: string;
  fixtureStatus: string; finalizedAt: string; homeTeamId: string; awayTeamId: string;
  finalScore: { home: number; away: number }; eventIds: string[];
  playerId: string; playerProviderId: string; playerTeamId: string; cardPublished: boolean;
  confirmationState: string | null;
  events: { id: string; playerId: string | null; providerPlayerId: string | null; teamId: string;
    type: string; status: string; info: string | null; addition: string | null;
    minute: number; extraMinute: number | null; result: string | null }[];
};

/** Review of a finished real match is independent of authorisation to dispatch a live event. */
export function assessEventsLiveReview(fact: EventsLiveEvidence, now: number) {
  const fail = (reason: string) => ({ reviewable: false as const, automation: "BLOCKED" as const, publishable: false as const, reason });
  if (!EVENTS_LIVE_ART_IDS.includes(fact.artId) || !Number.isFinite(now)
    || !Number.isFinite(Date.parse(fact.startsAt)) || Date.parse(fact.startsAt) > now
    || !Number.isFinite(Date.parse(fact.finalizedAt)) || Date.parse(fact.finalizedAt) > now
    || !["Full Time", "FT", "AET", "FT_PEN"].includes(fact.fixtureStatus)) return fail("FINAL_FIXTURE_REQUIRED");
  if (!fact.cardPublished || !fact.playerId || !fact.playerProviderId
    || ![fact.homeTeamId, fact.awayTeamId].includes(fact.playerTeamId)) return fail("CANONICAL_PUBLISHED_CARD_REQUIRED");
  const ordered = [...fact.events].sort((a, b) => a.minute - b.minute || (a.extraMinute ?? 0) - (b.extraMinute ?? 0) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  let score = { home: 0, away: 0 };
  const goals: { id: string; playerId: string | null; kind: string; scoringTeamId: string }[] = [];
  for (const event of ordered) {
    if (seen.has(event.id)) return fail("DUPLICATE_EVENT_ID");
    seen.add(event.id);
    const kind = classifyTouchlineConfirmedMatchEvent(event);
    if (!kind || !["goal", "penalty", "own-goal"].includes(kind)) continue;
    const next = parseTouchlineEventScore(event.result);
    if (!next) return fail("GOAL_SCORE_MISSING");
    const dh = next.home - score.home, da = next.away - score.away;
    if (!((dh === 1 && da === 0) || (dh === 0 && da === 1))) return fail("GOAL_SCORE_CONFLICT");
    const scoringTeamId = dh === 1 ? fact.homeTeamId : fact.awayTeamId;
    if (event.teamId !== scoringTeamId) return fail("SCORING_CLUB_CONFLICT");
    goals.push({ id: event.id, playerId: event.playerId, kind, scoringTeamId });
    score = next;
  }
  if (score.home !== fact.finalScore.home || score.away !== fact.finalScore.away) return fail("FINAL_SCORE_CONFLICT");
  if (fact.artId !== "FULL_TIME") {
    const targets = fact.eventIds.map(id => ordered.find(event => event.id === id));
    if (!targets.length || targets.some(event => !event || event.playerId !== fact.playerId || event.providerPlayerId !== fact.playerProviderId
      || !classifyTouchlineConfirmedMatchEvent(event))) return fail("EVENT_IDENTITY_OR_CONFIRMATION_CONFLICT");
    if (fact.artId === "HAT_TRICK_HERO") {
      const credited = goals.filter(event => fact.eventIds.includes(event.id) && event.playerId === fact.playerId
        && event.kind !== "own-goal" && event.scoringTeamId === fact.playerTeamId);
      if (new Set(fact.eventIds).size !== 3 || credited.length !== 3) return fail("THREE_CREDITED_GOALS_REQUIRED");
    } else if (fact.artId === "OWN_GOAL") {
      const target = goals.find(event => event.id === fact.eventIds[0]);
      if (fact.eventIds.length !== 1 || target?.kind !== "own-goal" || target.scoringTeamId === fact.playerTeamId) return fail("OWN_GOAL_CLUB_CONFLICT");
    } else if (fact.artId === "GOAL_CONFIRMED") {
      const target = goals.find(event => event.id === fact.eventIds[0]);
      if (fact.eventIds.length !== 1 || !target || !["goal", "penalty"].includes(target.kind) || target.scoringTeamId !== fact.playerTeamId) return fail("SCORER_CLUB_CONFLICT");
    } else if (fact.artId === "RED_CARD_CONFIRMED") {
      if (fact.eventIds.length !== 1 || !["red-card", "second-yellow-red"].includes(classifyTouchlineConfirmedMatchEvent(targets[0]!) ?? "")
        || targets[0]!.teamId !== fact.playerTeamId) return fail("DISMISSAL_REQUIRED");
    }
  }
  return { reviewable: true as const, automation: "BLOCKED" as const, publishable: false as const,
    reason: fact.artId === "FULL_TIME" || fact.confirmationState === "CONFIRMED" ? "RETROSPECTIVE_REVIEW_ONLY" : "RETROSPECTIVE_REVIEW_ONLY_NO_043_ATTESTATION" };
}

export function eventsLiveFrame(frameMs: number) {
  if (!Number.isFinite(frameMs)) throw new Error("INVALID_FRAME_TIME");
  return ((frameMs % EVENTS_LIVE_LOOP_MS) + EVENTS_LIVE_LOOP_MS) % EVENTS_LIVE_LOOP_MS;
}

/** Bind rendered identities/minutes/score to the audited event evidence, not merely to a declared source label. */
export function assessEventsLivePresentation(input: {
  artId: EventsLiveArtId; evidence: EventsLiveEvidence; home: { teamId: string }; away: { teamId: string };
  playerClub: { teamId: string }; playerCard: { canonicalPlayerId?: string | null; sportmonksPlayerId?: string };
  score: { home: number; away: number }; finalScore: { home: number; away: number };
  moments: EventsLiveMoment[];
}, now: number) {
  const state = assessEventsLiveReview(input.evidence, now);
  if (!state.reviewable) return state;
  const fact = input.evidence;
  let expected = fact.finalScore;
  if (fact.artId !== "FULL_TIME") {
    const ordered = [...fact.events].sort((a, b) => a.minute - b.minute || (a.extraMinute ?? 0) - (b.extraMinute ?? 0) || a.id.localeCompare(b.id));
    const terminal = ordered.findIndex(event => event.id === fact.eventIds.at(-1));
    const lastGoal = ordered.slice(0, terminal + 1).reverse().find(event => ["goal", "penalty", "own-goal"].includes(classifyTouchlineConfirmedMatchEvent(event) ?? ""));
    expected = lastGoal ? parseTouchlineEventScore(lastGoal.result)! : { home: 0, away: 0 };
  }
  if (input.artId !== fact.artId || input.home.teamId !== fact.homeTeamId || input.away.teamId !== fact.awayTeamId
    || input.playerClub.teamId !== fact.playerTeamId || input.playerCard.canonicalPlayerId !== fact.playerId
    || input.playerCard.sportmonksPlayerId !== fact.playerProviderId
    || input.score.home !== expected.home || input.score.away !== expected.away
    || input.finalScore.home !== fact.finalScore.home || input.finalScore.away !== fact.finalScore.away
    || input.moments.length !== fact.eventIds.length || input.moments.some((moment, index) => {
      const event = fact.events.find(event => event.id === fact.eventIds[index]);
      return !event || moment.eventId !== event.id || moment.minute !== event.minute || moment.extraMinute !== event.extraMinute;
    })) return { reviewable: false as const, automation: "BLOCKED" as const, publishable: false as const, reason: "RENDERED_FACTS_CONFLICT" };
  return state;
}

export type EventsLivePackageInput = Parameters<typeof assessEventsLivePresentation>[0] & {
  mode: string; dateLabel: string; fetchedAt: string; asOf: string; validUntil: string;
  matchRating: number; touchlinePoints: number; totalRating: null;
  playerCard: { name: string; shirtNumber?: number | null; position: string; marketValue: string | null };
  goals: { id: string; teamId: string; playerName: string; minute: number; extraMinute: number | null; kind: string }[];
  captions: { language: string; instagram: string; facebook: string; approval: string };
  destinations: { platform: string; placement: string; accountId: null; destinationResolution: string;
    editorialClub: { id: string; providerTeamId: string; name: string }; fixtureClubs: string[];
    eventRole: string; beneficiaryProviderTeamId: string | null; publishable: false }[];
  factualData: {
    cardPublication: { id: string; provider_player_id: string; current_club_id: string; provider_team_id: string;
      publication_club_id: string; publication_status: string; membership_status: string; name: string;
      jersey_number: number; detailed_position: string; market_value_eur: number; market_value_status: string; verified_season: string };
    settlement: { football_player_id: string; provider_fixture_id: string; club_id: string; rating: string;
      touchline_points: number; settlement_status: string; scoring_coverage_status: string; scoring_version: string };
    fixture: { events: { provider_event_id: string; player_name: string | null }[] };
    externalSources: { url: string; accessedAt: string }[];
  };
};

/** A valid event alone cannot bless unrelated metrics, card identity, scorers or destinations. */
export function assessEventsLivePackage(input: EventsLivePackageInput, now: number) {
  const state = assessEventsLivePresentation(input, now);
  if (!state.reviewable) return state;
  const fail = (reason: string) => ({ reviewable: false as const, automation: "BLOCKED" as const, publishable: false as const, reason });
  const dates = [input.asOf, input.fetchedAt, input.validUntil].map(Date.parse);
  if (!dates.every(Number.isFinite) || dates[0]! > dates[1]! || dates[1]! > now || dates[2]! <= now
    || dates[2]! - dates[1]! > 86400000) return fail("FACTUAL_REVIEW_EXPIRED");
  const card = input.factualData?.cardPublication, score = input.factualData?.settlement;
  if (!card || !score || card.id !== input.evidence.playerId || card.provider_player_id !== input.evidence.playerProviderId
    || card.provider_team_id !== input.playerClub.teamId || card.current_club_id !== card.publication_club_id
    || card.publication_status !== "published" || card.membership_status !== "active"
    || card.name !== input.playerCard.name || card.jersey_number !== input.playerCard.shirtNumber
    || card.detailed_position !== input.playerCard.position || card.market_value_status !== "verified" || card.verified_season !== "2026/27"
    || `€${card.market_value_eur / 1000000}m` !== input.playerCard.marketValue
    || score.football_player_id !== card.id || score.club_id !== card.current_club_id || score.provider_fixture_id !== input.evidence.providerFixtureId
    || score.settlement_status !== "final" || score.scoring_coverage_status !== "complete" || score.scoring_version !== "player_scoring_v3"
    || !Number.isFinite(Number(score.rating)) || Number(score.rating) !== input.matchRating || score.touchline_points !== input.touchlinePoints
    || input.totalRating !== null) return fail("CARD_OR_METRIC_PROVENANCE_CONFLICT");
  const goals = input.evidence.events.filter(event => ["goal", "penalty", "own-goal"].includes(classifyTouchlineConfirmedMatchEvent(event) ?? ""));
  if (input.goals.length !== goals.length || new Set(input.goals.map(goal => goal.id)).size !== goals.length || input.goals.some(goal => {
    const event = goals.find(event => event.id === goal.id);
    const raw = input.factualData.fixture.events.find(event => event.provider_event_id === goal.id);
    return !event || !raw || goal.playerName !== raw.player_name || goal.teamId !== event.teamId
      || goal.minute !== event.minute || goal.extraMinute !== event.extraMinute || goal.kind !== classifyTouchlineConfirmedMatchEvent(event);
  })) return fail("SCORER_LIST_CONFLICT");
  if (input.mode !== "RETROSPECTIVE_VISUAL_REVIEW" || input.captions?.language !== "en-GB" || input.captions.approval !== "PENDING"
    || ![input.captions.instagram, input.captions.facebook].every(caption => caption.includes(input.dateLabel) && /rewind/i.test(caption) && caption.includes("TouchLine"))
    || !input.factualData.externalSources?.length || input.factualData.externalSources.some(source => !source.url.startsWith("https://") || Date.parse(source.accessedAt) > now)) return fail("DATED_CAPTION_OR_EXTERNAL_SOURCE_REQUIRED");
  const role = input.artId === "OWN_GOAL" ? "OWN_GOAL_AUTHOR" : input.artId === "FULL_TIME" ? "FEATURED_PLAYER_CLUB" : "EVENT_PLAYER_CLUB";
  const beneficiary = input.artId === "OWN_GOAL" ? (input.playerClub.teamId === input.home.teamId ? input.away.teamId : input.home.teamId) : null;
  if (!input.destinations || input.destinations.length !== 4 || new Set(input.destinations.map(destination => `${destination.platform}:${destination.placement}`)).size !== 4
    || input.destinations.some(destination => !["INSTAGRAM", "FACEBOOK"].includes(destination.platform) || !["FEED", "STORY"].includes(destination.placement)
      || destination.accountId !== null || destination.publishable !== false || destination.destinationResolution !== "REQUIRED_BEFORE_APPROVAL"
      || destination.editorialClub.id !== card.current_club_id || destination.editorialClub.providerTeamId !== card.provider_team_id
      || destination.eventRole !== role || destination.beneficiaryProviderTeamId !== beneficiary)) return fail("DESTINATION_IDENTITY_CONFLICT");
  return state;
}

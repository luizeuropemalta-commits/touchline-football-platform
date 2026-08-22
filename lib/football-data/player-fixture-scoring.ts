import { estimateFantasyEventPoints } from "./fantasy-scoring.ts";
import type { TouchlineFantasyEvent } from "./types.ts";

export const TOUCHLINE_PLAYER_SCORING_VERSION = "player_scoring_v1";

export type TouchLinePlayerPointContribution = {
  providerEventId: string;
  role: "primary" | "assist";
  eventType: string;
  minute: number | null;
  points: number;
};

function isRecorded(event: TouchlineFantasyEvent) {
  return event.status !== "rescinded";
}

function canonicalEvents(events: readonly TouchlineFantasyEvent[]) {
  return [...new Map(events.map((event) => [event.providerId, event] as const)).values()]
    .filter(isRecorded);
}

/**
 * Event-backed football facts for one player in one fixture. Receiving the
 * complete event feed makes a zero a verified zero; callers must not invoke
 * this helper when the provider event feed is unavailable.
 */
export function touchLinePlayerFixtureEventStatistics(
  providerPlayerId: string,
  events: readonly TouchlineFantasyEvent[],
) {
  const statistics = {
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
  };
  for (const event of canonicalEvents(events)) {
    const eventType = String(event.type ?? "").trim();
    const isOwnGoal = /own\s*goal/i.test(eventType);
    if (event.playerId === providerPlayerId) {
      if (/goal/i.test(eventType) && !isOwnGoal) statistics.goals += 1;
      if (/yellow/i.test(eventType)) statistics.yellowCards += 1;
      if (/red/i.test(eventType) && !/yellow/i.test(eventType)) statistics.redCards += 1;
    }
    if (/goal/i.test(eventType) && !isOwnGoal && event.relatedPlayerId === providerPlayerId) {
      statistics.assists += 1;
    }
  }
  return statistics;
}

/**
 * Versioned player scoring derived exclusively from canonical provider events.
 * A goal contribution belongs to the primary player; its verified related
 * player receives the existing TouchLine assist score. No missing provider
 * statistic is converted into a fabricated zero-point fact here.
 */
export function touchLinePlayerFixturePoints(
  providerPlayerId: string,
  events: readonly TouchlineFantasyEvent[],
) {
  const contributions: TouchLinePlayerPointContribution[] = [];
  for (const event of canonicalEvents(events)) {
    const eventType = String(event.type ?? "").trim();
    const primaryPoints = estimateFantasyEventPoints(eventType);
    if (event.playerId === providerPlayerId && primaryPoints !== 0) {
      contributions.push({
        providerEventId: event.providerId,
        role: "primary",
        eventType,
        minute: event.minute ?? null,
        points: primaryPoints,
      });
    }
    if (/goal/i.test(eventType) && !/own\s*goal/i.test(eventType)
      && event.relatedPlayerId === providerPlayerId) {
      contributions.push({
        providerEventId: event.providerId,
        role: "assist",
        eventType: "Assist",
        minute: event.minute ?? null,
        points: estimateFantasyEventPoints("assist"),
      });
    }
  }

  return {
    scoringVersion: TOUCHLINE_PLAYER_SCORING_VERSION,
    points: contributions.reduce((total, contribution) => total + contribution.points, 0),
    contributions,
  };
}

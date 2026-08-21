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
  const canonicalEvents = [...new Map(events.map((event) => [event.providerId, event] as const)).values()];

  for (const event of canonicalEvents.filter(isRecorded)) {
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

export type TouchlinePublishedFeedPresentation = Readonly<{
  state: "available";
  fixture?: Readonly<{ homeName: string; awayName: string; homeScore: number; awayScore: number }>;
  points?: Readonly<{ label: string; value: number }>;
  leader?: Readonly<{ label: string; name: string; value: number }>;
  card?: Readonly<{ playerName: string; rating: number }>;
  event?: Readonly<{
    kind: "GOAL" | "RED_CARD";
    playerName: string;
    clubName: string;
    minute: number;
  }>;
}> | Readonly<{
  state: "unavailable";
  reason: "PUBLISHED_FACTS_UNAVAILABLE";
}>;

const text = (value: unknown, max = 120) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max
  ? value.trim()
  : null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Only a server-published object is eligible for the live feed. Missing or
 * malformed facts deliberately render an explicit unavailable state rather
 * than a guessed score, point total, leader, or card rating.
 */
export function readTouchlinePublishedFeedPresentation(value: unknown): TouchlinePublishedFeedPresentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { state: "unavailable", reason: "PUBLISHED_FACTS_UNAVAILABLE" };
  }
  const input = value as Record<string, unknown>;
  const fixtureInput = input.fixture as Record<string, unknown> | undefined;
  const pointsInput = input.points as Record<string, unknown> | undefined;
  const leaderInput = input.leader as Record<string, unknown> | undefined;
  const cardInput = input.card as Record<string, unknown> | undefined;
  const eventInput = input.event as Record<string, unknown> | undefined;
  const fixture = fixtureInput && text(fixtureInput.homeName) && text(fixtureInput.awayName)
    && finite(fixtureInput.homeScore) && finite(fixtureInput.awayScore)
    ? { homeName: text(fixtureInput.homeName)!, awayName: text(fixtureInput.awayName)!, homeScore: fixtureInput.homeScore, awayScore: fixtureInput.awayScore }
    : undefined;
  const points = pointsInput && text(pointsInput.label) && finite(pointsInput.value)
    ? { label: text(pointsInput.label)!, value: pointsInput.value }
    : undefined;
  const leader = leaderInput && text(leaderInput.label) && text(leaderInput.name) && finite(leaderInput.value)
    ? { label: text(leaderInput.label)!, name: text(leaderInput.name)!, value: leaderInput.value }
    : undefined;
  const card = cardInput && text(cardInput.playerName) && finite(cardInput.rating)
    ? { playerName: text(cardInput.playerName)!, rating: cardInput.rating }
    : undefined;
  const eventKind: "GOAL" | "RED_CARD" | null = eventInput?.kind === "GOAL" || eventInput?.kind === "RED_CARD"
    ? eventInput.kind
    : null;
  const event = eventInput
    && eventKind
    && text(eventInput.playerName)
    && text(eventInput.clubName)
    && finite(eventInput.minute)
    && Number.isInteger(eventInput.minute)
    && eventInput.minute >= 0
    && eventInput.minute <= 130
    ? { kind: eventKind, playerName: text(eventInput.playerName)!, clubName: text(eventInput.clubName)!, minute: eventInput.minute }
    : undefined;
  return fixture || points || leader || card || event
    ? { state: "available", ...(fixture ? { fixture } : {}), ...(points ? { points } : {}), ...(leader ? { leader } : {}), ...(card ? { card } : {}), ...(event ? { event } : {}) }
    : { state: "unavailable", reason: "PUBLISHED_FACTS_UNAVAILABLE" };
}

import type { TouchlineFantasyEvent } from "../football-data/types.ts";

export type MatchCardIndicator = Readonly<{
  kind: "yellow" | "red";
  eventId: string;
}>;

const providerId = (value: string | null | undefined) =>
  typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? value : null;

export function canonicalSportmonksPlayerId(
  row: Readonly<{ id?: unknown; provider?: unknown; provider_player_id?: unknown }>,
  canonicalPlayerId: string,
): string | null {
  if (row.id !== canonicalPlayerId || row.provider !== "sportmonks") return null;
  return providerId(typeof row.provider_player_id === "string" ? row.provider_player_id : null);
}

function cardKind(event: TouchlineFantasyEvent): MatchCardIndicator["kind"] | null {
  if (event.status !== "recorded" || /\b(?:var|review|pending|disallow(?:ed)?|cancel(?:led|ed)?|rescind(?:ed)?|overturn(?:ed)?)\b/i
    .test(`${event.info ?? ""} ${event.addition ?? ""}`)) return null;
  const type = String(event.type ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (["REDCARD", "YELLOWREDCARD", "SECONDYELLOWCARD", "SECONDYELLOWREDCARD"].includes(type)) return "red";
  return type === "YELLOWCARD" ? "yellow" : null;
}

/** A normal card from one exact Sportmonks match, never a season suspension.
 * A rescinded event ID wins even when an older recorded copy remains in a feed. */
export function cardShownForFixturePlayer(
  events: readonly TouchlineFantasyEvent[], fixtureId: string, playerId: string,
): MatchCardIndicator | null {
  if (!providerId(fixtureId) || !providerId(playerId)) return null;
  const rescindedIds = new Set(events.filter((event) => event.status === "rescinded"
    && event.provider === "sportmonks" && event.fixtureId === fixtureId && event.playerId === playerId)
    .map((event) => providerId(event.providerId)).filter((id): id is string => id !== null));
  let selected: MatchCardIndicator | null = null;
  for (const event of events) {
    const id = providerId(event.providerId);
    if (!id || rescindedIds.has(id) || event.provider !== "sportmonks"
      || event.fixtureId !== fixtureId || event.playerId !== playerId) continue;
    const kind = cardKind(event);
    if (kind === "red") return { kind, eventId: id };
    if (kind === "yellow" && !selected) selected = { kind, eventId: id };
  }
  return selected;
}

/** Bridge a selected TouchLine UUID to a verified Sportmonks identity.
 * The caller must still scope the feed query to the active season and round. */
export function cardShownForCanonicalPlayer(
  feed: Readonly<{ provider: string; providerFixtureId: string; events: readonly TouchlineFantasyEvent[] }> | null,
  selectedCanonicalPlayerId: string,
  card: Readonly<{ id: string; canonicalPlayerId?: string | null; providerPlayerId?: string | null }> | null,
): MatchCardIndicator | null {
  if (!feed || feed.provider !== "sportmonks" || !Array.isArray(feed.events) || !card
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedCanonicalPlayerId)
    || card.id !== selectedCanonicalPlayerId || card.canonicalPlayerId !== selectedCanonicalPlayerId
    || !providerId(card.providerPlayerId) || !providerId(feed.providerFixtureId)) return null;
  return cardShownForFixturePlayer(feed.events, feed.providerFixtureId, card.providerPlayerId!);
}

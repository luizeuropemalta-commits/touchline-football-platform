import type { TouchlineCardTierKey } from "./card-rules.ts";

export type TouchLinePlayerLinkInput = {
  sportmonksPlayerId?: string | number | null;
  /**
   * Opaque TouchLine identity for a published card. This is deliberately not
   * a Sportmonks identifier: public profile routes must never need to expose
   * a provider id in order to resolve a card presentation.
   */
  canonicalPlayerId?: string | null;
  name?: string | null;
  clubName?: string | null;
  position?: string | null;
  shirtNumber?: string | number | null;
  countryCode3?: string | null;
};

type TouchLinePlayerProfileLinkOptions = {
  previewTier?: TouchlineCardTierKey | null;
};

const TOUCHLINE_CANONICAL_PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TouchlineCanonicalProfileLink =
  | { status: "absent" }
  | { status: "valid"; canonicalPlayerId: string }
  | { status: "invalid" };

function queryValues(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

/**
 * A canonical card selector is authoritative only when it is one exact UUID.
 * A provider selector alongside it is ambiguous, so callers must fail closed
 * rather than translating either value through a display name.
 */
export function parseTouchlineCanonicalProfileLink(
  searchParams: Record<string, string | string[] | undefined>,
): TouchlineCanonicalProfileLink {
  const rawCardId = searchParams.cardId;
  if (rawCardId === undefined) return { status: "absent" };
  if (Array.isArray(rawCardId)) return { status: "invalid" };
  if (queryValues(searchParams, "playerId").length) return { status: "invalid" };

  const canonicalPlayerId = rawCardId.toLowerCase();
  if (!TOUCHLINE_CANONICAL_PLAYER_ID.test(canonicalPlayerId)) {
    return { status: "invalid" };
  }
  return { status: "valid", canonicalPlayerId };
}

export function normalizeTouchLinePlayerKey(value?: string | number | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTouchLineProviderPlayerId(value?: string | number | null) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(?:sportmonks:)?(\d+)$/i);
  return match?.[1] ?? null;
}

export function resolveTouchLineOfficialLookup(input: {
  providerPlayerId?: string | number | null;
  requestedName?: string | null;
  fallbackName: string;
}) {
  const providerPlayerId = normalizeTouchLineProviderPlayerId(input.providerPlayerId);
  const requestedName = String(input.requestedName ?? "").trim();

  return {
    providerPlayerId,
    name: providerPlayerId && requestedName
      ? requestedName
      : input.fallbackName.trim(),
  };
}

export function touchlinePlayerProfileHref(
  player: TouchLinePlayerLinkInput,
  locale?: string | null,
  options?: TouchLinePlayerProfileLinkOptions,
) {
  const slug =
    normalizeTouchLinePlayerKey(player.name) ||
    normalizeTouchLinePlayerKey(player.sportmonksPlayerId) ||
    "player";
  const params = new URLSearchParams();

  if (locale) params.set("lang", locale);
  if (player.name) params.set("name", String(player.name));
  if (player.clubName) params.set("club", String(player.clubName));
  if (player.position) params.set("position", String(player.position));
  if (player.shirtNumber !== null && player.shirtNumber !== undefined) {
    params.set("shirt", String(player.shirtNumber));
  }
  if (player.countryCode3) params.set("country", String(player.countryCode3));
  if (player.sportmonksPlayerId !== null && player.sportmonksPlayerId !== undefined) {
    params.set("playerId", String(player.sportmonksPlayerId));
  }
  const canonicalPlayerId = String(player.canonicalPlayerId ?? "").toLowerCase();
  if (TOUCHLINE_CANONICAL_PLAYER_ID.test(canonicalPlayerId) && !params.has("playerId")) {
    params.set("cardId", canonicalPlayerId);
  }
  if (options?.previewTier) params.set("previewTier", options.previewTier);

  const query = params.toString();
  return `/touchline-players/${slug}${query ? `?${query}` : ""}`;
}

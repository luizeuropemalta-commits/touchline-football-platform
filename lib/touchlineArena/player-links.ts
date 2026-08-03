import type { TouchlineCardTierKey } from "./card-rules.ts";

export type TouchLinePlayerLinkInput = {
  sportmonksPlayerId?: string | number | null;
  name?: string | null;
  clubName?: string | null;
  position?: string | null;
  shirtNumber?: string | number | null;
  countryCode3?: string | null;
};

type TouchLinePlayerProfileLinkOptions = {
  previewTier?: TouchlineCardTierKey | null;
};

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
  if (options?.previewTier) params.set("previewTier", options.previewTier);

  const query = params.toString();
  return `/touchline-players/${slug}${query ? `?${query}` : ""}`;
}

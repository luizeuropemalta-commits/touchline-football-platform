import { resolveTouchLinePresentationLocale } from "./root-locale.ts";

export const TOUCHLINE_ARENA_PANEL_KEYS = [
  "live",
  "bench",
  "market",
  "rankings",
  "news",
  "watch",
  "formation",
] as const;

export type TouchlineArenaPanelKey = (typeof TOUCHLINE_ARENA_PANEL_KEYS)[number];

export function touchlineArenaHref(locale: string) {
  return `/arena?lang=${encodeURIComponent(resolveTouchLinePresentationLocale(locale))}`;
}

export function touchlineArenaDemoHref(locale: string) {
  const params = new URLSearchParams({
    demoLineup: "1",
    skipIntro: "1",
    lang: resolveTouchLinePresentationLocale(locale),
  });
  return `/arena?${params.toString()}`;
}

/**
 * Opens the ClubHub discovery directory unless a caller has an explicit club
 * context. A generic navigation affordance must never quietly choose a club
 * for the visitor.
 */
export function touchlineClubHubHref(locale: string, clubSlug?: string | null) {
  const lang = encodeURIComponent(resolveTouchLinePresentationLocale(locale));
  const contextualSlug = clubSlug?.trim();

  return contextualSlug
    ? `/touchline-clubs/${encodeURIComponent(contextualSlug)}?lang=${lang}`
    : `/touchline-clubs?lang=${lang}`;
}

export function parseTouchlineArenaPanel(value?: string | string[] | null): TouchlineArenaPanelKey | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return TOUCHLINE_ARENA_PANEL_KEYS.includes(candidate as TouchlineArenaPanelKey)
    ? candidate as TouchlineArenaPanelKey
    : null;
}

export function touchlineArenaPanelHref(panel: TouchlineArenaPanelKey, locale: string) {
  const effectiveLocale = resolveTouchLinePresentationLocale(locale);
  const lang = `lang=${encodeURIComponent(effectiveLocale)}`;
  if (panel === "market") return `/my-club?${lang}`;
  // A ClubOwner owns exactly one playable XI. The former quick-substitution
  // bench required a hidden second squad and could expose an impossible
  // 10/11 setup. Keep old links safe, but land them in the one position-led
  // workspace where a card is replaced in its own eligible slot.
  if (panel === "bench" || panel === "formation") return `/my-club?${lang}#my-club-squad`;
  if (panel === "live" || panel === "watch") return `/live?${lang}`;
  if (panel === "rankings") return `/touchline-tables?${lang}`;
  // News is an Arena surface, not a second owner profile destination.
  return `/arena?${lang}`;
}

export function touchlineArenaContractHref(input: {
  locale: string;
  playerId: string | number;
  playerName: string;
  clubId?: string | number | null;
}) {
  return `/my-club?lang=${encodeURIComponent(resolveTouchLinePresentationLocale(input.locale))}`;
}

export function touchlineArenaPanelUrl(currentUrl: string, panel: TouchlineArenaPanelKey | null) {
  const url = new URL(currentUrl, "https://touchline.local");
  if (panel) {
    url.searchParams.set("panel", panel);
  } else {
    url.searchParams.delete("panel");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

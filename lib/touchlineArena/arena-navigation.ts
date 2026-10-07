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

export function touchlineArenaHref(locale: string, draftLocalesEnabled = false) {
  return `/clubowner?lang=${encodeURIComponent(resolveTouchLinePresentationLocale(locale, draftLocalesEnabled))}`;
}

export function touchlineArenaDemoHref(locale: string, draftLocalesEnabled = false) {
  const params = new URLSearchParams({
    lang: resolveTouchLinePresentationLocale(locale, draftLocalesEnabled),
  });
  return `/clubowner?${params.toString()}`;
}

/**
 * Opens the ClubHub discovery directory unless a caller has an explicit club
 * context. A generic navigation affordance must never quietly choose a club
 * for the visitor.
 */
export function touchlineClubHubHref(locale: string, clubSlug?: string | null, draftLocalesEnabled = false) {
  const lang = encodeURIComponent(resolveTouchLinePresentationLocale(locale, draftLocalesEnabled));
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

export function touchlineArenaPanelHref(panel: TouchlineArenaPanelKey, locale: string, draftLocalesEnabled = false) {
  const effectiveLocale = resolveTouchLinePresentationLocale(locale, draftLocalesEnabled);
  const lang = `lang=${encodeURIComponent(effectiveLocale)}`;
  if (panel === "market") return `/clubowner?${lang}`;
  // A ClubOwner owns exactly one playable XI. The former quick-substitution
  // bench required a hidden second squad and could expose an impossible
  // 10/11 setup. Keep old links safe, but land them in the one position-led
  // workspace where a card is replaced in its own eligible slot.
  if (panel === "bench" || panel === "formation") return `/clubowner?${lang}#my-club-xi-pitch`;
  if (panel === "live" || panel === "watch") return `/live?${lang}`;
  if (panel === "rankings") return `/rankings?${lang}`;
  return `/live?${lang}`;
}

export function touchlineArenaContractHref(input: {
  locale: string;
  playerId: string | number;
  playerName: string;
  clubId?: string | number | null;
}, draftLocalesEnabled = false) {
  return `/clubowner?lang=${encodeURIComponent(resolveTouchLinePresentationLocale(input.locale, draftLocalesEnabled))}`;
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

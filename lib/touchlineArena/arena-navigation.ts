import { touchlineClubOwnerProfileHref, touchlineClubOwnerSubstitutionHref } from "./club-owner-routes.ts";
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
  if (panel === "market") return `/market-transfer?${lang}`;
  // Quick Substitution is an Arena action: it overlays the live Arena field
  // and temporarily replaces the score rail. Keep the historical Training
  // Centre route for formation management only.
  if (panel === "bench") return `/arena?panel=bench&${lang}`;
  if (panel === "formation") return touchlineClubOwnerSubstitutionHref(effectiveLocale);
  if (panel === "live" || panel === "watch") return `/live?${lang}`;
  if (panel === "rankings") return `/touchline-tables?${lang}`;
  return touchlineClubOwnerProfileHref(effectiveLocale);
}

export function touchlineArenaContractHref(input: {
  locale: string;
  playerId: string | number;
  playerName: string;
  clubId?: string | number | null;
}) {
  const params = new URLSearchParams({
    lang: resolveTouchLinePresentationLocale(input.locale),
    contractPlayer: String(input.playerId),
    contractName: input.playerName,
  });
  if (input.clubId !== null && input.clubId !== undefined && String(input.clubId).trim()) {
    params.set("contractClub", String(input.clubId));
  }
  return `/market-transfer?${params.toString()}`;
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

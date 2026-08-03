import { touchlineClubOwnerProfileHref, touchlineClubOwnerSubstitutionHref } from "./club-owner-routes.ts";

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
  return `/arena?lang=${encodeURIComponent(locale)}`;
}

export function touchlineArenaDemoHref(locale: string) {
  const params = new URLSearchParams({
    demoLineup: "1",
    skipIntro: "1",
    lang: locale,
  });
  return `/arena?${params.toString()}`;
}

export function touchlineClubHubHref(locale: string, clubSlug = "manchester-united") {
  return `/touchline-clubs/${encodeURIComponent(clubSlug)}?lang=${encodeURIComponent(locale)}`;
}

export function parseTouchlineArenaPanel(value?: string | string[] | null): TouchlineArenaPanelKey | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return TOUCHLINE_ARENA_PANEL_KEYS.includes(candidate as TouchlineArenaPanelKey)
    ? candidate as TouchlineArenaPanelKey
    : null;
}

export function touchlineArenaPanelHref(panel: TouchlineArenaPanelKey, locale: string) {
  const lang = `lang=${encodeURIComponent(locale)}`;
  if (panel === "market") return `/market-transfer?${lang}`;
  if (panel === "bench" || panel === "formation") return touchlineClubOwnerSubstitutionHref(locale);
  if (panel === "live" || panel === "watch") return `/live?${lang}`;
  if (panel === "rankings") return `/touchline-tables?${lang}`;
  return touchlineClubOwnerProfileHref(locale);
}

export function touchlineArenaContractHref(input: {
  locale: string;
  playerId: string | number;
  playerName: string;
  clubId?: string | number | null;
}) {
  const params = new URLSearchParams({
    lang: input.locale,
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

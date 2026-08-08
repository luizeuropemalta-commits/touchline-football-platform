import { resolveTouchLinePresentationLocale } from "./root-locale.ts";

export const TOUCHLINE_CLUB_OWNER_ROUTE_BASE = "/club-owner" as const;
export const TOUCHLINE_CLUB_OWNER_SELF_SEGMENT = "me" as const;

export type TouchlineClubOwnerSelfArea = "profile" | "history" | "renewals" | "substitution";

function normalizeClubOwnerSlug(ownerSlug?: string | null) {
  const normalized = ownerSlug?.trim().replace(/^\/+|\/+$/g, "");
  // `me` is a reserved server-resolved identity route. A missing, blank or
  // reserved slug must never silently open the public Luiz profile.
  return normalized && normalized !== TOUCHLINE_CLUB_OWNER_SELF_SEGMENT
    ? normalized
    : null;
}

function withLocale(pathname: string, locale?: string | null) {
  const normalizedLocale = locale?.trim();
  if (!normalizedLocale) return pathname;
  const params = new URLSearchParams({
    lang: resolveTouchLinePresentationLocale(normalizedLocale),
  });
  return `${pathname}?${params.toString()}`;
}

export function touchlineClubOwnerBasePath(ownerSlug?: string | null) {
  const normalizedOwnerSlug = normalizeClubOwnerSlug(ownerSlug);
  return `${TOUCHLINE_CLUB_OWNER_ROUTE_BASE}/${encodeURIComponent(
    normalizedOwnerSlug ?? TOUCHLINE_CLUB_OWNER_SELF_SEGMENT,
  )}`;
}

export function touchlineClubOwnerSelfPath(area: TouchlineClubOwnerSelfArea = "profile") {
  const basePath = `${TOUCHLINE_CLUB_OWNER_ROUTE_BASE}/${TOUCHLINE_CLUB_OWNER_SELF_SEGMENT}`;
  if (area === "history") return `${basePath}/history`;
  if (area === "renewals") return `${basePath}/renewals`;
  if (area === "substitution") return `${basePath}/substitution`;
  return basePath;
}

export function touchlineClubOwnerSelfHref(locale?: string | null, area: TouchlineClubOwnerSelfArea = "profile") {
  return withLocale(touchlineClubOwnerSelfPath(area), locale);
}

export function touchlineClubOwnerProfileHref(locale?: string | null, ownerSlug?: string | null) {
  return withLocale(touchlineClubOwnerBasePath(ownerSlug), locale);
}

export function touchlineClubOwnerSubstitutionPath(ownerSlug?: string | null) {
  return `${touchlineClubOwnerBasePath(ownerSlug)}/substitution`;
}

export function touchlineClubOwnerSubstitutionHref(locale?: string | null, ownerSlug?: string | null) {
  return withLocale(touchlineClubOwnerSubstitutionPath(ownerSlug), locale);
}

export function touchlineClubOwnerRenewalsPath(ownerSlug?: string | null) {
  return `${touchlineClubOwnerBasePath(ownerSlug)}/renewals`;
}

export function touchlineClubOwnerRenewalsHref(locale?: string | null, ownerSlug?: string | null) {
  return withLocale(touchlineClubOwnerRenewalsPath(ownerSlug), locale);
}

export function touchlineClubOwnerHistoryPath(ownerSlug?: string | null) {
  return `${touchlineClubOwnerBasePath(ownerSlug)}/history`;
}

export function touchlineClubOwnerHistoryHref(locale?: string | null, ownerSlug?: string | null) {
  return withLocale(touchlineClubOwnerHistoryPath(ownerSlug), locale);
}

export function touchlineIsClubOwnerPath(pathname: string) {
  return pathname === TOUCHLINE_CLUB_OWNER_ROUTE_BASE || pathname.startsWith(`${TOUCHLINE_CLUB_OWNER_ROUTE_BASE}/`);
}

export function touchlineIsClubOwnerSubstitutionPath(pathname: string) {
  return /^\/club-owner\/[^/]+\/substitution\/?$/.test(pathname);
}

export function touchlineIsClubOwnerRenewalsPath(pathname: string) {
  return /^\/club-owner\/[^/]+\/renewals\/?$/.test(pathname);
}

export function touchlineIsClubOwnerHistoryPath(pathname: string) {
  return /^\/club-owner\/[^/]+\/history\/?$/.test(pathname);
}

export const TOUCHLINE_DEFAULT_CLUB_OWNER_SLUG = "luiz-lopez" as const;
export const TOUCHLINE_CLUB_OWNER_ROUTE_BASE = "/club-owner" as const;

function normalizeClubOwnerSlug(ownerSlug?: string | null) {
  const normalized = ownerSlug?.trim().replace(/^\/+|\/+$/g, "");
  return normalized || TOUCHLINE_DEFAULT_CLUB_OWNER_SLUG;
}

function withLocale(pathname: string, locale?: string | null) {
  const normalizedLocale = locale?.trim();
  if (!normalizedLocale) return pathname;
  const params = new URLSearchParams({ lang: normalizedLocale });
  return `${pathname}?${params.toString()}`;
}

export function touchlineClubOwnerBasePath(ownerSlug?: string | null) {
  return `${TOUCHLINE_CLUB_OWNER_ROUTE_BASE}/${encodeURIComponent(normalizeClubOwnerSlug(ownerSlug))}`;
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

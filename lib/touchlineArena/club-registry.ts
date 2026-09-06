import {
  normalizeTouchLineClubKey,
  TOUCHLINE_CLUB_RANK,
  TOUCHLINE_ENGLAND_CLUBS,
  type TouchLineClubVisual,
} from "./demo-data.ts";

/**
 * P2-1 read-only canonical identity projection.
 *
 * `demo-data.ts` remains the authoritative source during this transition.
 * This module deliberately contains no club literals, assets, or alternative
 * ranking data: every entry is derived from that existing catalogue.
 */
export type TouchlineCanonicalClub = Readonly<{
  providerTeamId: string;
  slug: string;
  displayName: string;
  shortCode: string;
  aliases: readonly string[];
  logoUrl: string | null;
  accent: string;
  secondaryAccent: string;
  touchlineRank: number | null;
}>;

export type TouchlineClubResolution =
  | Readonly<{ ok: true; club: TouchlineCanonicalClub }>
  | Readonly<{ ok: false; code: "empty" | "malformed" | "unknown" | "ambiguous" }>;

function canonicalClubFromLegacy(club: TouchLineClubVisual): TouchlineCanonicalClub {
  return Object.freeze({
    providerTeamId: club.teamId,
    slug: club.slug,
    displayName: club.name,
    shortCode: club.shortCode,
    aliases: Object.freeze([...club.aliases]),
    logoUrl: club.logoUrl ?? null,
    accent: club.accent,
    secondaryAccent: club.secondaryAccent,
    touchlineRank: TOUCHLINE_CLUB_RANK[club.shortCode] ?? null,
  });
}

export const TOUCHLINE_CANONICAL_CLUB_REGISTRY: readonly TouchlineCanonicalClub[] = Object.freeze(
  TOUCHLINE_ENGLAND_CLUBS.map(canonicalClubFromLegacy),
);

function indexRegistry(keysForClub: (club: TouchlineCanonicalClub) => readonly string[]) {
  const index = new Map<string, readonly TouchlineCanonicalClub[]>();

  for (const club of TOUCHLINE_CANONICAL_CLUB_REGISTRY) {
    for (const key of keysForClub(club)) {
      const normalized = normalizeTouchLineClubKey(key);
      if (!normalized) continue;
      const existing = index.get(normalized) ?? [];
      if (!existing.includes(club)) index.set(normalized, Object.freeze([...existing, club]));
    }
  }

  return index;
}

const CLUBS_BY_PROVIDER_TEAM_ID = indexRegistry((club) => [club.providerTeamId]);
const CLUBS_BY_SLUG = indexRegistry((club) => [club.slug]);
const CLUBS_BY_SHORT_CODE = indexRegistry((club) => [club.shortCode]);
const CLUBS_BY_ALIAS = indexRegistry((club) => club.aliases);

function inputKey(value: unknown): { ok: true; key: string; kind: "provider-id" | "text" } | { ok: false; code: "empty" | "malformed" } {
  if (value === null || value === undefined) return { ok: false, code: "empty" };
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return { ok: false, code: "malformed" };
    return { ok: true, key: String(value), kind: "provider-id" };
  }
  if (typeof value !== "string") return { ok: false, code: "malformed" };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, code: "empty" };

  // Provider team IDs are positive decimal strings only. Never normalize a
  // near-match such as `-19`, `+19`, `19!`, or `19.0` into a real club.
  if (/^[+-]?\d/.test(trimmed)) {
    if (!/^[1-9]\d*$/.test(trimmed)) return { ok: false, code: "malformed" };
    return { ok: true, key: trimmed, kind: "provider-id" };
  }

  const key = normalizeTouchLineClubKey(trimmed);
  return key ? { ok: true, key, kind: "text" } : { ok: false, code: "malformed" };
}

function resolveFromIndex(
  index: ReadonlyMap<string, readonly TouchlineCanonicalClub[]>,
  key: string,
): TouchlineClubResolution | null {
  const matches = index.get(key);
  if (!matches?.length) return null;
  if (matches.length !== 1) return { ok: false, code: "ambiguous" };
  return { ok: true, club: matches[0]! };
}

function resolveTextualKey(key: string): TouchlineClubResolution | null {
  const matches = new Set<TouchlineCanonicalClub>();
  for (const index of [CLUBS_BY_SLUG, CLUBS_BY_SHORT_CODE, CLUBS_BY_ALIAS]) {
    for (const club of index.get(key) ?? []) matches.add(club);
  }

  if (!matches.size) return null;
  if (matches.size !== 1) return { ok: false, code: "ambiguous" };
  return { ok: true, club: [...matches][0]! };
}

/**
 * Resolves only a real canonical club. Unknown inputs intentionally never
 * select a visual fallback club, including Manchester City.
 */
export function resolveTouchlineCanonicalClub(value: unknown): TouchlineClubResolution {
  const input = inputKey(value);
  if (!input.ok) return input;

  return (input.kind === "provider-id"
    ? resolveFromIndex(CLUBS_BY_PROVIDER_TEAM_ID, input.key)
    : resolveTextualKey(input.key))
    ?? { ok: false, code: "unknown" };
}

/**
 * Canonical route builder. Aliases are accepted only at the input boundary;
 * public links are always emitted from the canonical slug.
 */
export function touchlineCanonicalClubHubHref(club: Pick<TouchlineCanonicalClub, "slug">) {
  return `/touchline-clubs/${encodeURIComponent(club.slug)}`;
}

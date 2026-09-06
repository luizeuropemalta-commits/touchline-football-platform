import {
  TOUCHLINE_CANONICAL_CLUB_REGISTRY,
  resolveTouchlineCanonicalClub,
  type TouchlineCanonicalClub,
  type TouchlineClubResolution,
} from "./club-registry.ts";

/**
 * Arena's compatibility view over the P2-1 canonical club registry.
 *
 * The UI still consumes `teamId` and `name`, but this module owns the only
 * conversion from the canonical provider projection. Do not add Arena club
 * literals, assets, colours, aliases, or rankings here.
 */
export type TouchlineArenaClub = Readonly<{
  teamId: string;
  slug: string;
  name: string;
  shortCode: string;
  logoUrl: string | null;
  accent: string;
  secondaryAccent: string;
  aliases: readonly string[];
  touchlineRank: number;
}>;

export type TouchlineArenaFixtureSource = Readonly<{
  providerId?: unknown;
  name?: unknown;
  shortCode?: unknown;
  logoUrl?: unknown;
}>;

type TouchlineArenaFixtureExternalReason =
  | "missing"
  | "unknown-provider-id"
  | "conflict"
  | "unknown-text"
  | "ambiguous"
  | "malformed";

export type TouchlineArenaFixtureClubResolution =
  | Readonly<{ kind: "canonical"; club: TouchlineArenaClub }>
  | Readonly<{
      kind: "external";
      reason: TouchlineArenaFixtureExternalReason;
      source: Readonly<{ name?: string; shortCode?: string; logoUrl?: string }>;
    }>;

export type TouchlineArenaInitialClubResolution =
  | Readonly<{ kind: "absent"; club: TouchlineArenaClub }>
  | Readonly<{ kind: "canonical"; club: TouchlineArenaClub }>
  | Readonly<{ kind: "unavailable"; code: "empty" | "malformed" | "unknown" | "ambiguous" }>;

function arenaClubFromCanonical(club: TouchlineCanonicalClub): TouchlineArenaClub {
  const touchlineRank = club.touchlineRank;
  if (touchlineRank === null || !Number.isInteger(touchlineRank) || touchlineRank < 1 || touchlineRank > 20) {
    throw new Error(`TouchLine Arena registry requires a valid rank for ${club.providerTeamId}.`);
  }

  return Object.freeze({
    teamId: club.providerTeamId,
    slug: club.slug,
    name: club.displayName,
    shortCode: club.shortCode,
    logoUrl: club.logoUrl,
    accent: club.accent,
    secondaryAccent: club.secondaryAccent,
    aliases: club.aliases,
    touchlineRank,
  });
}

function buildArenaClubRegistry() {
  const clubs = TOUCHLINE_CANONICAL_CLUB_REGISTRY.map(arenaClubFromCanonical)
    .sort((left, right) => left.touchlineRank - right.touchlineRank);
  const ranks = new Set(clubs.map((club) => club.touchlineRank));

  if (clubs.length !== 20 || ranks.size !== 20 || clubs.some((club) => !Number.isInteger(club.touchlineRank))) {
    throw new Error("TouchLine Arena registry must expose exactly twenty uniquely ranked clubs.");
  }

  return Object.freeze(clubs);
}

export const TOUCHLINE_ARENA_CLUBS: readonly TouchlineArenaClub[] = buildArenaClubRegistry();

const ARENA_CLUB_BY_PROVIDER_TEAM_ID = new Map(
  TOUCHLINE_ARENA_CLUBS.map((club) => [club.teamId, club] as const),
);

function arenaClubFromResolution(resolution: TouchlineClubResolution): TouchlineArenaClub | null {
  return resolution.ok ? ARENA_CLUB_BY_PROVIDER_TEAM_ID.get(resolution.club.providerTeamId) ?? null : null;
}

function providedText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasProvidedValue(value: unknown) {
  return value !== null && value !== undefined;
}

/**
 * Provider IDs are an identity boundary, not a general club lookup. Text such
 * as a club name must never enter the provider-ID resolver, even when that
 * text would happen to resolve canonically somewhere else in the product.
 */
function canonicalProviderTeamId(value: unknown): string | number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[1-9]\d*$/.test(normalized) ? normalized : null;
}

/**
 * Preserve provider home/away semantics before filtering a fixture for a
 * particular Arena surface. A missing home side must never make the away side
 * become index zero.
 */
export function preserveTouchlineArenaFixtureSides<T extends TouchlineArenaFixtureSource>(
  home: T | undefined,
  away: T | undefined,
): readonly [T | undefined, T | undefined] {
  return Object.freeze([home, away]);
}

function sanitizedFixtureSource(source: TouchlineArenaFixtureSource) {
  const name = providedText(source.name);
  const shortCode = providedText(source.shortCode);
  const logoUrl = providedText(source.logoUrl);
  return Object.freeze({
    ...(name ? { name } : {}),
    ...(shortCode ? { shortCode } : {}),
    ...(logoUrl ? { logoUrl } : {}),
  });
}

function fixtureExternal(
  reason: TouchlineArenaFixtureExternalReason,
  source: TouchlineArenaFixtureSource,
): TouchlineArenaFixtureClubResolution {
  return Object.freeze({ kind: "external", reason, source: sanitizedFixtureSource(source) });
}

function externalReasonFromResolution(resolution: TouchlineClubResolution): TouchlineArenaFixtureExternalReason {
  if (resolution.ok) return "conflict";
  if (resolution.code === "ambiguous") return "ambiguous";
  if (resolution.code === "unknown") return "unknown-text";
  if (resolution.code === "empty") return "missing";
  return "malformed";
}

/**
 * Fixture text is only an integrity check when it is actually supplied as
 * usable text. An empty field is absence, not a second identity. A value of a
 * different type is malformed and cannot be used to corroborate a provider
 * ID.
 */
function fixtureTextInputs(source: TouchlineArenaFixtureSource) {
  const values: string[] = [];
  let malformed = false;

  for (const value of [source.name, source.shortCode]) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string") {
      malformed = true;
      continue;
    }
    const normalized = value.trim();
    if (normalized) values.push(normalized);
  }

  return Object.freeze({ values: Object.freeze(values), malformed });
}

/**
 * Finds a canonical Arena club only when an input resolves cleanly. It keeps
 * compatibility for normal text lookups but never manufactures a fallback.
 */
export function findTouchlineArenaClub(...values: readonly unknown[]): TouchlineArenaClub | null {
  for (const value of values) {
    const club = arenaClubFromResolution(resolveTouchlineCanonicalClub(value));
    if (club) return club;
  }
  return null;
}

/**
 * Resolves fixture identities at the provider boundary. A supplied provider
 * ID is authoritative: an invalid, unknown, or conflicting ID can never fall
 * through to a matching display name or short code.
 */
export function resolveTouchlineArenaFixtureClub(
  source: TouchlineArenaFixtureSource,
): TouchlineArenaFixtureClubResolution {
  if (hasProvidedValue(source.providerId)) {
    const providerId = canonicalProviderTeamId(source.providerId);
    if (providerId === null) return fixtureExternal("malformed", source);
    const providerResolution = resolveTouchlineCanonicalClub(providerId);
    if (!providerResolution.ok) {
      return fixtureExternal(
        providerResolution.code === "unknown" ? "unknown-provider-id" : "malformed",
        source,
      );
    }
    const providerClub = arenaClubFromResolution(providerResolution);
    if (!providerClub) {
      return fixtureExternal("unknown-provider-id", source);
    }

    const textInputs = fixtureTextInputs(source);
    if (textInputs.malformed) return fixtureExternal("malformed", source);
    for (const value of textInputs.values) {
      const textResolution = resolveTouchlineCanonicalClub(value);
      const textClub = arenaClubFromResolution(textResolution);
      if (!textClub || textClub.teamId !== providerClub.teamId) {
        return fixtureExternal("conflict", source);
      }
    }

    return Object.freeze({ kind: "canonical", club: providerClub });
  }

  const textInputs = fixtureTextInputs(source);
  if (textInputs.malformed) return fixtureExternal("malformed", source);
  if (!textInputs.values.length) return fixtureExternal("missing", source);

  let resolvedClub: TouchlineArenaClub | null = null;
  for (const value of textInputs.values) {
    const textResolution = resolveTouchlineCanonicalClub(value);
    const textClub = arenaClubFromResolution(textResolution);
    if (!textClub) return fixtureExternal(externalReasonFromResolution(textResolution), source);
    if (resolvedClub && resolvedClub.teamId !== textClub.teamId) return fixtureExternal("conflict", source);
    resolvedClub = textClub;
  }

  return resolvedClub
    ? Object.freeze({ kind: "canonical", club: resolvedClub })
    : fixtureExternal("missing", source);
}

/**
 * `undefined` and `null` mean no deep-link intent. Any present value must be
 * an exact canonical provider ID; malformed or unknown values select nothing.
 */
export function resolveTouchlineArenaInitialClub(
  contractClub: unknown,
): TouchlineArenaInitialClubResolution {
  if (contractClub === undefined || contractClub === null) {
    const defaultClub = TOUCHLINE_ARENA_CLUBS[0];
    if (!defaultClub) throw new Error("TouchLine Arena registry has no default club.");
    return Object.freeze({ kind: "absent", club: defaultClub });
  }

  // The query parameter is an internal provider-ID contract, not a general
  // ClubHub lookup. Textual aliases remain valid only at their own input
  // boundary and must not silently select an Arena market club here.
  if (
    (typeof contractClub === "string" && !/^[1-9]\d*$/.test(contractClub.trim()))
    || (typeof contractClub === "number" && (!Number.isSafeInteger(contractClub) || contractClub <= 0))
    || (typeof contractClub !== "string" && typeof contractClub !== "number")
  ) {
    return Object.freeze({
      kind: "unavailable",
      code: typeof contractClub === "string" && !contractClub.trim() ? "empty" : "malformed",
    });
  }

  const resolution = resolveTouchlineCanonicalClub(contractClub);
  const club = arenaClubFromResolution(resolution);
  if (club) return Object.freeze({ kind: "canonical", club });
  if (!resolution.ok) return Object.freeze({ kind: "unavailable", code: resolution.code });
  return Object.freeze({ kind: "unavailable", code: "unknown" });
}

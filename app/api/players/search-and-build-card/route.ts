/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { touchlineCountryCode3FromName, touchlineCountryFlagUrl } from "@/lib/touchlineArena/country-flags";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { requireAuthenticatedOrLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAYER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PUBLIC_ROOT = path.join(process.cwd(), "public");
const BLOCKED_CLIENT_RESPONSE_KEYS = new Set([
  "authorization",
  "image_path",
  "imagepath",
  "normalizedimagepath",
  "photo_url",
  "photourl",
  "raw",
  "raw_data",
  "rawdata",
  "rawplayerimagepath",
  "savedplayerimagepath",
  "secret",
  "sourcefaceurl",
  "token",
]);

function isBlockedClientResponseKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return BLOCKED_CLIENT_RESPONSE_KEYS.has(key.toLowerCase())
    || BLOCKED_CLIENT_RESPONSE_KEYS.has(normalized)
    || normalized.includes("apitoken")
    || normalized.includes("accesstoken")
    || normalized.includes("apikey");
}

function isBlockedProviderResponseString(value: string) {
  const normalized = value.toLowerCase();
  const configuredToken = process.env.SPORTMONKS_API_TOKEN;

  return normalized.includes("api_token=")
    || normalized.includes("image_path")
    || normalized.includes("raw_data")
    || normalized.includes("sportmonks.com")
    || Boolean(configuredToken && value.includes(configuredToken));
}

function sanitizePlayerRouteResponseForClient(value: unknown): unknown {
  if (typeof value === "string") {
    return isBlockedProviderResponseString(value) ? undefined : value;
  }

  if (Array.isArray(value)) {
    return value
      .map(sanitizePlayerRouteResponseForClient)
      .filter((item) => item !== undefined);
  }

  if (!value || typeof value !== "object") return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isBlockedClientResponseKey(key)) continue;
    const safeValue = sanitizePlayerRouteResponseForClient(nestedValue);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }

  return sanitized;
}

function playerRouteJson(payload: unknown, init?: ResponseInit) {
  return NextResponse.json(sanitizePlayerRouteResponseForClient(payload), init);
}

function playerCacheTtlMs() {
  const seconds = Number(process.env.TOUCHLINE_PLAYER_CACHE_TTL_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_PLAYER_CACHE_TTL_MS;
}

function getSupabaseService() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function unwrap(value: any) {
  return value?.data ?? value;
}

function unwrapArray(value: any): any[] {
  const unwrapped = unwrap(value);
  if (!unwrapped) return [];
  return Array.isArray(unwrapped) ? unwrapped : [unwrapped];
}

function numberOrNull(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSearchText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function localTouchLineClubLogoUrl(clubName?: string | null, fallbackLogoUrl?: string | null) {
  const club = findTouchLineClub(clubName);
  return localTouchLineAssetUrl(club?.logoUrl) || localTouchLineAssetUrl(fallbackLogoUrl);
}

function localTouchLineAssetUrl(value?: string | null) {
  const candidate = String(value || "").trim();
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "";
}

function moneyToEur(value: any) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const multiplier = /bn|billion|bilhão|bilhao|\bb\b/i.test(raw)
    ? 1_000_000_000
    : /mio|million|milhão|milhao|[0-9]\s*m\b/i.test(raw)
      ? 1_000_000
      : /[0-9]\s*k\b|thousand|mil\b/i.test(raw)
        ? 1_000
        : 1;

  const normalized = raw
    .replace(/[€£$]/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * multiplier) : null;
}

function marketValueFromMetadata(raw: any) {
  const metadata = unwrapArray(raw?.metadata);

  for (const item of metadata) {
    const type = unwrap(item?.type);
    const name = String(
      item?.name ||
        item?.key ||
        item?.type ||
        type?.name ||
        type?.code ||
        "",
    ).toLowerCase();

    if (!name.includes("market")) continue;

    const candidate =
      item?.values?.value ||
      item?.values?.amount ||
      item?.values ||
      item?.value ||
      item?.amount ||
      item?.data?.value ||
      null;

    const parsed = moneyToEur(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function getEntityName(value: any) {
  const item = unwrap(value);
  return item?.name || item?.display_name || item?.common_name || null;
}

function getEntityImage(value: any) {
  const item = unwrap(value);
  return item?.image_path || item?.logo_path || item?.url || null;
}

function countryCode3(name?: string | null, code?: string | null) {
  if (code) return String(code).slice(0, 3).toUpperCase();

  const value = String(name || "").toLowerCase();

  if (value.includes("spain")) return "ESP";
  if (value.includes("brazil")) return "BRA";
  if (value.includes("argentina")) return "ARG";
  if (value.includes("france")) return "FRA";
  if (value.includes("england")) return "ENG";
  if (value.includes("portugal")) return "POR";
  if (value.includes("italy")) return "ITA";
  if (value.includes("germany")) return "GER";
  if (value.includes("netherlands")) return "NED";

  return name ? String(name).slice(0, 3).toUpperCase() : "N/A";
}

function calcAge(dateOfBirth?: string | null) {
  if (!dateOfBirth) return null;

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();

  const monthDiff = now.getMonth() - dob.getMonth();
  const dayDiff = now.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--;

  return age;
}

function roleName(raw: any) {
  const position = unwrap(raw?.position);
  const detailed = unwrap(raw?.detailedPosition);

  const text = String(detailed?.name || position?.name || raw?.role_name || raw?.position_name || "").toLowerCase();

  if (text.includes("goalkeeper")) return "Goalkeeper";
  if (text.includes("defender") || text.includes("back")) return "Defender";
  if (text.includes("midfield")) return "Midfielder";
  if (text.includes("wing") || text.includes("forward") || text.includes("striker") || text.includes("attacker")) {
    return "Attacker";
  }

  return raw?.role_name || "Player";
}

function shortPosition(raw: any, role: string) {
  const position = unwrap(raw?.position);
  const detailed = unwrap(raw?.detailedPosition);

  const direct = raw?.position_code || raw?.short_position || position?.code || detailed?.code || null;

  if (direct && String(direct).toUpperCase() !== "N/A") {
    const directValue = String(direct).toUpperCase();
    if (directValue.length <= 4) return directValue;
  }

  const text = String(detailed?.name || position?.name || raw?.position_name || role || "").toLowerCase();

  if (text.includes("right wing")) return "RW";
  if (text.includes("left wing")) return "LW";
  if (text.includes("striker")) return "ST";
  if (text.includes("centre forward") || text.includes("center forward")) return "ST";
  if (text.includes("attacking midfield")) return "CAM";
  if (text.includes("central midfield")) return "CM";
  if (text.includes("defensive midfield")) return "CDM";
  if (text.includes("right back")) return "RB";
  if (text.includes("left back")) return "LB";
  if (text.includes("centre back") || text.includes("center back")) return "CB";
  if (text.includes("goalkeeper")) return "GK";

  const roleLower = String(role || "").toLowerCase();

  if (roleLower.includes("attacker")) return "ATT";
  if (roleLower.includes("midfielder")) return "MID";
  if (roleLower.includes("defender")) return "DEF";
  if (roleLower.includes("goalkeeper")) return "GK";

  return "Player";
}

function extractCurrentTeam(raw: any) {
  const latest = unwrap(raw?.latest);
  const teams = unwrapArray(raw?.teams);

  const activeTeamRecord =
    teams.find((item) => {
      const end = item?.end || item?.end_date || item?.until || item?.transfer?.end_date || null;

      return !end;
    }) || teams[0];

  const team =
    unwrap(latest?.team) ||
    unwrap(latest?.participant) ||
    unwrap(raw?.team) ||
    unwrap(raw?.currentTeam) ||
    unwrap(raw?.current_team) ||
    unwrap(activeTeamRecord?.team) ||
    unwrap(activeTeamRecord?.participant) ||
    activeTeamRecord;

  const teamId = team?.name || team?.display_name ? team?.id || team?.team_id : team?.team_id || team?.id;

  return {
    id: numberOrNull(teamId || raw?.team_id || raw?.current_team_id),
    name: team?.name || team?.display_name || raw?.team_name || raw?.club_name || "Free Agent",
    logo: team?.image_path || team?.logo_path || raw?.team_logo || raw?.club_logo || "",
  };
}

function extractLeague(raw: any) {
  const latest = unwrap(raw?.latest);
  const statistics = unwrapArray(raw?.statistics);

  const statWithLeague = statistics.find((s) => unwrap(s?.league)?.name);

  const league =
    unwrap(latest?.league) ||
    unwrap(latest?.season?.league) ||
    unwrap(statWithLeague?.league) ||
    unwrap(raw?.league) ||
    unwrap(raw?.current_league);

  return {
    id: numberOrNull(league?.id || raw?.league_id),
    name: league?.name || raw?.league_name || "League",
    logo: league?.image_path || league?.logo_path || raw?.league_logo || "",
  };
}

async function sportMonksGet(path: string, params: Record<string, string>) {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) throw new Error("Missing SPORTMONKS_API_TOKEN.");

  const baseUrl = process.env.SPORTMONKS_BASE_URL ?? "https://api.sportmonks.com/v3/football";
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("api_token", token);

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  let lastStatus = 0;
  let lastJson: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const json = await res.json().catch(() => null);

    if (res.ok) return json;

    lastStatus = res.status;
    lastJson = json;

    if (![429, 502, 503, 504].includes(res.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }

  if ([502, 503, 504].includes(lastStatus)) {
    throw new Error("TouchLine England is temporarily unavailable. Try again in a few seconds.");
  }

  if (lastStatus === 429) {
    throw new Error("TouchLine England is rate-limiting searches right now. Wait a few seconds and try again.");
  }

  throw new Error(`TouchLine England error ${lastStatus}: ${JSON.stringify(lastJson)?.slice(0, 500)}`);
}

function pickBestPlayer(players: any[], query: string) {
  const q = query.trim().toLowerCase();

  const exact = players.find((p) => {
    const names = [p?.display_name, p?.common_name, p?.name, `${p?.firstname || ""} ${p?.lastname || ""}`.trim()]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());

    return names.includes(q);
  });

  if (exact) return exact;

  const starts = players.find((p) =>
    String(p?.display_name || p?.name || "")
      .toLowerCase()
      .startsWith(q),
  );

  return starts || players[0] || null;
}

async function fetchSportMonksPlayerDetail(playerId: number | string) {
  const detail = await sportMonksGet(`/players/${playerId}`, {
    include: "country;nationality;position;detailedPosition;teams;latest;metadata;statistics;transfers",
  });

  return detail?.data || null;
}

async function fetchSportMonksPlayerCandidates(query: string, clubQuery?: string | null) {
  const search = await sportMonksGet(`/players/search/${encodeURIComponent(query.trim())}`, {
    include: "country;nationality;position;detailedPosition;teams;latest;metadata;statistics",
    per_page: "10",
  });

  const searchResults = search?.data || [];
  const detailedPlayers = await Promise.all(
    searchResults.slice(0, 10).map(async (player: any) => {
      if (!player?.id) return player;

      try {
        return (await fetchSportMonksPlayerDetail(player.id)) || player;
      } catch {
        return player;
      }
    }),
  );

  const normalized = await Promise.all(
    detailedPlayers.map(async (player) => enrichPlayerMarketValue(await enrichPlayerTeamData(normalizeSportMonksPlayer(player)))),
  );

  const clubNeedle = normalizeSearchText(clubQuery);
  const filtered = clubNeedle
    ? normalized.filter((player) => {
        const club = normalizeSearchText(player.current_team_name);
        return Boolean(club) && (club.includes(clubNeedle) || clubNeedle.includes(club));
      })
    : normalized;

  return [...(filtered.length ? filtered : normalized)].sort((a, b) => {
    const valueDiff = Number(b.market_value_eur || 0) - Number(a.market_value_eur || 0);
    if (valueDiff) return valueDiff;

    const aExact = String(a.display_name || "").toLowerCase() === query.trim().toLowerCase() ? 1 : 0;
    const bExact = String(b.display_name || "").toLowerCase() === query.trim().toLowerCase() ? 1 : 0;
    return bExact - aExact;
  });
}

async function fetchFullSportMonksPlayer(query: string, sportmonksPlayerId?: string | number | null) {
  if (sportmonksPlayerId) {
    const detail = await fetchSportMonksPlayerDetail(sportmonksPlayerId);
    if (detail?.id) return detail;
  }

  const search = await sportMonksGet(`/players/search/${encodeURIComponent(query.trim())}`, {
    include: "country;nationality;position;detailedPosition;teams;latest;metadata;statistics",
    per_page: "10",
  });

  const best = pickBestPlayer(search?.data || [], query);
  if (!best?.id) return null;

  return (await fetchSportMonksPlayerDetail(best.id)) || best;
}

async function fetchSportMonksTeam(teamId: number) {
  const team = await sportMonksGet(`/teams/${teamId}`, {
    include: "country;venue;activeSeasons.league",
  });

  return team?.data || null;
}

function currentLeagueFromTeam(team: any) {
  const seasons = unwrapArray(team?.activeSeasons || team?.activeseasons);
  const currentSeason = seasons.find((season) => season?.is_current) || seasons.find((season) => !season?.finished) || seasons[0];
  const league = unwrap(currentSeason?.league);

  return {
    id: numberOrNull(league?.id || currentSeason?.league_id),
    name: league?.name || null,
    logo: league?.image_path || league?.logo_path || null,
  };
}

function venueFromTeam(team: any) {
  const venue = unwrap(team?.venue);

  return {
    id: numberOrNull(venue?.id || team?.venue_id),
    name: venue?.name || null,
    city: venue?.city_name || venue?.city || null,
    capacity: numberOrNull(venue?.capacity),
  };
}

function isUsableTeam(team: any) {
  const name = String(team?.name || "").trim().toLowerCase();
  return Boolean(team?.id && name && name !== "free agent" && name !== "free agents");
}

function fallbackTeamIdsFromPlayer(player: any) {
  const raw = player.raw_data || {};
  const ids = [
    ...unwrapArray(raw?.statistics).map((item) => item?.team_id),
    ...unwrapArray(raw?.latest).map((item) => item?.team_id),
    ...unwrapArray(raw?.teams).map((item) => item?.team_id),
    ...unwrapArray(raw?.transfers).map((item) => item?.to_team_id),
    ...unwrapArray(raw?.transfers).map((item) => item?.from_team_id),
  ]
    .map(numberOrNull)
    .filter((id): id is number => Boolean(id));

  return Array.from(new Set(ids)).filter((id) => id !== player.current_team_id);
}

async function resolveUsableSportMonksTeam(player: any) {
  const primaryId = numberOrNull(player.current_team_id);
  const candidateIds = primaryId ? [primaryId, ...fallbackTeamIdsFromPlayer(player)] : fallbackTeamIdsFromPlayer(player);

  for (const teamId of candidateIds) {
    try {
      const team = await fetchSportMonksTeam(teamId);
      if (isUsableTeam(team)) return team;
    } catch {
      continue;
    }
  }

  return null;
}

async function enrichPlayerTeamData(player: any) {
  if (!player.current_team_id && !player.raw_data) return player;

  try {
    const team = await resolveUsableSportMonksTeam(player);
    if (!team?.id) return player;

    const league = currentLeagueFromTeam(team);
    const venue = venueFromTeam(team);

    return {
      ...player,
      current_team_name: team?.name || player.current_team_name,
      current_team_logo_url: localTouchLineClubLogoUrl(team?.name || player.current_team_name, team?.image_path || team?.logo_path || player.current_team_logo_url),
      current_league_id: league.id || player.current_league_id,
      current_league_name: league.name || player.current_league_name,
      current_league_logo_url: league.logo || player.current_league_logo_url,
      current_venue_id: venue.id || player.current_venue_id,
      current_venue_name: venue.name || player.current_venue_name,
      current_venue_city: venue.city || player.current_venue_city,
      current_venue_capacity: venue.capacity || player.current_venue_capacity,
    };
  } catch {
    return player;
  }
}

async function enrichPlayerMarketValue(player: any) {
  return player;
}

function jerseyNumber(raw: any) {
  const latest = unwrapArray(raw?.latest);
  const teams = unwrapArray(raw?.teams);
  const statistics = unwrapArray(raw?.statistics);
  const metadata = unwrapArray(raw?.metadata);
  const jerseyMeta = metadata.find((item) => {
    const name = String(item?.name || item?.key || item?.type?.name || item?.type || "").toLowerCase();
    return name.includes("jersey") || name.includes("shirt") || name.includes("number");
  });
  const value =
    latest.find((item) => item?.jersey_number)?.jersey_number ||
    latest.find((item) => item?.shirt_number)?.shirt_number ||
    latest.find((item) => item?.number)?.number ||
    teams.find((item) => item?.jersey_number)?.jersey_number ||
    teams.find((item) => item?.shirt_number)?.shirt_number ||
    teams.find((item) => item?.number)?.number ||
    statistics.find((item) => item?.jersey_number)?.jersey_number ||
    statistics.find((item) => item?.shirt_number)?.shirt_number ||
    statistics.find((item) => item?.number)?.number ||
    jerseyMeta?.values?.value ||
    jerseyMeta?.values ||
    jerseyMeta?.value ||
    raw?.jersey_number ||
    raw?.shirt_number ||
    raw?.number ||
    null;

  return value ? String(value) : null;
}

function preferredFoot(raw: any) {
  const metadata = unwrapArray(raw?.metadata);
  const footMeta = metadata.find((item) => {
    const value = String(item?.values || item?.value || "").toLowerCase();
    return value === "left" || value === "right" || value === "both";
  });

  return raw?.preferred_foot || raw?.foot || raw?.metadata?.preferred_foot || footMeta?.values || footMeta?.value || null;
}

function contractUntil(raw: any) {
  const teams = unwrapArray(raw?.teams);
  const activeTeamRecord =
    teams.find((item) => {
      const end = item?.end || item?.end_date || item?.until || item?.transfer?.end_date || null;
      if (!end) return true;
      const date = new Date(end);
      return !Number.isNaN(date.getTime()) && date > new Date();
    }) || teams[0];

  return raw?.contract_until || raw?.contract_expiry || raw?.metadata?.contract_until || activeTeamRecord?.end || activeTeamRecord?.end_date || activeTeamRecord?.until || null;
}

function normalizeSportMonksPlayer(raw: any) {
  const country = unwrap(raw?.country);
  const nationality = unwrap(raw?.nationality) || country;
  const team = extractCurrentTeam(raw);
  const league = extractLeague(raw);
  const role = roleName(raw);
  const position = shortPosition(raw, role);

  const displayName =
    raw?.display_name || raw?.common_name || raw?.name || [raw?.firstname, raw?.lastname].filter(Boolean).join(" ") || "Unknown Player";

  const nationalityName = nationality?.name || country?.name || raw?.nationality_name || null;
  const firstName = raw?.firstname || displayName.split(/\s+/)[0] || displayName;
  const lastName = raw?.lastname || raw?.common_name || displayName.split(/\s+/).slice(1).join(" ") || "";

  return {
    sportmonks_player_id: Number(raw.id),

    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    common_name: raw?.common_name || null,
    image_path: raw?.image_path || null,

    country_code3: countryCode3(
      nationalityName,
      nationality?.iso3 || nationality?.fifa_name || nationality?.code || country?.iso3 || country?.fifa_name || country?.code,
    ),

    nationality_name: nationalityName,
    nationality_flag_url: getEntityImage(nationality) || getEntityImage(country) || raw?.nationality_flag_url || raw?.country_flag || null,

    position_name: getEntityName(raw?.position),
    position_code: position,
    role_name: role,

    current_team_id: team.id,
    current_team_name: team.name,
    current_team_logo_url: localTouchLineClubLogoUrl(team.name, team.logo),

    current_league_id: league.id,
    current_league_name: league.name,
    current_league_logo_url: league.logo,

    market_value_eur:
      moneyToEur(raw?.market_value_eur) ||
      moneyToEur(raw?.market_value) ||
      moneyToEur(raw?.marketValue) ||
      moneyToEur(raw?.metadata?.market_value_eur) ||
      moneyToEur(raw?.metadata?.market_value) ||
      marketValueFromMetadata(raw),

    overall_rating: numberOrNull(raw?.overall_rating) || numberOrNull(raw?.rating) || numberOrNull(raw?.metadata?.overall_rating),

    age: numberOrNull(raw?.age) || calcAge(raw?.date_of_birth),
    height_cm: numberOrNull(raw?.height),
    preferred_foot: preferredFoot(raw),
    contract_until: contractUntil(raw),

    current_season: process.env.TOUCHLINE_CURRENT_SEASON || "2026",
    raw_data: raw,
  };
}

function formatMarketValue(value?: number | string | null) {
  if (!value) return "PENDING";

  const n = Number(value);

  if (!Number.isFinite(n)) return String(value);
  if (n >= 1_000_000_000) return `€${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;

  return `€${n}`;
}

function formatHeight(cm?: number | null) {
  if (!cm) return "N/A";
  return `${(cm / 100).toFixed(2)}m`;
}

function formatContract(value?: string | null) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return String(date.getFullYear());
}

function formatUpdated(value?: string | null) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isFreshSavedPlayer(player: any) {
  const updatedAt = player?.source_updated_at || player?.updated_at
    ? new Date(player.source_updated_at || player.updated_at).getTime()
    : 0;
  if (!updatedAt || Number.isNaN(updatedAt)) return false;
  if (Date.now() - updatedAt > playerCacheTtlMs()) return false;

  return Boolean(
    player?.id &&
      player?.sportmonks_player_id &&
      player?.display_name &&
      player?.current_team_id &&
      player?.current_team_name &&
      player?.position_name &&
      player?.position_code &&
      player?.source_updated_at,
  );
}

function cachedPlayerSearchCandidate(player: any) {
  return {
    sportmonksPlayerId: String(player.sportmonks_player_id),
    name: player.display_name,
    commonName: player.common_name,
    clubName: player.current_team_name,
    leagueName: player.current_league_name,
    nationality: player.nationality_name || player.country_code3,
    position: player.position_code,
    shirtNumber: jerseyNumber(player.raw_data),
    marketValue: formatMarketValue(player.market_value_eur),
    // Missing provider data is unavailable, never a manufactured FREE value.
    marketValueEur: player.market_value_eur ?? null,
  };
}

function safeIlikeNeedle(value: string) {
  return value.trim().replace(/[%_]/g, "").slice(0, 80);
}

function sortSavedCandidates(players: any[], query: string) {
  const q = query.trim().toLowerCase();

  return [...players].sort((a, b) => {
    const valueDiff = Number(b.market_value_eur || 0) - Number(a.market_value_eur || 0);
    if (valueDiff) return valueDiff;

    const aExact = String(a.display_name || a.common_name || "").toLowerCase() === q ? 1 : 0;
    const bExact = String(b.display_name || b.common_name || "").toLowerCase() === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    return new Date(b.source_updated_at || b.updated_at || 0).getTime() - new Date(a.source_updated_at || a.updated_at || 0).getTime();
  });
}

function officialSquadMemberKey(playerId?: string | null, clubId?: string | null) {
  return `${String(playerId || "")}:${String(clubId || "")}`;
}

async function hydrateOfficialPlayerCache(supabase: ReturnType<typeof getSupabaseService>, playerRows: any[]) {
  if (!playerRows.length) return [];

  const playerIds = playerRows.map((player) => player.id).filter(Boolean);
  const clubIds = Array.from(new Set(playerRows.map((player) => player.current_club_id).filter(Boolean)));

  const [{ data: clubRows }, { data: memberRows }] = await Promise.all([
    clubIds.length
      ? supabase
          .from("football_clubs")
          .select("id,provider_team_id,competition_id,name,logo_url")
          .in("id", clubIds)
      : Promise.resolve({ data: [] }),
    playerIds.length && clubIds.length
      ? supabase
          .from("football_squad_members")
          .select("club_id,player_id,jersey_number,position,source_updated_at")
          .eq("provider", "sportmonks")
          .in("player_id", playerIds)
          .in("club_id", clubIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
  ]);

  const competitionIds = Array.from(new Set((clubRows || []).map((club: any) => club.competition_id).filter(Boolean)));
  const { data: competitionRows } = competitionIds.length
    ? await supabase
        .from("football_competitions")
        .select("id,provider_competition_id,name,logo_url")
        .in("id", competitionIds)
    : { data: [] };

  const clubs = new Map((clubRows || []).map((club: any) => [club.id, club]));
  const competitions = new Map((competitionRows || []).map((competition: any) => [competition.id, competition]));
  const members = new Map(
    (memberRows || []).map((member: any) => [officialSquadMemberKey(member.player_id, member.club_id), member]),
  );

  return playerRows.map((player) => {
    const club: any = clubs.get(player.current_club_id);
    const competition: any = club ? competitions.get(club.competition_id) : null;
    const member: any = members.get(officialSquadMemberKey(player.id, player.current_club_id));
    const resolvedCountryCode3 = player.nationality
      ? touchlineCountryCode3FromName(player.nationality)
      : null;
    const heightCm = numberOrNull(String(player.height || "").replace(/[^0-9.]/g, ""));
    const position = member?.position || player.position || null;
    const role = position ? roleName({ position: { name: position } }) : null;
    const positionCode = position ? shortPosition({ position: { name: position } }, role || "") : null;

    return {
      id: player.id,
      sportmonks_player_id: Number(player.provider_player_id),
      first_name: player.first_name,
      last_name: player.last_name,
      display_name: player.display_name || player.name,
      common_name: player.name,
      image_path: player.photo_url,
      country_code3: resolvedCountryCode3,
      nationality_name: player.nationality,
      nationality_flag_url: touchlineCountryFlagUrl(resolvedCountryCode3),
      position_name: position,
      position_code: positionCode,
      role_name: role,
      current_team_id: numberOrNull(club?.provider_team_id),
      current_team_name: club?.name || null,
      current_team_logo_url: club ? localTouchLineClubLogoUrl(club.name, club.logo_url) || null : null,
      current_league_id: numberOrNull(competition?.provider_competition_id),
      current_league_name: competition?.name || null,
      current_league_logo_url: competition?.logo_url || null,
      market_value_eur: numberOrNull(player.market_value),
      age: numberOrNull(player.age),
      height_cm: heightCm,
      preferred_foot: null,
      contract_until: player.contract_until,
      current_season: process.env.TOUCHLINE_CURRENT_SEASON || "2026",
      raw_data: member ? { jersey_number: member.jersey_number ?? null } : null,
      source_updated_at: player.source_updated_at,
      updated_at: player.updated_at,
    };
  });
}

async function findSavedSportMonksPlayerCandidates(supabase: ReturnType<typeof getSupabaseService>, query: string, clubQuery?: string | null) {
  const needle = safeIlikeNeedle(query);
  if (!needle) return [];

  const clubNeedle = normalizeSearchText(clubQuery);
  const seen = new Set<string>();
  const candidates: any[] = [];

  for (const column of ["display_name", "name"]) {
    const { data, error } = await supabase
      .from("football_players")
      .select("*")
      .eq("provider", "sportmonks")
      .not("provider_player_id", "is", null)
      .ilike(column, `%${needle}%`)
      .order("source_updated_at", { ascending: false })
      .limit(10);

    if (error) continue;

    for (const player of await hydrateOfficialPlayerCache(supabase, data || [])) {
      const key = String(player.sportmonks_player_id || player.id || "");
      if (!key || seen.has(key) || !isFreshSavedPlayer(player)) continue;

      if (clubNeedle) {
        const club = normalizeSearchText(player.current_team_name);
        if (!club || (!club.includes(clubNeedle) && !clubNeedle.includes(club))) continue;
      }

      seen.add(key);
      candidates.push(player);
    }
  }

  return sortSavedCandidates(candidates, query).slice(0, 10);
}

async function findSavedSportMonksPlayer(supabase: ReturnType<typeof getSupabaseService>, sportmonksPlayerId?: string | number | null) {
  if (!sportmonksPlayerId) return null;

  const { data, error } = await supabase
    .from("football_players")
    .select("*")
    .eq("provider", "sportmonks")
    .eq("provider_player_id", String(sportmonksPlayerId))
    .maybeSingle();

  if (error || !data) return null;
  const [player] = await hydrateOfficialPlayerCache(supabase, [data]);
  return isFreshSavedPlayer(player) ? player : null;
}

function formatFoot(value?: string | null) {
  if (!value) return "N/A";
  const cleanValue = String(value).trim();
  if (!cleanValue) return "N/A";
  return cleanValue.charAt(0).toUpperCase() + cleanValue.slice(1).toLowerCase();
}

function touchlineAssetSlug(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function touchlineAssetClubAlias(value?: string | null) {
  const slug = touchlineAssetSlug(value);

  if (!slug) return "";
  if (slug.includes("manchester-city") || slug === "mancity" || slug === "man-city") return "man-city";
  if (slug.includes("manchester-united") || slug === "man-united" || slug === "man-utd") return "man-united";
  if (slug.includes("tottenham")) return "tottenham";
  if (slug.includes("liverpool")) return "liverpool";
  if (slug.includes("arsenal")) return "arsenal";
  if (slug.includes("chelsea")) return "chelsea";
  if (slug.includes("newcastle")) return "newcastle";
  return slug;
}

function approvedStaticCardPortraitUrl(player: any) {
  const clubSlug = touchlineAssetClubAlias(player.current_team_name);
  const playerSlugs = [
    touchlineAssetSlug(player.display_name),
    touchlineAssetSlug(player.name),
    touchlineAssetSlug(player.common_name),
  ].filter(Boolean);

  if (!playerSlugs.length || !clubSlug) return "";

  for (const playerSlug of playerSlugs) {
    const publicPath = `/touchlineArena/players/${playerSlug}/${clubSlug}/v1/approved/cards/portrait/transparent.png`;
    if (fs.existsSync(path.join(PUBLIC_ROOT, publicPath.replace(/^\/+/, "")))) return publicPath;
  }

  return "";
}

function buildPlayerCard(player: any) {
  const shirtNumber = jerseyNumber(player.raw_data);
  const approvedPortraitUrl = approvedStaticCardPortraitUrl(player);

  return {
    sportmonksPlayerId: String(player.sportmonks_player_id),

    overall: player.overall_rating ? Math.round(Number(player.overall_rating)) : shirtNumber || "—",
    shirtNumber: shirtNumber || "",

    role: player.role_name || "Player",
    position: player.position_code || "Player",

    flagUrl: touchlineCountryFlagUrl(player.country_code3) || "",
    countryCode3: player.country_code3 || "N/A",

    name: player.display_name || "Unknown Player",

    clubName: player.current_team_name || "Free Agent",
    clubLogoUrl: localTouchLineClubLogoUrl(player.current_team_name, player.current_team_logo_url),

    leagueName: player.current_league_name || "League",
    leagueLogoUrl: localTouchLineAssetUrl(player.current_league_logo_url),

    marketValue: formatMarketValue(player.market_value_eur),
    updatedAt: formatUpdated(player.updated_at),

    age: player.age || "N/A",
    height: formatHeight(player.height_cm),
    foot: formatFoot(player.preferred_foot),
    contract: formatContract(player.contract_until),
    nationality: player.nationality_name || player.country_code3 || "N/A",
    stadiumName: player.current_venue_name || "",
    frameUrl: "",
    avatarImageUrl: approvedPortraitUrl,
    avatarImageScale: approvedPortraitUrl ? 1.12 : 1,
    avatarObjectPosition: approvedPortraitUrl ? "center bottom" : "center center",
    sourcePhotoUrl: "",
  };
}

export async function POST(req: Request) {
  try {
    const accessError = await requireAuthenticatedOrLocalTouchlineEditor(req);
    if (accessError) return accessError;

    const { query, playerName, clubQuery, sportmonksPlayerId, searchOnly } = await req.json();

    const searchQuery = String(query || playerName || "").trim();

    if (!searchQuery) {
      return playerRouteJson({ error: "Missing player search query." }, { status: 400 });
    }

    if (searchOnly) {
      const supabase = getSupabaseService();
      const cachedCandidates = await findSavedSportMonksPlayerCandidates(supabase, searchQuery, typeof clubQuery === "string" ? clubQuery : null);

      if (cachedCandidates.length) {
        return playerRouteJson({
          ok: true,
          source: "database_cache",
          cacheTtlSeconds: Math.round(playerCacheTtlMs() / 1000),
          candidates: cachedCandidates.map(cachedPlayerSearchCandidate),
        });
      }

      const candidates = await fetchSportMonksPlayerCandidates(searchQuery, typeof clubQuery === "string" ? clubQuery : null);

      return playerRouteJson({
        ok: true,
        source: "sportmonks_refreshed",
        cacheTtlSeconds: Math.round(playerCacheTtlMs() / 1000),
        candidates: candidates.map(cachedPlayerSearchCandidate),
      });
    }

    let rawPlayer: any = null;
    let normalized: any = null;
    let livePlayerError: unknown = null;
    let playerDataSource: "sportmonks_api" | "database_fallback" = "sportmonks_api";

    try {
      rawPlayer = await fetchFullSportMonksPlayer(searchQuery, sportmonksPlayerId);

      if (rawPlayer?.id) {
        normalized = await enrichPlayerMarketValue(await enrichPlayerTeamData(normalizeSportMonksPlayer(rawPlayer)));
        normalized = {
          ...normalized,
          updated_at: new Date().toISOString(),
        };
      }
    } catch (error) {
      livePlayerError = error;
    }

    if (!normalized) {
      let cachedPlayer: any = null;

      try {
        const supabase = getSupabaseService();
        cachedPlayer = await findSavedSportMonksPlayer(supabase, sportmonksPlayerId);
      } catch {
        cachedPlayer = null;
      }

      if (cachedPlayer) {
        rawPlayer = cachedPlayer.raw_data || null;
        normalized = cachedPlayer;
        playerDataSource = "database_fallback";
      } else if (livePlayerError) {
        throw livePlayerError;
      } else {
        return playerRouteJson({ error: "Player not found in TouchLine England." }, { status: 404 });
      }
    }

    const savedPlayer = normalized;
    const playerCard = buildPlayerCard(savedPlayer);

    return playerRouteJson({
      playerCard,
      completeness: {
        hasPosition: Boolean(savedPlayer.position_code && savedPlayer.position_code !== "N/A"),
        hasClub: Boolean(savedPlayer.current_team_name),
        hasLeague: Boolean(savedPlayer.current_league_name),
        hasMarketValue: Boolean(savedPlayer.market_value_eur),
      },
      diagnostics: {
        playerPersistenceError: null,
        photoSource: {
          sourceRule: "Provider photos are not exposed. Only an existing approved TouchLine static portrait may be rendered.",
          rawPhotoPubliclyRendered: false,
          playerDataSource,
        },
        footballPlayersSchemaReady: true,
        playersSchemaReady: true,
      },
    });
  } catch (error: any) {
    console.error(error);

    const message = error?.message || "";
    const publicError = message.includes("temporarily unavailable")
      ? "TouchLine England is temporarily unavailable. Try again in a few seconds."
      : message.includes("rate-limiting")
        ? "TouchLine England is rate-limiting searches right now. Wait a few seconds and try again."
        : "Search and build card failed.";

    return playerRouteJson(
      {
        error: publicError,
      },
      { status: 500 },
    );
  }
}

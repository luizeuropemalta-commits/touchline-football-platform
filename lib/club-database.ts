import type { SupabaseClient } from "@supabase/supabase-js";
import { discoverEntityPlayerLinks } from "@/lib/market-link-registry";

export type ClubDatabaseProfile = {
  id: string;
  transfermarktId: string;
  name: string;
  profileUrl: string;
  photoUrl?: string | null;
  status: string;
  lastCheckedAt?: string | null;
  updatedAt?: string | null;
  marketValueText?: string | null;
  marketValue?: number | null;
  currency?: string | null;
  squadSize?: string | null;
  averageAge?: string | null;
  foreigners?: string | null;
  nationalTeamPlayers?: string | null;
  stadium?: string | null;
  league?: string | null;
  country?: string | null;
  rankLabel?: string | null;
  sourcePayload?: Record<string, unknown>;
};

type EntityRow = {
  id: string;
  transfermarkt_id: string;
  name: string;
  canonical_url: string;
  profile_url: string;
  photo_url: string | null;
  status: string;
  last_checked_at: string | null;
  updated_at: string | null;
  source_payload: Record<string, unknown> | null;
};

function cleanText(value?: string | null, max = 240) {
  return value?.trim().replace(/\s+/g, " ").slice(0, max) || null;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaContent(html: string, key: string) {
  const escapedKey = escapeRegex(key);
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedKey}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedKey}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return stripHtml(match[1]);
  }
  return null;
}

function extractClubName(html: string) {
  const headline =
    html.match(/<h1[^>]*class=["'][^"']*data-header__headline-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return cleanText(headline ? stripHtml(headline) : null, 180) ?? cleanText(extractMetaContent(html, "og:title")?.replace(/\s*\|.*$/g, ""), 180);
}

function absolutizeImageUrl(value: string | null | undefined, profileUrl: string) {
  if (!value) return null;
  try {
    const url = new URL(value, profileUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isGenericTransfermarktImage(value?: string | null) {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower.includes("transfermarkt-logo") ||
    lower.includes("/logo/") ||
    lower.includes("/logos/") ||
    lower.includes("tm-logo") ||
    lower.includes("default") ||
    lower.includes("socialmedia")
  );
}

function isLikelyClubCrest(value?: string | null) {
  if (!value || isGenericTransfermarktImage(value)) return false;
  const lower = value.toLowerCase();
  return lower.includes("/wappen/") || lower.includes("wappen") || lower.includes("vereinslogo") || lower.includes("club-logo");
}

function imageCandidatesFromHtml(html: string, profileUrl: string) {
  const candidates: string[] = [];
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    for (const attr of ["src", "data-src", "data-original", "data-lazy"]) {
      const value = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"))?.[1];
      const url = absolutizeImageUrl(value, profileUrl);
      if (url) candidates.push(url);
    }
    const srcset = tag.match(/srcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      for (const part of srcset.split(",")) {
        const value = part.trim().split(/\s+/)[0];
        const url = absolutizeImageUrl(value, profileUrl);
        if (url) candidates.push(url);
      }
    }
  }
  return [...new Set(candidates)];
}

function extractClubPhoto(html: string, profileUrl: string) {
  const candidates = imageCandidatesFromHtml(html, profileUrl);
  const crest = candidates.find(isLikelyClubCrest);
  if (crest) return crest;

  const classImage =
    html.match(/<img[^>]+class=["'][^"']*(?:data-header__profile-image|data-header__profile-club|vereinprofil_tooltip|vereinprofil)[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] ??
    html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]+class=["'][^"']*(?:data-header__profile-image|data-header__profile-club|vereinprofil_tooltip|vereinprofil)[^"']*["']/i)?.[1];
  const classImageUrl = absolutizeImageUrl(classImage, profileUrl);
  if (classImageUrl && !isGenericTransfermarktImage(classImageUrl)) return classImageUrl;

  const ogImage = absolutizeImageUrl(extractMetaContent(html, "og:image"), profileUrl);
  return ogImage && !isGenericTransfermarktImage(ogImage) ? ogImage : null;
}

function extractInfoValue(html: string, labels: string[]) {
  for (const label of labels) {
    const loose = new RegExp(`${escapeRegex(label)}\\s*:?\\s*</(?:span|div|td)>\\s*<(?:span|div|td)[^>]*>([\\s\\S]{0,300}?)</(?:span|div|td)>`, "i");
    const looseMatch = html.match(loose);
    const looseValue = looseMatch?.[1] ? stripHtml(looseMatch[1]) : null;
    if (looseValue && !new RegExp(`^${escapeRegex(label)}:?$`, "i").test(looseValue)) return cleanText(looseValue, 120);

    const text = stripHtml(html);
    const inline = text.match(new RegExp(`${escapeRegex(label)}\\s*:?\\s*([^|•\\n]{1,80})`, "i"))?.[1];
    if (inline) return cleanText(inline, 120);
  }
  return null;
}

function extractMarketValue(html: string) {
  const candidates = [
    html.match(/Total market value[\s\S]{0,900}?([€£$]\s?\d+(?:[.,]\d+)?\s?(?:m|k|bn|million|thousand)?)/i)?.[1],
    html.match(/Market value[\s\S]{0,900}?([€£$]\s?\d+(?:[.,]\d+)?\s?(?:m|k|bn|million|thousand)?)/i)?.[1],
    html.match(/class=["'][^"']*data-header__market-value-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i)?.[1],
  ];
  const text = cleanText(candidates.map((candidate) => candidate ? stripHtml(candidate) : null).find(Boolean), 80);
  if (!text) return { marketValue: null, marketValueText: null, currency: null };

  const currency = text.includes("£") ? "GBP" : text.includes("$") ? "USD" : "EUR";
  const numberMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  const raw = numberMatch?.[1] ? Number(numberMatch[1].replace(",", ".")) : null;
  const lower = text.toLowerCase();
  const multiplier = lower.includes("bn") ? 1_000_000_000 : lower.includes("m") || lower.includes("million") ? 1_000_000 : lower.includes("k") || lower.includes("thousand") ? 1_000 : 1;
  return {
    marketValue: raw && Number.isFinite(raw) ? raw * multiplier : null,
    marketValueText: text,
    currency,
  };
}

function parseClubHtml(html: string, profileUrl: string) {
  const market = extractMarketValue(html);
  return {
    name: extractClubName(html),
    photoUrl: extractClubPhoto(html, profileUrl),
    marketValue: market.marketValue,
    marketValueText: market.marketValueText,
    currency: market.currency,
    squadSize: extractInfoValue(html, ["Squad size", "Squad"]),
    averageAge: extractInfoValue(html, ["Average age"]),
    foreigners: extractInfoValue(html, ["Foreigners"]),
    nationalTeamPlayers: extractInfoValue(html, ["National team players", "National player"]),
    stadium: extractInfoValue(html, ["Stadium"]),
    league: extractInfoValue(html, ["League", "Current league"]),
    country: extractInfoValue(html, ["Country"]),
  };
}

function existingPayload(row: EntityRow) {
  return row.source_payload && typeof row.source_payload === "object" && !Array.isArray(row.source_payload)
    ? row.source_payload
    : {};
}

async function loadLatestPayload(admin: SupabaseClient, entityId: string, fallback: Record<string, unknown>) {
  const { data } = await admin
    .from("transfermarkt_entities")
    .select("source_payload")
    .eq("id", entityId)
    .maybeSingle();
  const payload = data?.source_payload;
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : fallback;
}

function profileEnrichmentEnabled() {
  const value = process.env.TRANSFERMARKT_PROFILE_ENRICHMENT_ENABLED ?? process.env.TRANSFERMARKT_SYNC_ENABLED;
  return value?.toLowerCase() !== "false";
}

function shouldSyncClubRoster(row: EntityRow) {
  const payload = existingPayload(row);
  const rosterSync = payload.clubRosterSync && typeof payload.clubRosterSync === "object" && !Array.isArray(payload.clubRosterSync)
    ? payload.clubRosterSync as Record<string, unknown>
    : {};
  const lastChecked = Date.parse(String(rosterSync.checkedAt ?? ""));
  return !lastChecked || Date.now() - lastChecked > 24 * 60 * 60 * 1000;
}

function mapClub(row: EntityRow): ClubDatabaseProfile {
  const payload = existingPayload(row);
  const club = payload.clubProfile && typeof payload.clubProfile === "object" && !Array.isArray(payload.clubProfile)
    ? payload.clubProfile as Record<string, unknown>
    : {};
  return {
    id: row.id,
    transfermarktId: row.transfermarkt_id,
    name: row.name,
    profileUrl: row.canonical_url ?? row.profile_url,
    photoUrl: isGenericTransfermarktImage(row.photo_url) ? null : row.photo_url,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    updatedAt: row.updated_at,
    marketValue: typeof club.marketValue === "number" ? club.marketValue : null,
    marketValueText: typeof club.marketValueText === "string" ? club.marketValueText : null,
    currency: typeof club.currency === "string" ? club.currency : "EUR",
    squadSize: typeof club.squadSize === "string" ? club.squadSize : null,
    averageAge: typeof club.averageAge === "string" ? club.averageAge : null,
    foreigners: typeof club.foreigners === "string" ? club.foreigners : null,
    nationalTeamPlayers: typeof club.nationalTeamPlayers === "string" ? club.nationalTeamPlayers : null,
    stadium: typeof club.stadium === "string" ? club.stadium : null,
    league: typeof club.league === "string" ? club.league : null,
    country: typeof club.country === "string" ? club.country : null,
    rankLabel: typeof club.rankLabel === "string" ? club.rankLabel : null,
    sourcePayload: payload,
  };
}

export async function enrichTransfermarktClubProfile(admin: SupabaseClient, row: EntityRow) {
  const profileUrl = row.canonical_url ?? row.profile_url;
  if (!profileUrl || !profileUrl.includes("transfermarkt.")) return mapClub(row);

  const payload = existingPayload(row);
  const club = payload.clubProfile && typeof payload.clubProfile === "object" && !Array.isArray(payload.clubProfile)
    ? payload.clubProfile as Record<string, unknown>
    : {};
  const lastChecked = Date.parse(String(club.checkedAt ?? ""));
  const hasGenericPhoto = isGenericTransfermarktImage(row.photo_url);
  const missingKeyFields = !row.photo_url || hasGenericPhoto || !club.marketValueText || !club.squadSize || !club.stadium || !club.league;

  if (!missingKeyFields) return mapClub(row);
  if (!hasGenericPhoto && lastChecked && Date.now() - lastChecked < 24 * 60 * 60 * 1000) return mapClub(row);
  if (!profileEnrichmentEnabled()) return mapClub(row);

  try {
    const response = await fetch(profileUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "TouchlineBot/1.0 (+https://touchline-football-platform.vercel.app; club metadata enrichment)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return mapClub(row);

    const html = (await response.text()).slice(0, 700_000);
    const parsed = parseClubHtml(html, profileUrl);
    const latestPayload = await loadLatestPayload(admin, row.id, payload);
    const nextPayload = {
      ...latestPayload,
      clubProfile: {
        ...club,
        ...parsed,
        checkedAt: new Date().toISOString(),
        status: "success",
        legalNote: "Touchline stores limited public club profile metadata for internal search/profile display and keeps Transfermarkt as the source link.",
      },
    };

    const { data } = await admin
      .from("transfermarkt_entities")
      .update({
        name: cleanText(parsed.name, 180) ?? row.name,
        photo_url: cleanText(parsed.photoUrl, 1000) ?? row.photo_url,
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        source_payload: nextPayload,
      })
      .eq("id", row.id)
      .select("id, transfermarkt_id, name, canonical_url, profile_url, photo_url, status, last_checked_at, updated_at, source_payload")
      .maybeSingle();

    return mapClub((data as EntityRow | null) ?? row);
  } catch {
    return mapClub(row);
  }
}

async function loadRawClubLinkedPlayers(admin: SupabaseClient, clubId: string) {
  const { data } = await admin
    .from("transfermarkt_relationships")
    .select("id, relationship_type, status, target:transfermarkt_entities!transfermarkt_relationships_target_entity_id_fkey(id, transfermarkt_id, entity_type, name, profile_url, canonical_url, photo_url, status)")
    .eq("source_entity_id", clubId)
    .eq("relationship_type", "club_player")
    .in("status", ["approved", "suggested", "needs_review"])
    .order("last_seen_at", { ascending: false })
    .limit(36);

  return ((data ?? []) as Array<{
    id: string;
    status: string;
    target?: {
      id?: string | null;
      transfermarkt_id?: string | null;
      entity_type?: string | null;
      name?: string | null;
      profile_url?: string | null;
      canonical_url?: string | null;
      photo_url?: string | null;
    } | null;
  }>).flatMap((row) => {
    const target = row.target;
    if (!target?.id || target.entity_type !== "player") return [];
    return [{
      entityId: target.id,
      id: target.id,
      transfermarktId: target.transfermarkt_id ?? "",
      name: target.name ?? "Player",
      profileUrl: target.canonical_url ?? target.profile_url ?? "#",
      photoUrl: target.photo_url ?? null,
      status: row.status,
    }];
  });
}

async function ensureGlobalPlayerProfilesForClub(admin: SupabaseClient, players: Awaited<ReturnType<typeof loadRawClubLinkedPlayers>>) {
  const rows = players.flatMap((player) => {
    if (!player.transfermarktId || !player.profileUrl || player.profileUrl === "#") return [];
    return [{
      transfermarkt_player_id: player.transfermarktId,
      player_name: player.name,
      profile_url: player.profileUrl,
      photo_url: player.photoUrl,
      source_provider: "transfermarkt",
      source_payload: {
        source: "club_profile_auto_sync",
        transfermarktEntityId: player.entityId,
        legalNote: "Automatically created from a public club-player reference. This is not a representation claim.",
      },
      last_updated_at: new Date().toISOString(),
    }];
  });

  if (!rows.length) return new Map<string, string>();

  const { data } = await admin
    .from("global_player_profiles")
    .upsert(rows, { onConflict: "transfermarkt_player_id" })
    .select("id, transfermarkt_player_id");

  return new Map(((data ?? []) as Array<{ id: string; transfermarkt_player_id: string }>).map((row) => [row.transfermarkt_player_id, row.id]));
}

export async function syncClubRosterOnProfileOpen(admin: SupabaseClient, row: EntityRow, createdBy?: string | null) {
  if (!shouldSyncClubRoster(row)) return;
  await discoverEntityPlayerLinks(
    admin,
    row.id,
    row.canonical_url ?? row.profile_url,
    "club_player",
    createdBy,
    { force: true },
  );

  const payload = existingPayload(row);
  const latestPayload = await loadLatestPayload(admin, row.id, payload);
  await admin
    .from("transfermarkt_entities")
    .update({
      source_payload: {
        ...latestPayload,
        clubRosterSync: {
          checkedAt: new Date().toISOString(),
          status: "attempted",
          legalNote: "Touchline stores public club-player links as references only.",
        },
      },
    })
    .eq("id", row.id);
}

export async function loadClubLinkedPlayers(admin: SupabaseClient, clubId: string) {
  const players = await loadRawClubLinkedPlayers(admin, clubId);
  const globalProfileIds = await ensureGlobalPlayerProfilesForClub(admin, players);
  return players.map((player) => ({
    ...player,
    internalProfileUrl: globalProfileIds.get(player.transfermarktId) ? `/players/database/${globalProfileIds.get(player.transfermarktId)}` : null,
  }));
}

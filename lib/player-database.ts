import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkPreviewResult } from "@/lib/link-preview";
import { fetchLinkPreview, getTransfermarktPlayerId, validatePreviewUrl } from "@/lib/link-preview";
import { upsertTransfermarktEntity } from "@/lib/market-link-registry";
import { parseTransfermarktEntityUrl } from "@/lib/market-link-parser";

export type PlayerDatabaseResult = {
  id: string;
  transfermarktPlayerId: string;
  sourceProvider?: string | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  sourceLinkLabel?: string | null;
  name: string;
  profileUrl: string;
  photoUrl?: string | null;
  currentClub?: string | null;
  position?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  agentName?: string | null;
  agencyName?: string | null;
  marketValue?: number | null;
  marketValueText?: string | null;
  currency?: string | null;
  lastUpdatedAt?: string | null;
  relevance?: number | null;
};

type UpsertProfileInput = {
  url: string;
  preview?: LinkPreviewResult;
  playerName?: string | null;
  photoUrl?: string | null;
  currentClub?: string | null;
  position?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  agentName?: string | null;
  agencyName?: string | null;
  marketValue?: number | null;
  marketValueText?: string | null;
  currency?: string | null;
  source?: string;
  payload?: Record<string, unknown>;
};

function cleanText(value?: string | null, max = 240) {
  return value?.trim().replace(/\s+/g, " ").slice(0, max) || null;
}

function normalizeHttpsUrl(value?: string | null) {
  const text = cleanText(value, 1000);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function titleToPlayerName(title?: string | null) {
  const cleaned = cleanText(title?.replace(/\s*\|.*$/g, "").replace(/\s+-\s+.*$/g, ""), 180);
  if (!cleaned) return null;
  if (/transfermarkt/i.test(cleaned) && cleaned.split(/\s+/).length <= 2) return null;
  return cleaned;
}

function playerNameFromUrl(profileUrl: string) {
  try {
    const slug = new URL(profileUrl).pathname.split("/").filter(Boolean)[0];
    if (!slug) return null;
    return slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

function toDate(value?: string | null) {
  const text = cleanText(value, 10);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function toNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function transfermarktProfileEnrichmentEnabled() {
  const value = process.env.TRANSFERMARKT_PROFILE_ENRICHMENT_ENABLED ?? process.env.TRANSFERMARKT_SYNC_ENABLED;
  return value?.toLowerCase() !== "false";
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

function extractTransfermarktInfoTableValue(html: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(
      `<span[^>]*class=["'][^"']*info-table__content--regular[^"']*["'][^>]*>\\s*${escapeRegex(label)}\\s*:?\\s*<\\/span>\\s*<span[^>]*class=["'][^"']*info-table__content--bold[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
      "i",
    );
    const match = html.match(pattern);
    const value = match?.[1] ? stripHtml(match[1]) : null;
    if (value) return value;
  }
  return null;
}

function extractTransfermarktInfoTableLink(html: string, labels: string[], expectedType: "agent" | "club") {
  for (const label of labels) {
    const pattern = new RegExp(
      `<span[^>]*class=["'][^"']*info-table__content--regular[^"']*["'][^>]*>\\s*${escapeRegex(label)}\\s*:?\\s*<\\/span>\\s*<span[^>]*class=["'][^"']*info-table__content--bold[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
      "i",
    );
    const match = html.match(pattern);
    const block = match?.[1];
    if (!block) continue;
    const href = block.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const parsed = parseTransfermarktEntityUrl(new URL(href, "https://www.transfermarkt.com").toString(), expectedType);
      if (parsed) return parsed;
    } catch {
      // Ignore malformed links and keep trying other labels.
    }
  }
  return null;
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

function extractTransfermarktName(html: string) {
  const headline = html.match(/<h1[^>]*class=["'][^"']*data-header__headline-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const name = headline ? stripHtml(headline).replace(/^#\d+\s*/g, "") : null;
  return cleanText(name, 180) ?? cleanText(extractMetaContent(html, "og:title")?.replace(/\s*\|.*$/g, ""), 180);
}

function extractTransfermarktPhoto(html: string, profileUrl: string) {
  const image =
    extractMetaContent(html, "og:image") ??
    html.match(/<img[^>]+class=["'][^"']*(?:data-header__profile-image|bilderrahmen-fixed)[^"']*["'][^>]+src=["']([^"']+)["']/i)?.[1] ??
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*(?:data-header__profile-image|bilderrahmen-fixed)[^"']*["']/i)?.[1];

  if (!image) return null;
  try {
    const url = new URL(image, profileUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractTransfermarktMarketValue(html: string) {
  const candidates = [
    html.match(/class=["'][^"']*data-header__market-value-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1],
    html.match(/class=["'][^"']*tm-player-market-value-development__current-value[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/Market value[\s\S]{0,700}?([€£$]\s?\d+(?:[.,]\d+)?\s?(?:m|k|bn|million|thousand)?)/i)?.[1],
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

function parseTransfermarktDate(value?: string | null) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const dateText = text.replace(/\([^)]*\)/g, "").trim();
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseTransfermarktAge(value?: string | null) {
  const match = value?.match(/\((\d{1,2})\)/);
  return match?.[1] ? Number(match[1]) : null;
}

function parseTransfermarktProfileHtml(html: string, profileUrl: string) {
  const dateOfBirthText = extractTransfermarktInfoTableValue(html, ["Date of birth/Age", "Date of birth"]);
  const market = extractTransfermarktMarketValue(html);
  return {
    playerName: extractTransfermarktName(html),
    photoUrl: extractTransfermarktPhoto(html, profileUrl),
    currentClub: extractTransfermarktInfoTableValue(html, ["Current club"]),
    position: extractTransfermarktInfoTableValue(html, ["Position", "Main position"]),
    nationality: extractTransfermarktInfoTableValue(html, ["Citizenship", "Nationality"]),
    dateOfBirth: parseTransfermarktDate(dateOfBirthText),
    age: parseTransfermarktAge(dateOfBirthText),
    agentName: extractTransfermarktInfoTableValue(html, ["Agent", "Player agent"]),
    currentClubEntity: extractTransfermarktInfoTableLink(html, ["Current club"], "club"),
    agentEntity: extractTransfermarktInfoTableLink(html, ["Agent", "Player agent"], "agent"),
    marketValue: market.marketValue,
    marketValueText: market.marketValueText,
    currency: market.currency,
  };
}

async function saveLinkedTransfermarktEntities(
  admin: SupabaseClient,
  input: {
    playerUrl: string;
    playerName?: string | null;
    club?: ReturnType<typeof parseTransfermarktEntityUrl>;
    agent?: ReturnType<typeof parseTransfermarktEntityUrl>;
  },
) {
  const player = parseTransfermarktEntityUrl(input.playerUrl, "player");
  if (!player) return { linked: 0 };

  const savedPlayer = await upsertTransfermarktEntity(admin, {
    url: player.canonicalUrl,
    name: input.playerName ?? player.name,
    entityType: "player",
    action: "search_save",
    fetchPreview: false,
    discoverRelationships: false,
  });

  let linked = 0;
  const links = [
    input.agent ? { entity: input.agent, relationshipType: "agent_player" as const } : null,
    input.club ? { entity: input.club, relationshipType: "club_player" as const } : null,
  ].filter(Boolean) as Array<{
    entity: NonNullable<ReturnType<typeof parseTransfermarktEntityUrl>>;
    relationshipType: "agent_player" | "club_player";
  }>;

  for (const link of links) {
    const savedSource = await upsertTransfermarktEntity(admin, {
      url: link.entity.canonicalUrl,
      name: link.entity.name,
      entityType: link.entity.entityType,
      sourceUrl: player.canonicalUrl,
      action: "search_save",
      fetchPreview: false,
      discoverRelationships: false,
    });

    const { error } = await admin.from("transfermarkt_relationships").upsert({
      source_entity_id: savedSource.entity.id,
      target_entity_id: savedPlayer.entity.id,
      relationship_type: link.relationshipType,
      status: "suggested",
      source_url: player.canonicalUrl,
      evidence: link.relationshipType === "agent_player"
        ? "Agent/agency link found on the player's public Transfermarkt profile. Requires confirmation before representation claims."
        : "Club link found on the player's public Transfermarkt profile.",
      source_payload: {
        discoveredAt: new Date().toISOString(),
        discoveredFrom: "player_profile_enrichment",
        safeRegistryOnly: true,
      },
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "source_entity_id,target_entity_id,relationship_type" });
    if (!error) linked += 1;
  }

  return { linked };
}

function existingText(row: Record<string, unknown> | null, key: string, max = 240) {
  return cleanText(typeof row?.[key] === "string" ? row[key] : null, max);
}

function existingNumber(row: Record<string, unknown> | null, key: string) {
  const value = row?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function existingPayload(row: Record<string, unknown> | null) {
  const payload = row?.source_payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

export function validateTransfermarktProfileUrl(value?: string | null) {
  const target = validatePreviewUrl(value);
  if (!target) return null;
  const host = target.hostname.toLowerCase();
  if (!host.endsWith("transfermarkt.com")) return null;
  if (!getTransfermarktPlayerId(target.toString())) return null;
  return target;
}

export async function upsertGlobalPlayerProfile(admin: SupabaseClient, input: UpsertProfileInput) {
  const target = validateTransfermarktProfileUrl(input.url);
  if (!target) throw new Error("Transfermarkt player profile URL is required.");

  const profileUrl = target.toString();
  const transfermarktPlayerId = getTransfermarktPlayerId(profileUrl);
  if (!transfermarktPlayerId) throw new Error("Transfermarkt player ID was not found in the URL.");

  const preview = input.preview ?? (await fetchLinkPreview(target));
  const { data: existingProfile } = (await admin
    .from("global_player_profiles")
    .select("player_name, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_payload")
    .eq("transfermarkt_player_id", transfermarktPlayerId)
    .maybeSingle()) as { data: Record<string, unknown> | null };

  const playerName =
    cleanText(input.playerName, 180) ||
    titleToPlayerName(preview.title) ||
    existingText(existingProfile, "player_name", 180) ||
    playerNameFromUrl(profileUrl) ||
    `Transfermarkt Player ${transfermarktPlayerId}`;

  const photoUrl = normalizeHttpsUrl(input.photoUrl) || normalizeHttpsUrl(preview.image) || normalizeHttpsUrl(existingText(existingProfile, "photo_url", 1000));
  const now = new Date().toISOString();
  const sourcePayload = {
    ...existingPayload(existingProfile),
    source: input.source ?? "touchline_import",
    profileUrl,
    previewTitle: preview.title,
    previewDescription: preview.description,
    previewImage: preview.image,
    siteName: preview.siteName,
    importedAt: now,
    note: "Stored as a searchable Touchline link/profile cache. Transfermarkt remains the click-through source.",
    ...(input.payload ?? {}),
  };

  const { data, error } = await admin
    .from("global_player_profiles")
    .upsert(
      {
        transfermarkt_player_id: transfermarktPlayerId,
        player_name: playerName,
        profile_url: profileUrl,
        photo_url: photoUrl,
        current_club: cleanText(input.currentClub, 180) ?? existingText(existingProfile, "current_club", 180),
        position: cleanText(input.position, 80) ?? existingText(existingProfile, "position", 80),
        nationality: cleanText(input.nationality, 80) ?? existingText(existingProfile, "nationality", 80),
        date_of_birth: toDate(input.dateOfBirth) ?? toDate(existingText(existingProfile, "date_of_birth", 10)),
        age: input.age && input.age > 0 && input.age < 80 ? Math.round(input.age) : existingNumber(existingProfile, "age"),
        agent_name: cleanText(input.agentName, 180) ?? existingText(existingProfile, "agent_name", 180),
        agency_name: cleanText(input.agencyName, 180) ?? existingText(existingProfile, "agency_name", 180),
        market_value: toNumber(input.marketValue) ?? existingNumber(existingProfile, "market_value"),
        market_value_text: cleanText(input.marketValueText, 80) ?? existingText(existingProfile, "market_value_text", 80),
        currency: (cleanText(input.currency, 3) ?? existingText(existingProfile, "currency", 3) ?? "EUR").toUpperCase(),
        source_provider: "transfermarkt",
        source_payload: sourcePayload,
        last_updated_at: now,
      },
      { onConflict: "transfermarkt_player_id" },
    )
    .select("id, transfermarkt_player_id, player_name, photo_url")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function enrichGlobalPlayerProfileFromTransfermarkt(
  admin: SupabaseClient,
  row: Record<string, unknown>,
) {
  const profileUrl = typeof row.profile_url === "string" ? row.profile_url : "";
  const target = validateTransfermarktProfileUrl(profileUrl);
  if (!target) return row;

  const payload = existingPayload(row);
  const enrichment = payload.transfermarktProfileEnrichment;
  const lastChecked = enrichment && typeof enrichment === "object" && !Array.isArray(enrichment)
    ? Date.parse(String((enrichment as Record<string, unknown>).checkedAt ?? ""))
    : 0;
  const missingKeyFields = [
    row.photo_url,
    row.current_club,
    row.position,
    row.nationality,
    row.date_of_birth || row.age,
    row.market_value || row.market_value_text,
  ].some((value) => !value);

  if (!missingKeyFields) return row;
  if (lastChecked && Date.now() - lastChecked < 24 * 60 * 60 * 1000) return row;
  if (!transfermarktProfileEnrichmentEnabled()) return row;

  try {
    const response = await fetch(target.toString(), {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "TouchlineBot/1.0 (+https://touchline-football-platform.vercel.app; profile metadata enrichment)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return row;

    const html = (await response.text()).slice(0, 700_000);
    const parsed = parseTransfermarktProfileHtml(html, target.toString());
    const linked = await saveLinkedTransfermarktEntities(admin, {
      playerUrl: target.toString(),
      playerName: cleanText(parsed.playerName, 180) ?? existingText(row, "player_name", 180),
      club: parsed.currentClubEntity,
      agent: parsed.agentEntity,
    });
    const patch = {
      player_name: cleanText(parsed.playerName, 180) ?? existingText(row, "player_name", 180),
      photo_url: normalizeHttpsUrl(parsed.photoUrl) ?? existingText(row, "photo_url", 1000),
      current_club: cleanText(parsed.currentClub, 180) ?? existingText(row, "current_club", 180),
      position: cleanText(parsed.position, 80) ?? existingText(row, "position", 80),
      nationality: cleanText(parsed.nationality, 80) ?? existingText(row, "nationality", 80),
      date_of_birth: toDate(parsed.dateOfBirth) ?? toDate(existingText(row, "date_of_birth", 10)),
      age: parsed.age && parsed.age > 0 && parsed.age < 80 ? parsed.age : existingNumber(row, "age"),
      agent_name: cleanText(parsed.agentName, 180) ?? existingText(row, "agent_name", 180),
      market_value: toNumber(parsed.marketValue) ?? existingNumber(row, "market_value"),
      market_value_text: cleanText(parsed.marketValueText, 80) ?? existingText(row, "market_value_text", 80),
      currency: (cleanText(parsed.currency, 3) ?? existingText(row, "currency", 3) ?? "EUR").toUpperCase(),
      source_provider: "transfermarkt",
      source_payload: {
        ...payload,
        transfermarktProfileEnrichment: {
          checkedAt: new Date().toISOString(),
          status: "success",
          fieldsFound: Object.entries(parsed).filter(([, value]) => Boolean(value)).map(([key]) => key),
          linkedEntitiesSaved: linked.linked,
          legalNote: "Touchline stores limited public profile metadata for internal search/profile display and keeps Transfermarkt as the source link.",
        },
      },
      last_updated_at: new Date().toISOString(),
    };

    const { data } = await admin
      .from("global_player_profiles")
      .update(patch)
      .eq("id", row.id)
      .select("id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at, created_at, updated_at")
      .maybeSingle();

    return data ?? row;
  } catch {
    return row;
  }
}

export function mapGlobalPlayer(row: Record<string, unknown>): PlayerDatabaseResult {
  const sourcePayload = row.source_payload && typeof row.source_payload === "object" && !Array.isArray(row.source_payload)
    ? (row.source_payload as Record<string, unknown>)
    : {};
  const sourceProvider = (row.source_provider as string | null) ?? "transfermarkt";
  const apiFootballPlayerId = sourcePayload.apiFootballPlayerId ? String(sourcePayload.apiFootballPlayerId) : null;
  const sourceLabel = sourceProvider === "transfermarkt"
    ? "Transfermarkt"
    : sourcePayload.source === "api-football"
      ? "API-Football"
      : "Football Data";
  const sourceLinkLabel = sourceProvider === "transfermarkt" ? "Transfermarkt" : "Source Link";

  return {
    id: String(row.id),
    transfermarktPlayerId: String(row.transfermarkt_player_id ?? ""),
    sourceProvider,
    sourceId: apiFootballPlayerId ?? String(row.transfermarkt_player_id ?? ""),
    sourceLabel,
    sourceLinkLabel,
    name: String(row.player_name ?? "Unnamed player"),
    profileUrl: String(row.profile_url ?? ""),
    photoUrl: (row.photo_url as string | null) ?? null,
    currentClub: (row.current_club as string | null) ?? null,
    position: (row.position as string | null) ?? null,
    nationality: (row.nationality as string | null) ?? null,
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    age: (row.age as number | null) ?? null,
    agentName: (row.agent_name as string | null) ?? null,
    agencyName: (row.agency_name as string | null) ?? null,
    marketValue: (row.market_value as number | null) ?? null,
    marketValueText: (row.market_value_text as string | null) ?? null,
    currency: (row.currency as string | null) ?? "EUR",
    lastUpdatedAt: (row.last_updated_at as string | null) ?? null,
    relevance: (row.relevance as number | null) ?? null,
  };
}

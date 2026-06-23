import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkPreviewResult } from "@/lib/link-preview";
import { fetchLinkPreview, getTransfermarktPlayerId, validatePreviewUrl } from "@/lib/link-preview";

export type PlayerDatabaseResult = {
  id: string;
  transfermarktPlayerId: string;
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

export function mapGlobalPlayer(row: Record<string, unknown>): PlayerDatabaseResult {
  return {
    id: String(row.id),
    transfermarktPlayerId: String(row.transfermarkt_player_id ?? ""),
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

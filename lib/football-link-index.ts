import type { SupabaseClient } from "@supabase/supabase-js";
import { getDomain, getTransfermarktPlayerId, validatePreviewUrl } from "@/lib/link-preview";

export type FootballLinkEntityType = "player" | "agent" | "club" | "coach" | "competition" | "other";

export type ParsedFootballLink = {
  entityType: FootballLinkEntityType;
  sourceProvider: "transfermarkt";
  sourceId: string | null;
  canonicalUrl: string;
  sourceDomain: string | null;
  title: string;
};

export type FootballLinkSeed = {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  source?: string;
  importedBy?: string | null;
  payload?: Record<string, unknown>;
};

export const footballLinkDailyLimit = Math.min(
  Math.max(Number(process.env.TOUCHLINE_LINK_INDEX_DAILY_LIMIT ?? 1000) || 1000, 50),
  2500,
);

const urlPattern = /https?:\/\/[^\s"'<>()[\]{}]+/gi;

function cleanText(value?: string | null, max = 240) {
  return value?.trim().replace(/\s+/g, " ").slice(0, max) || null;
}

function cleanUrlCandidate(value: string) {
  return value.trim().replace(/[.,;:!?]+$/g, "");
}

function toTitleFromSlug(value: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .slice(0, 180);
  } catch {
    return value.replace(/[-_]+/g, " ").trim().slice(0, 180);
  }
}

function firstReadableSlug(pathname: string) {
  const blocked = new Set([
    "profil",
    "spieler",
    "verein",
    "berater",
    "beraterfirma",
    "trainer",
    "wettbewerb",
    "startseite",
    "leistungsdaten",
    "transfers",
    "marktwertverlauf",
    "geruechte",
  ]);

  return pathname
    .split("/")
    .filter(Boolean)
    .find((part) => !blocked.has(part.toLowerCase()) && !/^\d+$/.test(part));
}

function canonicalizeTransfermarktUrl(target: URL) {
  target.hash = "";
  target.search = "";
  target.hostname = target.hostname.toLowerCase();
  target.pathname = target.pathname.replace(/\/+$/g, "");
  return target.toString();
}

function matchId(pathname: string, pattern: RegExp) {
  const match = pathname.match(pattern);
  return match?.[1] ?? null;
}

export function extractUrlsFromText(text?: string | null) {
  if (!text) return [];
  const found = text.match(urlPattern) ?? [];
  return [...new Set(found.map(cleanUrlCandidate).filter(Boolean))];
}

export function parseTransfermarktLink(value?: string | null): ParsedFootballLink | null {
  const target = validatePreviewUrl(value);
  if (!target) return null;
  if (!target.hostname.toLowerCase().includes("transfermarkt.")) return null;

  const canonicalUrl = canonicalizeTransfermarktUrl(target);
  const pathname = target.pathname;
  const playerId = getTransfermarktPlayerId(canonicalUrl);
  const agentId = matchId(pathname, /\/berater\/(\d+)/i) ?? matchId(pathname, /\/beraterfirma\/(\d+)/i);
  const clubId = matchId(pathname, /\/verein\/(\d+)/i);
  const coachId = matchId(pathname, /\/trainer\/(\d+)/i);
  const competitionId = matchId(pathname, /\/wettbewerb\/([a-z0-9_-]+)/i);

  const entityType: FootballLinkEntityType = playerId
    ? "player"
    : agentId
      ? "agent"
      : clubId
        ? "club"
        : coachId
          ? "coach"
          : competitionId
            ? "competition"
            : "other";

  const sourceId = playerId ?? agentId ?? clubId ?? coachId ?? competitionId ?? null;
  const fallbackTitle = entityType === "other" ? "Transfermarkt link" : `Transfermarkt ${entityType}`;
  const title = toTitleFromSlug(firstReadableSlug(pathname) ?? null) ?? (sourceId ? `${fallbackTitle} ${sourceId}` : fallbackTitle);

  return {
    entityType,
    sourceProvider: "transfermarkt",
    sourceId,
    canonicalUrl,
    sourceDomain: getDomain(canonicalUrl),
    title,
  };
}

export function buildFootballLinkSeedsFromText(text?: string | null, base?: Omit<FootballLinkSeed, "url">) {
  return extractUrlsFromText(text).map((url) => ({ ...base, url }));
}

export function buildGlobalPlayerRowsFromParsedLinks(links: Array<ParsedFootballLink & FootballLinkSeed>) {
  const now = new Date().toISOString();
  return links
    .filter((link) => link.entityType === "player" && link.sourceId)
    .map((link) => ({
      transfermarkt_player_id: link.sourceId,
      player_name: cleanText(link.title, 180) ?? `Transfermarkt Player ${link.sourceId}`,
      profile_url: link.canonicalUrl,
      photo_url: cleanText(link.imageUrl, 1000),
      source_provider: "transfermarkt",
      source_payload: {
        source: link.source ?? "automatic_link_index",
        indexedAt: now,
        note: "Automatically indexed from Touchline-owned activity. Transfermarkt remains the click-through source.",
        ...(link.payload ?? {}),
      },
      last_updated_at: now,
    }));
}

export async function upsertFootballLinkSeeds(admin: SupabaseClient, seeds: FootballLinkSeed[]) {
  const now = new Date().toISOString();
  const parsed = seeds
    .map((seed) => {
      const link = parseTransfermarktLink(seed.url);
      return link ? { ...seed, ...link } : null;
    })
    .filter(Boolean) as Array<FootballLinkSeed & ParsedFootballLink>;

  const unique = new Map<string, FootballLinkSeed & ParsedFootballLink>();
  parsed.forEach((link) => unique.set(link.canonicalUrl, link));
  const links = [...unique.values()];
  if (!links.length) return { parsed: 0, saved: 0, playerProfiles: 0 };

  const { data: existingRows } = await admin
    .from("global_football_links")
    .select("canonical_url,title,description,image_url,source_payload")
    .in("canonical_url", links.map((link) => link.canonicalUrl));

  const existingByUrl = new Map<string, Record<string, unknown>>();
  ((existingRows ?? []) as Record<string, unknown>[]).forEach((row) => existingByUrl.set(String(row.canonical_url), row));

  const rows = links.map((link) => {
    const existing = existingByUrl.get(link.canonicalUrl);
    const existingPayload = existing?.source_payload && typeof existing.source_payload === "object" && !Array.isArray(existing.source_payload)
      ? existing.source_payload as Record<string, unknown>
      : {};

    return {
      source_provider: link.sourceProvider,
      entity_type: link.entityType,
      source_id: link.sourceId,
      canonical_url: link.canonicalUrl,
      source_domain: link.sourceDomain,
      title: cleanText(link.title, 180) ?? cleanText(existing?.title as string | null, 180) ?? "Transfermarkt link",
      description: cleanText(link.description, 500) ?? cleanText(existing?.description as string | null, 500),
      image_url: cleanText(link.imageUrl, 1000) ?? cleanText(existing?.image_url as string | null, 1000),
      status: "active",
      import_source: cleanText(link.source, 80) ?? "automatic_link_index",
      imported_by: link.importedBy ?? null,
      source_payload: {
        ...existingPayload,
        ...link.payload,
        lastIndexSource: link.source ?? "automatic_link_index",
        lastIndexedAt: now,
      },
      last_seen_at: now,
    };
  });

  const { error } = await admin
    .from("global_football_links")
    .upsert(rows, { onConflict: "source_provider,canonical_url" });

  if (error) throw new Error(error.message);

  const playerRows = buildGlobalPlayerRowsFromParsedLinks(links);
  if (playerRows.length) {
    await admin
      .from("global_player_profiles")
      .upsert(playerRows, { onConflict: "transfermarkt_player_id", ignoreDuplicates: true });
  }

  return { parsed: parsed.length, saved: rows.length, playerProfiles: playerRows.length };
}

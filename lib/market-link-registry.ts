import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLinkPreview } from "@/lib/link-preview";
import { upsertFootballLinkSeeds } from "@/lib/football-link-index";
import { parseTransfermarktEntityUrl, type ParsedTransfermarktUrl } from "@/lib/market-link-parser";

export type TransfermarktEntityType = "player" | "agent" | "club";
export type TransfermarktStatus = "active" | "unavailable" | "changed" | "duplicate" | "needs_review" | "rejected";

export type ParsedTransfermarktEntity = ParsedTransfermarktUrl;

export type UpsertMarketLinkInput = {
  url: string;
  name?: string | null;
  entityType?: TransfermarktEntityType | null;
  photoUrl?: string | null;
  sourceUrl?: string | null;
  createdBy?: string | null;
  action?: "manual_add" | "search_save" | "agent_discovery" | "scheduled_sync" | "manual_sync";
  fetchPreview?: boolean;
  discoverRelationships?: boolean;
};

export const transfermarktAllowedTypes = new Set(["player", "agent", "club"]);

const MAX_DISCOVERED_RELATIONSHIPS = 30;

function cleanText(value?: string | null, max = 240) {
  return value?.trim().replace(/\s+/g, " ").slice(0, max) || null;
}

function normalizeSearchText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchResultScore(name: string, query: string) {
  const normalizedName = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedName || !normalizedQuery) return 0;

  let score = 0;
  if (normalizedName === normalizedQuery) score += 1000;
  if (normalizedName.startsWith(normalizedQuery)) score += 500;
  if (normalizedName.includes(normalizedQuery)) score += 250;

  const words = normalizedQuery.split(" ").filter(Boolean);
  const matchedWords = words.filter((word) => normalizedName.includes(word)).length;
  score += matchedWords * 80;
  score -= Math.max(normalizedName.length - normalizedQuery.length, 0);
  return score;
}

export function transfermarktSyncEnabled() {
  return process.env.TRANSFERMARKT_SYNC_ENABLED?.toLowerCase() === "true";
}

export function transfermarktRateLimitMs() {
  const parsed = Number(process.env.TRANSFERMARKT_RATE_LIMIT_MS ?? 2500);
  if (!Number.isFinite(parsed)) return 2500;
  return Math.min(Math.max(Math.round(parsed), 1000), 60_000);
}

export function marketSyncSecret() {
  return process.env.TRANSFERMARKT_SYNC_SECRET ?? process.env.MARKET_SYNC_SECRET ?? process.env.CRON_SECRET ?? "";
}

export async function waitForTransfermarktRateLimit() {
  await new Promise((resolve) => setTimeout(resolve, transfermarktRateLimitMs()));
}

async function logSync(
  admin: SupabaseClient,
  input: {
    entityId?: string | null;
    action: string;
    status: string;
    sourceUrl?: string | null;
    message?: string | null;
    recordsFound?: number;
    recordsSaved?: number;
    durationMs?: number;
    createdBy?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  await admin.from("transfermarkt_sync_logs").insert({
    entity_id: input.entityId ?? null,
    action: input.action,
    status: input.status,
    source_url: input.sourceUrl ?? null,
    message: cleanText(input.message, 500),
    records_found: input.recordsFound ?? 0,
    records_saved: input.recordsSaved ?? 0,
    duration_ms: input.durationMs ?? null,
    created_by: input.createdBy ?? null,
    source_payload: input.payload ?? {},
  });
}

export async function upsertTransfermarktEntity(admin: SupabaseClient, input: UpsertMarketLinkInput) {
  const started = Date.now();
  const parsed = parseTransfermarktEntityUrl(input.url, input.entityType ?? null);
  if (!parsed) {
    await logSync(admin, {
      action: input.action ?? "manual_add",
      status: "error",
      sourceUrl: input.url,
      message: "Invalid Transfermarkt player, agent or club URL.",
      createdBy: input.createdBy,
    });
    throw new Error("Invalid Transfermarkt player, agent or club URL.");
  }

  let previewTitle: string | null = null;
  let previewImage: string | null = cleanText(input.photoUrl, 1000);
  let previewStatus = "skipped";

  if (input.fetchPreview && transfermarktSyncEnabled()) {
    await waitForTransfermarktRateLimit();
    const preview = await fetchLinkPreview(new URL(parsed.canonicalUrl));
    previewTitle = preview.title;
    previewImage = preview.image ?? previewImage;
    previewStatus = preview.ok ? "success" : "partial";
  }

  const name =
    cleanText(input.name, 180) ??
    cleanText(previewTitle?.replace(/\s*\|.*$/g, ""), 180) ??
    parsed.name;

  const row = {
    transfermarkt_id: parsed.transfermarktId,
    entity_type: parsed.entityType,
    name,
    profile_url: parsed.profileUrl,
    canonical_url: parsed.canonicalUrl,
    photo_url: previewImage,
    source_domain: parsed.sourceDomain,
    status: "active" as TransfermarktStatus,
    confidence: input.name ? "user_submitted" : "public_reference",
    last_checked_at: new Date().toISOString(),
    next_check_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    source_url: input.sourceUrl ?? parsed.canonicalUrl,
    created_by: input.createdBy ?? null,
    source_payload: {
      source: input.action ?? "manual_add",
      previewStatus,
      legalNote: "Touchline stores profile links and public preview metadata only. Transfermarkt remains the click-through source.",
    },
  };

  const { data, error } = await admin
    .from("transfermarkt_entities")
    .upsert(row, { onConflict: "entity_type,transfermarkt_id" })
    .select("id, transfermarkt_id, entity_type, name, profile_url, canonical_url, photo_url, status, last_checked_at")
    .single();

  if (error) throw new Error(error.message);

  await upsertFootballLinkSeeds(admin, [{
    url: parsed.canonicalUrl,
    title: name,
    imageUrl: previewImage,
    source: "market_link_registry",
    importedBy: input.createdBy,
    payload: { registryEntityType: parsed.entityType, registryEntityId: data.id },
  }]);

  await logSync(admin, {
    entityId: data.id,
    action: input.action ?? "manual_add",
    status: "success",
    sourceUrl: parsed.canonicalUrl,
    message: "Transfermarkt entity saved without creating a duplicate.",
    recordsFound: 1,
    recordsSaved: 1,
    durationMs: Date.now() - started,
    createdBy: input.createdBy,
  });

  let relationshipsSaved = 0;
  if (input.discoverRelationships && parsed.entityType === "agent" && transfermarktSyncEnabled()) {
    const result = await discoverAgentPlayerLinks(admin, data.id, parsed.canonicalUrl, input.createdBy ?? null);
    relationshipsSaved = result.relationshipsSaved;
  }

  return { entity: data, relationshipsSaved };
}

export function extractTransfermarktUrlsFromHtml(html: string) {
  const matches = html.match(/https?:\/\/(?:www\.)?transfermarkt\.[^\s"'<>]+/gi) ?? [];
  const relativeMatches = html.match(/href=["'](\/[^"']*(?:\/spieler\/|\/berater\/|\/beraterfirma\/|\/verein\/)[^"']*)["']/gi) ?? [];
  const relativeUrls = relativeMatches
    .map((match) => match.match(/href=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .map((path) => `https://www.transfermarkt.com${path}`);

  return [...new Set([...matches, ...relativeUrls].map((url) => url.replace(/[?#].*$/, "").replace(/[.,;:!?]+$/g, "")))];
}

export async function discoverEntityPlayerLinks(
  admin: SupabaseClient,
  sourceEntityId: string,
  sourceUrl: string,
  relationshipType: "agent_player" | "club_player" = "agent_player",
  createdBy?: string | null,
  options?: { force?: boolean },
) {
  const started = Date.now();
  if (!transfermarktSyncEnabled() && !options?.force) {
    await logSync(admin, {
      entityId: sourceEntityId,
      action: "agent_discovery",
      status: "not_configured",
      sourceUrl,
      message: "TRANSFERMARKT_SYNC_ENABLED is not true, so external discovery was skipped.",
      createdBy,
    });
    return { discovered: 0, relationshipsSaved: 0 };
  }

  await waitForTransfermarktRateLimit();
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "TouchlineBot/1.0 (+https://touchline-football-platform.vercel.app; safe link registry)",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    await logSync(admin, {
      entityId: sourceEntityId,
      action: "agent_discovery",
      status: "partial",
      sourceUrl,
      message: `Source page unavailable or blocked (${response.status}).`,
      durationMs: Date.now() - started,
      createdBy,
    });
    return { discovered: 0, relationshipsSaved: 0 };
  }

  const html = (await response.text()).slice(0, 500_000);
  const playerLinks = extractTransfermarktUrlsFromHtml(html)
    .map((url) => parseTransfermarktEntityUrl(url, "player"))
    .filter(Boolean) as ParsedTransfermarktEntity[];

  const uniquePlayers = [...new Map(playerLinks.map((player) => [`${player.entityType}:${player.transfermarktId}`, player])).values()]
    .slice(0, MAX_DISCOVERED_RELATIONSHIPS);

  let relationshipsSaved = 0;
  for (const player of uniquePlayers) {
    const saved = await upsertTransfermarktEntity(admin, {
      url: player.canonicalUrl,
      name: player.name,
      sourceUrl,
      createdBy,
      action: "agent_discovery",
      fetchPreview: false,
      discoverRelationships: false,
    });

    const { error } = await admin.from("transfermarkt_relationships").upsert({
      source_entity_id: sourceEntityId,
      target_entity_id: saved.entity.id,
      relationship_type: relationshipType,
      status: "suggested",
      source_url: sourceUrl,
      evidence: relationshipType === "agent_player"
        ? "Public player link discovered from the submitted agent/agency profile page. Requires human confirmation before representation claims."
        : "Public player link discovered from the submitted club profile page. This is a club-player reference, not a representation claim.",
      source_payload: { discoveredAt: new Date().toISOString(), safeRegistryOnly: true },
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "source_entity_id,target_entity_id,relationship_type" });
    if (!error) relationshipsSaved += 1;
  }

  await logSync(admin, {
    entityId: sourceEntityId,
    action: "agent_discovery",
    status: "success",
    sourceUrl,
    message: relationshipType === "agent_player"
      ? "Agent/agency page checked for public player profile links."
      : "Club page checked for public player profile links.",
    recordsFound: uniquePlayers.length,
    recordsSaved: relationshipsSaved,
    durationMs: Date.now() - started,
    createdBy,
  });

  return { discovered: uniquePlayers.length, relationshipsSaved };
}

export async function discoverAgentPlayerLinks(admin: SupabaseClient, agentEntityId: string, agentUrl: string, createdBy?: string | null) {
  return discoverEntityPlayerLinks(admin, agentEntityId, agentUrl, "agent_player", createdBy);
}

function transfermarktSearchUrl(query: string) {
  const url = new URL("https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche");
  url.searchParams.set("query", query);
  return url.toString();
}

export async function discoverTransfermarktLinksByName(
  admin: SupabaseClient,
  input: {
    query: string;
    entityType?: TransfermarktEntityType;
    limit?: number;
    createdBy?: string | null;
  },
) {
  const query = cleanText(input.query, 100);
  if (!query || query.length < 3) return { discovered: 0, saved: 0, entities: [], sourceUrl: null };

  const sourceUrl = transfermarktSearchUrl(query);
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 15);
  const started = Date.now();

  await waitForTransfermarktRateLimit();

  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "TouchlineBot/1.0 (+https://touchline-football-platform.vercel.app; user-triggered link discovery)",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    await logSync(admin, {
      action: "search_save",
      status: "partial",
      sourceUrl,
      message: `Transfermarkt search unavailable or blocked (${response.status}).`,
      recordsFound: 0,
      recordsSaved: 0,
      durationMs: Date.now() - started,
      createdBy: input.createdBy,
      payload: { query, entityType: input.entityType ?? "player" },
    });
    return { discovered: 0, saved: 0, entities: [], sourceUrl };
  }

  const html = (await response.text()).slice(0, 600_000);
  const wantedType = input.entityType ?? "player";
  const parsedLinks = extractTransfermarktUrlsFromHtml(html)
    .map((url) => parseTransfermarktEntityUrl(url, wantedType))
    .filter(Boolean) as ParsedTransfermarktEntity[];

  const unique = [...new Map(parsedLinks.map((link) => [`${link.entityType}:${link.transfermarktId}`, link])).values()]
    .sort((a, b) => searchResultScore(b.name, query) - searchResultScore(a.name, query))
    .slice(0, limit);

  const entities = [];
  for (const link of unique) {
    const saved = await upsertTransfermarktEntity(admin, {
      url: link.canonicalUrl,
      name: link.name,
      sourceUrl,
      createdBy: input.createdBy,
      action: "search_save",
      fetchPreview: false,
      discoverRelationships: false,
    });
    entities.push(saved.entity);
  }

  await logSync(admin, {
    action: "search_save",
    status: entities.length ? "success" : "partial",
    sourceUrl,
    message: entities.length
      ? "User-triggered Transfermarkt name search saved candidate profile links."
      : "No Transfermarkt profile links found from user-triggered name search.",
    recordsFound: unique.length,
    recordsSaved: entities.length,
    durationMs: Date.now() - started,
    createdBy: input.createdBy,
    payload: { query, entityType: wantedType },
  });

  return { discovered: unique.length, saved: entities.length, entities, sourceUrl };
}

export async function syncKnownTransfermarktEntities(admin: SupabaseClient, options: { limit: number; createdBy?: string | null; manual?: boolean }) {
  const started = Date.now();
  const limit = Math.min(Math.max(options.limit, 1), 100);

  if (!transfermarktSyncEnabled()) {
    await logSync(admin, {
      action: options.manual ? "manual_sync" : "scheduled_sync",
      status: "not_configured",
      message: "TRANSFERMARKT_SYNC_ENABLED is not true. Registry exists, but external checking is disabled.",
      recordsFound: 0,
      recordsSaved: 0,
      durationMs: Date.now() - started,
      createdBy: options.createdBy,
    });
    return { checked: 0, updated: 0, status: "not_configured" };
  }

  const { data, error } = await admin
    .from("transfermarkt_entities")
    .select("id, entity_type, transfermarkt_id, canonical_url, name, photo_url, status")
    .in("status", ["active", "changed", "needs_review"])
    .or(`next_check_at.is.null,next_check_at.lte.${new Date().toISOString()}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let updated = 0;
  for (const entity of data ?? []) {
    await waitForTransfermarktRateLimit();
    const preview = await fetchLinkPreview(new URL(entity.canonical_url));
    const patch = {
      name: cleanText(preview.title?.replace(/\s*\|.*$/g, ""), 180) ?? entity.name,
      photo_url: preview.image ?? entity.photo_url,
      status: preview.ok ? "active" : "unavailable",
      last_checked_at: new Date().toISOString(),
      next_check_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      source_payload: {
        lastSyncStatus: preview.ok ? "ok" : preview.error,
        lastSyncAt: new Date().toISOString(),
      },
    };

    const { error: updateError } = await admin.from("transfermarkt_entities").update(patch).eq("id", entity.id);
    if (!updateError) updated += 1;

    if (entity.entity_type === "agent" && preview.ok) {
      await discoverAgentPlayerLinks(admin, entity.id, entity.canonical_url, options.createdBy ?? null);
    }
  }

  await logSync(admin, {
    action: options.manual ? "manual_sync" : "scheduled_sync",
    status: "success",
    message: "Known Transfermarkt registry links checked with rate limiting.",
    recordsFound: data?.length ?? 0,
    recordsSaved: updated,
    durationMs: Date.now() - started,
    createdBy: options.createdBy,
  });

  return { checked: data?.length ?? 0, updated, status: "success" };
}

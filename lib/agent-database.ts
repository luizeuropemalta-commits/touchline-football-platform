import type { SupabaseClient } from "@supabase/supabase-js";
import { discoverEntityPlayerLinks } from "@/lib/market-link-registry";

export type AgentDatabaseProfile = {
  id: string;
  transfermarktId: string;
  name: string;
  profileUrl: string;
  photoUrl?: string | null;
  status: string;
  lastCheckedAt?: string | null;
  updatedAt?: string | null;
  agencyName?: string | null;
  country?: string | null;
  publicLinkedPlayersCount: number;
  suggestedPlayersCount: number;
  verifiedPlayersCount: number;
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
    lower.includes("socialmedia") ||
    lower.includes("verified") ||
    lower.includes("check") ||
    lower.includes("/icons/") ||
    lower.includes("/icon/") ||
    lower.includes("flaggen")
  );
}

function extractAgentPhoto(html: string, profileUrl: string) {
  const candidates: string[] = [];
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    for (const attr of ["src", "data-src", "data-original", "data-lazy"]) {
      const url = absolutizeImageUrl(tag.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"))?.[1], profileUrl);
      if (url && !isGenericTransfermarktImage(url)) candidates.push(url);
    }
  }
  const profileImage = candidates.find((url) => {
    const lower = url.toLowerCase();
    return lower.includes("beraterfirma") || lower.includes("berater") || lower.includes("agentur") || lower.includes("person") || lower.includes("portrait") || lower.includes("profil");
  });
  const ogImage = absolutizeImageUrl(extractMetaContent(html, "og:image"), profileUrl);
  return profileImage ?? (ogImage && !isGenericTransfermarktImage(ogImage) ? ogImage : null);
}

function extractAgentName(html: string) {
  const headline =
    html.match(/<h1[^>]*class=["'][^"']*data-header__headline-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return cleanText(headline ? stripHtml(headline) : null, 180) ?? cleanText(extractMetaContent(html, "og:title")?.replace(/\s*\|.*$/g, ""), 180);
}

function extractInfoValue(html: string, labels: string[]) {
  const text = stripHtml(html);
  for (const label of labels) {
    const inline = text.match(new RegExp(`${escapeRegex(label)}\\s*:?\\s*([^|•\\n]{1,90})`, "i"))?.[1];
    if (inline) return cleanText(inline, 120);
  }
  return null;
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

function shouldSyncAgentPlayers(row: EntityRow) {
  const payload = existingPayload(row);
  const playerSync = payload.agentPlayerSync && typeof payload.agentPlayerSync === "object" && !Array.isArray(payload.agentPlayerSync)
    ? payload.agentPlayerSync as Record<string, unknown>
    : {};
  const lastChecked = Date.parse(String(playerSync.checkedAt ?? ""));
  return !lastChecked || Date.now() - lastChecked > 24 * 60 * 60 * 1000;
}

function mapAgent(row: EntityRow, counts?: { total: number; suggested: number; verified: number }): AgentDatabaseProfile {
  const payload = existingPayload(row);
  const agent = payload.agentProfile && typeof payload.agentProfile === "object" && !Array.isArray(payload.agentProfile)
    ? payload.agentProfile as Record<string, unknown>
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
    agencyName: typeof agent.agencyName === "string" ? agent.agencyName : null,
    country: typeof agent.country === "string" ? agent.country : null,
    publicLinkedPlayersCount: counts?.total ?? 0,
    suggestedPlayersCount: counts?.suggested ?? 0,
    verifiedPlayersCount: counts?.verified ?? 0,
    sourcePayload: payload,
  };
}

export async function enrichTransfermarktAgentProfile(admin: SupabaseClient, row: EntityRow) {
  const profileUrl = row.canonical_url ?? row.profile_url;
  if (!profileUrl || !profileUrl.includes("transfermarkt.")) return mapAgent(row);

  const payload = existingPayload(row);
  const agent = payload.agentProfile && typeof payload.agentProfile === "object" && !Array.isArray(payload.agentProfile)
    ? payload.agentProfile as Record<string, unknown>
    : {};
  const lastChecked = Date.parse(String(agent.checkedAt ?? ""));
  const hasGenericPhoto = isGenericTransfermarktImage(row.photo_url);
  const missingKeyFields = !row.photo_url || hasGenericPhoto || !agent.agencyName || !agent.country;
  if (!missingKeyFields) return mapAgent(row);
  if (!hasGenericPhoto && lastChecked && Date.now() - lastChecked < 24 * 60 * 60 * 1000) return mapAgent(row);
  if (!profileEnrichmentEnabled()) return mapAgent(row);

  try {
    const response = await fetch(profileUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "TouchlineBot/1.0 (+https://touchline-football-platform.vercel.app; agent metadata enrichment)",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return mapAgent(row);

    const html = (await response.text()).slice(0, 500_000);
    const parsed = {
      name: extractAgentName(html),
      photoUrl: extractAgentPhoto(html, profileUrl),
      agencyName: extractInfoValue(html, ["Agency", "Company", "Agent company"]),
      country: extractInfoValue(html, ["Country", "Nationality"]),
    };
    const latestPayload = await loadLatestPayload(admin, row.id, payload);
    const nextPayload = {
      ...latestPayload,
      agentProfile: {
        ...agent,
        ...parsed,
        checkedAt: new Date().toISOString(),
        status: "success",
        legalNote: "Touchline stores limited public agent/agency metadata and linked player references only. Representation must be confirmed separately.",
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

    return mapAgent((data as EntityRow | null) ?? row);
  } catch {
    return mapAgent(row);
  }
}

async function loadRawAgentLinkedPlayers(admin: SupabaseClient, agentId: string) {
  const { data } = await admin
    .from("transfermarkt_relationships")
    .select("id, relationship_type, status, target:transfermarkt_entities!transfermarkt_relationships_target_entity_id_fkey(id, transfermarkt_id, entity_type, name, profile_url, canonical_url, photo_url, status)")
    .eq("source_entity_id", agentId)
    .eq("relationship_type", "agent_player")
    .in("status", ["approved", "suggested", "needs_review"])
    .order("last_seen_at", { ascending: false })
    .limit(60);

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

async function ensureGlobalPlayerProfilesForAgent(admin: SupabaseClient, players: Awaited<ReturnType<typeof loadRawAgentLinkedPlayers>>) {
  type GlobalProfileReference = { id: string; photoUrl: string | null };
  const rows = players.flatMap((player) => {
    if (!player.transfermarktId || !player.profileUrl || player.profileUrl === "#") return [];
    return [{
      transfermarkt_player_id: player.transfermarktId,
      player_name: player.name,
      profile_url: player.profileUrl,
      photo_url: player.photoUrl,
      source_provider: "transfermarkt",
      source_payload: {
        source: "agent_profile_auto_sync",
        transfermarktEntityId: player.entityId,
        legalNote: "Automatically created from a public agent-player reference. This is not a verified representation claim.",
      },
      last_updated_at: new Date().toISOString(),
    }];
  });

  if (!rows.length) return new Map<string, GlobalProfileReference>();

  const { data: upserted } = await admin
    .from("global_player_profiles")
    .upsert(rows, { onConflict: "transfermarkt_player_id" })
    .select("id, transfermarkt_player_id");

  const ids = ((upserted ?? []) as Array<{ transfermarkt_player_id: string }>).map((row) => row.transfermarkt_player_id);
  if (!ids.length) return new Map<string, { id: string; photoUrl: string | null }>();

  const { data } = await admin
    .from("global_player_profiles")
    .select("id, transfermarkt_player_id, photo_url")
    .in("transfermarkt_player_id", ids);

  return new Map(((data ?? []) as Array<{ id: string; transfermarkt_player_id: string; photo_url: string | null }>).map((row) => [
    row.transfermarkt_player_id,
    { id: row.id, photoUrl: row.photo_url },
  ]));
}

export async function syncAgentPlayersOnProfileOpen(admin: SupabaseClient, row: EntityRow, createdBy?: string | null) {
  if (!shouldSyncAgentPlayers(row)) return;
  await discoverEntityPlayerLinks(
    admin,
    row.id,
    row.canonical_url ?? row.profile_url,
    "agent_player",
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
        agentPlayerSync: {
          checkedAt: new Date().toISOString(),
          status: "attempted",
          legalNote: "Touchline stores public agent-player links as suggestions only. Representation still requires confirmation.",
        },
      },
    })
    .eq("id", row.id);
}

export async function loadAgentLinkedPlayers(admin: SupabaseClient, agentId: string) {
  const players = await loadRawAgentLinkedPlayers(admin, agentId);
  const globalProfiles = await ensureGlobalPlayerProfilesForAgent(admin, players);
  return players.map((player) => ({
    ...player,
    photoUrl: globalProfiles.get(player.transfermarktId)?.photoUrl ?? player.photoUrl,
    internalProfileUrl: globalProfiles.get(player.transfermarktId)?.id ? `/players/database/${globalProfiles.get(player.transfermarktId)?.id}` : null,
  }));
}

export async function loadAgentRelationshipCounts(admin: SupabaseClient, agentId: string) {
  const players = await loadRawAgentLinkedPlayers(admin, agentId);
  return {
    total: players.length,
    verified: players.filter((player) => player.status === "approved").length,
    suggested: players.filter((player) => player.status !== "approved").length,
  };
}

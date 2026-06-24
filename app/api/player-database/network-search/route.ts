import { NextResponse } from "next/server";
import { discoverEntityPlayerLinks, discoverTransfermarktLinksByName } from "@/lib/market-link-registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type NetworkEntity = {
  id: string;
  transfermarkt_id: string;
  entity_type: "agent" | "club";
  name: string;
  profile_url: string;
  canonical_url: string;
  photo_url: string | null;
  status: string;
  confidence: string;
  last_checked_at: string | null;
  relevance?: number | null;
};

type RelationshipRow = {
  source_entity_id: string;
  relationship_type: string;
  status: string;
  target?: {
    id?: string | null;
    transfermarkt_id?: string | null;
    entity_type?: string | null;
    name?: string | null;
    profile_url?: string | null;
    canonical_url?: string | null;
    photo_url?: string | null;
    status?: string | null;
  } | null;
};

function cleanQuery(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
}

function cleanLimit(value: string | null) {
  const parsed = Number(value ?? 8);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.round(parsed), 1), 20);
}

function uniqueQueries(query: string) {
  const normalized = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const variants = [query];
  if (normalized.includes("sporting")) {
    variants.push("Sporting CP", "Sporting Lisbon", "Sporting Lisboa", "Sporting Clube de Portugal");
  }
  variants.push(`${query} club`);
  return [...new Set(variants.map((value) => value.trim()).filter(Boolean))].slice(0, 4);
}

async function searchNetworkEntities(admin: NonNullable<ReturnType<typeof createAdminClient>>, query: string, limit: number) {
  const [agents, clubs] = await Promise.all([
    admin.rpc("search_transfermarkt_entities", {
      search_query: query,
      entity_type_filter: "agent",
      result_limit: limit,
    }),
    admin.rpc("search_transfermarkt_entities", {
      search_query: query,
      entity_type_filter: "club",
      result_limit: limit,
    }),
  ]);

  if (agents.error) throw new Error(agents.error.message);
  if (clubs.error) throw new Error(clubs.error.message);

  return ([...((agents.data ?? []) as NetworkEntity[]), ...((clubs.data ?? []) as NetworkEntity[])])
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, limit);
}

async function loadPlayersForEntities(admin: NonNullable<ReturnType<typeof createAdminClient>>, entityIds: string[]) {
  if (!entityIds.length) return new Map<string, RelationshipRow[]>();

  const { data } = await admin
    .from("transfermarkt_relationships")
    .select("source_entity_id, relationship_type, status, target:transfermarkt_entities!transfermarkt_relationships_target_entity_id_fkey(id, transfermarkt_id, entity_type, name, profile_url, canonical_url, photo_url, status)")
    .in("source_entity_id", entityIds)
    .in("relationship_type", ["agent_player", "club_player"])
    .in("status", ["suggested", "approved", "needs_review"])
    .order("last_seen_at", { ascending: false })
    .limit(200);

  const byEntity = new Map<string, RelationshipRow[]>();
  for (const row of (data ?? []) as unknown as RelationshipRow[]) {
    const list = byEntity.get(row.source_entity_id) ?? [];
    list.push(row);
    byEntity.set(row.source_entity_id, list);
  }
  return byEntity;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Login required." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const query = cleanQuery(searchParams.get("q"));
  const limit = cleanLimit(searchParams.get("limit"));
  const shouldDiscover = searchParams.get("discover") === "1" || searchParams.get("discover") === "true";

  if (query.length < 2) return NextResponse.json({ ok: true, entities: [] });

  try {
    let entities = await searchNetworkEntities(admin, query, limit);
    let relationships = await loadPlayersForEntities(admin, entities.map((entity) => entity.id));

    if (shouldDiscover) {
      if (!entities.length) {
        for (const candidateQuery of uniqueQueries(query)) {
          await discoverTransfermarktLinksByName(admin, {
            query: candidateQuery,
            entityType: "club",
            limit: Math.min(limit, 8),
            createdBy: user.id,
          });

          entities = await searchNetworkEntities(admin, query, limit);
          if (entities.length) break;
        }
        if (!entities.length) {
          await discoverTransfermarktLinksByName(admin, {
            query,
            entityType: "agent",
            limit: Math.min(limit, 8),
            createdBy: user.id,
          });
        }
        entities = await searchNetworkEntities(admin, query, limit);
        relationships = await loadPlayersForEntities(admin, entities.map((entity) => entity.id));
      }

      for (const entity of entities.slice(0, 3)) {
        const existing = relationships.get(entity.id) ?? [];
        if (existing.length > 0) continue;
        await discoverEntityPlayerLinks(
          admin,
          entity.id,
          entity.canonical_url ?? entity.profile_url,
          entity.entity_type === "club" ? "club_player" : "agent_player",
          user.id,
          { force: true },
        );
      }
      entities = await searchNetworkEntities(admin, query, limit);
      relationships = await loadPlayersForEntities(admin, entities.map((entity) => entity.id));
    }

    return NextResponse.json({
      ok: true,
      entities: entities.map((entity) => ({
        id: entity.id,
        transfermarktId: entity.transfermarkt_id,
        type: entity.entity_type,
        name: entity.name,
        profileUrl: entity.canonical_url ?? entity.profile_url,
        photoUrl: entity.photo_url,
        status: entity.status,
        relevance: entity.relevance ?? null,
        players: (relationships.get(entity.id) ?? []).flatMap((relationship) => {
          const player = relationship.target;
          if (!player?.id || player.entity_type !== "player") return [];
          return [{
            id: player.id,
            transfermarktId: player.transfermarkt_id,
            name: player.name,
            profileUrl: player.canonical_url ?? player.profile_url,
            photoUrl: player.photo_url,
            status: relationship.status,
            relationshipType: relationship.relationship_type,
          }];
        }).slice(0, 12),
      })),
      discovered: shouldDiscover,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not search network." }, { status: 500 });
  }
}

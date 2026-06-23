import { NextResponse } from "next/server";
import {
  buildFootballLinkSeedsFromText,
  footballLinkDailyLimit,
  parseTransfermarktLink,
  upsertFootballLinkSeeds,
  type FootballLinkSeed,
} from "@/lib/football-link-index";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function cleanLimit(value: string | null) {
  const parsed = Number(value ?? process.env.TOUCHLINE_LINK_INDEX_SYNC_LIMIT ?? footballLinkDailyLimit);
  if (!Number.isFinite(parsed)) return footballLinkDailyLimit;
  return Math.min(Math.max(Math.round(parsed), 1), footballLinkDailyLimit);
}

async function isAuthorized(request: Request) {
  const secret = process.env.MARKET_SYNC_SECRET ?? process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization === `Bearer ${secret}`) return { ok: true, userId: null };

  const supabase = await createClient();
  if (!supabase) return { ok: false, userId: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isOwnerEmail(user.email)) return { ok: true, userId: user.id };
  return { ok: false, userId: null };
}

function pushSeed(seeds: FootballLinkSeed[], seed: FootballLinkSeed) {
  if (!parseTransfermarktLink(seed.url)) return;
  seeds.push(seed);
}

async function collectPlayerSeeds(admin: ReturnType<typeof createAdminClient>, limit: number) {
  if (!admin) return [];
  const { data, error } = await admin
    .from("players")
    .select("id, first_name, last_name, photo_url, position, nationality, external_market_url, external_market_provider, external_market_player_id, updated_at")
    .eq("external_market_provider", "transfermarkt")
    .not("external_market_url", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const seeds: FootballLinkSeed[] = [];
  for (const player of data ?? []) {
    pushSeed(seeds, {
      url: player.external_market_url,
      title: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || null,
      imageUrl: player.photo_url,
      source: "players_external_market_url",
      payload: {
        playerId: player.id,
        position: player.position,
        nationality: player.nationality,
        providerPlayerId: player.external_market_player_id,
      },
    });
  }
  return seeds;
}

async function collectRadarSeeds(admin: ReturnType<typeof createAdminClient>, limit: number) {
  if (!admin) return [];
  const { data, error } = await admin
    .from("market_radar_links")
    .select("id, url, title, description, image_url, category, created_by, source_domain, transfermarkt_player_id, updated_at")
    .ilike("url", "%transfermarkt%")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const seeds: FootballLinkSeed[] = [];
  for (const link of data ?? []) {
    pushSeed(seeds, {
      url: link.url,
      title: link.title,
      description: link.description,
      imageUrl: link.image_url,
      source: "market_radar_links",
      importedBy: link.created_by,
      payload: {
        radarLinkId: link.id,
        category: link.category,
        sourceDomain: link.source_domain,
        transfermarktPlayerId: link.transfermarkt_player_id,
      },
    });
  }
  return seeds;
}

async function collectCommunitySeeds(admin: ReturnType<typeof createAdminClient>, limit: number) {
  if (!admin) return [];
  const seeds: FootballLinkSeed[] = [];

  const [{ data: phase2Posts }, { data: networkPosts }] = await Promise.all([
    admin
      .from("community_posts_phase2")
      .select("id, body, author_id, post_type, updated_at")
      .ilike("body", "%transfermarkt%")
      .order("updated_at", { ascending: false })
      .limit(Math.ceil(limit / 2)),
    admin
      .from("network_posts")
      .select("id, body, author_user_id, post_type, published_at")
      .ilike("body", "%transfermarkt%")
      .order("published_at", { ascending: false })
      .limit(Math.ceil(limit / 2)),
  ]);

  for (const post of phase2Posts ?? []) {
    seeds.push(...buildFootballLinkSeedsFromText(post.body, {
      source: "community_posts_phase2",
      importedBy: post.author_id,
      payload: { postId: post.id, postType: post.post_type },
    }));
  }

  for (const post of networkPosts ?? []) {
    seeds.push(...buildFootballLinkSeedsFromText(post.body, {
      source: "network_posts",
      importedBy: post.author_user_id,
      payload: { postId: post.id, postType: post.post_type },
    }));
  }

  return seeds;
}

async function syncLinkIndex(request: Request) {
  const auth = await isAuthorized(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });

  const limit = cleanLimit(new URL(request.url).searchParams.get("limit"));
  const perSourceLimit = Math.max(20, Math.ceil(limit / 3));

  const [playerSeeds, radarSeeds, communitySeeds] = await Promise.all([
    collectPlayerSeeds(admin, perSourceLimit),
    collectRadarSeeds(admin, perSourceLimit),
    collectCommunitySeeds(admin, perSourceLimit),
  ]);

  const unique = new Map<string, FootballLinkSeed>();
  [...playerSeeds, ...radarSeeds, ...communitySeeds].forEach((seed) => {
    const parsed = parseTransfermarktLink(seed.url);
    if (parsed) unique.set(parsed.canonicalUrl, seed);
  });

  const seeds = [...unique.values()].slice(0, limit);
  const result = await upsertFootballLinkSeeds(admin, seeds);

  return NextResponse.json({
    ok: true,
    syncedAt: new Date().toISOString(),
    mode: auth.userId ? "owner_manual_run" : "scheduled_cron",
    limit,
    sources: {
      players: playerSeeds.length,
      radar: radarSeeds.length,
      community: communitySeeds.length,
    },
    uniqueTransfermarktLinks: seeds.length,
    ...result,
  });
}

export async function GET(request: Request) {
  return syncLinkIndex(request);
}

export async function POST(request: Request) {
  return syncLinkIndex(request);
}

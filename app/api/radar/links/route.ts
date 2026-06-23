import { NextResponse } from "next/server";
import { fetchLinkPreview, getDomain, getTransfermarktPlayerId, validatePreviewUrl } from "@/lib/link-preview";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const categories = new Set(["player", "rumor", "club", "news", "scout", "other"]);

function normalizeCategory(value?: string | null) {
  const category = value?.trim().toLowerCase();
  return category && categories.has(category) ? category : "rumor";
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    let query = admin
      .from("market_radar_links")
      .select("id, url, source_domain, category, title, description, image_url, site_name, transfermarkt_player_id, tags, note, status, last_previewed_at, created_at, updated_at")
      .eq("agency_id", agencyId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(120);

    if (category && category !== "all") query = query.eq("category", normalizeCategory(category));

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ links: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load radar links." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = (await request.json()) as {
    url?: string;
    category?: string;
    note?: string;
    tags?: unknown;
  };

  const target = validatePreviewUrl(body.url);
  if (!target) return NextResponse.json({ error: "Cola um link HTTPS válido." }, { status: 400 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const preview = await fetchLinkPreview(target);
    const url = target.toString();
    const sourceDomain = getDomain(url);

    const { data, error } = await admin
      .from("market_radar_links")
      .upsert(
        {
          agency_id: agencyId,
          created_by: user.id,
          url,
          source_domain: sourceDomain,
          category: normalizeCategory(body.category),
          title: preview.title,
          description: preview.description,
          image_url: preview.image,
          site_name: preview.siteName,
          transfermarkt_player_id: getTransfermarktPlayerId(url),
          tags: normalizeTags(body.tags),
          note: body.note?.trim() || null,
          status: "active",
          last_previewed_at: new Date().toISOString(),
        },
        { onConflict: "agency_id,url" },
      )
      .select("id, url, source_domain, category, title, description, image_url, site_name, transfermarkt_player_id, tags, note, status, last_previewed_at, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, link: data, preview });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save radar link." }, { status: 500 });
  }
}

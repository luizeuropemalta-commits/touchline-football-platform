import { NextResponse } from "next/server";
import { fetchLinkPreview, getDomain, getTransfermarktPlayerId, validatePreviewUrl } from "@/lib/link-preview";
import { createAdminClient } from "@/lib/supabase/admin";

async function refreshRadarLinks(request: Request) {
  const secret = process.env.MARKET_SYNC_SECRET ?? process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });

  const { data: links, error } = await admin
    .from("market_radar_links")
    .select("id, url")
    .eq("status", "active")
    .order("last_previewed_at", { ascending: true, nullsFirst: true })
    .limit(150);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];

  for (const link of links ?? []) {
    const target = validatePreviewUrl(link.url);
    if (!target) {
      results.push({ id: link.id, ok: false, reason: "Invalid URL" });
      continue;
    }

    const preview = await fetchLinkPreview(target);
    const { error: updateError } = await admin
      .from("market_radar_links")
      .update({
        source_domain: getDomain(target.toString()),
        title: preview.title,
        description: preview.description,
        image_url: preview.image,
        site_name: preview.siteName,
        transfermarkt_player_id: getTransfermarktPlayerId(target.toString()),
        last_previewed_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    results.push({
      id: link.id,
      ok: !updateError,
      reason: updateError?.message ?? preview.error,
    });
  }

  return NextResponse.json({
    refreshedAt: new Date().toISOString(),
    total: links?.length ?? 0,
    results,
  });
}

export async function GET(request: Request) {
  return refreshRadarLinks(request);
}

export async function POST(request: Request) {
  return refreshRadarLinks(request);
}

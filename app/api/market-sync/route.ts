import { NextResponse } from "next/server";
import { fetchExternalMarketPlayer } from "@/lib/market-data/provider";
import { createAdminClient } from "@/lib/supabase/admin";

async function syncMarketData(request: Request) {
  const secret = process.env.MARKET_SYNC_SECRET ?? process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin client is not configured. Add SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const { data: players, error } = await supabase
    .from("players")
    .select("id, agency_id, market_value, currency, external_market_provider, external_market_player_id, external_market_url")
    .not("external_market_provider", "is", null)
    .not("external_market_player_id", "is", null)
    .limit(250);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];

  for (const player of players ?? []) {
    const synced = await fetchExternalMarketPlayer({
      provider: player.external_market_provider,
      providerPlayerId: player.external_market_player_id,
      profileUrl: player.external_market_url,
    });

    if (!synced.ok) {
      results.push({ playerId: player.id, ok: false, reason: synced.reason });
      continue;
    }

    const marketValue = synced.player.marketValue ?? player.market_value;
    const currency = synced.player.currency ?? player.currency ?? "EUR";

    const { error: updateError } = await supabase
      .from("players")
      .update({
        market_value: marketValue,
        currency,
        external_market_url: synced.player.providerProfileUrl ?? player.external_market_url,
        external_market_synced_at: new Date().toISOString(),
        external_market_payload: synced.player.rawPayload ?? {},
      })
      .eq("id", player.id);

    if (updateError) {
      results.push({ playerId: player.id, ok: false, reason: updateError.message });
      continue;
    }

    const { error: snapshotError } = await supabase.from("player_market_snapshots").insert({
      agency_id: player.agency_id,
      player_id: player.id,
      provider: synced.player.provider,
      provider_player_id: synced.player.providerPlayerId,
      provider_profile_url: synced.player.providerProfileUrl,
      market_value: marketValue,
      currency,
      current_club: synced.player.currentClub,
      contract_until: synced.player.contractUntil,
      source_updated_at: synced.player.sourceUpdatedAt,
      raw_payload: synced.player.rawPayload ?? {},
    });

    results.push({
      playerId: player.id,
      ok: !snapshotError,
      reason: snapshotError?.message,
      marketValue,
      currency,
    });
  }

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    total: players?.length ?? 0,
    results,
  });
}

export async function GET(request: Request) {
  return syncMarketData(request);
}

export async function POST(request: Request) {
  return syncMarketData(request);
}

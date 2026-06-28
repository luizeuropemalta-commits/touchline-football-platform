import { NextResponse } from "next/server";
import { buildTouchlineSyncSummary } from "@/lib/sync/touchline-entity-sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const entityType = typeof body.entityType === "string" ? body.entityType : "player";
  if (!["player", "club", "agent", "agency"].includes(entityType)) {
    return NextResponse.json({ ok: false, error: "Unsupported entity type." }, { status: 400 });
  }

  const summary = buildTouchlineSyncSummary({
    entityType,
    id: typeof body.id === "string" ? body.id : null,
    name: typeof body.name === "string" ? body.name : "Touchline Entity",
    lastProviderSyncAt: typeof body.lastProviderSyncAt === "string" ? body.lastProviderSyncAt : null,
    lastMarketSyncAt: typeof body.lastMarketSyncAt === "string" ? body.lastMarketSyncAt : null,
    marketValueSource: typeof body.marketValueSource === "string" ? body.marketValueSource : null,
  });

  return NextResponse.json({
    ok: true,
    summary,
    syncMode: "runtime_qa_sync_status",
    providerRefresh: summary.shouldRefreshIdentity ? "refresh_required" : "fresh",
    marketRefresh: summary.shouldRefreshMarket ? "refresh_required" : "fresh_or_unavailable",
  });
}

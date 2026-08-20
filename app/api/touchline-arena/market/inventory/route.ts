import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readAuthoritativeTouchlineRoster } from "@/lib/touchlineArena/authoritative-roster-server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { resolveCompetitionCardOffer } from "@/lib/touchlineArena/competition-card-offer";
import { parseTouchlineMarketInventorySnapshot } from "@/lib/touchlineArena/market-inventory";
import { resolveTouchlineOwnerCommercialSummary } from "@/lib/touchlineArena/owner-commercial-summary";
import { TOUCHLINE_SQUAD_RULES } from "@/lib/touchlineArena/squad-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAM_ID_PATTERN = /^[0-9]{1,20}$/;
const TOUCHLINE_ENGLAND_SEASON = "2026-27";
const DATABASE_ERROR_STATUS: Record<string, number> = {
  TL_MARKET_AUTH_REQUIRED: 401,
  TL_MARKET_USER_NOT_FOUND: 404,
  TL_MARKET_INVALID_TEAM_ID: 400,
  TL_MARKET_CLUB_NOT_FOUND: 404,
};

function databaseErrorCode(message: string) {
  return Object.keys(DATABASE_ERROR_STATUS).find((code) => message.includes(code)) ?? null;
}

function nonNegativeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return NextResponse.json({ error: "TouchLine Market server is not configured." }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !hasTouchLineArenaAccess(user)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const teamId = request.nextUrl.searchParams.get("teamId")?.trim() ?? "";
  if (!TEAM_ID_PATTERN.test(teamId)) {
    return NextResponse.json({ error: "TL_MARKET_INVALID_TEAM_ID" }, { status: 400 });
  }

  const [inventoryResponse, rosterResult] = await Promise.all([
    admin.rpc("get_touchline_market_inventory", {
      requested_user_id: user.id,
      requested_provider_team_id: teamId,
    }),
    readAuthoritativeTouchlineRoster(admin, user.id),
  ]);
  const { data, error } = inventoryResponse;
  if (error) {
    const code = databaseErrorCode(error.message);
    return NextResponse.json(
      { error: code ?? "TL_MARKET_INVENTORY_FAILED" },
      { status: code ? DATABASE_ERROR_STATUS[code] : 500 },
    );
  }

  if (!rosterResult.ok) {
    return NextResponse.json({ error: rosterResult.error }, { status: 503 });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "TL_MARKET_INVENTORY_INVALID" }, { status: 500 });
  }

  const commercialSummary = resolveTouchlineOwnerCommercialSummary({
    ownedContractCount: rosterResult.snapshot.ownedContractCount,
    rosterCards: rosterResult.snapshot.cards,
  });
  const inventoryRecord = data as Record<string, unknown>;
  const inventoryContractCount = nonNegativeInteger(inventoryRecord.activeContractCount);
  const inventoryOpenSlots = nonNegativeInteger(inventoryRecord.openContractSlots);
  if (
    inventoryContractCount !== commercialSummary.cardsTracked
    || inventoryOpenSlots !== Math.max(
      0,
      TOUCHLINE_SQUAD_RULES.contracted - commercialSummary.cardsTracked,
    )
  ) {
    return NextResponse.json({ error: "TL_MARKET_ACCOUNT_SUMMARY_MISMATCH" }, { status: 409 });
  }

  const snapshot = parseTouchlineMarketInventorySnapshot({
    ...inventoryRecord,
    squadValueGbp: commercialSummary.squadValueGbp,
    representedClubCount: rosterResult.snapshot.representedClubCount,
  });
  if (!snapshot) {
    return NextResponse.json({ error: "TL_MARKET_INVENTORY_INVALID" }, { status: 500 });
  }

  return NextResponse.json({
    ...snapshot,
    // Display only: checkout still accepts inventory IDs and derives its own
    // protected values through the existing RPC.
    cards: snapshot.cards.map((card) => ({
      ...card,
      officialOffer: resolveCompetitionCardOffer({
        subjectType: "player",
        subjectId: card.providerPlayerId,
        competitionId: "england",
        seasonId: TOUCHLINE_ENGLAND_SEASON,
        tierKey: card.tierKey,
      }),
    })),
  }, { status: 200 });
}

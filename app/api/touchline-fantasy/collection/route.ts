import { TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS } from "@/lib/touchlineFantasy/market-plan-policy";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clubCollectionEnabled, createClubCollectionStore } from "@/lib/touchlineFantasy/club-collection-server";
import { parseClubAcquisitionCommand, purchaseClubPlayer } from "@/lib/touchlineFantasy/club-acquisition-service";
import { clubPlayerPosition } from "@/lib/touchlineFantasy/club-position";
import { clubPrimaryPositionIndex } from "@/lib/touchlineFantasy/club-primary-position-index";
import { loadTouchlineFantasyReadSnapshot } from "@/lib/touchlineFantasy/server";
import { readClubCommand } from "@/lib/touchlineFantasy/club-request";
import { parseClubCommandAuthority, clubCommandMatchesAuthority } from "@/lib/touchlineFantasy/club-command-authority";
export { GET } from "@/lib/touchlineFantasy/club-collection-read-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers });

async function context() {
  const client = await createClient();
  const { data, error: authError } = client ? await client.auth.getUser() : { data: { user: null }, error: null };
  if (authError || !data.user) return { error: failure("AUTH_REQUIRED", 401) } as const;
  if (!clubCollectionEnabled()) return { error: failure("CLUB_COLLECTION_UNAVAILABLE", 503) } as const;
  const admin = createAdminClient();
  if (!admin) return { error: failure("CLUB_STORAGE_UNAVAILABLE", 503) } as const;
  const { data: config, error } = await admin.from("touchline_fantasy_configs").select("season_id")
    .eq("competition_key", "england").eq("status", "active").single();
  if (error || !config?.season_id) return { error: failure("CLUB_SEASON_UNAVAILABLE", 503) } as const;
  return { user: data.user, admin, seasonId: String(config.season_id), store: createClubCollectionStore(admin) } as const;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return failure("INVALID_ORIGIN", 403);
  const input = await readClubCommand(request);
  const envelope = parseClubCommandAuthority(input);
  const command = parseClubAcquisitionCommand(envelope?.command);
  if (!envelope || !command) return failure("INVALID_REQUEST", 400);
  try {
    const ctx = await context();
    if (ctx.error) return ctx.error;
    if (!clubCommandMatchesAuthority(envelope.authority, ctx.user.id, ctx.seasonId)) return failure("CLUB_CONTEXT_CHANGED", 409);
    const snapshot = await loadTouchlineFantasyReadSnapshot(ctx.user);
    if (!snapshot?.entitlementActive) return failure("CLUB_ACCESS_REQUIRED", 403);
    const state = await ctx.store.read(ctx.user.id, ctx.seasonId);
    if (!state) return failure("CLUB_COLLECTION_REQUIRED", 409);
    // A plan change needs its own audited budget transition, not silent reallocation.
    if (snapshot.marketAccess?.planKey !== state.plan) return failure("CLUB_PLAN_MISMATCH", 409);
    const card = snapshot.catalogue.find(entry => entry.canonicalPlayerId === command.playerId);
    const primaryDetails = clubPrimaryPositionIndex(snapshot.catalogue);
    const primaryDetail = primaryDetails[command.playerId];
    const position = clubPlayerPosition(primaryDetail);
    const { data: football, error } = await ctx.admin.from("football_players").select("current_club_id")
      .eq("id", command.playerId).maybeSingle();
    if (error) return failure("CLUB_OFFER_UNAVAILABLE", 503);
    const offer = card && position && primaryDetail && football?.current_club_id && card.editorialCard?.marketValueEur !== undefined
      ? { playerId: command.playerId, clubId: String(football.current_club_id), position,
        primaryDetail, valueEur: card.editorialCard.marketValueEur, published: true } : null;
    let allowedClubIds: string[] | null = null;
    if (state.plan === "beta") {
      const clubs = await ctx.admin.from("football_clubs").select("id")
        .eq("provider", "sportmonks").in("provider_team_id", [...TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS]);
      if (clubs.error || !Array.isArray(clubs.data)) return failure("CLUB_OFFER_UNAVAILABLE", 503);
      allowedClubIds = clubs.data.map(row => String(row.id));
    }
    const round = snapshot.activeGameweek;
    const now = Date.now();
    const result = await purchaseClubPlayer(ctx.store, {
      ownerId: ctx.user.id, seasonId: ctx.seasonId, active: true, allowedClubIds, offer,
      primaryDetails,
      geometry: state.formationCode ? snapshot.formationRegistry[state.formationCode] : null,
      marketOpen: snapshot.qaClubMarketOpen === true || (round?.state === "MARKET_OPEN" && Date.parse(round.marketOpensAt) <= now && Date.parse(round.locksAt) > now),
    }, command);
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message.match(/^CLUB_[A-Z_]+$/)?.[0] : null;
    return failure(code ?? "CLUB_STORAGE_UNAVAILABLE", code === "CLUB_ACCESS_REQUIRED" ? 403
      : code?.includes("UNAVAILABLE") || !code ? 503 : 409);
  }
}

import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  collectPaginatedRows,
  TOUCHLINE_CARD_SYNC_PAGE_SIZE,
} from "@/lib/touchlineArena/paginated-read";

const CARD_STATUSES = new Set(["pending", "ready", "published", "reserved", "sold", "retired"]);
const SALE_STATUSES = new Set(["not_listed", "available", "reserved", "sold"]);
const ART_STATUSES = new Set(["missing", "pending", "ready", "review"]);

type FootballPlayerInventorySeed = {
  id: string;
  display_name: string | null;
  name: string | null;
  current_club_id: string | null;
  football_clubs: { name: string | null } | { name: string | null }[] | null;
};

async function ownerContext() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return { error: NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) {
    return { error: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
  }
  return { admin, user };
}

export async function POST() {
  const context = await ownerContext();
  if ("error" in context) return context.error;

  let players: FootballPlayerInventorySeed[];
  try {
    players = await collectPaginatedRows(async (from, to) => {
      const { data, error: playersError } = await context.admin
        .from("football_players")
        .select("id, display_name, name, current_club_id, football_clubs:current_club_id(name)")
        .order("id", { ascending: true })
        .range(from, to);

      if (playersError) throw new Error(playersError.message);
      return (data ?? []) as FootballPlayerInventorySeed[];
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Card inventory synchronization failed." },
      { status: 500 },
    );
  }

  const rows = players.map((player) => {
    const club = Array.isArray(player.football_clubs) ? player.football_clubs[0] : player.football_clubs;
    return {
    player_id: player.id,
    club_id: player.current_club_id ?? null,
    player_name: player.display_name ?? player.name ?? "Unnamed Player",
    club_name: club?.name ?? null,
    art_status: "missing",
    card_status: "pending",
    sale_status: "not_listed",
    updated_by: context.user!.id,
    created_by: context.user!.id,
    };
  });

  if (!rows.length) return NextResponse.json({ ok: true, inserted: 0, status: "No football players found." });

  for (let offset = 0; offset < rows.length; offset += TOUCHLINE_CARD_SYNC_PAGE_SIZE) {
    const { error } = await context.admin
      .from("touchline_card_inventory")
      .upsert(rows.slice(offset, offset + TOUCHLINE_CARD_SYNC_PAGE_SIZE), { onConflict: "player_id", ignoreDuplicates: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: rows.length,
    synchronized: rows.length,
    status: `${rows.length} card drafts synchronized from football foundation.`,
  });
}

export async function PATCH(request: NextRequest) {
  const context = await ownerContext();
  if ("error" in context) return context.error;

  const body = await request.json().catch(() => ({}));
  const cardId = typeof body.cardId === "string" ? body.cardId.trim() : "";
  if (!cardId) return NextResponse.json({ error: "cardId is required." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_by: context.user!.id };
  if (CARD_STATUSES.has(body.cardStatus)) patch.card_status = body.cardStatus;
  if (SALE_STATUSES.has(body.saleStatus)) patch.sale_status = body.saleStatus;
  if (ART_STATUSES.has(body.artStatus)) patch.art_status = body.artStatus;
  if (typeof body.frameColor === "string" && body.frameColor.trim()) patch.frame_color = body.frameColor.trim().slice(0, 64);
  if (typeof body.frameUrl === "string") patch.frame_url = body.frameUrl.trim() || null;
  if (typeof body.cardTemplateUrl === "string") patch.card_template_url = body.cardTemplateUrl.trim() || null;
  if (typeof body.avatarImageUrl === "string") patch.avatar_image_url = body.avatarImageUrl.trim() || null;
  if (patch.card_status === "published") patch.published_at = new Date().toISOString();
  if (patch.card_status === "reserved") patch.reserved_at = new Date().toISOString();
  if (patch.card_status === "sold") patch.sold_at = new Date().toISOString();

  const { data: before, error: beforeError } = await context.admin
    .from("touchline_card_inventory")
    .select("*")
    .eq("id", cardId)
    .maybeSingle();

  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  const { data: after, error } = await context.admin
    .from("touchline_card_inventory")
    .update(patch)
    .eq("id", cardId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await context.admin.from("touchline_card_inventory_history").insert({
    card_id: cardId,
    actor_id: context.user!.id,
    action: "admin_update",
    before_state: before,
    after_state: after,
  });

  return NextResponse.json({ ok: true, card: after });
}

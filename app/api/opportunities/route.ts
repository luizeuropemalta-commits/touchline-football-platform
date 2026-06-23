import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const statusActions: Record<string, string> = {
  send_profile: "sent_profile",
  request_contact: "contact_requested",
  open_negotiation: "negotiation",
  close: "closed",
  dismiss: "dismissed",
};

function cleanText(value: unknown, max = 220) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ opportunities: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("player_opportunities")
      .select("id, title, position_needed, age_min, age_max, requirements, match_score, status, source, expires_at, created_at, updated_at, players:player_id(id, first_name, last_name, position, photo_url), clubs:club_id(id, name, league, country_code)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) throw new Error(error.message);
    return NextResponse.json({ opportunities: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load opportunities." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const json = await readJsonObject(request);
    if (!json.ok) return json.response;
    const body = json.data;
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const opportunityId = cleanText(body.opportunityId, 80);
    const action = cleanText(body.action, 40);

    if (opportunityId && action) {
      const nextStatus = statusActions[action];
      if (!nextStatus) return NextResponse.json({ error: "Unsupported action." }, { status: 400 });

      const { data, error } = await admin
        .from("player_opportunities")
        .update({ status: nextStatus })
        .eq("agency_id", agencyId)
        .eq("id", opportunityId)
        .select("id, status")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, opportunity: data });
    }

    const title = cleanText(body.title, 220);
    if (!title) return NextResponse.json({ error: "Opportunity title is required." }, { status: 400 });

    const clubName = cleanText(body.clubName, 180);
    let clubId: string | null = null;
    if (clubName) {
      const { data: club, error: clubError } = await admin
        .from("clubs")
        .upsert({ agency_id: agencyId, name: clubName }, { onConflict: "agency_id,name" })
        .select("id")
        .single();
      if (clubError) throw new Error(clubError.message);
      clubId = club.id;
    }

    const playerId = cleanText(body.playerId, 80) || null;
    if (playerId) {
      const { data: player, error: playerError } = await admin
        .from("players")
        .select("id")
        .eq("agency_id", agencyId)
        .eq("id", playerId)
        .maybeSingle();
      if (playerError) throw new Error(playerError.message);
      if (!player) return NextResponse.json({ error: "Player not found." }, { status: 404 });
    }

    const { data, error } = await admin
      .from("player_opportunities")
      .insert({
        agency_id: agencyId,
        player_id: playerId,
        club_id: clubId,
        title,
        position_needed: cleanText(body.positionNeeded, 80) || null,
        age_min: cleanNumber(body.ageMin),
        age_max: cleanNumber(body.ageMax),
        requirements: {
          eu_passport: Boolean(body.euPassport),
          notes: cleanText(body.notes, 1000),
        },
        match_score: cleanNumber(body.matchScore) ?? 70,
        status: "open",
        source: cleanText(body.source, 40) || "manual",
        created_by: user.id,
      })
      .select("id, status")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, opportunity: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save opportunity." }, { status: 500 });
  }
}

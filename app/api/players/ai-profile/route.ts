import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function ageFromDate(date?: string | null) {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
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
    const body = json.data as { playerId?: string };
    const playerId = cleanText(body.playerId, 80);
    if (!playerId) return NextResponse.json({ error: "Player ID is required." }, { status: 400 });

    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id, first_name, last_name, date_of_birth, nationality, position, preferred_foot, market_value, currency, contract_end_date, height_cm, weight_kg, clubs:current_club_id(name)")
      .eq("agency_id", agencyId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) throw new Error(playerError.message);
    if (!player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

    const name = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "The player";
    const club = clubName(player.clubs as ClubJoin);
    const age = ageFromDate(player.date_of_birth);
    const position = player.position || "versatile footballer";
    const value = player.market_value ? `${player.currency ?? "EUR"} ${Number(player.market_value).toLocaleString()}` : "market value to be confirmed";

    const aiProfile = {
      professional_biography: `${name} is a ${age ? `${age}-year-old ` : ""}${position}${player.nationality ? ` from ${player.nationality}` : ""}${club ? ` currently connected to ${club}` : ""}. Touchline profile data is ready for club presentation and representation workflow review.`,
      scouting_summary: `${name} should be positioned with clubs looking for ${position} profiles. Current data indicates ${value}, with contract status ${player.contract_end_date ? `ending on ${player.contract_end_date}` : "still to be completed"}.`,
      strengths: [
        player.position ? `Clear positional profile: ${player.position}` : "Flexible role profile",
        player.preferred_foot ? `Preferred foot documented: ${player.preferred_foot}` : "Footedness pending confirmation",
        player.height_cm ? `Physical profile captured: ${player.height_cm}cm` : "Physical data can be enriched",
      ],
      weaknesses: [
        "Needs verified performance metrics before elite club presentation",
        "Needs updated video highlights for recruitment teams",
        "Representation documentation should be attached before public promotion",
      ],
      market_recommendation: "Prepare a professional player presentation, attach authorized documents and target clubs with active positional needs before opening negotiation.",
      club_recommendations: [
        "Clubs with open requirement matching the player position",
        "Recruitment teams following this agency",
        "Markets where contract timing and passport status create transfer value",
      ],
      generated: true,
      generated_at: new Date().toISOString(),
      generator: "touchline_phase2_rule_engine",
    };

    const { error: updateError } = await admin
      .from("players")
      .update({ ai_profile: aiProfile })
      .eq("agency_id", agencyId)
      .eq("id", playerId);

    if (updateError) throw new Error(updateError.message);

    await admin.from("ai_generated_documents").insert({
      agency_id: agencyId,
      created_by: user.id,
      target_type: "player",
      target_id: playerId,
      document_type: "player_presentation",
      title: `${name} — AI Player Profile`,
      content: `${aiProfile.professional_biography}\n\n${aiProfile.scouting_summary}\n\nMarket recommendation: ${aiProfile.market_recommendation}`,
      status: "draft",
      metadata: aiProfile,
    });

    return NextResponse.json({ ok: true, aiProfile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate AI profile." }, { status: 500 });
  }
}

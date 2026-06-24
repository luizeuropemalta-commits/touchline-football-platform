import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

    const playerId = cleanText(json.data.playerId, 80);
    const targetClub = cleanText(json.data.targetClub, 160);
    const recipient = cleanText(json.data.recipient, 160);
    const objective = cleanText(json.data.objective, 160) || "Player presentation";
    const tone = cleanText(json.data.tone, 80) || "Premium";
    const notes = cleanText(json.data.notes, 1200);
    const pitchText = cleanText(json.data.pitchText, 8000);

    if (!playerId) return NextResponse.json({ error: "Player ID is required." }, { status: 400 });
    if (!pitchText) return NextResponse.json({ error: "Pitch text is required." }, { status: 400 });

    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id, first_name, last_name")
      .eq("agency_id", agencyId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) throw new Error(playerError.message);
    if (!player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

    const playerName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Player";
    const title = `${playerName} — ${targetClub ? `${targetClub} ` : ""}${objective} Pitch`;

    const { data: document, error: insertError } = await admin
      .from("ai_generated_documents")
      .insert({
        agency_id: agencyId,
        created_by: user.id,
        target_type: "player",
        target_id: playerId,
        document_type: "player_presentation",
        title,
        content: pitchText,
        status: "draft",
        metadata: {
          generator: "touchline_pitch_player",
          targetClub,
          recipient,
          objective,
          tone,
          notes,
          savedAt: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ ok: true, documentId: document?.id ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save pitch." }, { status: 500 });
  }
}

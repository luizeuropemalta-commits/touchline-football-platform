import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type RoomRow = {
  id: string;
  interest_id: string | null;
  deal_id: string | null;
  player_id: string | null;
  club_id: string | null;
  title: string;
  status: string;
};

function cleanText(value: unknown, max = 3000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getRoom(admin: Awaited<ReturnType<typeof ensureUserWorkspace>>["admin"], agencyId: string, roomId: string) {
  const { data, error } = await admin
    .from("negotiation_rooms")
    .select("id, interest_id, deal_id, player_id, club_id, title, status")
    .eq("agency_id", agencyId)
    .eq("id", roomId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as RoomRow | null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const json = await readJsonObject(request);
    if (!json.ok) return json.response;

    const action = cleanText(json.data.action, 80);
    const body = cleanText(json.data.body, 3000);
    const status = cleanText(json.data.status, 80);
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const room = await getRoom(admin, agencyId, id);
    if (!room) return NextResponse.json({ error: "Deal room not found." }, { status: 404 });

    if (action === "add_message" || action === "add_note") {
      if (!body) return NextResponse.json({ error: "Message is required." }, { status: 400 });
      const messageBody = action === "add_note" ? `[NOTE] ${body}` : body;
      const { data, error } = await admin
        .from("negotiation_messages")
        .insert({
          agency_id: agencyId,
          room_id: room.id,
          sender_id: user.id,
          body: messageBody,
        })
        .select("id, body, created_at")
        .single();

      if (error) throw new Error(error.message);
      await admin.from("negotiation_rooms").update({ status: room.status }).eq("agency_id", agencyId).eq("id", room.id);
      return NextResponse.json({ ok: true, message: data });
    }

    if (action === "add_file_reference") {
      const name = cleanText(json.data.name, 180);
      const storagePath = cleanText(json.data.storagePath, 1000);
      if (!name || !storagePath) return NextResponse.json({ error: "File name and path are required." }, { status: 400 });
      const { data, error } = await admin
        .from("negotiation_files")
        .insert({
          agency_id: agencyId,
          room_id: room.id,
          uploaded_by: user.id,
          name,
          storage_path: storagePath,
          mime_type: cleanText(json.data.mimeType, 180) || null,
          size_bytes: null,
        })
        .select("id, name, storage_path, mime_type, size_bytes, created_at")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, file: data });
    }

    if (action === "update_status") {
      const allowedRoomStatuses = new Set(["active", "paused", "closed", "archived"]);
      const nextStatus = allowedRoomStatuses.has(status) ? status : "";
      if (!nextStatus) return NextResponse.json({ error: "Unsupported room status." }, { status: 400 });

      const { data, error } = await admin
        .from("negotiation_rooms")
        .update({ status: nextStatus })
        .eq("agency_id", agencyId)
        .eq("id", room.id)
        .select("id, status")
        .single();

      if (error) throw new Error(error.message);
      if (room.interest_id) {
        const interestStatus =
          nextStatus === "closed" ? "deal_closed" :
          nextStatus === "archived" ? "declined" :
          nextStatus === "active" ? "negotiation" :
          null;
        if (interestStatus) {
          await admin.from("player_interests").update({ status: interestStatus }).eq("agency_id", agencyId).eq("id", room.interest_id);
        }
      }

      await admin.from("negotiation_messages").insert({
        agency_id: agencyId,
        room_id: room.id,
        sender_id: user.id,
        body: `[SYSTEM] Room marked as ${nextStatus.replaceAll("_", " ")}`,
      });

      return NextResponse.json({ ok: true, room: data });
    }

    if (action === "mark_proposal_sent") {
      await admin.from("negotiation_messages").insert({
        agency_id: agencyId,
        room_id: room.id,
        sender_id: user.id,
        body: "[SYSTEM] Proposal / pitch sent to club",
      });
      if (room.interest_id) {
        await admin.from("player_interests").update({ status: "contact_started" }).eq("agency_id", agencyId).eq("id", room.interest_id);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update deal room." }, { status: 500 });
  }
}

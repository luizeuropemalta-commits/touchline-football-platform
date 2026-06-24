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

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanDate(value: unknown) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : text;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateAfter(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function invoiceNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `TL-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
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

async function ensureDeal({
  admin,
  agencyId,
  userId,
  room,
  estimatedValue,
  agencyFee,
  currency,
}: {
  admin: Awaited<ReturnType<typeof ensureUserWorkspace>>["admin"];
  agencyId: string;
  userId: string;
  room: RoomRow;
  estimatedValue: number | null;
  agencyFee: number | null;
  currency: string;
}) {
  if (!room.player_id) throw new Error("This room needs a connected player before creating contracts or invoices.");

  if (room.deal_id) {
    const { data, error } = await admin
      .from("deals")
      .update({
        estimated_value: estimatedValue,
        agency_fee: agencyFee,
        currency,
        status: "paperwork",
      })
      .eq("agency_id", agencyId)
      .eq("id", room.deal_id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  const { data, error } = await admin
    .from("deals")
    .insert({
      agency_id: agencyId,
      player_id: room.player_id,
      club_id: room.club_id,
      owner_id: userId,
      title: room.title,
      deal_type: "transfer",
      status: "paperwork",
      estimated_value: estimatedValue,
      agency_fee: agencyFee,
      currency,
      probability: 75,
      notes: "Created from Club Deal Room commercial flow.",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const dealId = data.id as string;
  const { error: roomError } = await admin
    .from("negotiation_rooms")
    .update({ deal_id: dealId })
    .eq("agency_id", agencyId)
    .eq("id", room.id);
  if (roomError) throw new Error(roomError.message);

  return dealId;
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
    const estimatedValue = cleanNumber(json.data.estimatedValue);
    const agencyFee = cleanNumber(json.data.agencyFee);
    const taxAmount = cleanNumber(json.data.taxAmount) ?? 0;
    const currency = cleanText(json.data.currency, 3) || "EUR";
    const dueDate = cleanDate(json.data.dueDate) || dateAfter(14);
    const contractEndDate = cleanDate(json.data.contractEndDate) || dateAfter(365);
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

    if (action === "save_commercial_terms") {
      const dealId = await ensureDeal({ admin, agencyId, userId: user.id, room, estimatedValue, agencyFee, currency });
      await admin.from("negotiation_messages").insert({
        agency_id: agencyId,
        room_id: room.id,
        sender_id: user.id,
        body: `[SYSTEM] Commercial terms saved: value ${currency} ${estimatedValue ?? 0}, agency fee ${currency} ${agencyFee ?? 0}`,
      });
      return NextResponse.json({ ok: true, dealId });
    }

    if (action === "create_contract") {
      if (!room.player_id) return NextResponse.json({ error: "This room needs a connected player before creating a contract." }, { status: 400 });
      const dealId = await ensureDeal({ admin, agencyId, userId: user.id, room, estimatedValue, agencyFee, currency });
      const contractType = cleanText(json.data.contractType, 40) || "playing";
      const allowedContractTypes = new Set(["playing", "representation", "loan", "endorsement", "other"]);

      const { data: contract, error: contractError } = await admin
        .from("contracts")
        .insert({
          agency_id: agencyId,
          player_id: room.player_id,
          club_id: room.club_id,
          deal_id: dealId,
          contract_type: allowedContractTypes.has(contractType) ? contractType : "playing",
          status: "draft",
          starts_on: todayDate(),
          expires_on: contractEndDate,
          gross_value: estimatedValue,
          currency,
          metadata: {
            source: "deal_room",
            roomId: room.id,
            agencyFee,
            generatedAt: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (contractError) throw new Error(contractError.message);

      await admin.from("ai_generated_documents").insert({
        agency_id: agencyId,
        created_by: user.id,
        target_type: "deal",
        target_id: dealId,
        document_type: "contract",
        title: `${room.title} — Contract Draft`,
        content: `Contract draft created from Deal Room.\n\nDeal value: ${currency} ${estimatedValue ?? 0}\nAgency fee: ${currency} ${agencyFee ?? 0}\nContract end: ${contractEndDate}\n\nLegal review required before signature.`,
        status: "draft",
        metadata: {
          source: "deal_room_contract_flow",
          roomId: room.id,
          contractId: contract.id,
          estimatedValue,
          agencyFee,
          currency,
          contractEndDate,
        },
      });

      await admin.from("negotiation_messages").insert({
        agency_id: agencyId,
        room_id: room.id,
        sender_id: user.id,
        body: `[SYSTEM] Contract draft created`,
      });

      return NextResponse.json({ ok: true, dealId, contractId: contract.id });
    }

    if (action === "create_invoice") {
      if (!room.player_id) return NextResponse.json({ error: "This room needs a connected player before creating an invoice." }, { status: 400 });
      const dealId = await ensureDeal({ admin, agencyId, userId: user.id, room, estimatedValue, agencyFee, currency });

      const { data: club } = room.club_id
        ? await admin.from("clubs").select("name").eq("agency_id", agencyId).eq("id", room.club_id).maybeSingle()
        : { data: null };

      const subtotal = agencyFee ?? (estimatedValue ? Math.round(estimatedValue * 0.1) : 0);
      const { data: invoice, error: invoiceError } = await admin
        .from("invoices")
        .insert({
          agency_id: agencyId,
          deal_id: dealId,
          player_id: room.player_id,
          invoice_number: invoiceNumber(),
          status: "draft",
          client_name: club?.name ?? room.title,
          client_details: {
            source: "deal_room",
            roomId: room.id,
          },
          subtotal,
          tax_amount: taxAmount,
          currency,
          issued_on: todayDate(),
          due_on: dueDate,
          notes: "Created from Club Deal Room commercial flow.",
        })
        .select("id, invoice_number")
        .single();

      if (invoiceError) throw new Error(invoiceError.message);

      await admin.from("negotiation_messages").insert({
        agency_id: agencyId,
        room_id: room.id,
        sender_id: user.id,
        body: `[SYSTEM] Invoice draft created: ${invoice.invoice_number}`,
      });

      return NextResponse.json({ ok: true, dealId, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update deal room." }, { status: 500 });
  }
}

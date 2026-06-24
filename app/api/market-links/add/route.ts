import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { transfermarktAllowedTypes, upsertTransfermarktEntity, type TransfermarktEntityType } from "@/lib/market-link-registry";

function cleanString(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanType(value: unknown): TransfermarktEntityType | null {
  const type = cleanString(value, 40).toLowerCase();
  return transfermarktAllowedTypes.has(type) ? type as TransfermarktEntityType : null;
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Login required." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });

  const url = cleanString(body.data.url);
  if (!url) return NextResponse.json({ ok: false, error: "Transfermarkt URL is required." }, { status: 400 });

  try {
    const result = await upsertTransfermarktEntity(admin, {
      url,
      name: cleanString(body.data.name, 180) || null,
      entityType: cleanType(body.data.entityType),
      photoUrl: cleanString(body.data.photoUrl, 1000) || null,
      sourceUrl: cleanString(body.data.sourceUrl, 1000) || null,
      createdBy: user.id,
      action: "manual_add",
      fetchPreview: body.data.fetchPreview !== false,
      discoverRelationships: body.data.discoverRelationships === true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save Transfermarkt link." },
      { status: 400 },
    );
  }
}

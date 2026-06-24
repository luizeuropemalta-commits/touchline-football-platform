import { NextResponse } from "next/server";
import { discoverTransfermarktLinksByName, transfermarktAllowedTypes, type TransfermarktEntityType } from "@/lib/market-link-registry";
import { readJsonObject } from "@/lib/server/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function cleanString(value: unknown, max = 100) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function cleanType(value: unknown): TransfermarktEntityType {
  const type = cleanString(value, 40).toLowerCase();
  return transfermarktAllowedTypes.has(type) ? type as TransfermarktEntityType : "player";
}

function cleanLimit(value: unknown) {
  const parsed = Number(value ?? 8);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.round(parsed), 1), 15);
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

  const query = cleanString(body.data.query ?? body.data.q);
  if (query.length < 3) {
    return NextResponse.json({ ok: false, error: "Type at least 3 letters to discover external links." }, { status: 400 });
  }

  const result = await discoverTransfermarktLinksByName(admin, {
    query,
    entityType: cleanType(body.data.entityType),
    limit: cleanLimit(body.data.limit),
    createdBy: user.id,
  });

  return NextResponse.json({ ok: true, ...result });
}

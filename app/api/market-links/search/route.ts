import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { transfermarktAllowedTypes, type TransfermarktEntityType } from "@/lib/market-link-registry";

function cleanQuery(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
}

function cleanLimit(value: string | null) {
  const parsed = Number(value ?? 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.round(parsed), 1), 100);
}

function cleanType(value: string | null): TransfermarktEntityType | null {
  const type = value?.trim().toLowerCase() ?? "";
  return transfermarktAllowedTypes.has(type) ? type as TransfermarktEntityType : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Login required." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const query = cleanQuery(searchParams.get("q"));
  const limit = cleanLimit(searchParams.get("limit"));
  const type = cleanType(searchParams.get("type"));

  if (query.length < 2) return NextResponse.json({ ok: true, entities: [] });

  const { data, error } = await admin.rpc("search_transfermarkt_entities", {
    search_query: query,
    entity_type_filter: type,
    result_limit: limit,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entities: data ?? [] });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set(["player", "agent", "club", "coach", "competition", "other"]);

function cleanQuery(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
}

function cleanLimit(value: string | null) {
  const limit = Number(value ?? 20);
  if (!Number.isFinite(limit)) return 20;
  return Math.min(Math.max(Math.round(limit), 1), 100);
}

function cleanEntityType(value: string | null) {
  const type = value?.trim().toLowerCase() ?? "";
  return allowedTypes.has(type) ? type : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const query = cleanQuery(searchParams.get("q"));
  const limit = cleanLimit(searchParams.get("limit"));
  const entityType = cleanEntityType(searchParams.get("type"));

  if (query.length < 2) return NextResponse.json({ links: [] });

  const { data, error } = await admin.rpc("search_global_football_links", {
    search_query: query,
    entity_type_filter: entityType,
    result_limit: limit,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ links: data ?? [] });
}

import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { transfermarktAllowedTypes, type TransfermarktEntityType } from "@/lib/market-link-registry";

function cleanQuery(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
}

function cleanType(value: string | null): TransfermarktEntityType | null {
  const type = value?.trim().toLowerCase() ?? "";
  return transfermarktAllowedTypes.has(type) ? type as TransfermarktEntityType : null;
}

function cleanStatus(value: string | null) {
  const status = value?.trim().toLowerCase() ?? "";
  return ["active", "unavailable", "changed", "duplicate", "needs_review", "rejected"].includes(status) ? status : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isOwnerEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "Owner access required." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const q = cleanQuery(searchParams.get("q"));
  const type = cleanType(searchParams.get("type"));
  const status = cleanStatus(searchParams.get("status"));

  let query = admin
    .from("transfermarkt_entities")
    .select("id, transfermarkt_id, entity_type, name, profile_url, canonical_url, photo_url, status, confidence, last_checked_at, next_check_at, source_url, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (type) query = query.eq("entity_type", type);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`name.ilike.%${q}%,transfermarkt_id.eq.${q}`);

  const [{ data: entities, error }, { data: logs }, { data: relationships }] = await Promise.all([
    query,
    admin
      .from("transfermarkt_sync_logs")
      .select("id, action, status, source_url, message, records_found, records_saved, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("transfermarkt_relationships")
      .select("id, relationship_type, status, evidence, source_url, last_seen_at, source:transfermarkt_entities!transfermarkt_relationships_source_entity_id_fkey(id, name, entity_type, transfermarkt_id), target:transfermarkt_entities!transfermarkt_relationships_target_entity_id_fkey(id, name, entity_type, transfermarkt_id)")
      .order("last_seen_at", { ascending: false })
      .limit(50),
  ]);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const counts = await Promise.all([
    admin.from("transfermarkt_entities").select("id", { count: "exact", head: true }),
    admin.from("transfermarkt_entities").select("id", { count: "exact", head: true }).eq("entity_type", "player"),
    admin.from("transfermarkt_entities").select("id", { count: "exact", head: true }).eq("entity_type", "agent"),
    admin.from("transfermarkt_entities").select("id", { count: "exact", head: true }).eq("entity_type", "club"),
    admin.from("transfermarkt_entities").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
  ]);

  return NextResponse.json({
    ok: true,
    entities: entities ?? [],
    logs: logs ?? [],
    relationships: relationships ?? [],
    counts: {
      total: counts[0].count ?? 0,
      players: counts[1].count ?? 0,
      agents: counts[2].count ?? 0,
      clubs: counts[3].count ?? 0,
      needsReview: counts[4].count ?? 0,
    },
  });
}

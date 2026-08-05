import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import {
  applyTouchlineMarketValueImport,
  type TouchlineMarketValueImportRequest,
} from "@/lib/touchlineArena/market-value-import-server";
import type { TouchlineMarketValueImportRow } from "@/lib/touchlineArena/market-value-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

const JOB_KEYS = new Set([
  "annual_full_refresh",
  "final_delta_refresh",
  "transfer_window_roster_detection",
  "manual_emergency_player_import",
]);
const SCOPES = new Set(["player", "club", "competition", "league"]);

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveIntegerOrNull(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function importRows(value: unknown): TouchlineMarketValueImportRow[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const rows: TouchlineMarketValueImportRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const currency = cleanText(row.currency);
    if (currency !== null && currency !== "EUR" && currency !== "GBP" && currency !== "USD") return null;
    rows.push({
      playerId: cleanText(row.playerId) ?? "",
      externalPlayerId: cleanText(row.externalPlayerId),
      sourceUrl: cleanText(row.sourceUrl),
      marketValue: row.marketValue === null ? null : positiveIntegerOrNull(row.marketValue),
      currency: currency as TouchlineMarketValueImportRow["currency"],
      marketValueEur: row.marketValueEur === null ? null : positiveIntegerOrNull(row.marketValueEur),
    });
  }
  return rows;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: "Server market-value administration is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }
  const actorUserId = user?.id;
  if (!actorUserId) return NextResponse.json({ error: "Owner session is unavailable." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const rows = importRows(body?.rows);
  const scope = cleanText(body?.scope);
  const verifiedSeason = cleanText(body?.verifiedSeason);
  const jobKey = cleanText(body?.jobKey);
  const source = cleanText(body?.source);
  if (!body || !rows || !scope || !SCOPES.has(scope) || !verifiedSeason || !jobKey || !JOB_KEYS.has(jobKey)) {
    return NextResponse.json({ error: "Invalid import request." }, { status: 400 });
  }
  if (source !== "licensed_import" && source !== "manual_approval") {
    return NextResponse.json({ error: "Only an approved licensed import or manual approval is accepted." }, { status: 400 });
  }

  try {
    const result = await applyTouchlineMarketValueImport(admin, {
      scope: scope as TouchlineMarketValueImportRequest["scope"],
      verifiedSeason,
      source,
      actorUserId,
      rows,
      jobKey: jobKey as TouchlineMarketValueImportRequest["jobKey"],
      competitionId: cleanText(body.competitionId),
      clubId: cleanText(body.clubId),
      sourceImportFile: cleanText(body.sourceImportFile),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Market-value import failed." }, { status: 500 });
  }
}

/** Owner-only queue actions. Approval re-enters the same canonical importer so
 * history and run accounting remain complete; it never touches card economy. */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: "Server market-value administration is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const actorUserId = user?.id;
  if (!actorUserId) return NextResponse.json({ error: "Owner session is unavailable." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = cleanText(body?.action);
  const itemId = cleanText(body?.itemId);
  if (!body || !action || !itemId) return NextResponse.json({ error: "A queue action and itemId are required." }, { status: 400 });

  if (action === "reject") {
    const reason = cleanText(body.reason) ?? "rejected-by-owner";
    const { error } = await admin.from("football_market_value_import_items").update({ status: "rejected", failure_code: reason }).eq("id", itemId);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "map") {
    const playerId = cleanText(body.playerId);
    if (!playerId) return NextResponse.json({ error: "A canonical playerId is required for mapping." }, { status: 400 });
    const { error } = await admin.from("football_market_value_import_items").update({ player_id: playerId, status: "pending", failure_code: null }).eq("id", itemId);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, status: "pending" });
  }

  if (action === "approve") {
    const approvedRows = importRows([body.row]);
    const row = approvedRows?.[0];
    const verifiedSeason = cleanText(body.verifiedSeason);
    if (!row || !verifiedSeason) return NextResponse.json({ error: "An approved row and verifiedSeason are required." }, { status: 400 });
    try {
      const result = await applyTouchlineMarketValueImport(admin, {
        scope: "player",
        verifiedSeason,
        source: "manual_approval",
        actorUserId,
        rows: [row],
        jobKey: "manual_emergency_player_import",
      });
      const { error } = await admin.from("football_market_value_import_items").update({ status: "imported", failure_code: null }).eq("id", itemId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, result });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Market-value approval failed." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Unsupported market-value queue action." }, { status: 400 });
}

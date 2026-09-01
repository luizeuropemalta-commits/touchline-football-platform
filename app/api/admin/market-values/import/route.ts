import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import {
  createTouchlineCardEngineBatch,
  type TouchlineCardEngineBatchSourceType,
} from "@/lib/touchlineArena/card-engine-batch-server";
import { loadTouchlineCardEngineCandidates } from "@/lib/touchlineArena/card-engine-candidates-server";
import {
  prepareTouchlineMarketValueCardEngineRows,
  touchlineMarketValueBatchContentIdentity,
  type TouchlineMarketValueBatchSource,
} from "@/lib/touchlineArena/card-engine-market-value-batch";
import { CARD_ENGINE_IMPORT_MAX_ROWS, summarizeCardEngineRows } from "@/lib/touchlineArena/card-engine-editorial-import";
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
  if (!Array.isArray(value) || !value.length || value.length > CARD_ENGINE_IMPORT_MAX_ROWS) return null;
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

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function cardEngineSourceType(source: TouchlineMarketValueBatchSource): TouchlineCardEngineBatchSourceType {
  return source === "licensed_import" ? "csv" : "single_edit";
}

async function createMarketValueReviewBatch(input: Readonly<{
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  actorUserId: string;
  rows: readonly TouchlineMarketValueImportRow[];
  scope: string;
  verifiedSeason: string;
  source: TouchlineMarketValueBatchSource;
  jobKey: string;
  competitionId?: string | null;
  clubId?: string | null;
  sourceImportFile?: string | null;
}>) {
  const resolved = prepareTouchlineMarketValueCardEngineRows({
    rows: input.rows,
    candidates: await loadTouchlineCardEngineCandidates(input.admin),
    source: input.source,
  });
  const summary = summarizeCardEngineRows(resolved);
  const batch = await createTouchlineCardEngineBatch(input.admin, {
    sourceType: cardEngineSourceType(input.source),
    sourceFilename: input.sourceImportFile,
    effectiveSeason: input.verifiedSeason,
    rows: resolved,
    actorId: input.actorUserId,
    contentIdentity: touchlineMarketValueBatchContentIdentity({
      scope: input.scope,
      verifiedSeason: input.verifiedSeason,
      source: input.source,
      jobKey: input.jobKey,
      competitionId: input.competitionId,
      clubId: input.clubId,
      rows: input.rows,
    }),
  });
  return { batch, summary, rows: resolved };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Market Values write blocked." }, { status: 403 });
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
    const result = await createMarketValueReviewBatch({
      admin,
      scope,
      verifiedSeason,
      source: source as TouchlineMarketValueBatchSource,
      actorUserId,
      rows,
      jobKey,
      competitionId: cleanText(body.competitionId),
      clubId: cleanText(body.clubId),
      sourceImportFile: cleanText(body.sourceImportFile),
    });
    return NextResponse.json({ ok: true, result, nextAction: "review_in_card_engine" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Market Values batch creation failed." }, { status: 409 });
  }
}

/** Owner-only queue actions. A queue approval creates a Card Engine review
 * batch; it does not publish or mutate a player Market Value directly. */
export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Market Values write blocked." }, { status: 403 });
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
      const result = await createMarketValueReviewBatch({
        admin,
        scope: "player",
        verifiedSeason,
        source: "manual_approval",
        actorUserId,
        rows: [row],
        jobKey: "manual_emergency_player_import",
        sourceImportFile: `market-value-queue-item-${itemId}`,
      });
      return NextResponse.json({ ok: true, status: "card_engine_review_required", result });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Market Values review batch creation failed." }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Unsupported market-value queue action." }, { status: 400 });
}

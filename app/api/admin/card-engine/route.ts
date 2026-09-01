import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  parseCardEngineDelimitedInput,
  resolveCardEngineImportRows,
  summarizeCardEngineRows,
} from "@/lib/touchlineArena/card-engine-editorial-import";
import {
  createTouchlineCardEngineBatch,
  transitionTouchlineCardEngineBatch,
  type TouchlineCardEngineBatchAction,
  type TouchlineCardEngineBatchSourceType,
} from "@/lib/touchlineArena/card-engine-batch-server";
import { loadTouchlineCardEngineCandidates } from "@/lib/touchlineArena/card-engine-candidates-server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

const MAX_IMPORT_BYTES = 250_000;
const MAX_REQUEST_BYTES = MAX_IMPORT_BYTES + 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max = 1_000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

async function readBoundedJson(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) return { body: null, tooLarge: true } as const;
  const reader = request.body?.getReader();
  if (!reader) return { body: null, tooLarge: false } as const;
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return { body: null, tooLarge: true } as const;
    }
    chunks.push(value);
  }
  const payload = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }
  try { return { body: JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>, tooLarge: false } as const; }
  catch { return { body: null, tooLarge: false } as const; }
}

async function ownerContext() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return { error: NextResponse.json({ error: "Protected Card Engine administration is not configured." }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user.email)) return { error: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
  return { admin, user };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Card Engine write blocked." }, { status: 403 });
  const parsedRequest = await readBoundedJson(request);
  if (parsedRequest.tooLarge) return NextResponse.json({ error: "Import exceeds the 250 KB limit." }, { status: 413 });
  const context = await ownerContext();
  if ("error" in context) return context.error;
  const body = parsedRequest.body;
  if (!body) return NextResponse.json({ error: "Invalid Card Engine request." }, { status: 400 });
  const action = text(body.action, 32);
  const importText = typeof body.text === "string" ? body.text.slice(0, MAX_IMPORT_BYTES) : "";
  const sourceType = text(body.sourceType, 24);
  const effectiveSeason = text(body.effectiveSeason, 16);
  if ((action !== "preview" && action !== "create") || !importText || !["paste", "csv", "single_edit", "qa_fixture"].includes(sourceType) || !/^\d{4}-\d{2,4}$/.test(effectiveSeason)) {
    return NextResponse.json({ error: "A bounded CSV/TSV/paste import, source type and season are required." }, { status: 400 });
  }
  const parsed = parseCardEngineDelimitedInput(importText);
  if (!parsed.length) return NextResponse.json({ error: "No valid header/data rows were found. Use provider_player_id, player_id, name, club, date_of_birth, display_name, shirt_number, market_value_eur or card_template_key." }, { status: 400 });
  try {
    const resolved = resolveCardEngineImportRows(parsed, await loadTouchlineCardEngineCandidates(context.admin));
    const summary = summarizeCardEngineRows(resolved);
    if (action === "preview") return NextResponse.json({ ok: true, rows: resolved, summary, publishable: summary.review + summary.conflict + summary.unmatched === 0 });
    const batch = await createTouchlineCardEngineBatch(context.admin, {
      sourceType: sourceType as TouchlineCardEngineBatchSourceType,
      sourceFilename: text(body.fileName, 255) || null,
      effectiveSeason,
      rows: resolved,
      actorId: context.user.id,
      contentIdentity: importText,
    });
    return NextResponse.json({ ok: true, batch, summary, rows: resolved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Card Engine resolution failed." }, { status: 409 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Card Engine write blocked." }, { status: 403 });
  const parsedRequest = await readBoundedJson(request);
  if (parsedRequest.tooLarge) return NextResponse.json({ error: "Card Engine request exceeds the size limit." }, { status: 413 });
  const context = await ownerContext();
  if ("error" in context) return context.error;
  const body = parsedRequest.body;
  const action = text(body?.action, 32);
  const batchId = text(body?.batchId, 64).toLowerCase();
  if (!UUID_PATTERN.test(batchId) || !["approve", "publish", "rollback"].includes(action)) return NextResponse.json({ error: "A valid batch and action are required." }, { status: 400 });
  try {
    const result = await transitionTouchlineCardEngineBatch(context.admin, {
      action: action as TouchlineCardEngineBatchAction,
      batchId,
      actorId: context.user.id,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Card Engine command failed." }, { status: 409 });
  }
}

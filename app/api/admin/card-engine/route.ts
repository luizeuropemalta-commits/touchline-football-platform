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
  return origin === request.nextUrl.origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

async function readBoundedJson(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) return { body: null, tooLarge: true } as const;
  const reader = request.body?.getReader();
  if (!reader) return { body: null, tooLarge: false } as const;
  const chunks: Uint8Array[] = [];
  let received = 0;
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error("BODY_TIMEOUT")); void reader.cancel().catch(() => {}); }, 10_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { complete = true; break; }
      received += value.byteLength;
      if (received > MAX_REQUEST_BYTES) return { body: null, tooLarge: true } as const;
      chunks.push(value);
    }
  } catch (error) {
    return { body: null, tooLarge: false, timedOut: error instanceof Error && error.message === "BODY_TIMEOUT" } as const;
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const payload = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }
  try { return { body: JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>, tooLarge: false } as const; }
  catch { return { body: null, tooLarge: false } as const; }
}

async function ownerContext() {
  try {
    const supabase = await createClient();
    if (!supabase) return { error: NextResponse.json({ error: "Protected Card Engine administration is not configured." }, { status: 503 }) };
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return { error: NextResponse.json({ error: "Owner authentication could not be confirmed." }, { status: 503 }) };
    if (!user?.id || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user.email)) return { error: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
    const admin = createAdminClient();
    if (!admin) return { error: NextResponse.json({ error: "Protected Card Engine administration is not configured." }, { status: 503 }) };
    return { admin, user };
  } catch {
    return { error: NextResponse.json({ error: "Owner authentication could not be confirmed." }, { status: 503 }) };
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Card Engine write blocked." }, { status: 403 });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return NextResponse.json({ error: "JSON Card Engine request required." }, { status: 415 });
  const parsedRequest = await readBoundedJson(request);
  if ("timedOut" in parsedRequest && parsedRequest.timedOut) return NextResponse.json({ error: "Card Engine request body timed out." }, { status: 408 });
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
  } catch {
    return NextResponse.json({ error: "Card Engine resolution could not be confirmed. Reload the review history before retrying." }, { status: 409 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin Card Engine write blocked." }, { status: 403 });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return NextResponse.json({ error: "JSON Card Engine request required." }, { status: 415 });
  const parsedRequest = await readBoundedJson(request);
  if ("timedOut" in parsedRequest && parsedRequest.timedOut) return NextResponse.json({ error: "Card Engine request body timed out." }, { status: 408 });
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
  } catch {
    return NextResponse.json({ error: "Card Engine command could not be confirmed. Reload the review history before retrying." }, { status: 409 });
  }
}

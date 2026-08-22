import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  parseCardEngineDelimitedInput,
  resolveCardEngineImportRows,
  summarizeCardEngineRows,
  type CardEngineCandidate,
} from "@/lib/touchlineArena/card-engine-editorial-import";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

const MAX_IMPORT_BYTES = 250_000;
const MAX_REQUEST_BYTES = MAX_IMPORT_BYTES + 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EngineRpc = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

function text(value: unknown, max = 1_000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
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

async function candidates(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: players, error } = await admin
    .from("football_players")
    .select("id,provider_player_id,display_name,name,date_of_birth,source_updated_at,current_club_id,football_clubs:current_club_id(name)")
    .eq("provider", "sportmonks")
    .not("current_club_id", "is", null)
    .limit(1_000);
  if (error) throw new Error(error.message);
  const ids = (players ?? []).map((player) => player.id).filter((id): id is string => UUID_PATTERN.test(id));
  const { data: memberships, error: membershipError } = ids.length
    ? await admin.from("football_squad_members").select("player_id,jersey_number,club_id,status,provider").in("player_id", ids).eq("provider", "sportmonks").eq("status", "active")
    : { data: [], error: null };
  if (membershipError) throw new Error(membershipError.message);
  const membershipsByPlayer = new Map<string, Array<{ jersey_number: number | null; club_id: string }>>();
  for (const membership of memberships ?? []) membershipsByPlayer.set(membership.player_id, [...(membershipsByPlayer.get(membership.player_id) ?? []), membership]);
  return (players ?? []).flatMap((player) => {
    const club = Array.isArray(player.football_clubs) ? player.football_clubs[0] : player.football_clubs;
    const membershipsForPlayer = membershipsByPlayer.get(player.id) ?? [];
    if (!player.provider_player_id || membershipsForPlayer.length !== 1 || membershipsForPlayer[0]!.club_id !== player.current_club_id) return [];
    const member = membershipsForPlayer[0]!;
    return [{
      playerId: player.id, providerPlayerId: player.provider_player_id,
      name: player.display_name || player.name || "", club: club?.name || null,
      dateOfBirth: player.date_of_birth || null,
      provider: { displayName: player.display_name, jerseyNumber: member.jersey_number, sourceUpdatedAt: player.source_updated_at },
    } satisfies CardEngineCandidate];
  });
}

function rpc(admin: NonNullable<ReturnType<typeof createAdminClient>>) { return admin as unknown as EngineRpc; }

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
    const resolved = resolveCardEngineImportRows(parsed, await candidates(context.admin));
    const summary = summarizeCardEngineRows(resolved);
    if (action === "preview") return NextResponse.json({ ok: true, rows: resolved, summary, publishable: summary.review + summary.conflict + summary.unmatched === 0 });
    const contentSha256 = digest(importText);
    const idempotencyKey = digest(`${sourceType}:${effectiveSeason}:${contentSha256}`);
    const { data, error } = await rpc(context.admin).rpc("touchline_card_engine_create_batch", {
      p_idempotency_key: idempotencyKey, p_content_sha256: contentSha256, p_source_type: sourceType,
      p_source_filename: text(body.fileName, 255) || null, p_effective_season: effectiveSeason,
      p_rows: resolved.map((row) => ({
        rowNumber: row.rowNumber, raw: row.raw, ...(row.playerId ? { playerId: row.playerId } : {}),
        ...(row.providerPlayerId ? { providerPlayerId: row.providerPlayerId } : {}), matchStatus: row.matchStatus,
        matchStrategy: row.matchStrategy, provider: row.provider, proposed: row.proposed, errors: row.errors,
      })), p_actor_id: context.user.id,
    });
    if (error || !data?.[0]) return NextResponse.json({ error: error?.message ?? "Card Engine batch creation returned no result." }, { status: 409 });
    return NextResponse.json({ ok: true, batch: data[0], summary, rows: resolved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Card Engine resolution failed." }, { status: 500 });
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
  const functionName = action === "approve" ? "touchline_card_engine_approve_batch" : action === "publish" ? "touchline_card_engine_publish_batch" : "touchline_card_engine_revert_batch";
  const { data, error } = await rpc(context.admin).rpc(functionName, { p_batch_id: batchId, p_actor_id: context.user.id });
  if (error || !data?.[0]) return NextResponse.json({ error: error?.message ?? "Card Engine command returned no result." }, { status: 409 });
  return NextResponse.json({ ok: true, result: data[0] });
}

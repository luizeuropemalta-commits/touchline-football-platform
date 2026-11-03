import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

function writeBoundary(request: NextRequest, bodyless = false) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Same-origin admin request required." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Same-origin admin request required." }, { status: 403 });
  }
  const contentType = request.headers.get("content-type");
  if (!(bodyless && contentType === null) && contentType?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "JSON admin request required." }, { status: 415 });
  }
  return null;
}

async function ownerContext() {
  try {
    const supabase = await createClient();
    if (!supabase) return { error: NextResponse.json({ error: "Protected administration is unavailable." }, { status: 503 }) };
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return { error: NextResponse.json({ error: "Owner authentication could not be confirmed." }, { status: 503 }) };
    if (!user || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user.email)) {
      return { error: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
    }
    const admin = createAdminClient();
    if (!admin) return { error: NextResponse.json({ error: "Protected administration is unavailable." }, { status: 503 }) };
    return { admin, user };
  } catch {
    return { error: NextResponse.json({ error: "Owner authentication could not be confirmed." }, { status: 503 }) };
  }
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function confirmedRow(value: unknown, expected: Record<string, unknown>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)
    && Object.entries(expected).every(([key, item]) => row[key] === item);
}
function sameJson(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object") return false;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length
      && actual.every((item, index) => sameJson(item, expected[index]));
  }
  const a = actual as Record<string, unknown>;
  const b = expected as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length
    && Object.keys(b).every((key) => Object.hasOwn(a, key) && sameJson(a[key], b[key]));
}

function sameTimestamp(actual: unknown, expected: string | null) {
  if (expected === null) return actual === null;
  return typeof actual === "string" && Number.isFinite(Date.parse(expected))
    && Date.parse(actual) === Date.parse(expected);
}

const unconfirmed = () => NextResponse.json({ error: "The administrative change could not be confirmed. Check its history before retrying." }, { status: 503 });

export async function POST(request: NextRequest) {
  const boundary = writeBoundary(request);
  if (boundary) return boundary;
  const context = await ownerContext();
  if ("error" in context) return context.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }
  const action = cleanText(body.action);

  if (action === "create_promotion") {
    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Promotion name is required." }, { status: 400 });
    const command = {
      name,
      description: optionalText(body.description),
      status: cleanText(body.status, "draft"),
      audience: typeof body.audience === "object" && body.audience ? body.audience : {},
      rules: typeof body.rules === "object" && body.rules ? body.rules : {},
      starts_at: optionalText(body.startsAt),
      ends_at: optionalText(body.endsAt),
      created_by: context.user!.id,
    };
    const { data, error } = await context.admin.from("touchline_promotions").insert(command).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!confirmedRow(data, { name, status: command.status, created_by: command.created_by, description: command.description })
      || !sameJson(data.audience, command.audience) || !sameJson(data.rules, command.rules)
      || !sameTimestamp(data.starts_at, command.starts_at) || !sameTimestamp(data.ends_at, command.ends_at)) return unconfirmed();
    return NextResponse.json({ ok: true, promotion: data });
  }

  if (action === "grant_credit") {
    const userId = cleanText(body.userId);
    const reason = cleanText(body.reason);
    const amountCents = Math.round(Number(body.amountCents));
    const idempotencyKey = cleanText(body.idempotencyKey, `admin-grant:${userId}:${amountCents}:${reason.toLowerCase()}`);
    if (!userId) return NextResponse.json({ error: "Clubowner user ID is required." }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Credit reason is required." }, { status: 400 });
    if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "TouchLine Credit amount must be positive." }, { status: 400 });

    const { data: target } = await context.admin.from("users").select("id").eq("id", userId).maybeSingle();
    if (!target) return NextResponse.json({ error: "Clubowner user not found." }, { status: 404 });

    const { data, error } = await context.admin.from("clubowner_credit_ledger").insert({
      user_id: userId,
      amount_cents: amountCents,
      currency: "TC",
      entry_type: "admin_grant",
      reason,
      idempotency_key: idempotencyKey,
      promotion_id: optionalText(body.promotionId),
      metadata: { source: "owner_admin" },
      created_by: context.user!.id,
    }).select("*").single();

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23505" ? 409 : 500 });
    if (!confirmedRow(data, { user_id: userId, amount_cents: amountCents, currency: "TC", entry_type: "admin_grant", reason,
      idempotency_key: idempotencyKey, promotion_id: optionalText(body.promotionId), created_by: context.user!.id })) return unconfirmed();
    return NextResponse.json({ ok: true, ledgerEntry: data });
  }

  return NextResponse.json({ error: "Unsupported promotion action." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const boundary = writeBoundary(request);
  if (boundary) return boundary;
  const context = await ownerContext();
  if ("error" in context) return context.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }
  const promotionId = cleanText(body.promotionId);
  const status = cleanText(body.status);
  if (!promotionId) return NextResponse.json({ error: "promotionId is required." }, { status: 400 });
  if (!["draft", "active", "paused", "ended"].includes(status)) return NextResponse.json({ error: "Unsupported promotion status." }, { status: 400 });

  const { data, error } = await context.admin
    .from("touchline_promotions")
    .update({ status })
    .eq("id", promotionId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!confirmedRow(data, { id: promotionId, status })) return unconfirmed();
  return NextResponse.json({ ok: true, promotion: data });
}

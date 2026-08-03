import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

async function ownerContext() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return { error: NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) {
    return { error: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
  }
  return { admin, user };
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const context = await ownerContext();
  if ("error" in context) return context.error;

  const body = await request.json().catch(() => ({}));
  const action = cleanText(body.action);

  if (action === "create_promotion") {
    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Promotion name is required." }, { status: 400 });
    const { data, error } = await context.admin.from("touchline_promotions").insert({
      name,
      description: optionalText(body.description),
      status: cleanText(body.status, "draft"),
      audience: typeof body.audience === "object" && body.audience ? body.audience : {},
      rules: typeof body.rules === "object" && body.rules ? body.rules : {},
      starts_at: optionalText(body.startsAt),
      ends_at: optionalText(body.endsAt),
      created_by: context.user!.id,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ ok: true, ledgerEntry: data });
  }

  return NextResponse.json({ error: "Unsupported promotion action." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const context = await ownerContext();
  if ("error" in context) return context.error;

  const body = await request.json().catch(() => ({}));
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
  return NextResponse.json({ ok: true, promotion: data });
}

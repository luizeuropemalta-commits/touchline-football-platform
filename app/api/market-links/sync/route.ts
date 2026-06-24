import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { marketSyncSecret, syncKnownTransfermarktEntities } from "@/lib/market-link-registry";

function cleanLimit(value: string | null) {
  const parsed = Number(value ?? 25);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(Math.round(parsed), 1), 100);
}

async function authorize(request: Request) {
  const secret = marketSyncSecret();
  const authorization = request.headers.get("authorization");
  if (secret && authorization === `Bearer ${secret}`) return { ok: true, userId: null, manual: false };

  const supabase = await createClient();
  if (!supabase) return { ok: false, userId: null, manual: true };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isOwnerEmail(user.email)) return { ok: true, userId: user.id, manual: true };
  return { ok: false, userId: null, manual: true };
}

async function runSync(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Owner or sync secret required." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });

  const limit = cleanLimit(new URL(request.url).searchParams.get("limit"));
  const result = await syncKnownTransfermarktEntities(admin, {
    limit,
    createdBy: auth.userId,
    manual: auth.manual,
  });

  return NextResponse.json({
    ok: true,
    syncedAt: new Date().toISOString(),
    mode: auth.manual ? "owner_manual_run" : "scheduled_cron",
    limit,
    ...result,
  });
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}

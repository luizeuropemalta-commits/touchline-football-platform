import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createFootballDataSyncEngine } from "@/lib/football-data";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const authorized = await isAuthorized(request);
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized. Use owner session or FOOTBALL_DATA_VALIDATION_SECRET bearer token." },
      { status: 401 },
    );
  }

  const providerParam = request.nextUrl.searchParams.get("provider");
  const provider = providerParam === "sportmonks" || providerParam === "legacy" || providerParam === "api-football"
    ? providerParam
    : undefined;

  const engine = createFootballDataSyncEngine(provider);
  const report = await engine.validateProviderConnection();

  return NextResponse.json({
    status: "ok",
    report,
    note: "Tokens are server-only and are never returned by this endpoint.",
  });
}

async function isAuthorized(request: NextRequest) {
  const secret = process.env.FOOTBALL_DATA_VALIDATION_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization === `Bearer ${secret}`) return true;

  const supabase = await createClient();
  if (!supabase) return false;

  const { data } = await supabase.auth.getUser();
  return isOwnerEmail(data.user?.email);
}

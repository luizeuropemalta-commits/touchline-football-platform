import { NextRequest, NextResponse } from "next/server";

import { footballDataErrorHttpStatus } from "@/lib/football-data/http";
import { publicFootballDataFailure } from "@/lib/football-data/public-error";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { TouchlineFantasyEvent } from "@/lib/football-data/types";
import { requireOwnerOrLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

const SPORTMONKS_ID_PATTERN = /^[0-9]{1,20}$/;

function stripEventRaw(event: TouchlineFantasyEvent): TouchlineFantasyEvent {
  const clean = { ...event };
  delete clean.raw;
  return clean;
}

export async function GET(request: NextRequest) {
  const accessError = await requireOwnerOrLocalTouchlineEditor(request);
  if (accessError) return accessError;

  const rawFixtureId = request.nextUrl.searchParams.get("fixtureId")?.trim();
  if (rawFixtureId && !SPORTMONKS_ID_PATTERN.test(rawFixtureId)) {
    return NextResponse.json({ ok: false, error: "fixtureId must be a numeric Sportmonks identifier." }, { status: 400 });
  }

  const fixtureId = rawFixtureId || undefined;
  const provider = createFootballDataProvider("sportmonks");
  const result = await provider.getLiveFantasyEvents(fixtureId);

  if (!result.ok) {
    return NextResponse.json(
      publicFootballDataFailure(result.error.code),
      { status: footballDataErrorHttpStatus(result.error.status) },
    );
  }

  return NextResponse.json({
    ok: true,
    data: result.data.map(stripEventRaw),
    cached: result.cached ?? false,
    fetchedAt: result.fetchedAt,
  });
}

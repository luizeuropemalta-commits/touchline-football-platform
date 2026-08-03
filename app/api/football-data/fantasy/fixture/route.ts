import { NextRequest, NextResponse } from "next/server";

import { persistFantasyFixtureFeed } from "@/lib/football-data/fantasy-store";
import { sanitizeFantasyFixtureFeedForClient } from "@/lib/football-data/fantasy-sanitize";
import { footballDataErrorHttpStatus } from "@/lib/football-data/http";
import { publicFootballDataFailure } from "@/lib/football-data/public-error";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { TouchlineFantasyFixtureFeed } from "@/lib/football-data/types";
import {
  requireAuthenticatedOrLocalTouchlineEditor,
  requireOwnerOrLocalTouchlineEditor,
} from "@/lib/touchlineArena/api-access";

const SPORTMONKS_ID_PATTERN = /^[0-9]{1,20}$/;

type LoadedFixtureFeed =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      data: TouchlineFantasyFixtureFeed;
      cached: boolean;
      fetchedAt: string;
    };

async function loadFixtureFeed(request: NextRequest): Promise<LoadedFixtureFeed> {
  const fixtureId = request.nextUrl.searchParams.get("fixtureId") ?? request.nextUrl.searchParams.get("id");
  if (!fixtureId?.trim() || !SPORTMONKS_ID_PATTERN.test(fixtureId.trim())) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "A valid numeric fixtureId is required." }, { status: 400 }),
    };
  }

  const normalizedFixtureId = fixtureId.trim();

  const provider = createFootballDataProvider("sportmonks");
  const result = await provider.getFixtureFantasyFeed(normalizedFixtureId);

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        publicFootballDataFailure(result.error.code),
        { status: footballDataErrorHttpStatus(result.error.status) },
      ),
    };
  }

  if (!result.data) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Fixture not found." }, { status: 404 }),
    };
  }

  return {
    ok: true,
    data: result.data,
    cached: result.cached ?? false,
    fetchedAt: result.fetchedAt,
  };
}

function fixtureFeedResponse(
  loaded: Extract<LoadedFixtureFeed, { ok: true }>,
  persistence: { persisted: boolean; reason?: string },
) {
  return NextResponse.json({
    ok: true,
    data: sanitizeFantasyFixtureFeedForClient(loaded.data),
    cached: loaded.cached,
    fetchedAt: loaded.fetchedAt,
    persistence,
    note: "Provider token and official media paths are never returned to the frontend.",
  });
}

export async function GET(request: NextRequest) {
  const accessError = await requireAuthenticatedOrLocalTouchlineEditor(request);
  if (accessError) return accessError;

  const loaded = await loadFixtureFeed(request);
  if (!loaded.ok) return loaded.response;

  return fixtureFeedResponse(loaded, { persisted: false, reason: "read_only_request" });
}

export async function POST(request: NextRequest) {
  const accessError = await requireOwnerOrLocalTouchlineEditor(request);
  if (accessError) return accessError;

  const loaded = await loadFixtureFeed(request);
  if (!loaded.ok) return loaded.response;

  const persistence = await persistFantasyFixtureFeed(loaded.data);
  return fixtureFeedResponse(loaded, persistence);
}

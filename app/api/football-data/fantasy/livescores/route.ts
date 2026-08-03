import { NextResponse } from "next/server";

import { footballDataErrorHttpStatus } from "@/lib/football-data/http";
import { publicFootballDataFailure } from "@/lib/football-data/public-error";
import {
  readLiveScoreSnapshot,
  writeLiveScoreSnapshot,
} from "@/lib/football-data/live-score-snapshot";
import {
  persistLiveScoreSnapshot,
  readPersistedLiveScoreSnapshot,
} from "@/lib/football-data/live-score-persistence";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { TouchlineFixture } from "@/lib/football-data/types";
import { mergeTouchlineLiveFixtureDeltas } from "@/lib/football-data/sportmonks-live";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { requireAuthenticatedOrLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

function stripFixtureRaw(fixture: TouchlineFixture): TouchlineFixture {
  return {
    ...fixture,
    source: {
      provider: fixture.source.provider,
      providerId: fixture.source.providerId,
      externalUrl: fixture.source.externalUrl,
      lastSyncedAt: fixture.source.lastSyncedAt,
    },
    homeTeam: fixture.homeTeam
      ? {
          ...fixture.homeTeam,
          source: {
            provider: fixture.homeTeam.source.provider,
            providerId: fixture.homeTeam.source.providerId,
            externalUrl: fixture.homeTeam.source.externalUrl,
            lastSyncedAt: fixture.homeTeam.source.lastSyncedAt,
          },
        }
      : undefined,
    awayTeam: fixture.awayTeam
      ? {
          ...fixture.awayTeam,
          source: {
            provider: fixture.awayTeam.source.provider,
            providerId: fixture.awayTeam.source.providerId,
            externalUrl: fixture.awayTeam.source.externalUrl,
            lastSyncedAt: fixture.awayTeam.source.lastSyncedAt,
          },
        }
      : undefined,
  };
}

function snapshotJson(snapshot: { fixtures: TouchlineFixture[]; fetchedAt: string }, source: "local-snapshot" | "durable-snapshot" | "outage-fallback") {
  return NextResponse.json({
    ok: true,
    data: snapshot.fixtures,
    cached: true,
    degraded: source === "outage-fallback",
    source,
    fetchedAt: snapshot.fetchedAt,
  }, {
    headers: { "Cache-Control": "public, s-maxage=6, stale-while-revalidate=30" },
  });
}

function mergeCanonicalFixtures(schedule: TouchlineFixture[], live: TouchlineFixture[]) {
  const byFixture = new Map(schedule.map((fixture) => [fixture.providerId, fixture] as const));
  for (const fixture of live) byFixture.set(fixture.providerId, fixture);
  return [...byFixture.values()].sort((first, second) => {
    const firstTime = first.startsAt ? Date.parse(first.startsAt) : Number.POSITIVE_INFINITY;
    const secondTime = second.startsAt ? Date.parse(second.startsAt) : Number.POSITIVE_INFINITY;
    return firstTime - secondTime;
  });
}

async function snapshotResponse(source: "local-snapshot" | "outage-fallback") {
  const schedule = await readPublicCompetitionFixtures();
  const snapshot = readLiveScoreSnapshot();
  if (snapshot) return snapshotJson({ ...snapshot, fixtures: mergeCanonicalFixtures(schedule, snapshot.fixtures) }, source);
  const durable = await readPersistedLiveScoreSnapshot();
  if (durable) return snapshotJson({ ...durable, fixtures: mergeCanonicalFixtures(schedule, durable.fixtures) }, source === "outage-fallback" ? source : "durable-snapshot");
  return schedule.length
    ? snapshotJson({ fixtures: schedule, fetchedAt: new Date().toISOString() }, "local-snapshot")
    : null;
}

export async function GET(request: Request) {
  const snapshotOnly = new URL(request.url).searchParams.get("snapshot") === "1";
  if (snapshotOnly) {
    return await snapshotResponse("local-snapshot") ?? NextResponse.json(
      { ok: false, error: "No coherent live snapshot is available.", code: "snapshot_miss" },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const accessError = await requireAuthenticatedOrLocalTouchlineEditor(request);
  if (accessError) {
    return await snapshotResponse("local-snapshot") ?? accessError;
  }

  const provider = createFootballDataProvider("sportmonks");
  const existing = readLiveScoreSnapshot() ?? await readPersistedLiveScoreSnapshot();
  const result = existing
    ? await provider.getLatestLiveScores()
    : await provider.getLiveScores();

  if (!result.ok) {
    const fallback = await snapshotResponse("outage-fallback");
    if (fallback) return fallback;

    return NextResponse.json(
      publicFootballDataFailure(result.error.code),
      { status: footballDataErrorHttpStatus(result.error.status) },
    );
  }

  const deltas = result.data.map(stripFixtureRaw);
  const fixtures = existing
    ? mergeTouchlineLiveFixtureDeltas(existing.fixtures, deltas)
    : deltas;
  writeLiveScoreSnapshot(fixtures, result.fetchedAt);
  await persistLiveScoreSnapshot(fixtures, result.fetchedAt);

  return NextResponse.json({
    ok: true,
    data: fixtures,
    cached: result.cached ?? false,
    degraded: false,
    source: "live-provider",
    fetchedAt: result.fetchedAt,
  }, {
    headers: { "Cache-Control": "public, s-maxage=6, stale-while-revalidate=15" },
  });
}

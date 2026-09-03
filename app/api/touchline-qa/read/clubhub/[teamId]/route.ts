import { NextResponse } from "next/server";

import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { loadTouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table-server";
import { readPublicFantasyFixtureSnapshots } from "@/lib/football-data/public-fantasy-snapshot";
import { selectPublicClubFixture } from "@/lib/football-data/public-fixture-selection";
import type { TouchlineFixture } from "@/lib/football-data/types";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { readTouchlineClubSocialFeed } from "@/lib/touchlineArena/club-social-feed-server";
import { TOUCHLINE_STADIUM_CATALOG, toTouchlineLiveFixture } from "@/lib/touchlineArena/stadium-catalog";
import { createTouchlineQaClubHubMirrorDto } from "@/lib/touchlineMirror/qa-clubhub-mirror";
import { canonicalFeedToMirrorFeed } from "@/lib/touchlineMirror/qa-clubhub-mirror-server";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

function fixtureHasClub(fixture: TouchlineFixture, teamId: string) {
  return fixture.homeTeam?.providerId === teamId || fixture.awayTeam?.providerId === teamId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  // This read surface exists only inside the fully declared QA Preview
  // contract. Production, localhost and malformed Preview environments hide
  // it instead of relaxing the boundary.
  if (inspectTouchlineIsolatedPreviewEnvironment().status !== "qa") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const { teamId } = await params;
  const club = findTouchLineClub(teamId);
  if (!club || club.teamId !== teamId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  try {
    const [table, persistedFeeds, scheduledFixtures, socialFeed] = await Promise.all([
      loadTouchlineOfficialLeagueTable(),
      readPublicFantasyFixtureSnapshots(),
      readPublicCompetitionFixtures(),
      readTouchlineClubSocialFeed({ providerTeamId: club.teamId, limit: 6 }),
    ]);
    const fixture = selectPublicClubFixture(
      [...persistedFeeds.map((feed) => feed.fixture), ...scheduledFixtures],
      (candidate) => fixtureHasClub(candidate, club.teamId),
    );
    const homeVenue = TOUCHLINE_STADIUM_CATALOG.find(
      (stadium) => stadium.homeTeamProviderId === club.teamId,
    ) ?? null;
    const body = createTouchlineQaClubHubMirrorDto({
      club,
      table,
      nextFixture: fixture ? toTouchlineLiveFixture(fixture) : null,
      homeVenue,
      feed: canonicalFeedToMirrorFeed(club.teamId, socialFeed),
    });
    if (!body) throw new Error("Unavailable QA ClubHub read model");
    return NextResponse.json(body, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { ok: false, error: "TL_QA_CLUBHUB_MIRROR_UNAVAILABLE" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

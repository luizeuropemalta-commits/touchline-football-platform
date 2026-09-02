import ClubHubPremiumPrototype from "@/components/touchline/club-hub/ClubHubPremiumPrototype";
import { headers } from "next/headers";
import { loadTouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table-server";
import { readPublicPremierSquad } from "@/lib/football-data/public-premier-squad-server";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { readTouchlineClubSocialFeed } from "@/lib/touchlineArena/club-social-feed-server";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";
import { readClubHubNextFixturePreview } from "@/app/visual-qa/clubhub-next-fixture-post/preview-draft";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import {
  touchlineCoachClassificationForProviderId,
  touchlineLiveCoachForTeam,
} from "@/lib/touchlineArena/live-coaches";

import qaSnapshot from "./qa-canonical-snapshot.json";

export const metadata = {
  title: "TouchLine · ClubHub premium redesign",
  robots: { index: false, follow: false },
};

export default async function ClubHubPremiumRedesignPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ feedCursor?: string }>;
}>) {
  const club = findTouchLineClub("arsenal");
  if (!club) return null;
  const { feedCursor } = await searchParams;
  const requestHeaders = await headers();
  const initialTimeZone = normalizeTouchlineMatchCentreTimeZone(
    requestHeaders.get("x-vercel-ip-timezone") ?? "Europe/Malta",
  );
  const liveReadsEnabled = process.env.TOUCHLINE_CLUBHUB_VISUAL_QA_LIVE_READ === "1";

  const [table, squad, feed, featuredPost] = await Promise.all([
    liveReadsEnabled ? loadTouchlineOfficialLeagueTable() : Promise.resolve(null),
    liveReadsEnabled ? readPublicPremierSquad(club.teamId) : Promise.resolve(null),
    liveReadsEnabled
      ? readTouchlineClubSocialFeed({ providerTeamId: club.teamId, limit: 12, cursor: feedCursor ?? null })
      : Promise.resolve(null),
    readClubHubNextFixturePreview(),
  ]);

  const tableView = table?.rows.length === 20 ? {
    state: table.state,
    asOf: table.asOf,
    rows: table.rows.map((row) => ({
      displayPosition: row.displayPosition,
      team: {
        teamId: row.team.providerTeamId,
        name: row.team.name,
        logoUrl: row.team.logoUrl,
      },
      played: row.played,
      goalDifference: row.goalDifference,
      points: row.points,
    })),
  } : {
    state: qaSnapshot.table.state,
    asOf: qaSnapshot.table.asOf,
    rows: qaSnapshot.table.rows.map((row) => ({
      displayPosition: row.displayPosition,
      team: { teamId: row.team.teamId, name: row.team.name, logoUrl: row.team.logoUrl },
      played: row.played,
      goalDifference: row.goalDifference,
      points: row.points,
    })),
  };

  const squadView = squad?.status === 200 && squad.body.ok ? {
    state: squad.body.dataQuality.canonicalProjectionState,
    capturedAt: squad.body.fetchedAt,
    degraded: squad.body.degraded,
    players: squad.body.rosterPlayers.map((player) => ({
      canonicalPlayerId: player.canonicalPlayerId,
      name: player.name,
      role: player.role,
      position: player.position,
      shirtNumber: player.shirtNumber,
    })),
  } : {
    state: qaSnapshot.squad.state,
    capturedAt: qaSnapshot.squad.capturedAt,
    degraded: qaSnapshot.squad.degraded,
    players: qaSnapshot.squad.players,
  };

  const feedView = !feed || feed.state === "unavailable"
    ? { state: "empty" as const, items: [], nextCursor: null }
    : feed;
  const arsenalPosition = tableView.rows.find((row) => row.team.teamId === qaSnapshot.nextFixture.homeTeam.teamId)?.displayPosition ?? null;
  const chelseaPosition = tableView.rows.find((row) => row.team.teamId === qaSnapshot.nextFixture.awayTeam.teamId)?.displayPosition ?? null;
  const arsenalLeader = qaSnapshot.ranking.leaders.find((leader) => leader.teamId === club.teamId) ?? null;
  const canonicalCoach = touchlineLiveCoachForTeam(club.teamId);
  const coachClassification = canonicalCoach
    ? touchlineCoachClassificationForProviderId(canonicalCoach.coach.providerId)
    : null;
  const coachCard = canonicalCoach && coachClassification && canonicalCoach.coach.displayName === qaSnapshot.coach.name
    ? {
      coach: canonicalCoach.coach,
      countryCode3: canonicalCoach.countryCode3,
      slot: createTouchlineArenaCoachSlot(canonicalCoach.coach, null, coachClassification.tierKey),
    }
    : null;
  const leaderCard = featuredPost?.draft.home.club.teamId === club.teamId
    && featuredPost.draft.home.leader.card.canonicalPlayerId === arsenalLeader?.canonicalPlayerId
    ? featuredPost.draft.home.leader.card
    : null;
  const clubLeader = arsenalLeader && leaderCard ? { ...arsenalLeader, card: leaderCard } : null;

  return (
    <ClubHubPremiumPrototype
      club={{
        teamId: club.teamId,
        name: club.name,
        shortCode: club.shortCode,
        logoUrl: club.logoUrl ?? qaSnapshot.nextFixture.homeTeam.logoUrl,
        accent: club.accent,
        heroImageUrl: qaSnapshot.nextFixture.venue.interiorImageUrl,
      }}
      clubCoach={{ ...qaSnapshot.coach, card: coachCard }}
      clubLeader={clubLeader}
      feed={feedView}
      featuredPost={featuredPost}
      initialTimeZone={initialTimeZone}
      nextFixture={{ ...qaSnapshot.nextFixture, homePosition: arsenalPosition, awayPosition: chelseaPosition }}
      snapshotMode={!liveReadsEnabled || table?.rows.length !== 20 || !(squad?.status === 200 && squad.body.ok)}
      squad={squadView}
      table={tableView}
    />
  );
}

import ClubHubPremiumPrototype from "@/components/touchline/club-hub/ClubHubPremiumPrototype";
import { headers } from "next/headers";
import {
  TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
  type TouchlineOfficialLeagueTable,
} from "@/lib/football-data/official-league-table";
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
import { readTouchlineFullTimeVisualQaPreview } from "@/app/visual-qa/social-full-time/preview-draft";

import qaSnapshot from "./qa-canonical-snapshot.json";

export const metadata = {
  title: "TouchLine · ClubHub premium redesign",
  robots: { index: false, follow: false },
};

export default async function ClubHubPremiumRedesignPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ club?: string; feedCursor?: string }>;
}>) {
  const params = await searchParams;
  const requestedClub = params.club === "chelsea" ? "chelsea" : "arsenal";
  const club = findTouchLineClub(requestedClub);
  if (!club) return null;
  const { feedCursor } = params;
  const requestHeaders = await headers();
  const initialTimeZone = normalizeTouchlineMatchCentreTimeZone(
    requestHeaders.get("x-vercel-ip-timezone") ?? "Europe/Malta",
  );
  const liveReadsEnabled = process.env.TOUCHLINE_CLUBHUB_VISUAL_QA_LIVE_READ === "1";

  const [table, squad, feed, featuredPost, fullTimeDraft] = await Promise.all([
    liveReadsEnabled ? loadTouchlineOfficialLeagueTable() : Promise.resolve(null),
    liveReadsEnabled ? readPublicPremierSquad(club.teamId) : Promise.resolve(null),
    liveReadsEnabled
      ? readTouchlineClubSocialFeed({ providerTeamId: club.teamId, limit: 12, cursor: feedCursor ?? null })
      : Promise.resolve(null),
    readClubHubNextFixturePreview(),
    readTouchlineFullTimeVisualQaPreview(),
  ]);

  const snapshotRows = qaSnapshot.table.rows.map((row) => {
    const tiedRows = qaSnapshot.table.rows.filter((candidate) => (
      candidate.points === row.points
      && candidate.goalDifference === row.goalDifference
      && candidate.goalsFor === row.goalsFor
    ));
    const betterRows = qaSnapshot.table.rows.filter((candidate) => (
      candidate.points > row.points
      || (candidate.points === row.points && candidate.goalDifference > row.goalDifference)
      || (
        candidate.points === row.points
        && candidate.goalDifference === row.goalDifference
        && candidate.goalsFor > row.goalsFor
      )
    ));
    return {
      sportsRank: betterRows.length + 1,
      isTied: tiedRows.length > 1,
      displayPosition: row.displayPosition,
      team: {
        providerTeamId: row.team.teamId,
        name: row.team.name,
        shortCode: row.team.shortCode,
        slug: row.team.slug,
        logoUrl: row.team.logoUrl,
      },
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
      form: row.form.filter((result): result is "W" | "D" | "L" => (
        result === "W" || result === "D" || result === "L"
      )),
      liveFixture: null,
    };
  });
  const snapshotTable: TouchlineOfficialLeagueTable = {
    state: qaSnapshot.table.state === "ready" ? "ready" : "unavailable",
    competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    season: null,
    asOf: qaSnapshot.table.asOf,
    coverage: qaSnapshot.table.coverage,
    rows: snapshotRows,
    reason: null,
  };
  const tableView: TouchlineOfficialLeagueTable = table?.rows.length === 20
    ? table
    : snapshotTable;

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
  } : requestedClub === "arsenal" ? {
    state: qaSnapshot.squad.state,
    capturedAt: qaSnapshot.squad.capturedAt,
    degraded: qaSnapshot.squad.degraded,
    players: qaSnapshot.squad.players,
  } : { state: "unavailable", capturedAt: null, degraded: false, players: [] };

  const feedView = !feed || feed.state === "unavailable"
    ? { state: "empty" as const, items: [], nextCursor: null }
    : feed;
  const arsenalPosition = tableView.rows.find((row) => row.team.providerTeamId === qaSnapshot.nextFixture.homeTeam.teamId)?.displayPosition ?? null;
  const chelseaPosition = tableView.rows.find((row) => row.team.providerTeamId === qaSnapshot.nextFixture.awayTeam.teamId)?.displayPosition ?? null;
  const selectedLeader = qaSnapshot.ranking.leaders.find((leader) => leader.teamId === club.teamId) ?? null;
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
  const previewLeader = featuredPost?.draft.home.club.teamId === club.teamId
    ? featuredPost.draft.home.leader
    : featuredPost?.draft.away.club.teamId === club.teamId ? featuredPost.draft.away.leader : null;
  const leaderCard = previewLeader && selectedLeader
    && previewLeader.card.canonicalPlayerId === selectedLeader.canonicalPlayerId
    ? previewLeader.card
    : null;
  const clubLeader = selectedLeader && leaderCard ? { ...selectedLeader, card: leaderCard } : null;
  const fullTimePost = fullTimeDraft ? {
    draft: fullTimeDraft,
    caption: [
      "LOCAL LAYOUT SAMPLE · NOT A FOOTBALL CLAIM",
      "",
      `${fullTimeDraft.home.name} are shown with a ${fullTimeDraft.score.home}-${fullTimeDraft.score.away} sample scoreline against ${fullTimeDraft.away.name} at ${fullTimeDraft.venue.name}.`,
      "The live publication will name every verified scorer and minute, then describe the clubs’ positions from the reconciled post-match table snapshot.",
      "Positions may change as the remaining Gameweek fixtures are completed.",
    ].join("\n"),
  } : null;

  return (
    <ClubHubPremiumPrototype
      club={{
        teamId: club.teamId,
        name: club.name,
        shortCode: club.shortCode,
        logoUrl: club.logoUrl ?? qaSnapshot.nextFixture.homeTeam.logoUrl,
        accent: club.accent,
        heroImageUrl: requestedClub === "chelsea"
          ? "/touchlineArena/stadiums/interiors/06-chelsea-stamford-bridge-live.webp"
          : qaSnapshot.nextFixture.venue.interiorImageUrl,
      }}
      clubCoach={{ ...qaSnapshot.coach, card: coachCard }}
      clubLeader={clubLeader}
      feed={feedView}
      fullTimePost={fullTimePost}
      featuredPost={featuredPost}
      initialTimeZone={initialTimeZone}
      nextFixture={{ ...qaSnapshot.nextFixture, homePosition: arsenalPosition, awayPosition: chelseaPosition }}
      snapshotMode={!liveReadsEnabled || table?.rows.length !== 20 || !(squad?.status === 200 && squad.body.ok)}
      squad={squadView}
      table={tableView}
    />
  );
}

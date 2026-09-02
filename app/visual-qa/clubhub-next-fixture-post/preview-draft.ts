import "server-only";

import { createHash } from "node:crypto";

import { readVisualQaMarketCatalogue } from "@/app/visual-qa/market-premium-pitch/catalogue";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { TOUCHLINE_SOCIAL_COPY_ICONS as icon } from "@/lib/touchlineArena/social-copy-icons";
import type { TouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";

import qaSnapshot from "../clubhub-premium-redesign/qa-canonical-snapshot.json";

function checksum(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function ordinal(position: number) {
  const mod100 = position % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
  return `${position}${suffix}`;
}

function previewCaption(input: Readonly<{
  homePosition: number;
  awayPosition: number;
  homeLeaderName: string;
  awayLeaderName: string;
  homeTotalRating: number;
  awayTotalRating: number;
}>) {
  const kickOff = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Malta",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(qaSnapshot.nextFixture.startsAt)).replace(",", " ·");
  return [
    `${icon.fixture} LONDON SHOWDOWN`,
    "",
    "Arsenal v Chelsea",
    `${icon.calendar} Premier League · ${qaSnapshot.nextFixture.roundName}`,
    `${icon.kickOff} ${kickOff} Malta`,
    `${icon.venue} ${qaSnapshot.nextFixture.venue.name}`,
    "",
    `${icon.table} Arsenal are ${ordinal(input.homePosition)}; Chelsea are ${ordinal(input.awayPosition)}. Both clubs have six points from two matches.`,
    `${icon.card} ${input.homeLeaderName} — ${input.homeTotalRating.toFixed(2)} Total Rating`,
    `${icon.card} ${input.awayLeaderName} — ${input.awayTotalRating.toFixed(2)} Total Rating`,
    "",
    "Two club-leading TouchLine cards. One London showdown.",
    `${icon.interaction} Who comes out on top?`,
    "",
    "TouchLine Verified",
    "#TouchLine #Arsenal #Chelsea #PremierLeague #Gameweek3",
  ].join("\n");
}

export async function readClubHubNextFixturePreview(): Promise<Readonly<{
  caption: string;
  draft: TouchlineSocialMatchPreviewDraft;
}> | null> {
  const catalogue = await readVisualQaMarketCatalogue();
  const arsenal = findTouchLineClub("arsenal");
  const chelsea = findTouchLineClub("chelsea");
  const arsenalLeader = qaSnapshot.ranking.leaders.find((leader) => leader.teamId === arsenal?.teamId) ?? null;
  const chelseaLeader = qaSnapshot.ranking.leaders.find((leader) => leader.teamId === chelsea?.teamId) ?? null;
  const arsenalTable = qaSnapshot.table.rows.find((row) => row.team.teamId === arsenal?.teamId) ?? null;
  const chelseaTable = qaSnapshot.table.rows.find((row) => row.team.teamId === chelsea?.teamId) ?? null;
  const saka = catalogue.catalogue.find((card) => card.canonicalPlayerId === arsenalLeader?.canonicalPlayerId);
  const joaoPedro = catalogue.catalogue.find((card) => card.canonicalPlayerId === chelseaLeader?.canonicalPlayerId);
  if (catalogue.state !== "ready" || qaSnapshot.ranking.state !== "ready"
    || !arsenal?.logoUrl || !chelsea?.logoUrl || !arsenalLeader || !chelseaLeader
    || !arsenalTable?.displayPosition || !chelseaTable?.displayPosition || !saka || !joaoPedro) {
    return null;
  }

  const facts = { fixture: qaSnapshot.nextFixture, ranking: qaSnapshot.ranking, tableAsOf: qaSnapshot.table.asOf };
  const sourceChecksum = checksum(facts);
  const caption = previewCaption({
    homePosition: arsenalTable.displayPosition,
    awayPosition: chelseaTable.displayPosition,
    homeLeaderName: arsenalLeader.name,
    awayLeaderName: chelseaLeader.name,
    homeTotalRating: arsenalLeader.totalRating,
    awayTotalRating: chelseaLeader.totalRating,
  });
  const draft = {
    sourceProvenance: "PERSISTED_VERIFIED_MATCH_PREVIEW",
    fixtureId: "local-preview-arsenal-chelsea",
    sourceSnapshotAt: qaSnapshot.ranking.generatedAt,
    startsAt: qaSnapshot.nextFixture.startsAt,
    status: "Not Started",
    seasonProviderId: "28083",
    gameweekNumber: Number(qaSnapshot.nextFixture.roundName.match(/\d+/)?.[0]),
    venue: {
      name: qaSnapshot.nextFixture.venue.name,
      interiorImageUrl: qaSnapshot.nextFixture.venue.interiorImageUrl,
    },
    caption,
    sourceVersion: "touchline-match-preview-feed-v1",
    sourceChecksum,
    sourceRevisionManifest: { fixture: 1, table: 1, ranking: 1, squad: 1 },
    sourceRevisionChecksum: sourceChecksum,
    ranking: {
      snapshotId: qaSnapshot.ranking.snapshotId,
      publishedAt: qaSnapshot.ranking.publishedAt,
      scoringVersion: "player_scoring_v3",
      coverageStatus: "complete_for_scoring",
    },
    tableAsOf: qaSnapshot.table.asOf,
    home: {
      club: { ...arsenal, name: "Arsenal", logoUrl: arsenal.logoUrl },
      table: {
        providerTeamId: arsenal.teamId,
        isTied: true,
        sportsRank: arsenalTable.displayPosition,
        displayPosition: arsenalTable.displayPosition,
        played: arsenalTable.played,
        points: arsenalTable.points,
        goalDifference: arsenalTable.goalDifference,
      },
      leader: {
        card: { ...saka, clubName: "Arsenal", seasonTotalRating: arsenalLeader.totalRating },
        totalRating: arsenalLeader.totalRating,
        overallRank: arsenalLeader.overallRank,
        positionGroup: "winger",
        positionRank: arsenalLeader.positionRank,
      },
    },
    away: {
      club: { ...chelsea, name: "Chelsea", logoUrl: chelsea.logoUrl },
      table: {
        providerTeamId: chelsea.teamId,
        isTied: true,
        sportsRank: chelseaTable.displayPosition,
        displayPosition: chelseaTable.displayPosition,
        played: chelseaTable.played,
        points: chelseaTable.points,
        goalDifference: chelseaTable.goalDifference,
      },
      leader: {
        card: { ...joaoPedro, clubName: "Chelsea", seasonTotalRating: chelseaLeader.totalRating },
        totalRating: chelseaLeader.totalRating,
        overallRank: chelseaLeader.overallRank,
        positionGroup: "striker",
        positionRank: chelseaLeader.positionRank,
      },
    },
  } satisfies TouchlineSocialMatchPreviewDraft;

  return { caption, draft };
}

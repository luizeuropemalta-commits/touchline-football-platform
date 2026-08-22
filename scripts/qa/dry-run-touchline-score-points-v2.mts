import { readFile, writeFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

import { isTouchLineSettledFixtureStatus } from "../../lib/football-data/fixture-settlement.ts";
import { touchLinePlayerFixturePoints } from "../../lib/football-data/player-fixture-scoring.ts";
import type { TouchlineFantasyEvent, TouchlineFantasyLineupMember } from "../../lib/football-data/types.ts";

type Row = Record<string, unknown>;
const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";

function rows(value: unknown): Row[] { return Array.isArray(value) ? value as Row[] : []; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function statisticMap(member?: TouchlineFantasyLineupMember) {
  return Object.fromEntries((member?.statistics ?? []).flatMap((statistic) => {
    const code = text(statistic.code)?.toLowerCase();
    const value = number(statistic.value);
    return code && value !== null ? [[code, value] as const] : [];
  }));
}
function lineup(value: unknown) { return Array.isArray(value) ? value as TouchlineFantasyLineupMember[] : null; }
function events(value: unknown) { return Array.isArray(value) ? value as TouchlineFantasyEvent[] : null; }
function appearance(member: TouchlineFantasyLineupMember | undefined, statistics: Record<string, number>) {
  if (!member) return "absent" as const;
  if (member.isStarter) return "started" as const;
  if (member.isSubstitute && (statistics["minutes-played"] ?? statistics.minutes ?? 0) > 0) return "substitute" as const;
  return "unused" as const;
}

const outputArg = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArg?.slice("--output=".length);
const inputArg = process.argv.find((argument) => argument.startsWith("--input="));
const inputPath = inputArg?.slice("--input=".length);
let fixtureData: unknown;
let feedData: unknown;
let membershipData: unknown;
let oldData: unknown;

if (inputPath) {
  const exported = JSON.parse(await readFile(inputPath, "utf8")) as Row;
  if (exported.projectRef !== QA_PROJECT_REF) throw new Error("TL_DRY_RUN_QA_EXPORT_REQUIRED");
  fixtureData = exported.fixtures;
  feedData = exported.feeds;
  membershipData = exported.memberships;
  oldData = exported.oldPoints;
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !url.includes(QA_PROJECT_REF)) throw new Error("TL_DRY_RUN_QA_ENV_REQUIRED");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: fixtures, error: fixtureError }, { data: feeds, error: feedError }, { data: memberships, error: membershipError }] = await Promise.all([
    admin.from("football_fixtures").select("id,provider,provider_fixture_id,season_id,competition_id,home_club_id,away_club_id,status,home_score,away_score"),
    admin.from("football_fantasy_fixture_feeds").select("provider,provider_fixture_id,lineups_payload,events_payload,last_synced_at"),
    admin.from("football_player_season_memberships").select("football_player_id,season_id,competition_id,club_id,football_players(provider,provider_player_id,provider_position,position,display_name,name)"),
  ]);
  if (fixtureError || feedError || membershipError) throw new Error(`TL_DRY_RUN_READ_FAILED:${fixtureError?.message ?? feedError?.message ?? membershipError?.message}`);
  fixtureData = fixtures;
  feedData = feeds;
  membershipData = memberships;
  const eligibleFixtureIds = rows(fixtures).filter((fixture) => isTouchLineSettledFixtureStatus(text(fixture.status))).map((fixture) => text(fixture.id)).filter((id): id is string => Boolean(id));
  const { data: currentPoints, error: oldError } = eligibleFixtureIds.length
    ? await admin.from("football_player_fixture_statistics").select("football_player_id,fixture_id,touchline_points,scoring_version").in("fixture_id", eligibleFixtureIds)
    : { data: [], error: null };
  if (oldError) throw new Error(`TL_DRY_RUN_OLD_POINTS_FAILED:${oldError.message}`);
  oldData = currentPoints;
}

const fixtures = rows(fixtureData).filter((fixture) => isTouchLineSettledFixtureStatus(text(fixture.status)));
const feedByFixture = new Map(rows(feedData).map((feed) => [`${text(feed.provider)}:${text(feed.provider_fixture_id)}`, feed]));
const oldByPlayerFixture = new Map(rows(oldData).map((row) => [`${text(row.football_player_id)}:${text(row.fixture_id)}`, number(row.touchline_points)]));
const settlements: Row[] = [];
const missingFacts: Record<string, number> = {};
const conflicts: string[] = [];

for (const membership of rows(membershipData)) {
  const player = object(membership.football_players);
  const providerPlayerId = text(player.provider_player_id);
  const footballPlayerId = text(membership.football_player_id);
  const clubId = text(membership.club_id);
  if (text(player.provider) !== "sportmonks" || !providerPlayerId || !footballPlayerId || !clubId) {
    conflicts.push(`invalid-membership:${footballPlayerId ?? "unknown"}`);
    continue;
  }
  for (const fixture of fixtures) {
    if (text(fixture.season_id) !== text(membership.season_id)) continue;
    if (text(fixture.home_club_id) !== clubId && text(fixture.away_club_id) !== clubId) continue;
    const feed = feedByFixture.get(`${text(fixture.provider)}:${text(fixture.provider_fixture_id)}`);
    const members = lineup(feed?.lineups_payload);
    const member = members?.find((candidate) => String(candidate.playerId ?? "") === providerPlayerId);
    const statistics = statisticMap(member);
    const teamGoalsConceded = text(fixture.home_club_id) === clubId ? number(fixture.away_score) : number(fixture.home_score);
    const result = touchLinePlayerFixturePoints({
      providerPlayerId,
      positionGroup: text(player.provider_position) ?? text(player.position),
      appearanceStatus: feed ? appearance(member, statistics) : "unavailable",
      minutesPlayed: statistics["minutes-played"] ?? statistics.minutes ?? null,
      rating: statistics.rating ?? null,
      statistics: member ? statistics : null,
      events: feed ? events(feed.events_payload) : null,
      teamGoalsConceded,
    });
    for (const fact of result.missingFacts) missingFacts[fact] = (missingFacts[fact] ?? 0) + 1;
    const keyForOld = `${footballPlayerId}:${text(fixture.id)}`;
    const oldPoints = oldByPlayerFixture.get(keyForOld) ?? null;
    settlements.push({
      fixtureId: text(fixture.provider_fixture_id),
      footballPlayerId,
      providerPlayerId,
      playerName: text(player.display_name) ?? text(player.name),
      positionGroup: result.positionGroup,
      oldPoints,
      newPoints: result.points,
      difference: oldPoints === null || result.points === null ? null : result.points - oldPoints,
      coverageStatus: result.coverageStatus,
      missingFacts: result.missingFacts,
      contributions: result.contributions,
    });
  }
}

const oldTotal = settlements.reduce((total, row) => total + (number(row.oldPoints) ?? 0), 0);
const newTotal = settlements.reduce((total, row) => total + (number(row.newPoints) ?? 0), 0);
const nonZeroGolden = settlements.filter((row) => row.fixtureId === "19722203" && number(row.newPoints) !== 0);
const contributionTotals = Object.fromEntries([...new Set(settlements.flatMap((row) => rows(row.contributions).map((item) => text(item.ruleCode)).filter(Boolean)))].sort().map((rule) => [
  rule,
  settlements.reduce((total, row) => total + rows(row.contributions).filter((item) => text(item.ruleCode) === rule).reduce((sum, item) => sum + (number(item.points) ?? 0), 0), 0),
]));
const report = {
  generatedAt: new Date().toISOString(),
  projectRef: QA_PROJECT_REF,
  mode: "READ_ONLY_DRY_RUN",
  scoringVersion: "player_scoring_v2",
  fixturesToRecalculate: [...new Set(fixtures.map((fixture) => text(fixture.provider_fixture_id)).filter(Boolean))].sort(),
  players: new Set(settlements.map((row) => row.footballPlayerId)).size,
  settlements: settlements.length,
  oldTotal,
  newTotal,
  difference: newTotal - oldTotal,
  changedSettlements: settlements.filter((row) => row.difference !== 0).length,
  unavailableSettlements: settlements.filter((row) => row.newPoints === null).length,
  missingFacts,
  conflicts: [...new Set(conflicts)].sort(),
  contributionTotals,
  goldenFixture: { fixtureId: "19722203", nonZeroPlayers: nonZeroGolden },
};

if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

import type { TouchlineFixture } from "../football-data/types";

const LIVE_STATUS = /\b(live|inplay|in play|1st half|2nd half|half time|ht|extra time|penalties)\b/i;
const FINISHED_STATUS = /\b(finished|ft|after extra time|aet|penalties finished|cancelled|postponed)\b/i;

function fixtureStartTime(fixture: TouchlineFixture) {
  const value = fixture.startsAt ? Date.parse(fixture.startsAt) : Number.NaN;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function teamKey(team: TouchlineFixture["homeTeam"] | undefined) {
  return String(team?.providerId ?? team?.id ?? "").trim();
}

function isComplete(fixture: TouchlineFixture) {
  return FINISHED_STATUS.test(fixture.status ?? "");
}

function isLive(fixture: TouchlineFixture, now: number) {
  const startsAt = fixtureStartTime(fixture);
  // A persisted status can lag behind a rescheduled kickoff. Do not let a
  // future fixture labelled "LIVE" seize the Arena carousel: the rail must
  // remain an honest view of the next usable confrontations until kickoff.
  if (LIVE_STATUS.test(fixture.status ?? "") && startsAt <= now) return true;
  return startsAt <= now && !isComplete(fixture);
}

function isUsable(fixture: TouchlineFixture) {
  const home = teamKey(fixture.homeTeam);
  const away = teamKey(fixture.awayTeam);
  return Boolean(home && away && home !== away && Number.isFinite(fixtureStartTime(fixture)));
}

function contiguousRoundFrom(fixtures: readonly TouchlineFixture[], start: number) {
  const teams = new Set<string>();
  const round: TouchlineFixture[] = [];
  for (let index = start; index < fixtures.length && round.length < 10; index += 1) {
    const fixture = fixtures[index];
    if (!isUsable(fixture)) continue;
    const home = teamKey(fixture.homeTeam);
    const away = teamKey(fixture.awayTeam);
    if (teams.has(home) || teams.has(away)) break;
    teams.add(home);
    teams.add(away);
    round.push(fixture);
  }
  return round;
}

/**
 * Selects a coherent England round without relying on a hard-coded calendar.
 * A complete ten-match set contains each club only once. When a match is live,
 * the selected set must contain that fixture; otherwise it starts at the next
 * eligible canonical fixture. This keeps the Arena carousel a schedule view,
 * not a second live-scoring feed.
 */
export function selectArenaFixtureRound(
  fixtures: readonly TouchlineFixture[],
  now = Date.now(),
) {
  const ordered = fixtures
    .filter(isUsable)
    .slice()
    .sort((first, second) => fixtureStartTime(first) - fixtureStartTime(second));
  if (!ordered.length) return [] as TouchlineFixture[];

  const anchorIndex = ordered.findIndex((fixture) => isLive(fixture, now));
  const nextIndex = ordered.findIndex((fixture) => !isComplete(fixture) && fixtureStartTime(fixture) >= now - 4 * 60 * 60 * 1_000);
  const targetIndex = anchorIndex >= 0 ? anchorIndex : nextIndex;
  if (targetIndex < 0) return [] as TouchlineFixture[];

  let best = contiguousRoundFrom(ordered, targetIndex);
  if (anchorIndex >= 0) {
    for (let start = Math.max(0, anchorIndex - 9); start <= anchorIndex; start += 1) {
      const candidate = contiguousRoundFrom(ordered, start);
      if (candidate.some((fixture) => fixture.id === ordered[anchorIndex].id) && candidate.length > best.length) {
        best = candidate;
      }
    }
  }
  return best;
}

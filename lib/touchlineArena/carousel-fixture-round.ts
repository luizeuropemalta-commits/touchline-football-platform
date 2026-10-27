import type { TouchlinePublicFixture } from "../football-data/public-fixture.ts";
import { isTouchLineSettledFixtureStatus } from "../football-data/fixture-settlement.ts";
import { touchlineFixtureState } from "./fixture-state.ts";

type Scope = { competitionId: "8"; seasonId: string };
type Round = { key: string; fixtures: TouchlinePublicFixture[]; ordinal: number | null; startsAt: number };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const roundName = (fixture: TouchlinePublicFixture) => text(fixture.roundName).toLowerCase();
const start = (fixture: TouchlinePublicFixture) => {
  const value = Date.parse(fixture.startsAt ?? "");
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
};
const compareFixtures = (left: TouchlinePublicFixture, right: TouchlinePublicFixture) => {
  const a = start(left), b = start(right);
  return (a === b ? 0 : a < b ? -1 : 1) || left.providerId.localeCompare(right.providerId);
};
const ordinal = (name: string) => {
  const match = /^(?:(?:round|matchweek|gameweek)\s+)?([1-9]\d*)$/.exec(name);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(value) ? value : null;
};
const complete = (round: Round) => round.fixtures.length === 10
  && new Set(round.fixtures.flatMap(fixture => [fixture.homeTeam!.providerId, fixture.awayTeam!.providerId])).size === 20;
const begun = (round: Round, now: number) => round.fixtures.some(fixture => start(fixture) <= now
  || isTouchLineSettledFixtureStatus(fixture.status) || touchlineFixtureState(fixture, now) === "live");

/** The carousel owns one canonical round. Live's historical selection is separate.
 * Dates order known groups only; they never manufacture missing round identity.
 */
export function selectCarouselFixtureRound(
  fixtures: TouchlinePublicFixture[], now: number, scope: Scope | null,
  focusedProviderId: string | null = null,
): TouchlinePublicFixture[] {
  if (!scope || scope.competitionId !== "8" || !text(scope.seasonId)
    || text(scope.seasonId) !== scope.seasonId || !Number.isFinite(now)) return [];
  const valid = fixtures.filter(fixture => fixture.competitionId === scope.competitionId
    && fixture.seasonId === scope.seasonId && text(fixture.providerId) === fixture.providerId && !!fixture.providerId
    && !!text(fixture.homeTeam?.providerId) && !!text(fixture.awayTeam?.providerId)
    && text(fixture.homeTeam?.providerId) === fixture.homeTeam?.providerId
    && text(fixture.awayTeam?.providerId) === fixture.awayTeam?.providerId
    && fixture.homeTeam?.providerId !== fixture.awayTeam?.providerId
    && (text(fixture.roundId) || roundName(fixture)));
  const unique = new Map<string, TouchlinePublicFixture>();
  for (const fixture of valid) {
    const previous = unique.get(fixture.providerId);
    const timestamp = (row: TouchlinePublicFixture) => {
      const value = Date.parse(row.verifiedAt ?? row.providerUpdatedAt ?? "");
      return Number.isFinite(value) ? value : 0;
    };
    // A duplicate cannot count as another match or discard the newer receipt.
    if (!previous || timestamp(fixture) > timestamp(previous)) unique.set(fixture.providerId, fixture);
  }
  const aliases = new Map<string, Set<string>>();
  for (const fixture of unique.values()) {
    const name = roundName(fixture), id = text(fixture.roundId);
    if (name && id) {
      const ids = aliases.get(name) ?? new Set<string>(); ids.add(id); aliases.set(name, ids);
    }
  }
  const groups = new Map<string, TouchlinePublicFixture[]>();
  for (const fixture of unique.values()) {
    const name = roundName(fixture), id = text(fixture.roundId), aliasesForName = aliases.get(name);
    // Missing IDs may join an unambiguous canonical name, never competing IDs.
    if (!id && aliasesForName && aliasesForName.size !== 1) continue;
    const knownId = id || (aliasesForName?.size === 1 ? [...aliasesForName][0] : "");
    const key = knownId ? `id:${knownId}` : `name:${name}`;
    const group = groups.get(key) ?? []; group.push(fixture); groups.set(key, group);
  }
  const rounds: Round[] = [...groups].map(([key, rows]) => {
    const ordinals = new Set(rows.map(row => ordinal(roundName(row))).filter((value): value is number => value !== null));
    return { key, fixtures: rows.slice().sort(compareFixtures), ordinal: ordinals.size === 1 ? [...ordinals][0] : null,
      startsAt: Math.min(...rows.map(start)) };
  }).sort((a, b) => (a.startsAt === b.startsAt ? 0 : a.startsAt < b.startsAt ? -1 : 1) || a.key.localeCompare(b.key));
  // Keep unnamed/non-numeric groups in chronological slots; order the known
  // numbered groups canonically within their slots (including postponed dates).
  const numbered = rounds.filter(round => round.ordinal !== null)
    .sort((a, b) => a.ordinal! - b.ordinal! || a.key.localeCompare(b.key));
  let numberIndex = 0;
  const ordered = rounds.map(round => round.ordinal === null ? round : numbered[numberIndex++]);
  const focused = focusedProviderId ? ordered.find(round => round.fixtures.some(fixture => fixture.providerId === focusedProviderId)) : undefined;
  let selected = focused;
  if (!selected) {
    const live = ordered.filter(round => round.fixtures.some(fixture => touchlineFixtureState(fixture, now) === "live"));
    const started = ordered.filter(round => begun(round, now));
    selected = live.at(-1) ?? started.at(-1) ?? ordered[0];
    if (selected && complete(selected) && selected.fixtures.every(fixture => isTouchLineSettledFixtureStatus(fixture.status))) {
      const next = ordered[ordered.indexOf(selected) + 1];
      if (next && complete(next)) selected = next;
    }
  }
  if (!selected) return [];
  const display = selected.fixtures.slice(0, 10);
  // Even an anomalously overfull group cannot evict the focused link or exceed10.
  const focusedFixture = focused && selected.fixtures.find(fixture => fixture.providerId === focusedProviderId);
  if (focusedFixture && !display.includes(focusedFixture)) display[display.length - 1] = focusedFixture;
  return display.sort(compareFixtures);
}

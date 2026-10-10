import assert from "node:assert/strict";
import { test } from "node:test";
import type { TouchlineFantasyFixtureFeed } from "../lib/football-data/types.ts";
import { selectTouchlineLastCompletedXi } from "../lib/touchlineArena/club-last-xi.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";

const source = { provider: "sportmonks" as const, providerId: "source-1" };
const team = (providerId: string) => ({ id: `sportmonks:${providerId}`, providerId, provider: "sportmonks" as const,
  name: `Club ${providerId}`, source: { ...source, providerId } });
function feed(id: string, startsAt: string, status = "FT", count = 11): TouchlineFantasyFixtureFeed {
  return {
    fixture: { id: `sportmonks:${id}`, providerId: id, provider: "sportmonks", startsAt, status,
      homeTeam: team("19"), awayTeam: team("20"), source: { ...source, providerId: id } },
    lineups: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, providerId: `${id}-${index}`,
      provider: "sportmonks" as const, fixtureId: id, teamId: "19", playerId: `${index + 1}`,
      isStarter: true, statistics: [] })),
    formations: [{ id: `${id}-formation`, providerId: `${id}-formation`, provider: "sportmonks", fixtureId: id,
      teamId: "19", formation: "4-2-3-1" }],
    sidelined: [], events: [], fetchedAt: startsAt,
    mediaPolicy: { officialMediaExposed: false, note: "Synthetic local test" },
  };
}

test("last XI chooses the latest exact completed team sheet, not a future or partial sheet", () => {
  const result = selectTouchlineLastCompletedXi([
    feed("90", "2026-09-10T14:00:00Z"),
    feed("91", "2026-09-20T14:00:00Z", "FT", 10),
    feed("92", "2026-09-25T14:00:00Z", "LIVE"),
    feed("93", "2026-10-02T14:00:00Z"),
  ], "19", "2026-10-01T14:00:00Z", Date.parse("2026-10-01T12:00:00Z"));
  assert.equal(result?.fixtureId, "90");
  assert.equal(result?.starters.length, 11);
  assert.equal(result?.formation, "4-2-3-1");
});

test("last XI rejects wrong club, duplicate player, wrong fixture and unfinished evidence", () => {
  const valid = feed("90", "2026-09-10T14:00:00Z");
  assert.equal(selectTouchlineLastCompletedXi([valid], "21", null), null);
  assert.equal(selectTouchlineLastCompletedXi([{ ...valid, lineups: valid.lineups.map((item, index) =>
    index === 10 ? { ...item, playerId: "1" } : item) }], "19", null), null);
  assert.equal(selectTouchlineLastCompletedXi([{ ...valid, lineups: valid.lineups.map((item, index) =>
    index === 10 ? { ...item, fixtureId: "other" } : item) }], "19", null), null);
  assert.equal(selectTouchlineLastCompletedXi([feed("91", "2026-09-10T14:00:00Z", "LIVE")], "19", null), null);
});

test("historical formation belongs to the same Sportmonks fixture and club", () => {
  const valid = feed("90", "2026-09-10T14:00:00Z");
  const matching = valid.formations[0]!;
  const foreign = [
    { ...matching, fixtureId: "other", formation: "5-4-1" },
    { ...matching, provider: "other" as typeof matching.provider, formation: "5-4-1" },
    { ...matching, teamId: "20", formation: "5-4-1" },
  ];
  assert.equal(selectTouchlineLastCompletedXi([{ ...valid, formations: [...foreign, matching] }], "19", null)?.formation, "4-2-3-1");
  assert.equal(selectTouchlineLastCompletedXi([{ ...valid, formations: foreign }], "19", null)?.formation, null);
});

test("last-XI selection remains club-scoped across all twenty club identities", () => {
  const feeds = TOUCHLINE_ENGLAND_CLUBS.map((club, index) => {
    const base = feed(String(100 + index), "2026-09-10T14:00:00Z");
    return { ...base,
      fixture: { ...base.fixture, homeTeam: team(club.teamId), awayTeam: team("999") },
      lineups: base.lineups.map((member) => ({ ...member, teamId: club.teamId })),
      formations: base.formations.map((formation) => ({ ...formation, teamId: club.teamId })),
    };
  });
  assert.equal(feeds.length, 20);
  for (const [index, club] of TOUCHLINE_ENGLAND_CLUBS.entries()) {
    assert.equal(selectTouchlineLastCompletedXi(feeds, club.teamId, null)?.fixtureId, String(100 + index), club.slug);
  }
});

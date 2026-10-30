import assert from "node:assert/strict";
import test from "node:test";
import { touchlineLiveClubLineupLinks } from "../lib/touchlineArena/live-club-lineup-links.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";
import type { TouchlinePublicFixture } from "../lib/football-data/public-fixture.ts";

const team = (index: number) => {
  const club = TOUCHLINE_ENGLAND_CLUBS[index];
  return { id: club.teamId, providerId: club.teamId, name: club.name };
};
const fixture = (index = 0): TouchlinePublicFixture => ({
  id: `match-${index}`, providerId: String(19910000 + index), status: "NS",
  homeTeam: team(index), awayTeam: team((index + 1) % TOUCHLINE_ENGLAND_CLUBS.length),
});

test("all twenty clubs have exact fixture destinations on either side without a teamsheet", () => {
  assert.equal(TOUCHLINE_ENGLAND_CLUBS.length, 20);
  for (let index = 0; index < 20; index++) for (const status of ["NS", "LIVE", "FT"]) {
    const selected = { ...fixture(index), status };
    for (const reverse of [false, true]) {
      const actual = reverse ? { ...selected, homeTeam: selected.awayTeam, awayTeam: selected.homeTeam } : selected;
      const links = touchlineLiveClubLineupLinks(actual, TOUCHLINE_ENGLAND_CLUBS, "pt-BR");
      assert.equal(links.length, 2);
      for (const [side, participant] of [actual.homeTeam, actual.awayTeam].entries()) {
        const club = TOUCHLINE_ENGLAND_CLUBS.find(item => item.teamId === participant!.providerId)!;
        assert.equal(links[side]?.href, `/touchline-clubs/${club.slug}?lang=pt-BR&fixtureId=${actual.providerId}#touchline-club-lineup`);
        assert.equal(links[side]?.teamId, participant!.providerId);
        assert.equal(links[side]?.name, participant!.name);
      }
    }
  }
});

test("selection/reordering never borrows the previous fixture or opponent identity", () => {
  const first = fixture(0), second = fixture(8);
  const before = touchlineLiveClubLineupLinks(first, TOUCHLINE_ENGLAND_CLUBS, "en-GB");
  const after = touchlineLiveClubLineupLinks(second, [...TOUCHLINE_ENGLAND_CLUBS].reverse(), "ar-SA");
  assert.ok(before.every(link => link?.href.includes("fixtureId=19910000#")));
  assert.ok(after.every(link => link?.href.includes("fixtureId=19910008#")));
  assert.ok(after.every(link => link?.href.includes("lang=ar-SA&")));
  assert.notDeepEqual(before.map(link => link?.teamId), after.map(link => link?.teamId));
});

test("missing or unknown identity is not guessed from a matching club name", () => {
  assert.deepEqual(touchlineLiveClubLineupLinks(null, TOUCHLINE_ENGLAND_CLUBS, "pt-BR"), [null, null]);
  const unknown = { ...fixture(), homeTeam: { ...team(0), providerId: "999999" } };
  const result = touchlineLiveClubLineupLinks(unknown, TOUCHLINE_ENGLAND_CLUBS, "pt-BR");
  assert.equal(result[0], null);
  assert.equal(result[1]?.teamId, team(1).providerId);
  assert.equal(touchlineLiveClubLineupLinks({ ...fixture(), homeTeam: undefined }, TOUCHLINE_ENGLAND_CLUBS, "pt-BR")[0], null);
  for (const providerId of ["", "../other", "197001#other", "NaN"]) {
    assert.deepEqual(touchlineLiveClubLineupLinks({ ...fixture(), providerId }, TOUCHLINE_ENGLAND_CLUBS, "pt-BR"), [null, null]);
  }
});

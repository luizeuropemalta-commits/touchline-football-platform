import test from "node:test";
import assert from "node:assert/strict";
import { CLUB_ROSTER_CAPACITY, CLUB_ROSTER_SHOWCASE_LIMIT, listedNegotiableClubPlayers, negotiableClubPlayers, relocateClubPlayer, validateClubRoster, type ClubRosterEntry } from "../lib/touchlineFantasy/club-roster.ts";

const roster: ClubRosterEntry[] = (["starters", "reserves", "outside"] as const).flatMap(area =>
  Array.from({ length: CLUB_ROSTER_CAPACITY[area] }, (_, slot) => ({ playerId: `${area}-${slot}`, area, slot })));

test("thirty-five players comprise eleven starters, nine reserves and fifteen outside players", () => {
  assert.deepEqual(CLUB_ROSTER_CAPACITY, { starters: 11, reserves: 9, outside: 15, total: 35 });
  assert.equal(roster.length, 35);
  assert.deepEqual(validateClubRoster(roster), []);
  assert.equal(negotiableClubPlayers(roster).length, 15);
  assert.ok(negotiableClubPlayers(roster).every(id => id.startsWith("outside-")));
});
test("moving an outside player into the XI swaps ownership without duplication and removes proposal eligibility", () => {
  const moved = relocateClubPlayer(roster, "outside-0", "starters", 0)!;
  assert.equal(moved.length, 35);
  assert.equal(new Set(moved.map(entry => entry.playerId)).size, 35);
  assert.ok(!negotiableClubPlayers(moved).includes("outside-0"));
  assert.ok(negotiableClubPlayers(moved).includes("starters-0"));
  assert.equal(roster[0].playerId, "starters-0");
});
test("reserves are excluded from proposals and can exchange with an outside player", () => {
  const moved = relocateClubPlayer(roster, "outside-1", "reserves", 8)!;
  assert.ok(!negotiableClubPlayers(moved).includes("outside-1"));
  assert.ok(negotiableClubPlayers(moved).includes("reserves-8"));
});
test("invalid state, duplicate identity, overflow and missing players fail closed", () => {
  assert.deepEqual(negotiableClubPlayers([...roster, roster[0]]), []);
  assert.equal(relocateClubPlayer(roster, "outside-0", "reserves", 9), null);
  assert.equal(relocateClubPlayer(roster, "missing", "outside", 0), null);
  assert.equal(relocateClubPlayer(roster, "outside-0", "outside", -1), null);
  assert.equal(relocateClubPlayer(roster, "outside-0", "outside", 15), null);
});

test("vitrine accepts zero through eleven chosen players, leaving at least four outside it", () => {
  assert.equal(CLUB_ROSTER_SHOWCASE_LIMIT, 11);
  const candidates = negotiableClubPlayers(roster);
  for (let count = 0; count <= 11; count++) {
    const chosen = candidates.slice(0, count);
    assert.deepEqual(listedNegotiableClubPlayers(roster, chosen), chosen);
    assert.ok(candidates.length - chosen.length >= 4);
  }
  assert.deepEqual(listedNegotiableClubPlayers(roster, candidates.slice(0, 12)), []);
  assert.deepEqual(listedNegotiableClubPlayers(roster, candidates), []);
  assert.deepEqual(listedNegotiableClubPlayers(roster, ["outside-0", "outside-0"]), []);
  assert.deepEqual(listedNegotiableClubPlayers(roster, ["missing"]), []);
});

test("none of the twenty match-related players can be published; relocation invalidates stale listings", () => {
  for (const entry of roster.filter(entry => entry.area !== "outside")) {
    assert.deepEqual(listedNegotiableClubPlayers(roster, [entry.playerId]), []);
  }
  const moved = relocateClubPlayer(roster, "outside-0", "reserves", 0)!;
  assert.deepEqual(listedNegotiableClubPlayers(moved, ["outside-0"]), []);
  assert.deepEqual(listedNegotiableClubPlayers(moved, []), [], "newly outside reserve is not automatically advertised");
  assert.deepEqual(listedNegotiableClubPlayers(moved, ["reserves-0"]), ["reserves-0"]);
});

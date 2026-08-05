import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";
import { buildTouchLineClubLineup } from "../lib/touchlineArena/club-lineup.ts";
import { findTouchLineClub, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const city = findTouchLineClub("manchester-city")!;
const roles = ["forward", "forward", "forward", "midfielder", "midfielder", "midfielder", "defender", "defender", "defender", "defender", "goalkeeper"];
const squadCards: ClubOwnerSquadCard[] = roles.map((role, index) => ({
  id: String(index + 1),
  name: `City Player ${index + 1}`,
  shortName: `Player ${index + 1}`,
  role,
  position: role,
  clubName: city.name,
  shirtNumber: index + 1,
  countryCode3: "ENG",
  marketValue: "Pending",
  marketValueSource: "unavailable",
  touchlinePoints: 0,
}));

function officialMember(index: number, teamId = city.teamId): TouchlineFantasyLineupMember {
  return {
    id: `lineup-${index}`,
    providerId: `lineup-${index}`,
    provider: "sportmonks",
    fixtureId: "fixture-1",
    teamId,
    teamName: teamId === city.teamId ? city.name : "Arsenal FC",
    playerId: String(index + 1),
    playerName: `City Player ${index + 1}`,
    jerseyNumber: index + 1,
    position: roles[index],
    isStarter: true,
    isSubstitute: false,
    statistics: [],
  };
}

test("ClubHub labels squad-only data as preview, never as official", () => {
  const lineup = buildTouchLineClubLineup({ club: city, squadCards });

  assert.equal(lineup.status, "preview");
  assert.equal(lineup.formation, "4-3-3");
  assert.equal(lineup.players.length, 11);
});

test("ClubHub confirms and distributes only a complete provider Starting XI for its club", () => {
  const officialLineup = [
    ...roles.map((_, index) => officialMember(index)),
    officialMember(0, "19"),
  ];
  const lineup = buildTouchLineClubLineup({
    club: city,
    squadCards,
    officialLineup,
    formation: "4-2-3-1",
  });

  assert.equal(lineup.status, "confirmed");
  assert.equal(lineup.formation, "4-2-3-1");
  assert.equal(lineup.players.length, 11);
  assert.ok(lineup.players.every(({ card }) => card.clubName === city.name));
});

test("ClubHub presents England card prices in the canonical competition currency", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");

  assert.match(source, /resolveTouchlineCommercialCardPrice\(\{[\s\S]*?competition: "england"/);
  assert.match(source, /formatTouchlineCommercialCardPrice/);
  assert.match(source, /Card price/);
  assert.doesNotMatch(source, /\$\{economy\.priceTc\} TC/);
});

test("shared player cards never present the England commercial price as Touch Credits", () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

  assert.match(source, /resolveTouchlineCommercialCardPrice\(\{[\s\S]*?competition: "england"/);
  assert.match(source, /Card price/);
  assert.doesNotMatch(source, /TC Value/);
});

test("shared player cards keep public unavailable values pending and allow a stored price only for an active contract", () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

  assert.match(source, /player\.cardPriceAuthority === "active-contract"/);
  assert.match(source, /formatTouchlineContractedCommercialCardPrice/);
  assert.match(source, /verifiedEconomy\.status === "resolved"/);
  assert.match(source, /runtimeLocale === "pt-BR" \? "Pendente" : "Pending"/);
});

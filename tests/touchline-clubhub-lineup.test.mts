import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";
import {
  buildTouchLineClubLineup,
  buildTouchLineClubMatchdayPresentation,
} from "../lib/touchlineArena/club-lineup.ts";
import { findTouchLineClub, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const city = findTouchLineClub("manchester-city")!;
const starterRoles = ["forward", "forward", "forward", "midfielder", "midfielder", "midfielder", "defender", "defender", "defender", "defender", "goalkeeper"];
const roles = [...starterRoles, "goalkeeper", "defender", "defender", "defender", "midfielder", "midfielder", "midfielder", "forward", "forward"];
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

function officialMember(
  index: number,
  options: {
    fixtureId?: string;
    teamId?: string;
    isStarter?: boolean;
    isSubstitute?: boolean;
  } = {},
): TouchlineFantasyLineupMember {
  const teamId = options.teamId ?? city.teamId;
  return {
    id: `lineup-${index}`,
    providerId: `lineup-${index}`,
    provider: "sportmonks",
    fixtureId: options.fixtureId ?? "fixture-1",
    teamId,
    teamName: teamId === city.teamId ? city.name : "Arsenal FC",
    playerId: String(index + 1),
    playerName: `City Player ${index + 1}`,
    jerseyNumber: index + 1,
    position: roles[index],
    isStarter: options.isStarter ?? true,
    isSubstitute: options.isSubstitute ?? false,
    statistics: [],
  };
}

const officialStarters = starterRoles.map((_, index) => officialMember(index));
const officialBench = Array.from({ length: 9 }, (_, index) => officialMember(index + 11, {
  isStarter: false,
  isSubstitute: true,
}));

const matchingCoach = {
  fixtureId: "fixture-1",
  teamId: city.teamId,
  name: "Official City Coach",
} as const;

test("ClubHub labels squad-only data as preview, never as official", () => {
  const lineup = buildTouchLineClubLineup({ club: city, squadCards });

  assert.equal(lineup.status, "preview");
  assert.equal(lineup.formation, "4-3-3");
  assert.equal(lineup.players.length, 11);
});

test("ClubHub confirms and distributes only a complete provider Starting XI for its club", () => {
  const officialLineup = [
    ...officialStarters,
    officialMember(0, { teamId: "19" }),
  ];
  const lineup = buildTouchLineClubLineup({
    club: city,
    squadCards,
    officialLineup,
    formation: "4-2-3-1",
    fixtureId: "fixture-1",
  });

  assert.equal(lineup.status, "confirmed");
  assert.equal(lineup.formation, "4-2-3-1");
  assert.equal(lineup.players.length, 11);
  assert.ok(lineup.players.every(({ card }) => card.clubName === city.name));
});

test("ClubHub confirms the technical area only for an exact fixture, club, XI, coach, and nine-person bench", () => {
  const presentation = buildTouchLineClubMatchdayPresentation({
    club: city,
    squadCards,
    officialLineup: [...officialStarters, ...officialBench],
    formation: "4-2-3-1",
    fixtureId: "fixture-1",
    officialCoach: matchingCoach,
  });

  const lineupIds = presentation.lineup.players.map(({ card }) => card.id);
  const benchIds = presentation.technical.bench.map((card) => card.id);

  assert.equal(presentation.lineup.status, "confirmed");
  assert.equal(presentation.lineup.players.length, 11);
  assert.equal(presentation.technical.state, "confirmed");
  assert.deepEqual(presentation.technical.coach, matchingCoach);
  assert.equal(benchIds.length, 9);
  assert.equal(new Set(lineupIds).size, lineupIds.length);
  assert.equal(new Set(benchIds).size, benchIds.length);
  assert.ok(benchIds.every((id) => !lineupIds.includes(id)));
  assert.equal(new Set(presentation.displayedPlayerIds).size, presentation.displayedPlayerIds.length);
  assert.equal(presentation.displayedPlayerIds.length, 20);
  assert.ok(presentation.displayedPlayerIds.every((id) => lineupIds.includes(id) || benchIds.includes(id)));
});

test("ClubHub fail-closes the named technical bench for incomplete or mismatched official sheets", () => {
  const incompleteCases = [
    {
      label: "missing coach",
      officialLineup: [...officialStarters, ...officialBench],
      officialCoach: null,
    },
    {
      label: "only eight substitutes",
      officialLineup: [...officialStarters, ...officialBench.slice(0, 8)],
      officialCoach: matchingCoach,
    },
    {
      label: "duplicate substitute",
      officialLineup: [
        ...officialStarters,
        ...officialBench.slice(0, 8),
        officialMember(11, { isStarter: false, isSubstitute: true }),
      ],
      officialCoach: matchingCoach,
    },
    {
      label: "wrong fixture member",
      officialLineup: [
        ...officialStarters.slice(0, 10),
        officialMember(10, { fixtureId: "fixture-other" }),
        ...officialBench,
      ],
      officialCoach: matchingCoach,
    },
    {
      label: "wrong team member",
      officialLineup: [
        ...officialStarters.slice(0, 10),
        officialMember(10, { teamId: "19" }),
        ...officialBench,
      ],
      officialCoach: matchingCoach,
    },
  ] as const;

  for (const scenario of incompleteCases) {
    const presentation = buildTouchLineClubMatchdayPresentation({
      club: city,
      squadCards,
      officialLineup: scenario.officialLineup,
      fixtureId: "fixture-1",
      officialCoach: scenario.officialCoach,
    });

    assert.equal(
      presentation.technical.state,
      "awaiting_official_team_sheet",
      `${scenario.label} must not be presented as an official technical sheet`,
    );
    assert.equal(presentation.technical.coach, null, `${scenario.label} must not name a coach`);
    assert.deepEqual(presentation.technical.bench, [], `${scenario.label} must not name bench players`);
  }
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

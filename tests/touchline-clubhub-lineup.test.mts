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
const starterRoles = ["goalkeeper", "defender", "defender", "defender", "defender", "midfielder", "midfielder", "midfielder", "forward", "forward", "forward"];
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
    formationPosition: String(index + 1),
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
  assert.deepEqual(
    lineup.players.reduce<Record<number, number>>((counts, player) => {
      counts[player.x] = (counts[player.x] ?? 0) + 1;
      return counts;
    }, {}),
    { 10: 1, 29: 4, 50: 2, 71: 3, 88: 1 },
  );
});

test("ClubHub confirms the technical area only for an exact fixture, club, XI, and provider bench", () => {
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

test("ClubHub accepts the provider's complete bench size without assuming nine substitutes", () => {
  const presentation = buildTouchLineClubMatchdayPresentation({
    club: city,
    squadCards,
    officialLineup: [...officialStarters, ...officialBench.slice(0, 7)],
    fixtureId: "fixture-1",
    officialCoach: matchingCoach,
  });

  assert.equal(presentation.lineup.status, "confirmed");
  assert.equal(presentation.technical.state, "confirmed");
  assert.equal(presentation.technical.bench.length, 7);
});

test("ClubHub preserves an official bench when the provider has not supplied a coach", () => {
  const presentation = buildTouchLineClubMatchdayPresentation({
    club: city,
    squadCards,
    officialLineup: [...officialStarters, ...officialBench],
    fixtureId: "fixture-1",
    officialCoach: null,
  });

  assert.equal(presentation.technical.state, "confirmed");
  assert.equal(presentation.technical.coach, null);
  assert.equal(presentation.technical.bench.length, 9);
});

test("ClubHub fail-closes the named technical bench for incomplete or mismatched official sheets", () => {
  const incompleteCases = [
    {
      label: "no official substitutes",
      officialLineup: [...officialStarters],
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

test("ClubHub retains all eleven football slots even when a card publication is pending", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");

  assert.match(source, /lineup\.players\.length \? lineup\.players\.map/);
  assert.match(source, /evaluateTouchlineCardCompleteness/);
  assert.doesNotMatch(source, /CARD PENDING REVIEW|DATA PENDING/);
  assert.doesNotMatch(source, /lineup\.players\.filter\(\(\{ card \}\) => Boolean\(card\.editorialCard\)\)/);
  assert.match(source, /editorialCard: card\.editorialCard/);
  assert.match(source, /activeContractCard: null/);
  assert.match(source, /buildTouchlinePlayerCardZoomDetails/);
  assert.doesNotMatch(source, /resolveTouchlineVerifiedPlayerEconomy|resolveTouchlinePublicCardPresentation|activeContractCard: activeContract/);
});

test("ClubHub calls an unconfirmed eleven a Squad Preview, never an expected line-up", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");

  assert.match(source, /Squad Preview/);
  assert.doesNotMatch(source, /Predicted line-up/);
});

test("the persisted-squad API preserves every canonical roster player for Club Hub", () => {
  const source = readFileSync(new URL("../app/api/football-data/premier-squad/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /rosterPlayers: sortedPlayers/);
  assert.match(page, /payload\.rosterPlayers \?\? payload\.players/);
});

test("Market preserves every real roster player when card data is pending", () => {
  const source = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

  assert.match(source, /rosterPlayers\?: TeamBuilderSquadPlayer\[\]/);
  assert.match(source, /const rosterPlayers = payload\.rosterPlayers \?\? payload\.players/);
  assert.match(source, /connectBuilderSquadToMarketInventory\(rosterPlayers, inventorySnapshot\)/);
  assert.match(source, /playerCount: rosterPlayers\.length/);
});

test("shared player cards require a manual published profile, apart from a frozen owned-contract render", () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

  assert.match(source, /const editorialCard = player\.editorialCard \?\? null/);
  assert.match(source, /formatTouchlineEditorialCardPrice/);
  assert.match(source, /if \(!editorialCard && !contractedTier && !allowVisualInventoryPreview && !reviewRequired\) return null/);
  assert.match(source, /allowVisualInventoryPreview = false/);
  assert.match(source, /player\.cardPriceAuthority === "active-contract"/);
  assert.doesNotMatch(source, /resolveTouchlineVerifiedPlayerEconomy|Market value|Valor de mercado|formatTouchlineContractedCommercialCardPrice/);
});

test("incomplete ClubHub players remain in the shared premium card grid", () => {
  const grid = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");

  assert.match(grid, /const visibleCards = useMemo\(\(\) => cards\.slice\(0, visibleCount\)/);
  assert.match(grid, /evaluateTouchlineCardCompleteness/);
  assert.match(grid, /squadCardToExactPlayer\(\{ \.\.\.card, cardReview \}\)/);
  assert.match(grid, /const tierKey = card\.editorialCard\?\.tierKey \?\? null/);
  assert.match(grid, /contractHref=\{undefined\}/);
  assert.match(grid, /cards\.length/);
  assert.doesNotMatch(grid, /marketValueState: card\.marketValueState|classificationState: card\.classificationState/);
  assert.doesNotMatch(grid, /resolveTouchlineVerifiedPlayerEconomy|resolveTouchlinePublicCardPresentation|cardPriceAuthority|formatTouchlineContractedCommercialCardPrice/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";
import {
  buildTouchLineClubLineup,
  buildTouchLineClubMatchdayPresentation,
  isClubHubSquadPreviewWindow,
} from "../lib/touchlineArena/club-lineup.ts";
import { findTouchLineClub, TOUCHLINE_ENGLAND_CLUBS, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { getTouchlineClubHubLineupCopy } from "../lib/touchlineArena/club-hub-lineup-i18n.ts";

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

for (const club of TOUCHLINE_ENGLAND_CLUBS) {
  test(`${club.slug}: historical pitch never substitutes an unpublished starter or duplicates a starter on the bench`, () => {
    const starters = officialStarters.map(member => ({ ...member, teamId: club.teamId, fixtureId: "historical" }));
    const result = buildTouchLineClubMatchdayPresentation({
      club, squadCards: squadCards.filter(card => card.id !== "1" && card.id !== "6"), fixtureId: "upcoming",
      lastCompletedXi: { fixtureId: "historical", formation: "4-3-3", starters },
    });
    const slots = result.lineup.recordedPitch!.players;
    assert.equal(slots.length, 11);
    assert.deepEqual(slots.filter(slot=>slot.card === null).map(slot=>slot.playerId), ["1","6"]);
    assert.ok(slots.every(slot=>!slot.card || String(slot.card.id) === slot.playerId));
    const ids = new Set(slots.map(slot=>slot.playerId));
    assert.ok(result.technical.previewBench.every(card=>!ids.has(String(card.id))));
    assert.ok(result.remainingSquad.cards.every(card=>!ids.has(String(card.id))));
    assert.equal(result.lineup.status, "preview");
    assert.equal(result.technical.state, "awaiting_official_team_sheet");
  });
  test(`${club.slug}: only an exact complete team sheet can classify remaining squad members`, () => {
    const extra = { ...squadCards[0]!, id: "31504", name: "Unselected squad member" };
    const cards = [...squadCards, extra];
    const sheet = [...officialStarters, ...officialBench].map((member) => ({ ...member, teamId: club.teamId }));
    for (const officialLineup of [[], sheet.slice(0, 11), sheet.map((member) => ({ ...member, fixtureId: "old-match" }))]) {
      const result = buildTouchLineClubMatchdayPresentation({ club, squadCards: cards, officialLineup, fixtureId: "fixture-1" });
      assert.equal(result.remainingSquad.state, "unconfirmed");
      assert.ok(result.remainingSquad.cards.some((card) => card.id === extra.id));
    }
    const result = buildTouchLineClubMatchdayPresentation({ club, squadCards: cards, officialLineup: sheet, fixtureId: "fixture-1" });
    assert.equal(result.remainingSquad.state, "not_listed");
    assert.deepEqual(result.remainingSquad.cards.map((card) => card.id), [extra.id]);
    assert.equal(result.remainingSquad.fixtureId, "fixture-1");
  });
}

test("ClubHub labels squad-only data as preview, never as official", () => {
  const presentation = buildTouchLineClubMatchdayPresentation({ club: city, squadCards });
  const lineup = presentation.lineup;

  assert.equal(lineup.status, "preview");
  assert.equal(lineup.previewBasis, "illustrative");
  assert.equal(lineup.formation, "4-3-3");
  assert.equal(lineup.players.length, 11);
  assert.equal(presentation.technical.state, "awaiting_official_team_sheet");
  assert.equal(presentation.technical.bench.length, 0);
  assert.equal(presentation.technical.previewBench.length, 9);
  assert.equal(new Set(presentation.technical.previewBench.map((card) => card.id)).size, 9);
  assert.ok(presentation.technical.previewBench.every((card) => !lineup.players.some(({ card: starter }) => starter.id === card.id)));
});

test("ClubHub starts from the last completed XI without claiming the next XI is official", () => {
  const prior = officialStarters.map((member) => ({ ...member, fixtureId: "previous-fixture" }));
  const result = buildTouchLineClubMatchdayPresentation({
    club: city, squadCards, fixtureId: "next-fixture",
    lastCompletedXi: { fixtureId: "previous-fixture", formation: "4-2-3-1", starters: prior },
  });
  assert.equal(result.lineup.status, "preview");
  assert.equal(result.lineup.previewBasis, "last-completed-xi");
  assert.equal(result.lineup.formation, "4-2-3-1");
  assert.equal(result.lineup.recordedFormation, "4-2-3-1");
  assert.deepEqual(result.lineup.players.map(({ card }) => card.id), prior.map((member) => member.playerId));
  assert.equal(result.technical.state, "awaiting_official_team_sheet");
  const confirmed = buildTouchLineClubMatchdayPresentation({
    club: city, squadCards, fixtureId: "next-fixture",
    officialLineup: officialStarters.map((member) => ({ ...member, fixtureId: "next-fixture" })),
    lastCompletedXi: { fixtureId: "previous-fixture", formation: "4-2-3-1", starters: prior },
  });
  assert.equal(confirmed.lineup.status, "confirmed");
  assert.equal(confirmed.lineup.previewBasis, undefined);
  assert.equal(confirmed.lineup.recordedFormation, undefined);
  const missingCard = buildTouchLineClubMatchdayPresentation({
    club: city, squadCards: squadCards.slice(1), fixtureId: "next-fixture",
    lastCompletedXi: { fixtureId: "previous-fixture", formation: "4-2-3-1", starters: prior },
  });
  assert.equal(missingCard.lineup.previewBasis, "illustrative");
  assert.equal(missingCard.recordedXiWithoutCards?.length, 11);
  assert.deepEqual(missingCard.recordedXiWithoutCards?.map((member) => member.playerId), prior.map((member) => member.playerId));
  assert.equal(missingCard.recordedXiWithoutCards?.[0]?.playerName, "City Player 1");
  assert.equal(missingCard.lineup.recordedPitch?.formation, "4-2-3-1");
  assert.equal(missingCard.lineup.recordedFormation, "4-2-3-1");
  assert.equal(missingCard.lineup.recordedPitch?.players.length, 11);
  assert.deepEqual(missingCard.lineup.recordedPitch?.players.map((slot) => slot.playerId), prior.map((member) => member.playerId));
  assert.equal(missingCard.lineup.recordedPitch?.players[0]?.card, null);
  assert.ok(missingCard.lineup.recordedPitch?.players.slice(1).every((slot) => slot.card?.id === slot.playerId));
  assert.ok(missingCard.lineup.recordedPitch?.players.every((slot) => Number.isFinite(slot.x) && Number.isFinite(slot.y)));
  assert.equal(confirmed.lineup.recordedPitch, undefined);
  assert.equal(confirmed.recordedXiWithoutCards, null);
  const unnamed = buildTouchLineClubMatchdayPresentation({
    club: city, squadCards: squadCards.slice(1), fixtureId: "next-fixture",
    lastCompletedXi: { fixtureId: "previous-fixture", formation: "4-2-3-1", starters: prior.map((member, index) => index === 0 ? { ...member, playerName: " " } : member) },
  });
  assert.equal(unnamed.recordedXiWithoutCards, null);
  assert.equal(unnamed.lineup.recordedPitch, undefined);
});

test("official identities precede history when a published starter card is missing without confirming the technical sheet", () => {
  const prior = officialStarters.map(member => ({ ...member, fixtureId: "previous-fixture", playerName: "Historical identity" }));
  const input = { club: city, squadCards: squadCards.slice(1), fixtureId: "fixture-1", formation: "4-2-3-1",
    officialLineup: [...officialStarters, ...officialBench], officialCoach: matchingCoach,
    lastCompletedXi: { fixtureId: "previous-fixture", formation: "4-3-3", starters: prior } };
  const result = buildTouchLineClubMatchdayPresentation(input);
  assert.equal(result.lineup.status, "confirmed");
  assert.equal(result.lineup.previewBasis, undefined);
  assert.equal(result.lineup.recordedPitch, undefined);
  assert.equal(result.recordedXiWithoutCards, null);
  assert.equal(result.lineup.formation, "4-2-3-1");
  assert.equal(result.lineup.officialPitch?.players.length, 11);
  assert.equal(result.lineup.officialPitch?.players[0]?.card, null);
  assert.deepEqual(result.lineup.officialPitch?.players.map(slot => slot.playerName), officialStarters.map(member => member.playerName));
  assert.ok(result.lineup.officialPitch?.players.every(slot => !slot.card || slot.card.id === slot.playerId));
  assert.equal(result.technical.state, "awaiting_official_team_sheet");
  assert.equal(result.technical.coach, null);
  assert.deepEqual(result.technical.bench, []);
  assert.ok(result.technical.previewBench.every(card => !officialStarters.some(member => member.playerId === card.id)));
  for (const bad of [
    officialStarters.map((member, index) => index === 10 ? { ...member, playerId: "1" } : member),
    officialStarters.map((member, index) => index === 0 ? { ...member, fixtureId: "wrong" } : member),
    officialStarters.map((member, index) => index === 0 ? { ...member, provider: "other" as typeof member.provider } : member),
    officialStarters.map((member, index) => index === 0 ? { ...member, playerName: " " } : member),
  ]) {
    const invalid = buildTouchLineClubMatchdayPresentation({ ...input, officialLineup: bad });
    assert.equal(invalid.lineup.status, "preview");
    assert.equal(invalid.lineup.officialPitch, undefined);
  }
});

test("the last-completed-XI label and caution are present in all eight languages", () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const copy = getTouchlineClubHubLineupCopy(locale, true);
    assert.ok(copy.lastXiTitle.length > 4, locale);
    assert.ok(copy.lastXiNotice.length > 40, locale);
  }
});

for (const missingCard of [false, true]) {
  test(`official formation stays unknown independently of geometry (missing card: ${missingCard})`, () => {
    const input = { club: city, squadCards: missingCard ? squadCards.slice(1) : squadCards,
      fixtureId: "fixture-1", officialLineup: officialStarters,
      lastCompletedXi: { fixtureId: "previous", formation: "5-4-1", starters: officialStarters.map(member => ({ ...member, fixtureId: "previous" })) } };
    const result = buildTouchLineClubMatchdayPresentation({ ...input, formation: null });
    assert.equal(result.lineup.status, "confirmed");
    assert.equal(result.lineup.officialFormation, null);
    assert.equal(result.lineup.recordedFormation, undefined);
    const slots = result.lineup.officialPitch?.players ?? result.lineup.players;
    assert.equal(slots.length, 11);
    assert.ok(slots.every(slot => Number.isFinite(slot.x) && Number.isFinite(slot.y)));
    const known = buildTouchLineClubMatchdayPresentation({ ...input, formation: "4-2-3-1" });
    assert.equal(known.lineup.officialFormation, "4-2-3-1");
    assert.equal(known.lineup.formation, "4-2-3-1");
  });

  test(`historical formation stays unknown independently of fallback geometry (missing card: ${missingCard})`, () => {
    const prior = officialStarters.map(member => ({ ...member, fixtureId: "previous-fixture" }));
    const result = buildTouchLineClubMatchdayPresentation({
      club: city, squadCards: missingCard ? squadCards.slice(1) : squadCards, fixtureId: "next-fixture",
      lastCompletedXi: { fixtureId: "previous-fixture", formation: null, starters: prior },
    });
    assert.equal(result.lineup.recordedFormation, null);
    const slots = result.lineup.recordedPitch?.players ?? result.lineup.players;
    assert.equal(slots.length, 11);
    assert.ok(slots.every(slot => Number.isFinite(slot.x) && Number.isFinite(slot.y)));
    assert.deepEqual(result.lineup.recordedPitch?.players.map(slot => slot.playerId) ?? result.lineup.players.map(slot => slot.card.id), prior.map(member => member.playerId));
  });
}

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

  assert.match(source, /pitchPlayers\.length \? pitchPlayers\.map/);
  assert.match(source, /evaluateTouchlineCardCompleteness/);
  assert.doesNotMatch(source, /CARD PENDING REVIEW|DATA PENDING/);
  assert.doesNotMatch(source, /lineup\.players\.filter\(\(\{ card \}\) => Boolean\(card\.editorialCard\)\)/);
  assert.match(source, /editorialCard: card\.editorialCard/);
  assert.match(source, /activeContractCard: null/);
  assert.match(source, /buildTouchlinePlayerCardZoomDetails/);
  assert.doesNotMatch(source, /resolveTouchlineVerifiedPlayerEconomy|resolveTouchlinePublicCardPresentation|activeContractCard: activeContract/);
});

test("ClubHub uses Squad Preview from T−24 until confirmation or a terminal fixture, never as an expected line-up", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");

  assert.match(source, /const lineupCopy = getTouchlineClubHubLineupCopy\(locale, draftLocalesEnabled\)/);
  assert.match(source, /isClubHubSquadPreviewWindow/);
  assert.match(source, /startsAtIso/);
  assert.match(source, /fixtureStatus: matchup\?\.initialFixture\?\.status/);
  assert.match(source, /const showPreviewContext = !confirmed && squadPreviewWindow/);
  assert.match(source, /confirmed\n\s*\? lineupCopy\.confirmedTitle/);
  assert.match(source, /showPreviewContext\n\s*\? lineupCopy\.previewTitle\n\s*:\s*lineupCopy\.unconfirmedTitle/);
  assert.match(source, /const workflowCopy = getTouchlineFantasyMarketWorkflowCopy\(locale, draftLocalesEnabled\)/);
  assert.match(source, /showPreviewContext \? \(/);
  assert.doesNotMatch(source, /Predicted line-up/);
});

test("ClubHub preview window requires an absolute fixture instant and preserves confirmed line-ups", () => {
  const kickoff = "2026-09-12T14:00:00.000Z";
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "confirmed", startsAt: kickoff, now: Date.parse("2026-09-11T13:59:59.000Z") }), false);
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt: kickoff, now: Date.parse("2026-09-11T13:59:59.000Z") }), false);
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt: kickoff, now: Date.parse("2026-09-11T14:00:00.000Z") }), true);
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt: "2026-09-12T16:00:00+02:00", now: Date.parse("2026-09-11T14:00:00.000Z") }), true);
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt: "2026-09-12T11:00:00-03:00", now: Date.parse("2026-09-11T14:00:00.000Z") }), true);
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt: kickoff, fixtureStatus: "LIVE", now: Date.parse("2026-09-12T14:00:01.000Z") }), true);
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt: kickoff, fixtureStatus: "Full Time", now: Date.parse("2026-09-12T14:00:01.000Z") }), false);
  for (const startsAt of [null, undefined, "", "   ", "invalid", "2026-02-30T14:00:00.000Z", "2026-09-12T14:00:00"]) {
    assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt, now: Date.parse("2026-09-11T14:00:00.000Z") }), false);
  }
  assert.equal(isClubHubSquadPreviewWindow({ lineupStatus: "preview", startsAt: kickoff, now: Number.NaN }), false);
});

test("ClubHub adds close identity captions without a floating rating label or substituted historical player", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");

  assert.doesNotMatch(source, /showMatchRating/);
  assert.doesNotMatch(source, /className=\{styles\.playerName\}/);
  assert.doesNotMatch(styles, /\.playerName\s*\{/);
  assert.match(source, /className=\{styles\.playerCaption\}/);
  assert.match(source, /const pitchPlayers = officialPitch\?\.players \?\? recordedPitch\?\.players/);
  assert.match(source, /!recordedPitch && recordedXiWithoutCards/);
  assert.match(styles, /top: calc\(100% \+ 2px\)/);
});

test("ClubHub mobile captions are smaller and goalkeeper first-name leaves full identity accessible", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");
  assert.match(source, /styles\.goalkeeperMobileName/);
  assert.match(source, /aria-label=\{playerName\}/);
  assert.match(source, /playerName\.trim\(\)\.split\(\/\\s\+\/u\)\[0\]/);
  assert.match(css, /\.playerCaption\s*\{\s*font-size: clamp\(7px, 1\.1cqw, 10px\)/);
  assert.match(css, /\.goalkeeperMobileName\s*\{\s*display: inline/);
});

test("ClubHub keeps the field beside the premium table and the four leaders below the field", () => {
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const technical = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");

  assert.match(page, /leaderCards=\{\(/);
  assert.match(page, /displayWidth=\{112\}/);
  assert.doesNotMatch(page, /ClubHubPremiumOverviewSection/);
  assert.match(lineup, /className=\{styles\.pitchAndLeaders\}/);
  assert.match(lineup, /className=\{styles\.positionLeaders\}/);
  assert.match(page, /className="club-hub-field-table-layout"[\s\S]*?<ClubHubLineupSection[\s\S]*?<ClubHubOfficialTablePanel/);
  assert.match(page, /\.club-hub-field-table-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(290px, 340px\)/);
  assert.match(styles, /\.pitchAndLeaders \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.positionLeaders \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\[data-clubhub-card-spotlight\^="position-"\][\s\S]*?overflow: visible/);
  assert.match(styles, /@media \(min-width: 981px\) and \(max-width: 1599px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(technical, /<p aria-hidden="true"\s*\/>/);
  assert.doesNotMatch(technical, /9 cards from the available squad/);
});

test("ClubHub preserves the canonical Market formation on a regulation landscape pitch", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");

  assert.match(source, /const horizontalPitchPosition = \(x: number, y: number\) => \(\{ x, y \}\)/);
  assert.match(source, /orientation="horizontal"/);
  assert.match(source, /surfaceVariant="smoked-glass"/);
  assert.match(source, /orientation="upright"/);
  assert.match(styles, /width: min\(100%, 922px\)/);
  const technical = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.tsx", import.meta.url), "utf8");
  assert.match(technical, /<TouchlineClubPerimeterTrace accent="#a3ff12"/);
});

test("the persisted-squad API preserves every canonical roster player for Club Hub", () => {
  const source = readFileSync(new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /rosterPlayers: sortedPlayers/);
  assert.match(page, /payload\.rosterPlayers \?\? payload\.players/);
});

test("shared player cards require publication and show only a verified market value", () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

  assert.match(source, /const editorialCard = player\.editorialCard \?\? null/);
  assert.match(source, /formatTouchlineMarketValueEur/);
  assert.match(source, /player\.marketValueState === "verified"/);
  assert.match(source, /if \(!editorialCard && !contractedTier && !allowVisualInventoryPreview && !reviewRequired && !publicationPending\) return null/);
  assert.match(source, /allowVisualInventoryPreview = false/);
  assert.match(source, /player\.cardPriceAuthority === "active-contract"/);
  assert.doesNotMatch(source, /resolveTouchlineVerifiedPlayerEconomy|formatTouchlineContractedCommercialCardPrice/);
});

test("public ClubHub line-up preserves football market values", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const publicPage = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const audit = readFileSync(new URL("../components/touchline/audit/TouchlineAuditStudio.tsx", import.meta.url), "utf8");
  const visualQa = readFileSync(new URL("../app/visual-qa/clubhub-profile-contract/page.tsx", import.meta.url), "utf8");
  const cards = source.match(/<TouchlineEliteExactCard\b[\s\S]*?\/>/g) ?? [];

  assert.equal(cards.length, 2);
  assert.match(source, /hideMarketValuePanel = false/);
  cards.forEach(card => assert.match(card, /hideMarketValuePanel=\{hideMarketValuePanel\}/));
  assert.match(cards[0], /forceNeonActive/);
  assert.match(cards[1], /showProfileAction=\{false\}/);
  assert.match(publicPage, /<ClubHubOfficialLineup[\s\S]*?hideMarketValuePanel=\{false\}/);
  assert.doesNotMatch(audit, /hideMarketValuePanel/);
  assert.doesNotMatch(visualQa, /hideMarketValuePanel/);
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

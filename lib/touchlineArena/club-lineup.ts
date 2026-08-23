import type { TouchlineFantasyLineupMember } from "../football-data/types.ts";
import { inferArenaRole, normalizeOfficialShirtNumber } from "../football-data/arena-lineup.ts";
import { type ClubOwnerSquadCard, type TouchLineClubVisual } from "./demo-data.ts";
import { touchlineCanonicalFormationSlots, type TouchlineFormationPitchSlot } from "./pitch-layout.ts";
import {
  isTouchlineTacticalSlotCandidateEligible,
  type TouchlineFormationGeometryRegistry,
} from "./formation-geometry.ts";

export type TouchLineClubLineupStatus = "confirmed" | "preview";

export type TouchLineClubLineupSlot = {
  card: ClubOwnerSquadCard;
  x: number;
  y: number;
};

export type TouchLineClubLineup = {
  status: TouchLineClubLineupStatus;
  formation: string;
  players: TouchLineClubLineupSlot[];
};

export type TouchLineClubOfficialMatchdayCoach = Readonly<{
  fixtureId: string;
  teamId: string;
  name: string;
}>;

export type TouchLineClubMatchdayTechnicalState = "confirmed" | "awaiting_official_team_sheet";

export type TouchLineClubMatchdayPresentation = Readonly<{
  lineup: TouchLineClubLineup;
  technical: Readonly<{
    state: TouchLineClubMatchdayTechnicalState;
    coach: TouchLineClubOfficialMatchdayCoach | null;
    bench: readonly ClubOwnerSquadCard[];
  }>;
  /** Every named player shown in the XI or confirmed technical bench. */
  displayedPlayerIds: readonly string[];
}>;

function memberPlayerId(member: TouchlineFantasyLineupMember) {
  const playerId = String(member.playerId ?? "").trim();
  return playerId || null;
}

function isStrictMatchdayMember(
  member: TouchlineFantasyLineupMember,
  club: TouchLineClubVisual,
  fixtureId: string | null | undefined,
) {
  const selectedFixtureId = String(fixtureId ?? "").trim();
  return Boolean(
    selectedFixtureId
    && String(member.fixtureId ?? "").trim() === selectedFixtureId
    && String(member.teamId ?? "").trim() === club.teamId
    && memberPlayerId(member),
  );
}

function strictCardForOfficialMember(
  member: TouchlineFantasyLineupMember,
  squadCards: ClubOwnerSquadCard[],
) {
  const providerPlayerId = memberPlayerId(member);
  if (!providerPlayerId) return null;
  const existing = squadCards.find((card) => String(card.id) === providerPlayerId);
  if (!existing) return null;
  return {
    ...existing,
    role: inferArenaRole(member.position || existing.position),
    position: member.position || existing.position,
    shirtNumber: normalizeOfficialShirtNumber(member.jerseyNumber, existing.shirtNumber),
  };
}

function selectPreviewStartingEleven(
  squadCards: ClubOwnerSquadCard[],
  slots: readonly TouchlineFormationPitchSlot[],
) {
  const available = [...squadCards];
  const chosen: ClubOwnerSquadCard[] = [];

  for (const slot of slots) {
    const exactIndex = available.findIndex((card) => isTouchlineTacticalSlotCandidateEligible({
      position: card.position,
      role: inferArenaRole(card.role || card.position),
    }, slot));
    const broadRoleIndex = available.findIndex((card) => inferArenaRole(card.role || card.position) === slot.role);
    const selectedIndex = exactIndex >= 0 ? exactIndex : broadRoleIndex >= 0 ? broadRoleIndex : 0;
    const [card] = available.splice(selectedIndex, 1);
    if (card) chosen.push(card);
  }

  return chosen;
}

function arrangeCards(cards: ClubOwnerSquadCard[], slots: readonly TouchlineFormationPitchSlot[]) {
  return slots.flatMap((slot, index) => cards[index] ? [{ card: cards[index]!, x: slot.x, y: slot.y }] : []);
}

function officialFormationPosition(member: TouchlineFantasyLineupMember) {
  const value = Number.parseInt(String(member.formationPosition ?? ""), 10);
  return Number.isInteger(value) && value >= 1 && value <= 11 ? value : Number.POSITIVE_INFINITY;
}

export function buildTouchLineClubLineup(input: {
  club: TouchLineClubVisual;
  squadCards: ClubOwnerSquadCard[];
  officialLineup?: TouchlineFantasyLineupMember[];
  formation?: string | null;
  fixtureId?: string | null;
  formationGeometryRegistry?: TouchlineFormationGeometryRegistry;
}): TouchLineClubLineup {
  return buildTouchLineClubMatchdayPresentation(input).lineup;
}

/**
 * Pure ClubHub read model. A public matchday is confirmed only after the
 * selected fixture supplies one exact 11-player XI and the complete technical
 * team sheet (coach plus the provider's unique substitutes). It never infers a coach,
 * bench member, fixture or player identity.
 */
export function buildTouchLineClubMatchdayPresentation(input: {
  club: TouchLineClubVisual;
  squadCards: ClubOwnerSquadCard[];
  officialLineup?: TouchlineFantasyLineupMember[];
  formation?: string | null;
  fixtureId?: string | null;
  officialCoach?: TouchLineClubOfficialMatchdayCoach | null;
  formationGeometryRegistry?: TouchlineFormationGeometryRegistry;
}): TouchLineClubMatchdayPresentation {
  const strictMembers = (input.officialLineup ?? []).filter((member) => (
    isStrictMatchdayMember(member, input.club, input.fixtureId)
  ));
  const officialStarters = strictMembers
    .filter((member) => member.isStarter)
    .sort((first, second) => officialFormationPosition(first) - officialFormationPosition(second));
  const starterIds = officialStarters.map(memberPlayerId);
  const startersAreUnique = starterIds.every((id): id is string => Boolean(id))
    && new Set(starterIds).size === starterIds.length;
  const confirmedStarterCards = startersAreUnique && officialStarters.length === 11
    ? officialStarters.map((member) => strictCardForOfficialMember(member, input.squadCards))
    : [];
  const hasConfirmedStartingEleven = confirmedStarterCards.length === 11 && confirmedStarterCards.every(Boolean);
  const formation = hasConfirmedStartingEleven && input.formation?.trim()
    ? input.formation.trim()
    : "4-3-3";
  const formationSlots = touchlineCanonicalFormationSlots(formation, input.formationGeometryRegistry);
  const cards = hasConfirmedStartingEleven
    ? confirmedStarterCards as ClubOwnerSquadCard[]
    : selectPreviewStartingEleven(input.squadCards, formationSlots);

  const lineup: TouchLineClubLineup = {
    status: hasConfirmedStartingEleven ? "confirmed" : "preview",
    formation,
    players: arrangeCards(cards, formationSlots),
  };

  const officialBench = strictMembers.filter((member) => member.isSubstitute);
  const benchIds = officialBench.map(memberPlayerId);
  const benchAreUnique = benchIds.every((id): id is string => Boolean(id))
    && new Set(benchIds).size === benchIds.length
    && benchIds.every((id) => !starterIds.includes(id));
  // Sportmonks determines the official bench size. Competitions and matchday
  // regulations differ, so a fixed count would turn a valid official sheet
  // into a perpetual preview.
  const confirmedBenchCards = benchAreUnique && officialBench.length > 0
    ? officialBench.map((member) => strictCardForOfficialMember(member, input.squadCards))
    : [];
  const coach = input.officialCoach
    && input.fixtureId
    && input.officialCoach.fixtureId === input.fixtureId
    && input.officialCoach.teamId === input.club.teamId
    && input.officialCoach.name.trim()
    ? input.officialCoach
    : null;
  const hasConfirmedTechnicalTeamSheet = hasConfirmedStartingEleven
    && coach !== null
    && officialBench.length > 0
    && confirmedBenchCards.length === officialBench.length
    && confirmedBenchCards.every(Boolean);
  const bench = hasConfirmedTechnicalTeamSheet
    ? confirmedBenchCards as ClubOwnerSquadCard[]
    : [];
  const displayedPlayerIds = [...new Set([
    ...lineup.players.map(({ card }) => card.id),
    ...bench.map((card) => card.id),
  ])];

  return {
    lineup,
    technical: {
      state: hasConfirmedTechnicalTeamSheet ? "confirmed" : "awaiting_official_team_sheet",
      coach: hasConfirmedTechnicalTeamSheet ? coach : null,
      bench,
    },
    displayedPlayerIds,
  };
}

import type { TouchlineFantasyLineupMember } from "../football-data/types.ts";
import { inferArenaRole, normalizeOfficialShirtNumber } from "../football-data/arena-lineup.ts";
import { type ClubOwnerSquadCard, type TouchLineClubVisual } from "./demo-data.ts";
import { touchlineCanonicalFormationSlots, type TouchlineFormationPitchSlot } from "./pitch-layout.ts";
import {
  isTouchlineTacticalSlotCandidateEligible,
  type TouchlineFormationGeometryRegistry,
} from "./formation-geometry.ts";

export type TouchLineClubLineupStatus = "confirmed" | "preview";

export const CLUB_HUB_SQUAD_PREVIEW_WINDOW_MS = 24 * 60 * 60 * 1_000;

const ABSOLUTE_ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const TERMINAL_FIXTURE_STATUS = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties|cancelled|canceled|abandoned|awarded|walkover)/i;

function parseAbsoluteIsoTimestamp(value: string | null | undefined) {
  const candidate = String(value ?? "").trim();
  const match = candidate.match(ABSOLUTE_ISO_TIMESTAMP);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second
  ) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isTerminalFixtureStatus(value: string | null | undefined) {
  return TERMINAL_FIXTURE_STATUS.test(String(value ?? "").trim());
}

/**
 * A provisional XI is labelled "Squad Preview" only during the final 24 hours
 * before its verified fixture. A confirmed XI always remains an official
 * line-up. A missing, malformed, local-time, or terminal fixture fails closed
 * to the neutral "Line-up" label.
 */
export function isClubHubSquadPreviewWindow(input: {
  lineupStatus: TouchLineClubLineupStatus;
  startsAt: string | null | undefined;
  /** Raw canonical provider status; never a localized presentation label. */
  fixtureStatus?: string | null;
  now?: number;
}) {
  if (input.lineupStatus === "confirmed") return false;
  const kickoff = parseAbsoluteIsoTimestamp(input.startsAt);
  const now = input.now ?? Date.now();
  if (kickoff === null || !Number.isFinite(now) || isTerminalFixtureStatus(input.fixtureStatus)) return false;

  // Once the final-24-hours window opens, a provisional XI remains clearly
  // labelled until the provider confirms it or the fixture reaches a terminal
  // state. This also covers the provider's short status lag at kick-off.
  return now >= kickoff - CLUB_HUB_SQUAD_PREVIEW_WINDOW_MS;
}

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
    /**
     * Nine distinct squad cards for the pre-match display. They are never
     * represented as an official bench; the persisted team sheet replaces
     * them as soon as its substitutes arrive.
     */
    previewBench: readonly ClubOwnerSquadCard[];
  }>;
  /** Every named player shown in the XI or the visible technical bench. */
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
 * team sheet (the provider's unique substitutes, plus a coach when supplied).
 * It never infers a coach,
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
    && officialBench.length > 0
    && confirmedBenchCards.length === officialBench.length
    && confirmedBenchCards.every(Boolean);
  const bench = hasConfirmedTechnicalTeamSheet
    ? confirmedBenchCards as ClubOwnerSquadCard[]
    : [];
  // A pre-match Club Hub is still useful before the official team sheet is
  // available. Keep nine real squad cards visible, but do not promote them to
  // the official bench DTO or claim they were selected for the fixture.
  const displayedStartingIds = new Set(lineup.players.map(({ card }) => String(card.id)));
  const previewBench = input.squadCards
    .filter((card) => !displayedStartingIds.has(String(card.id)))
    .slice(0, 9);
  const displayBench = hasConfirmedTechnicalTeamSheet ? bench : previewBench;
  const displayedPlayerIds = [...new Set([
    ...lineup.players.map(({ card }) => card.id),
    ...displayBench.map((card) => card.id),
  ])];

  return {
    lineup,
    technical: {
      state: hasConfirmedTechnicalTeamSheet ? "confirmed" : "awaiting_official_team_sheet",
      coach: hasConfirmedTechnicalTeamSheet ? coach : null,
      bench,
      previewBench,
    },
    displayedPlayerIds,
  };
}

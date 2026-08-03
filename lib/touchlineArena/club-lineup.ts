import type { TouchlineFantasyLineupMember } from "../football-data/types.ts";
import { inferArenaRole, makeArenaShortName, normalizeOfficialShirtNumber } from "../football-data/arena-lineup.ts";
import { findTouchLineClub, type ClubOwnerSquadCard, type TouchLineClubVisual } from "./demo-data.ts";
import { TOUCHLINE_STANDARD_433_SLOTS } from "./pitch-layout.ts";

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

const FORMATION_433_SLOTS = TOUCHLINE_STANDARD_433_SLOTS;

function normalizeIdentity(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function lineupMemberBelongsToClub(member: TouchlineFantasyLineupMember, club: TouchLineClubVisual) {
  if (member.teamId && String(member.teamId) === club.teamId) return true;
  const memberClub = findTouchLineClub(member.teamName);
  return memberClub?.teamId === club.teamId;
}

function cardForOfficialMember(
  member: TouchlineFantasyLineupMember,
  squadCards: ClubOwnerSquadCard[],
  club: TouchLineClubVisual,
): ClubOwnerSquadCard {
  const providerPlayerId = String(member.playerId ?? "").trim();
  const memberName = normalizeIdentity(member.playerName);
  const existing = squadCards.find((card) => (
    (providerPlayerId && String(card.id) === providerPlayerId) || normalizeIdentity(card.name) === memberName
  ));

  if (existing) {
    return {
      ...existing,
      role: inferArenaRole(member.position || existing.position),
      position: member.position || existing.position,
      shirtNumber: normalizeOfficialShirtNumber(member.jerseyNumber, existing.shirtNumber),
    };
  }

  return {
    id: providerPlayerId || member.providerId || `lineup-${memberName}`,
    name: member.playerName,
    shortName: makeArenaShortName(member.playerName),
    role: inferArenaRole(member.position),
    position: member.position || "MID",
    clubName: club.name,
    shirtNumber: normalizeOfficialShirtNumber(member.jerseyNumber),
    countryCode3: "N/A",
    marketValue: "Pending",
    marketValueSource: "unavailable",
    touchlinePoints: 0,
  };
}

function previewStartingEleven(squadCards: ClubOwnerSquadCard[]) {
  const available = [...squadCards];
  const chosen: ClubOwnerSquadCard[] = [];

  for (const slot of FORMATION_433_SLOTS) {
    const roleIndex = available.findIndex((card) => inferArenaRole(card.role || card.position) === slot.role);
    const selectedIndex = roleIndex >= 0 ? roleIndex : 0;
    const [card] = available.splice(selectedIndex, 1);
    if (card) chosen.push(card);
  }

  return chosen;
}

function arrangeCards(cards: ClubOwnerSquadCard[]) {
  const remaining = [...cards];
  return FORMATION_433_SLOTS.flatMap((slot) => {
    const roleIndex = remaining.findIndex((card) => inferArenaRole(card.role || card.position) === slot.role);
    const selectedIndex = roleIndex >= 0 ? roleIndex : 0;
    const [card] = remaining.splice(selectedIndex, 1);
    return card ? [{ card, x: slot.x, y: slot.y }] : [];
  });
}

export function buildTouchLineClubLineup(input: {
  club: TouchLineClubVisual;
  squadCards: ClubOwnerSquadCard[];
  officialLineup?: TouchlineFantasyLineupMember[];
  formation?: string | null;
}): TouchLineClubLineup {
  const officialStarters = (input.officialLineup ?? [])
    .filter((member) => member.isStarter && lineupMemberBelongsToClub(member, input.club));
  const hasConfirmedStartingEleven = officialStarters.length >= 11;
  const cards = hasConfirmedStartingEleven
    ? officialStarters.slice(0, 11).map((member) => cardForOfficialMember(member, input.squadCards, input.club))
    : previewStartingEleven(input.squadCards);

  return {
    status: hasConfirmedStartingEleven ? "confirmed" : "preview",
    formation: hasConfirmedStartingEleven && input.formation?.trim() ? input.formation.trim() : "4-3-3",
    players: arrangeCards(cards),
  };
}

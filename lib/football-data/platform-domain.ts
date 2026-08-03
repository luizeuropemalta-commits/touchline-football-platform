import type {
  TouchlineCoach,
  TouchlineCompetition,
  TouchlinePlayer,
  TouchlineSeason,
  TouchlineTeam,
  TouchlineTransfer,
} from "./types";

/**
 * Provider-neutral real-football contracts shared by TouchLine Platform
 * modules. They deliberately exclude every TouchLine Game concept.
 */
export type TouchlineExternalFootballId = Readonly<{
  provider: string;
  providerId: string;
}>;

export type TouchlineRealFootballPlayer = Readonly<{
  id: string;
  externalId: TouchlineExternalFootballId;
  name: string;
  displayName: string;
  position: string | null;
  currentClubId: string | null;
  currentClubName: string | null;
  nationality: string | null;
  photoUrl: string | null;
  marketValue: number | null;
  marketValueCurrency: string | null;
  realContractUntil: string | null;
}>;

export type TouchlineRealFootballClub = Readonly<{
  id: string;
  externalId: TouchlineExternalFootballId;
  name: string;
  shortCode: string | null;
  country: string | null;
  logoUrl: string | null;
}>;

export type TouchlineRealFootballCoach = Readonly<{
  id: string;
  externalId: TouchlineExternalFootballId;
  name: string;
  displayName: string;
  currentClubId: string | null;
  nationality: string | null;
  photoUrl: string | null;
}>;

export type TouchlineRealFootballCompetition = Readonly<{
  id: string;
  externalId: TouchlineExternalFootballId;
  name: string;
  type: string | null;
  country: string | null;
  logoUrl: string | null;
}>;

export type TouchlineRealFootballSeason = Readonly<{
  id: string;
  externalId: TouchlineExternalFootballId;
  name: string;
  competitionId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isCurrent: boolean | null;
}>;

export type TouchlineRealFootballTransfer = Readonly<{
  id: string;
  externalId: TouchlineExternalFootballId;
  playerId: string | null;
  fromClubId: string | null;
  toClubId: string | null;
  occurredOn: string | null;
  type: string | null;
  amount: number | null;
  currency: string | null;
}>;

export type TouchlinePlatformSearchResult =
  | Readonly<{ kind: "player"; entity: TouchlineRealFootballPlayer }>
  | Readonly<{ kind: "club"; entity: TouchlineRealFootballClub }>
  | Readonly<{ kind: "coach"; entity: TouchlineRealFootballCoach }>
  | Readonly<{ kind: "competition"; entity: TouchlineRealFootballCompetition }>;

const externalId = (value: { provider: string; providerId: string }): TouchlineExternalFootballId => ({
  provider: value.provider,
  providerId: value.providerId,
});

export function toTouchlineRealFootballPlayer(player: TouchlinePlayer): TouchlineRealFootballPlayer {
  return {
    id: player.id,
    externalId: externalId(player),
    name: player.name,
    displayName: player.displayName,
    position: player.position ?? null,
    currentClubId: player.currentTeamId ?? null,
    currentClubName: player.currentTeamName ?? null,
    nationality: player.nationality ?? null,
    photoUrl: player.photoUrl ?? null,
    marketValue: player.marketValue ?? null,
    marketValueCurrency: player.marketValueCurrency ?? null,
    realContractUntil: player.contractUntil ?? null,
  };
}

export function toTouchlineRealFootballClub(club: TouchlineTeam): TouchlineRealFootballClub {
  return {
    id: club.id,
    externalId: externalId(club),
    name: club.name,
    shortCode: club.shortCode ?? null,
    country: club.country ?? null,
    logoUrl: club.logoUrl ?? null,
  };
}

export function toTouchlineRealFootballCoach(coach: TouchlineCoach): TouchlineRealFootballCoach {
  return {
    id: coach.id,
    externalId: externalId(coach),
    name: coach.name,
    displayName: coach.displayName,
    currentClubId: coach.teamId ?? null,
    nationality: coach.nationality ?? null,
    photoUrl: coach.photoUrl ?? null,
  };
}

export function toTouchlineRealFootballCompetition(
  competition: TouchlineCompetition,
): TouchlineRealFootballCompetition {
  return {
    id: competition.id,
    externalId: externalId(competition),
    name: competition.name,
    type: competition.type ?? null,
    country: competition.country ?? null,
    logoUrl: competition.logoUrl ?? null,
  };
}

export function toTouchlineRealFootballSeason(season: TouchlineSeason): TouchlineRealFootballSeason {
  return {
    id: season.id,
    externalId: externalId(season),
    name: season.name,
    competitionId: season.competitionId ?? null,
    startsAt: season.startsAt ?? null,
    endsAt: season.endsAt ?? null,
    isCurrent: season.isCurrent ?? null,
  };
}

export function toTouchlineRealFootballTransfer(transfer: TouchlineTransfer): TouchlineRealFootballTransfer {
  return {
    id: transfer.id,
    externalId: externalId(transfer),
    playerId: transfer.playerId ?? null,
    fromClubId: transfer.fromTeamId ?? null,
    toClubId: transfer.toTeamId ?? null,
    occurredOn: transfer.date ?? null,
    type: transfer.type ?? null,
    amount: transfer.amount ?? null,
    currency: transfer.currency ?? null,
  };
}

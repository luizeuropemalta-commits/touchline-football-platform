import type { TouchlineCoach } from "../football-data/types";
import {
  classifyTouchlineCoach,
  type TouchlineCoachClassification,
  type TouchlineCoachClassificationInput,
} from "./coach-classification.ts";

export const TOUCHLINE_LIVE_COACHES_FETCHED_AT = "2026-07-27T00:00:00.000Z";

export type TouchlineLiveCoachLookup = Readonly<{
  coach: TouchlineCoach;
  countryCode3: string;
}>;

export type TouchlineLiveCoachSnapshot = TouchlineLiveCoachLookup &
  Readonly<{
    fetchedAt: string;
  }>;

type TouchlineLiveCoachSeed = Readonly<{
  teamId: string;
  name: string;
  coachId: string;
  nationality: string;
  countryId: string;
  countryCode3: string;
}>;

const TOUCHLINE_LIVE_COACH_SEEDS: readonly TouchlineLiveCoachSeed[] = [
  { teamId: "19", name: "Mikel Arteta", coachId: "307", nationality: "Spain", countryId: "32", countryCode3: "ESP" },
  { teamId: "15", name: "Unai Emery", coachId: "455907", nationality: "Spain", countryId: "32", countryCode3: "ESP" },
  { teamId: "52", name: "Marco Rose", coachId: "29710", nationality: "Germany", countryId: "11", countryCode3: "GER" },
  { teamId: "236", name: "Keith Andrews", coachId: "255", nationality: "Republic of Ireland", countryId: "455", countryCode3: "IRL" },
  { teamId: "78", name: "Fabian Hürzeler", coachId: "37679", nationality: "United States", countryId: "3483", countryCode3: "USA" },
  { teamId: "18", name: "Xabi Alonso", coachId: "511", nationality: "Spain", countryId: "32", countryCode3: "ESP" },
  { teamId: "117", name: "Frank Lampard", coachId: "95", nationality: "England", countryId: "462", countryCode3: "ENG" },
  { teamId: "51", name: "Pierre Sage", coachId: "37732840", nationality: "France", countryId: "17", countryCode3: "FRA" },
  { teamId: "13", name: "David Moyes", coachId: "455355", nationality: "Scotland", countryId: "1161", countryCode3: "SCO" },
  { teamId: "11", name: "Arbeloa", coachId: "515", nationality: "Spain", countryId: "32", countryCode3: "ESP" },
  { teamId: "22", name: "Sergej Jakirović", coachId: "74546", nationality: "Bosnia and Herzegovina", countryId: "507", countryCode3: "BIH" },
  { teamId: "116", name: "Gary O'Neil", coachId: "270", nationality: "England", countryId: "462", countryCode3: "ENG" },
  { teamId: "71", name: "Daniel Farke", coachId: "460535", nationality: "Germany", countryId: "11", countryCode3: "GER" },
  { teamId: "8", name: "Andoni Iraola", coachId: "19960388", nationality: "Spain", countryId: "32", countryCode3: "ESP" },
  { teamId: "9", name: "Enzo Maresca", coachId: "107439", nationality: "Italy", countryId: "251", countryCode3: "ITA" },
  { teamId: "14", name: "Michael Carrick", coachId: "645", nationality: "England", countryId: "462", countryCode3: "ENG" },
  { teamId: "20", name: "Eddie Howe", coachId: "523911", nationality: "England", countryId: "462", countryCode3: "ENG" },
  { teamId: "63", name: "Oliver Glasner", coachId: "51518", nationality: "Austria", countryId: "143", countryCode3: "AUT" },
  { teamId: "3", name: "Régis Le Bris", coachId: "529482", nationality: "France", countryId: "17", countryCode3: "FRA" },
  { teamId: "6", name: "Roberto De Zerbi", coachId: "127889", nationality: "Italy", countryId: "251", countryCode3: "ITA" },
] as const;

/**
 * Immutable opening-tier evidence for 2026/27.
 *
 * The completed 2025/26 Premier League table and manager register were
 * captured from the League's official publications. A position is supplied
 * only when that coach completed the season with that club. A current club is
 * never substituted for a new coach's previous record.
 *
 * Sources:
 * - https://www.premierleague.com/en/tables/premier-league/2025-26
 * - https://www.premierleague.com/en/managers
 * - https://www.premierleague.com/en/news/4673099/the-202627-premier-league-season-officially-starts
 */
const TOUCHLINE_COACH_2025_26_EVIDENCE: Readonly<
  Record<string, Omit<TouchlineCoachClassificationInput, "coachProviderId">>
> = Object.freeze({
  // Managers who completed the last Premier League season with this club.
  "307": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Arsenal FC", sourceSeasonId: "2025-26", finalPosition: 1 },
  "455907": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Aston Villa", sourceSeasonId: "2025-26", finalPosition: 4 },
  "255": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Brentford", sourceSeasonId: "2025-26", finalPosition: 9 },
  "37679": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Brighton & Hove Albion", sourceSeasonId: "2025-26", finalPosition: 8 },
  "455355": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Everton", sourceSeasonId: "2025-26", finalPosition: 13 },
  "460535": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Leeds United", sourceSeasonId: "2025-26", finalPosition: 14 },
  "523911": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Newcastle United", sourceSeasonId: "2025-26", finalPosition: 12 },
  "529482": { sourceLeagueId: "premier-league", sourceLeagueName: "Premier League", sourceClub: "Sunderland", sourceSeasonId: "2025-26", finalPosition: 7 },

  // The 2025/26 Championship promotion route is itself the documented
  // fallback rule. It never borrows a Premier League table position.
  "95": { sourceLeagueId: "championship", sourceLeagueName: "EFL Championship", sourceClub: "Coventry City", sourceSeasonId: "2025-26", promotionType: "champions" },
  "74546": { sourceLeagueId: "championship", sourceLeagueName: "EFL Championship", sourceClub: "Hull City", sourceSeasonId: "2025-26", promotionType: "playoff-winners" },
});

function createLiveCoachSnapshot(seed: TouchlineLiveCoachSeed): TouchlineLiveCoachSnapshot {
  const raw = Object.freeze({
    id: Number(seed.coachId),
    display_name: seed.name,
    country_id: Number(seed.countryId),
    team_id: Number(seed.teamId),
    country: Object.freeze({
      id: Number(seed.countryId),
      name: seed.nationality,
    }),
  });
  const source = Object.freeze({
    provider: "sportmonks" as const,
    providerId: seed.coachId,
    raw,
    lastSyncedAt: TOUCHLINE_LIVE_COACHES_FETCHED_AT,
  });
  const coach: TouchlineCoach = Object.freeze({
    id: `sportmonks:${seed.coachId}`,
    providerId: seed.coachId,
    provider: "sportmonks",
    name: seed.name,
    displayName: seed.name,
    nationality: seed.nationality,
    countryId: seed.countryId,
    teamId: seed.teamId,
    source,
  });

  return Object.freeze({
    coach,
    countryCode3: seed.countryCode3,
    fetchedAt: TOUCHLINE_LIVE_COACHES_FETCHED_AT,
  });
}

export const TOUCHLINE_LIVE_COACHES_BY_TEAM: Readonly<Record<string, TouchlineLiveCoachSnapshot>> =
  Object.freeze(
    Object.fromEntries(
      TOUCHLINE_LIVE_COACH_SEEDS.map((seed) => [seed.teamId, createLiveCoachSnapshot(seed)]),
    ),
  );

/**
 * The selectable England coach registry. It deliberately reuses the same
 * Sportmonks snapshots consumed by Match Centre; Arena never manufactures a
 * second coach identity for ClubOwners.
 */
export const TOUCHLINE_LIVE_COACHES: readonly TouchlineLiveCoachSnapshot[] = Object.freeze(
  TOUCHLINE_LIVE_COACH_SEEDS.map(createLiveCoachSnapshot),
);

/**
 * The live registry deliberately does not manufacture historical league-table
 * records. Until an auditable last complete season is imported, each coach is
 * classified through the explicitly approved Sapphire Blue pending fallback.
 */
export const TOUCHLINE_LIVE_COACH_CLASSIFICATIONS: Readonly<Record<string, TouchlineCoachClassification>> = Object.freeze(
  Object.fromEntries(
    TOUCHLINE_LIVE_COACHES.map(({ coach }) => [
      coach.providerId,
      classifyTouchlineCoach({
        coachProviderId: coach.providerId,
        ...TOUCHLINE_COACH_2025_26_EVIDENCE[coach.providerId],
      }),
    ]),
  ),
);

export function touchlineLiveCoachForProviderId(
  providerId: string | number | null | undefined,
): TouchlineLiveCoachLookup | null {
  const normalizedProviderId = String(providerId ?? "").trim();
  if (!normalizedProviderId) return null;

  const snapshot = TOUCHLINE_LIVE_COACHES.find(
    (candidate) => candidate.coach.providerId === normalizedProviderId,
  );
  if (!snapshot) return null;

  return {
    coach: snapshot.coach,
    countryCode3: snapshot.countryCode3,
  };
}

export function touchlineCoachClassificationForProviderId(
  providerId: string | number | null | undefined,
) {
  const normalizedProviderId = String(providerId ?? "").trim();
  return normalizedProviderId ? TOUCHLINE_LIVE_COACH_CLASSIFICATIONS[normalizedProviderId] ?? null : null;
}

export function touchlineLiveCoachForTeam(
  teamId: string | number | null | undefined,
): TouchlineLiveCoachLookup | null {
  const normalizedTeamId = String(teamId ?? "").trim();
  const snapshot = TOUCHLINE_LIVE_COACHES_BY_TEAM[normalizedTeamId];
  if (!snapshot) return null;

  return {
    coach: snapshot.coach,
    countryCode3: snapshot.countryCode3,
  };
}

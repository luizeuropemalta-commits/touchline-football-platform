import { normalizeOfficialShirtNumber } from "./arena-lineup.ts";

export type OfficialShirtNumberSource =
  | "provider"
  | "club-verified"
  | "verified-cache"
  | "unassigned";

type ClubVerifiedShirtNumber = {
  providerId: string;
  clubTeamId: string;
  shirtNumber: number;
  verifiedAt: string;
  sourceUrl: string;
};

const CLUB_VERIFIED_SHIRT_NUMBERS: ClubVerifiedShirtNumber[] = [
  {
    providerId: "37567285",
    clubTeamId: "51",
    shirtNumber: 11,
    verifiedAt: "2026-07-24",
    sourceUrl: "https://www.cpfc.co.uk/news/first-team/revealed-matheus-franca-crystal-palace-squad-number/",
  },
  {
    providerId: "37537859",
    clubTeamId: "51",
    shirtNumber: 63,
    verifiedAt: "2026-07-24",
    sourceUrl: "https://www.cpfc.co.uk/teams/first-team/goalkeeper/owen-goodman/",
  },
];

const CLUB_VERIFIED_SHIRT_NUMBER_LOOKUP = new Map(
  CLUB_VERIFIED_SHIRT_NUMBERS.map((entry) => [`${entry.clubTeamId}:${entry.providerId}`, entry] as const),
);

export function resolveOfficialShirtNumber(input: {
  providerId?: string | number | null;
  clubTeamId?: string | number | null;
  providerValues?: unknown[];
  cachedValues?: unknown[];
  cachedVerifiedAt?: string | null;
}) {
  const providerNumber = normalizeOfficialShirtNumber(...(input.providerValues ?? []));
  if (providerNumber) {
    return {
      shirtNumber: providerNumber,
      source: "provider" as const,
      verifiedAt: null,
      sourceUrl: null,
    };
  }

  const providerId = String(input.providerId ?? "").trim();
  const clubTeamId = String(input.clubTeamId ?? "").trim();
  const verified = CLUB_VERIFIED_SHIRT_NUMBER_LOOKUP.get(`${clubTeamId}:${providerId}`);
  if (verified) {
    return {
      shirtNumber: verified.shirtNumber,
      source: "club-verified" as const,
      verifiedAt: verified.verifiedAt,
      sourceUrl: verified.sourceUrl,
    };
  }

  const cachedNumber = normalizeOfficialShirtNumber(...(input.cachedValues ?? []));
  if (cachedNumber) {
    return {
      shirtNumber: cachedNumber,
      source: "verified-cache" as const,
      verifiedAt: input.cachedVerifiedAt ?? null,
      sourceUrl: null,
    };
  }

  return {
    shirtNumber: null,
    source: "unassigned" as const,
    verifiedAt: null,
    sourceUrl: null,
  };
}

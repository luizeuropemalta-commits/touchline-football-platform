import {
  resolveTouchLineOfficialLookup,
  touchlinePlayerProfileHref,
} from "../lib/touchlineArena/player-links.ts";
import { resolveTouchLinePlayerProfile } from "../lib/touchlineArena/player-profile.ts";

const MINIMUM_SQUAD_SIZE = 18;
const expectedPlayerCount = Number.parseInt(process.env.TOUCHLINE_EXPECTED_PLAYER_COUNT ?? "", 10);
// The standard local TouchLine development server runs on 3000. CI and
// alternate local ports can still opt in through TOUCHLINE_AUDIT_BASE_URL.
const baseUrl = process.env.TOUCHLINE_AUDIT_BASE_URL || "http://127.0.0.1:3000";

const clubs = [
  ["19", "Arsenal FC", "ARS"],
  ["15", "Aston Villa", "AVL"],
  ["52", "AFC Bournemouth", "BOU"],
  ["236", "Brentford FC", "BRE"],
  ["78", "Brighton & Hove Albion", "BHA"],
  ["18", "Chelsea FC", "CHE"],
  ["117", "Coventry City", "COV"],
  ["51", "Crystal Palace", "CRY"],
  ["13", "Everton FC", "EVE"],
  ["11", "Fulham FC", "FUL"],
  ["22", "Hull City", "HUL"],
  ["116", "Ipswich Town", "IPS"],
  ["71", "Leeds United", "LEE"],
  ["8", "Liverpool FC", "LIV"],
  ["9", "Manchester City", "MCI"],
  ["14", "Manchester United", "MUN"],
  ["20", "Newcastle United", "NEW"],
  ["63", "Nottingham Forest", "NFO"],
  ["3", "Sunderland AFC", "SUN"],
  ["6", "Tottenham Hotspur", "TOT"],
] as const;

type SquadPlayer = {
  providerId?: string | number | null;
  name?: string | null;
  clubName?: string | null;
  position?: string | null;
  shirtNumber?: string | number | null;
  countryCode3?: string | null;
};

type SquadPayload = {
  players?: SquadPlayer[];
  pendingPlayers?: SquadPlayer[];
  dataQuality?: {
    totalPlayers?: number;
    cardEligiblePlayers?: number;
    awaitingShirtNumberPlayers?: number;
  };
};

const failures: string[] = [];
const allPlayers: Array<SquadPlayer & { sourceClub: string }> = [];

for (const [teamId, clubName, clubShortCode] of clubs) {
  const endpoint = new URL("/api/football-data/premier-squad", baseUrl);
  endpoint.searchParams.set("teamId", teamId);
  endpoint.searchParams.set("clubName", clubName);
  endpoint.searchParams.set("clubShortCode", clubShortCode);

  const response = await fetch(endpoint);
  if (!response.ok) {
    failures.push(`${clubName}: squad endpoint returned ${response.status}.`);
    continue;
  }

  const payload = await response.json() as SquadPayload;
  // A player awaiting a verified shirt number cannot be offered as a card,
  // but is still an active footballer whose identity and profile link must be
  // audited. Do not silently turn a card-eligibility boundary into missing
  // roster data.
  const players = [
    ...(Array.isArray(payload.players) ? payload.players : []),
    ...(Array.isArray(payload.pendingPlayers) ? payload.pendingPlayers : []),
  ];
  const reportedTotal = payload.dataQuality?.totalPlayers;
  if (Number.isInteger(reportedTotal) && reportedTotal !== players.length) {
    failures.push(`${clubName}: data-quality total ${reportedTotal} does not equal ${players.length} returned active players.`);
  }
  if (!players.length) failures.push(`${clubName}: squad is empty.`);
  if (players.length > 0 && players.length < MINIMUM_SQUAD_SIZE) {
    failures.push(`${clubName}: squad has only ${players.length} players; expected at least ${MINIMUM_SQUAD_SIZE}.`);
  }

  for (const player of players) {
    const providerId = String(player.providerId ?? "").trim();
    const name = String(player.name ?? "").trim();
    if (!name) failures.push(`${clubName}: player without a name.`);
    if (!/^\d+$/.test(providerId)) {
      failures.push(`${clubName}: ${name || "unknown player"} has invalid provider id ${providerId || "(empty)"}.`);
    }

    const href = touchlinePlayerProfileHref({
      sportmonksPlayerId: providerId,
      name,
      clubName: player.clubName || clubName,
      position: player.position,
      shirtNumber: player.shirtNumber,
      countryCode3: player.countryCode3,
    }, "pt-BR");
    const profileUrl = new URL(href, baseUrl);
    if (!profileUrl.pathname.startsWith("/touchline-players/") || profileUrl.searchParams.get("playerId") !== providerId) {
      failures.push(`${clubName}: ${name || providerId} generated an invalid profile link.`);
    }

    const playerKey = profileUrl.pathname.split("/").filter(Boolean).at(-1) ?? "player";
    const resolvedProfile = resolveTouchLinePlayerProfile(
      playerKey,
      Object.fromEntries(profileUrl.searchParams.entries()),
    );
    const officialLookup = resolveTouchLineOfficialLookup({
      providerPlayerId: profileUrl.searchParams.get("playerId"),
      requestedName: profileUrl.searchParams.get("name"),
      fallbackName: resolvedProfile.card.name,
    });
    if (officialLookup.providerPlayerId !== providerId || officialLookup.name !== name) {
      failures.push(
        `${clubName}: ${name || providerId} changes official identity after local card resolution `
        + `(resolved as ${officialLookup.name || "(empty)"} / ${officialLookup.providerPlayerId || "(empty)"}).`,
      );
    }

    allPlayers.push({ ...player, providerId, name, sourceClub: clubName });
  }

  console.log(`${clubShortCode}: ${players.length} players`);
}

if (Number.isInteger(expectedPlayerCount) && expectedPlayerCount > 0 && allPlayers.length !== expectedPlayerCount) {
  failures.push(`Expected ${expectedPlayerCount} players, received ${allPlayers.length}.`);
}

const playersByProviderId = new Map<string, Array<SquadPlayer & { sourceClub: string }>>();
for (const player of allPlayers) {
  const providerId = String(player.providerId);
  playersByProviderId.set(providerId, [...(playersByProviderId.get(providerId) ?? []), player]);
}

for (const [providerId, players] of playersByProviderId) {
  if (players.length > 1) {
    failures.push(`Provider id ${providerId} appears in multiple squads: ${players.map((player) => player.sourceClub).join(", ")}.`);
  }
}

if (failures.length) {
  console.error("\nPlayer-profile audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `\nPlayer-profile audit passed: ${clubs.length} clubs, ${allPlayers.length} unique players, valid links and stable official identities.`,
  );
}

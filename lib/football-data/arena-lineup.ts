import type { TouchlinePublicFantasyLineupMember } from "./public-fantasy-fixture";
import type { TouchlineCardTierKey } from "../touchlineArena/card-rules";
import type { TouchlinePublicEditorialCardPresentation } from "../touchlineArena/editorial-card-profile";

export type ArenaLineupRole = "forward" | "midfielder" | "defender" | "goalkeeper";

export type ArenaLineupPlayer = {
  id: string;
  name: string;
  shortName: string;
  role: ArenaLineupRole;
  asset?: string;
  card?: {
    templateUrl: string;
    frameUrl?: string | null;
    playerName: string;
    shirtNumber?: string | number | null;
    clubName: string;
    clubLogoUrl?: string | null;
    position?: string | null;
    countryCode3?: string | null;
    flagUrl?: string | null;
    fantasyPoints?: string | number | null;
    marketValue?: string | null;
    marketValueSource?: "provider" | "verified-cache" | "unavailable" | null;
    /** Server-owned public value state. Never infer it from a display string. */
    marketValueState?: "verified" | "pending" | "unavailable" | "error" | null;
    /** Server-owned public classification state paired with marketValueState. */
    classificationState?: "verified" | "pending" | "unavailable" | "error" | null;
    cardTier?: TouchlineCardTierKey | null;
    cardPriceVersion?: string | null;
    /** Only active server-side contracts may freeze the card classification. */
    cardPriceAuthority?: "active-contract" | null;
    /** Canonical public presentation published by the editorial card workflow. */
    editorialCard?: TouchlinePublicEditorialCardPresentation | null;
    inventoryId?: string | null;
    matchStats?: Partial<Record<"goals" | "assists" | "defense" | "cleanSheets" | "cards", string | number | null>>;
  };
  x: number;
  y: number;
  heightVh: number;
};

export const APPROVED_ARENA_PLAYER_ASSETS: Record<string, string> = {
  "aaron-ramsdale": "/touchlineArena/players/aaron-ramsdale/arsenal/v1/approved/field/full-body/transparent.png",
  "bukayo-saka": "/touchlineArena/players/bukayo-saka/arsenal/v1/approved/field/full-body/transparent.png",
  "declan-rice": "/touchlineArena/players/declan-rice/arsenal/v1/approved/field/full-body/transparent.png",
  "gabriel-magalhaes": "/touchlineArena/players/gabriel-magalhaes/arsenal/v1/approved/field/full-body/transparent.png",
  haaland: "/touchlineArena/players/haaland/man-city/v1/approved/full_body_static_transparent.png",
  "ibrahima-konate": "/touchlineArena/players/ibrahima-konate/liverpool/v1/approved/field/full-body/transparent.png",
  "martin-odegaard": "/touchlineArena/players/martin-odegaard/arsenal/v1/approved/field/full-body/transparent.png",
  "mohamed-salah": "/touchlineArena/players/mohamed-salah/liverpool/v1/approved/field/full-body/transparent.png",
  "son-heung-min": "/touchlineArena/players/son-heung-min/tottenham/v1/approved/field/full-body/transparent.png",
  "trent-alexander-arnold": "/touchlineArena/players/trent-alexander-arnold/liverpool/v1/approved/field/full-body/transparent.png",
  "william-saliba": "/touchlineArena/players/william-saliba/arsenal/v1/approved/field/full-body/transparent.png",
};

const roleSlots: Record<ArenaLineupRole, Array<Omit<ArenaLineupPlayer, "id" | "name" | "shortName" | "role" | "asset">>> = {
  goalkeeper: [{ x: 50, y: 39, heightVh: 11 }],
  defender: [
    { x: 30, y: 52, heightVh: 15 },
    { x: 44, y: 49, heightVh: 14 },
    { x: 56, y: 49, heightVh: 14 },
    { x: 70, y: 52, heightVh: 15 },
    { x: 50, y: 50, heightVh: 14 },
  ],
  midfielder: [
    { x: 38, y: 62, heightVh: 19 },
    { x: 50, y: 60, heightVh: 19 },
    { x: 62, y: 62, heightVh: 19 },
    { x: 44, y: 66, heightVh: 20 },
    { x: 56, y: 66, heightVh: 20 },
  ],
  forward: [
    { x: 36, y: 72, heightVh: 24 },
    { x: 50, y: 75, heightVh: 26 },
    { x: 64, y: 72, heightVh: 24 },
    { x: 43, y: 76, heightVh: 25 },
    { x: 57, y: 76, heightVh: 25 },
  ],
};

const genericSlots: Array<Omit<ArenaLineupPlayer, "id" | "name" | "shortName" | "role" | "asset">> = [
  ...roleSlots.forward,
  ...roleSlots.midfielder,
  ...roleSlots.defender,
  ...roleSlots.goalkeeper,
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function inferArenaRole(position?: string): ArenaLineupRole {
  const normalized = (position ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const compact = normalized.replace(/\s+/g, "");
  const tokens = normalized.split(" ").filter(Boolean);

  if (includesAny(normalized, ["goalkeeper", "keeper", "goleiro"]) || tokens.includes("gk") || compact === "goalie") return "goalkeeper";
  if (
    includesAny(normalized, ["defender", "centre back", "center back", "full back", "wing back", "zagueiro", "lateral"]) ||
    ["cb", "lb", "rb", "lcb", "rcb", "lwb", "rwb", "df"].some((term) => tokens.includes(term) || compact === term)
  ) {
    return "defender";
  }
  if (
    includesAny(normalized, ["forward", "attacker", "striker", "winger", "ponta", "atacante", "centroavante"]) ||
    ["st", "cf", "fw", "att", "lw", "rw", "lf", "rf"].some((term) => tokens.includes(term) || compact === term)
  ) {
    return "forward";
  }
  return "midfielder";
}

export function makeArenaShortName(name: string) {
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  if (pieces.length <= 1) return pieces[0] ?? "Player";

  const last = pieces.at(-1) ?? pieces[0];
  if (last.length <= 3 && pieces.length > 2) return `${pieces[0][0]}. ${pieces.at(-2)}`;
  return last;
}

export function normalizeOfficialShirtNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 99) return parsed;
  }

  return null;
}

export function findApprovedArenaAsset(playerName: string) {
  const slug = slugify(playerName);
  if (APPROVED_ARENA_PLAYER_ASSETS[slug]) return APPROVED_ARENA_PLAYER_ASSETS[slug];

  const entry = Object.entries(APPROVED_ARENA_PLAYER_ASSETS).find(([knownSlug]) => {
    return slug.includes(knownSlug) || knownSlug.includes(slug);
  });

  return entry?.[1];
}

export function buildArenaPlayersFromFantasyLineup(lineups: readonly Pick<
  TouchlinePublicFantasyLineupMember,
  "playerId" | "playerName" | "position" | "isStarter"
>[]) {
  const starters = lineups.filter((player) => player.isStarter);
  const sourcePlayers = (starters.length >= 11 ? starters : lineups).slice(0, 11);
  const roleCounts: Record<ArenaLineupRole, number> = {
    defender: 0,
    forward: 0,
    goalkeeper: 0,
    midfielder: 0,
  };

  return sourcePlayers.map((player, index): ArenaLineupPlayer => {
    const name = player.playerName || `Player ${index + 1}`;
    const role = inferArenaRole(player.position);
    const slotIndex = roleCounts[role]++;
    const slot = roleSlots[role][slotIndex] ?? genericSlots[index] ?? genericSlots.at(-1)!;

    return {
      id: player.playerId ? `sportmonks-${player.playerId}` : `sportmonks-lineup-${index + 1}-${slugify(name)}`,
      name,
      shortName: makeArenaShortName(name),
      role,
      asset: findApprovedArenaAsset(name),
      ...slot,
    };
  });
}

import {
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "./card-rules.ts";

export const TOUCHLINE_POSITION_RANKING_GROUPS = [
  "goalkeeper",
  "centre-back",
  "full-back",
  "midfielder",
  "winger",
  "striker",
] as const;

export type TouchlinePositionRankingGroup = (typeof TOUCHLINE_POSITION_RANKING_GROUPS)[number];

export const TOUCHLINE_POSITION_RANKING_LABELS: Record<TouchlinePositionRankingGroup, { en: string; pt: string }> = {
  goalkeeper: { en: "Goalkeepers", pt: "Goleiros" },
  "centre-back": { en: "Centre-backs", pt: "Zagueiros" },
  "full-back": { en: "Full-backs", pt: "Laterais" },
  midfielder: { en: "Midfielders", pt: "Meio-campistas" },
  winger: { en: "Wingers", pt: "Pontas" },
  striker: { en: "Strikers", pt: "Centroavantes" },
};

export const TOUCHLINE_POSITIONAL_TIER_ORDER: readonly TouchlineCardTierKey[] = [
  "diamond-gold",
  "clear-diamond",
  "emerald-green",
  "radiant-gold",
  "amethyst-purple",
  "sapphire-blue",
  "ruby-red",
];

export type TouchlineRankingSnapshotStatus = "draft" | "audited" | "published";

export type TouchlineRankingPlayerInput = {
  playerId: string;
  providerPlayerId?: string | number | null;
  name: string;
  clubName: string;
  position?: string | null;
  role?: string | null;
  touchlinePoints: number;
  roundPoints?: number | null;
  minutesPlayed?: number | null;
  appearances?: number | null;
};

export type TouchlineRankedPlayer = TouchlineRankingPlayerInput & {
  positionGroup: TouchlinePositionRankingGroup;
  positionRank: number;
  groupSize: number;
  tierKey: TouchlineCardTierKey;
  priceTc: number;
};

export type TouchlinePositionRanking = {
  group: TouchlinePositionRankingGroup;
  players: TouchlineRankedPlayer[];
};

export type TouchlineRankingSnapshot = {
  snapshotId: string;
  roundId: string;
  status: TouchlineRankingSnapshotStatus;
  generatedAt: string;
  source: "simulation" | "sportmonks" | "sportmonks-audited";
  positions: TouchlinePositionRanking[];
  players: TouchlineRankedPlayer[];
};

const POSITION_ALIASES: Array<[TouchlinePositionRankingGroup, RegExp]> = [
  ["goalkeeper", /^(gk|g|goalkeeper|goalie|keeper)$/i],
  ["full-back", /^(lb|rb|lwb|rwb|fb|left back|right back|full.?back|wing.?back)$/i],
  ["centre-back", /^(cb|lcb|rcb|centre.?back|center.?back|central defender)$/i],
  ["winger", /^(lw|rw|lf|rf|left wing|right wing|winger)$/i],
  ["striker", /^(st|cf|ss|striker|centre.?forward|center.?forward|forward|attacker)$/i],
  ["midfielder", /^(dm|cdm|cm|am|cam|lm|rm|mid|midfield|midfielder)$/i],
];

function finiteNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function finiteNonNegative(value?: number | null) {
  return Math.max(0, finiteNumber(value));
}

function stablePlayerKey(player: TouchlineRankingPlayerInput) {
  return String(player.providerPlayerId ?? player.playerId).trim().toLowerCase();
}

export function touchlinePositionRankingGroupFor(
  position?: string | null,
  role?: string | null,
): TouchlinePositionRankingGroup {
  const normalizedPosition = String(position || "").trim();
  const directMatch = POSITION_ALIASES.find(([, pattern]) => pattern.test(normalizedPosition));
  if (directMatch) return directMatch[0];

  const normalizedRole = String(role || "").trim();
  if (/goal/i.test(normalizedRole)) return "goalkeeper";
  if (/wing/i.test(normalizedRole)) return "winger";
  if (/forward|attack|striker/i.test(normalizedRole)) return "striker";
  if (/defend|back/i.test(normalizedRole)) return "centre-back";
  return "midfielder";
}

export function compareTouchlineRankingPlayers(
  first: TouchlineRankingPlayerInput,
  second: TouchlineRankingPlayerInput,
) {
  const pointDifference = finiteNumber(second.touchlinePoints) - finiteNumber(first.touchlinePoints);
  if (pointDifference) return pointDifference;

  const minuteDifference = finiteNonNegative(second.minutesPlayed) - finiteNonNegative(first.minutesPlayed);
  if (minuteDifference) return minuteDifference;

  const appearanceDifference = finiteNonNegative(second.appearances) - finiteNonNegative(first.appearances);
  if (appearanceDifference) return appearanceDifference;

  return stablePlayerKey(first).localeCompare(stablePlayerKey(second), "en");
}

export function touchlineTierForPositionRank(positionRank: number, groupSize: number): TouchlineCardTierKey {
  if (positionRank <= 1) return "diamond-gold";
  if (groupSize <= 1) return "diamond-gold";

  const remainingPlayers = groupSize - 1;
  const zeroBasedRankAfterLeader = Math.min(remainingPlayers - 1, Math.max(0, positionRank - 2));
  const remainingTierIndex = Math.min(
    TOUCHLINE_POSITIONAL_TIER_ORDER.length - 2,
    Math.floor((zeroBasedRankAfterLeader * (TOUCHLINE_POSITIONAL_TIER_ORDER.length - 1)) / remainingPlayers),
  );

  return TOUCHLINE_POSITIONAL_TIER_ORDER[remainingTierIndex + 1];
}

export function buildTouchlinePositionRankings(
  players: readonly TouchlineRankingPlayerInput[],
): TouchlinePositionRanking[] {
  const seenPlayerIds = new Set<string>();

  for (const player of players) {
    const playerId = player.playerId.trim();
    if (!playerId) throw new Error("Every ranked player must have a playerId.");
    if (seenPlayerIds.has(playerId)) throw new Error(`Duplicate playerId in ranking input: ${playerId}`);
    seenPlayerIds.add(playerId);
  }

  return TOUCHLINE_POSITION_RANKING_GROUPS.map((group) => {
    const groupedPlayers = players
      .filter((player) => touchlinePositionRankingGroupFor(player.position, player.role) === group)
      .sort(compareTouchlineRankingPlayers);
    const groupSize = groupedPlayers.length;

    return {
      group,
      players: groupedPlayers.map((player, index) => {
        const positionRank = index + 1;
        const tierKey = touchlineTierForPositionRank(positionRank, groupSize);
        const tier = touchlineArenaTierForKey(tierKey);
        if (!tier) throw new Error(`Missing TouchLine card tier: ${tierKey}`);

        return {
          ...player,
          touchlinePoints: finiteNumber(player.touchlinePoints),
          roundPoints: finiteNumber(player.roundPoints),
          minutesPlayed: finiteNonNegative(player.minutesPlayed),
          appearances: finiteNonNegative(player.appearances),
          positionGroup: group,
          positionRank,
          groupSize,
          tierKey,
          priceTc: tier.retailPriceTc,
        };
      }),
    };
  });
}

export function buildTouchlineRankingSnapshot(input: {
  snapshotId: string;
  roundId: string;
  status?: TouchlineRankingSnapshotStatus;
  generatedAt: string;
  source?: TouchlineRankingSnapshot["source"];
  players: readonly TouchlineRankingPlayerInput[];
}): TouchlineRankingSnapshot {
  const positions = buildTouchlinePositionRankings(input.players);

  return {
    snapshotId: input.snapshotId,
    roundId: input.roundId,
    status: input.status ?? "draft",
    generatedAt: input.generatedAt,
    source: input.source ?? "simulation",
    positions,
    players: positions.flatMap((position) => position.players),
  };
}

export function touchlineRankingSnapshotCanGoLive(snapshot: TouchlineRankingSnapshot) {
  return snapshot.status === "published" && snapshot.source === "sportmonks-audited";
}

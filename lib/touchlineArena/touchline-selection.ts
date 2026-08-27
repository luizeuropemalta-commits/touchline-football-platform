import {
  type TouchlinePositionRankingGroup,
  type TouchlineRankedPlayer,
  type TouchlineRankingSnapshot,
} from "./card-ranking.ts";

export const TOUCHLINE_SELECTION_FORMATION = "4-3-3";
export const TOUCHLINE_SELECTION_VERSION = "touchline-selection-4-3-3-v2";

export type TouchlineSelectionSlot = {
  id: string;
  label: string;
  group: TouchlinePositionRankingGroup;
  groupIndex: number;
  side?: "left" | "right";
  x: number;
  y: number;
};

export type TouchlineSelectionPlayer = TouchlineSelectionSlot & {
  player: TouchlineRankedPlayer;
};

export type TouchlineSelection = {
  sourceSnapshotId: string;
  formation: typeof TOUCHLINE_SELECTION_FORMATION;
  version: typeof TOUCHLINE_SELECTION_VERSION;
  complete: boolean;
  missingSlots: readonly string[];
  players: readonly TouchlineSelectionPlayer[];
};

export const TOUCHLINE_SELECTION_SLOTS: readonly TouchlineSelectionSlot[] = [
  { id: "gk", label: "GK", group: "goalkeeper", groupIndex: 0, x: 50, y: 88 },
  { id: "lb", label: "LB", group: "full-back", groupIndex: 0, side: "left", x: 15, y: 66 },
  { id: "lcb", label: "LCB", group: "centre-back", groupIndex: 0, x: 38, y: 70 },
  { id: "rcb", label: "RCB", group: "centre-back", groupIndex: 1, x: 62, y: 70 },
  { id: "rb", label: "RB", group: "full-back", groupIndex: 1, side: "right", x: 85, y: 66 },
  { id: "lcm", label: "LCM", group: "midfielder", groupIndex: 0, x: 29, y: 43 },
  { id: "cm", label: "CM", group: "midfielder", groupIndex: 1, x: 50, y: 49 },
  { id: "rcm", label: "RCM", group: "midfielder", groupIndex: 2, x: 71, y: 43 },
  { id: "lw", label: "LW", group: "winger", groupIndex: 0, side: "left", x: 18, y: 18 },
  { id: "st", label: "ST", group: "striker", groupIndex: 0, x: 50, y: 12 },
  { id: "rw", label: "RW", group: "winger", groupIndex: 1, side: "right", x: 82, y: 18 },
];

function normalizedPosition(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function playerSide(player: TouchlineRankedPlayer): "left" | "right" | null {
  const position = normalizedPosition(player.position);
  if (/^(lb|lwb|lw|lf)$/.test(position) || /\bleft\b/.test(position)) return "left";
  if (/^(rb|rwb|rw|rf)$/.test(position) || /\bright\b/.test(position)) return "right";
  return null;
}

function playerForSlot(
  slot: TouchlineSelectionSlot,
  rankedPlayers: readonly TouchlineRankedPlayer[],
  usedPlayerIds: ReadonlySet<string>,
) {
  const available = rankedPlayers.filter((player) => !usedPlayerIds.has(player.playerId));
  if (!slot.side) return available[0];

  return available.find((player) => playerSide(player) === slot.side)
    ?? available.find((player) => playerSide(player) === null)
    ?? available[0];
}

export function buildTouchlineSelection(snapshot: TouchlineRankingSnapshot): TouchlineSelection {
  const players: TouchlineSelectionPlayer[] = [];
  const missingSlots: string[] = [];
  const usedPlayerIds = new Set<string>();

  for (const slot of TOUCHLINE_SELECTION_SLOTS) {
    const rankedPlayers = snapshot.positions.find((position) => position.group === slot.group)?.players ?? [];
    const player = playerForSlot(slot, rankedPlayers, usedPlayerIds);
    if (!player) {
      missingSlots.push(slot.id);
      continue;
    }
    usedPlayerIds.add(player.playerId);
    players.push({ ...slot, player });
  }

  return {
    sourceSnapshotId: snapshot.snapshotId,
    formation: TOUCHLINE_SELECTION_FORMATION,
    version: TOUCHLINE_SELECTION_VERSION,
    complete: missingSlots.length === 0,
    missingSlots,
    players,
  };
}

import {
  type TouchlinePositionRankingGroup,
  type TouchlineRankedPlayer,
  type TouchlineRankingSnapshot,
} from "./card-ranking.ts";

export const TOUCHLINE_SELECTION_FORMATION = "4-3-3";
export const TOUCHLINE_SELECTION_VERSION = "touchline-selection-4-3-3-v1";

export type TouchlineSelectionSlot = {
  id: string;
  label: string;
  group: TouchlinePositionRankingGroup;
  groupIndex: number;
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
  { id: "lb", label: "LB", group: "full-back", groupIndex: 0, x: 15, y: 66 },
  { id: "lcb", label: "LCB", group: "centre-back", groupIndex: 0, x: 38, y: 70 },
  { id: "rcb", label: "RCB", group: "centre-back", groupIndex: 1, x: 62, y: 70 },
  { id: "rb", label: "RB", group: "full-back", groupIndex: 1, x: 85, y: 66 },
  { id: "lcm", label: "LCM", group: "midfielder", groupIndex: 0, x: 29, y: 43 },
  { id: "cm", label: "CM", group: "midfielder", groupIndex: 1, x: 50, y: 49 },
  { id: "rcm", label: "RCM", group: "midfielder", groupIndex: 2, x: 71, y: 43 },
  { id: "lw", label: "LW", group: "winger", groupIndex: 0, x: 18, y: 18 },
  { id: "st", label: "ST", group: "striker", groupIndex: 0, x: 50, y: 12 },
  { id: "rw", label: "RW", group: "winger", groupIndex: 1, x: 82, y: 18 },
];

export function buildTouchlineSelection(snapshot: TouchlineRankingSnapshot): TouchlineSelection {
  const players: TouchlineSelectionPlayer[] = [];
  const missingSlots: string[] = [];

  for (const slot of TOUCHLINE_SELECTION_SLOTS) {
    const player = snapshot.positions.find((position) => position.group === slot.group)?.players[slot.groupIndex];
    if (!player) {
      missingSlots.push(slot.id);
      continue;
    }
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

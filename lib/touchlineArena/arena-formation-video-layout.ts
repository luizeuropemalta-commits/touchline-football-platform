/**
 * Canonical Arena video placement.  The tactical formation itself stays in the
 * saved roster; this module only maps it onto each cinematic camera and
 * landscape viewport.  Keeping that mapping here prevents a saved drag or a
 * previous camera projection from leaking into the next video loop.
 */
export const ARENA_433_VIDEO_LOOP_IDS = [
  "wide-touchline",
  "lower-stand",
  "side-sweep",
] as const;

export const ARENA_VIDEO_VIEWPORTS = [
  "desktop",
  "tablet-landscape",
  "phone-landscape",
] as const;

export type Arena433VideoLoopId = (typeof ARENA_433_VIDEO_LOOP_IDS)[number];
export type ArenaVideoViewport = (typeof ARENA_VIDEO_VIEWPORTS)[number];
export type ArenaVideoRole = "goalkeeper" | "defender" | "midfielder" | "forward";

export type ArenaVideoSlot = {
  x: number;
  y: number;
  heightVh: number;
};

type Arena433VideoLayout = Record<ArenaVideoRole, ArenaVideoSlot[]>;

// Every value is a bottom-centred card anchor expressed as a percentage of the
// Arena stage. The rows remain 1 / 4 / 3 / 3 in every real landscape viewport.
export const ARENA_433_VIDEO_COORDINATES: Record<
  Arena433VideoLoopId,
  Record<ArenaVideoViewport, Arena433VideoLayout>
> = {
  "wide-touchline": {
    desktop: {
      goalkeeper: [{ x: 15, y: 77, heightVh: 7.4 }],
      defender: [{ x: 30, y: 64, heightVh: 7.4 }, { x: 30, y: 71, heightVh: 7.4 }, { x: 30, y: 78, heightVh: 7.4 }, { x: 30, y: 85, heightVh: 7.4 }],
      midfielder: [{ x: 48, y: 67, heightVh: 7.4 }, { x: 48, y: 76, heightVh: 7.4 }, { x: 48, y: 85, heightVh: 7.4 }],
      forward: [{ x: 67, y: 67, heightVh: 7.4 }, { x: 67, y: 76, heightVh: 7.4 }, { x: 67, y: 85, heightVh: 7.4 }],
    },
    "tablet-landscape": {
      goalkeeper: [{ x: 15, y: 78, heightVh: 7.8 }],
      defender: [{ x: 30, y: 65, heightVh: 7.8 }, { x: 30, y: 72, heightVh: 7.8 }, { x: 30, y: 79, heightVh: 7.8 }, { x: 30, y: 86, heightVh: 7.8 }],
      midfielder: [{ x: 48, y: 68, heightVh: 7.8 }, { x: 48, y: 77, heightVh: 7.8 }, { x: 48, y: 86, heightVh: 7.8 }],
      forward: [{ x: 67, y: 68, heightVh: 7.8 }, { x: 67, y: 77, heightVh: 7.8 }, { x: 67, y: 86, heightVh: 7.8 }],
    },
    "phone-landscape": {
      goalkeeper: [{ x: 15, y: 79, heightVh: 9.2 }],
      defender: [{ x: 30, y: 66, heightVh: 9.2 }, { x: 30, y: 73, heightVh: 9.2 }, { x: 30, y: 80, heightVh: 9.2 }, { x: 30, y: 87, heightVh: 9.2 }],
      midfielder: [{ x: 48, y: 69, heightVh: 9.2 }, { x: 48, y: 78, heightVh: 9.2 }, { x: 48, y: 87, heightVh: 9.2 }],
      forward: [{ x: 67, y: 69, heightVh: 9.2 }, { x: 67, y: 78, heightVh: 9.2 }, { x: 67, y: 87, heightVh: 9.2 }],
    },
  },
  "lower-stand": {
    desktop: {
      goalkeeper: [{ x: 18, y: 76, heightVh: 7.2 }],
      defender: [{ x: 35, y: 63, heightVh: 7.2 }, { x: 35, y: 70, heightVh: 7.2 }, { x: 35, y: 78, heightVh: 7.2 }, { x: 35, y: 85, heightVh: 7.2 }],
      midfielder: [{ x: 53, y: 66, heightVh: 7.2 }, { x: 53, y: 75, heightVh: 7.2 }, { x: 53, y: 84, heightVh: 7.2 }],
      forward: [{ x: 71, y: 66, heightVh: 7.2 }, { x: 71, y: 75, heightVh: 7.2 }, { x: 71, y: 84, heightVh: 7.2 }],
    },
    "tablet-landscape": {
      goalkeeper: [{ x: 18, y: 77, heightVh: 7.6 }],
      defender: [{ x: 35, y: 64, heightVh: 7.6 }, { x: 35, y: 71, heightVh: 7.6 }, { x: 35, y: 79, heightVh: 7.6 }, { x: 35, y: 86, heightVh: 7.6 }],
      midfielder: [{ x: 53, y: 67, heightVh: 7.6 }, { x: 53, y: 76, heightVh: 7.6 }, { x: 53, y: 85, heightVh: 7.6 }],
      forward: [{ x: 71, y: 67, heightVh: 7.6 }, { x: 71, y: 76, heightVh: 7.6 }, { x: 71, y: 85, heightVh: 7.6 }],
    },
    "phone-landscape": {
      goalkeeper: [{ x: 18, y: 78, heightVh: 9 }],
      defender: [{ x: 35, y: 65, heightVh: 9 }, { x: 35, y: 72, heightVh: 9 }, { x: 35, y: 80, heightVh: 9 }, { x: 35, y: 87, heightVh: 9 }],
      midfielder: [{ x: 53, y: 68, heightVh: 9 }, { x: 53, y: 77, heightVh: 9 }, { x: 53, y: 86, heightVh: 9 }],
      forward: [{ x: 71, y: 68, heightVh: 9 }, { x: 71, y: 77, heightVh: 9 }, { x: 71, y: 86, heightVh: 9 }],
    },
  },
  "side-sweep": {
    desktop: {
      goalkeeper: [{ x: 20, y: 75, heightVh: 7 }],
      defender: [{ x: 38, y: 62, heightVh: 7 }, { x: 38, y: 69, heightVh: 7 }, { x: 38, y: 77, heightVh: 7 }, { x: 38, y: 84, heightVh: 7 }],
      midfielder: [{ x: 56, y: 65, heightVh: 7 }, { x: 56, y: 74, heightVh: 7 }, { x: 56, y: 83, heightVh: 7 }],
      forward: [{ x: 74, y: 65, heightVh: 7 }, { x: 74, y: 74, heightVh: 7 }, { x: 74, y: 83, heightVh: 7 }],
    },
    "tablet-landscape": {
      goalkeeper: [{ x: 20, y: 76, heightVh: 7.4 }],
      defender: [{ x: 38, y: 63, heightVh: 7.4 }, { x: 38, y: 70, heightVh: 7.4 }, { x: 38, y: 78, heightVh: 7.4 }, { x: 38, y: 85, heightVh: 7.4 }],
      midfielder: [{ x: 56, y: 66, heightVh: 7.4 }, { x: 56, y: 75, heightVh: 7.4 }, { x: 56, y: 84, heightVh: 7.4 }],
      forward: [{ x: 74, y: 66, heightVh: 7.4 }, { x: 74, y: 75, heightVh: 7.4 }, { x: 74, y: 84, heightVh: 7.4 }],
    },
    "phone-landscape": {
      goalkeeper: [{ x: 20, y: 77, heightVh: 8.8 }],
      defender: [{ x: 38, y: 64, heightVh: 8.8 }, { x: 38, y: 71, heightVh: 8.8 }, { x: 38, y: 79, heightVh: 8.8 }, { x: 38, y: 86, heightVh: 8.8 }],
      midfielder: [{ x: 56, y: 67, heightVh: 8.8 }, { x: 56, y: 76, heightVh: 8.8 }, { x: 56, y: 85, heightVh: 8.8 }],
      forward: [{ x: 74, y: 67, heightVh: 8.8 }, { x: 74, y: 76, heightVh: 8.8 }, { x: 74, y: 85, heightVh: 8.8 }],
    },
  },
};

export function arenaVideoViewportForDimensions(width: number, height: number): ArenaVideoViewport {
  if (height <= 520 || width <= 900) return "phone-landscape";
  if (width >= 1200 && height >= 640) return "desktop";
  return "tablet-landscape";
}

export function resolveArena433VideoSlots(
  players: ReadonlyArray<{ id: string; role: ArenaVideoRole }>,
  loopId: Arena433VideoLoopId,
  viewport: ArenaVideoViewport,
) {
  const layout = ARENA_433_VIDEO_COORDINATES[loopId][viewport];
  const roleIndexes: Record<ArenaVideoRole, number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };

  return new Map(players.flatMap((player) => {
    const slot = layout[player.role][roleIndexes[player.role]++];
    return slot ? [[player.id, slot] as const] : [];
  }));
}

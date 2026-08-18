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

// This single media loop contains the three camera passes in this order.
// Keeping its boundaries with the canonical formation profiles prevents a
// clock value from selecting a profile unknown to the rendered coordinates.
export const ARENA_433_VIDEO_LOOP_CAMERA_BOUNDARIES = [
  { until: 0.48, loopId: "wide-touchline" },
  { until: 0.74, loopId: "lower-stand" },
  { until: 1, loopId: "side-sweep" },
] as const;

export const ARENA_433_VIDEO_LOOP_FALLBACK_DURATION_SECONDS = 21;

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

/**
 * Resolves the camera pass directly from the media clock. A modulo operation
 * makes the browser's loop reset an explicit return to wide-touchline, rather
 * than preserving side-sweep state while frame zero is already visible.
 */
export function arena433VideoLoopIndexForPlayback(
  currentTime: number | null | undefined,
  duration: number | null | undefined,
) {
  const safeDuration = typeof duration === "number" && Number.isFinite(duration) && duration > 0
    ? duration
    : ARENA_433_VIDEO_LOOP_FALLBACK_DURATION_SECONDS;
  const safeCurrentTime = typeof currentTime === "number" && Number.isFinite(currentTime) ? currentTime : 0;
  const remainder = safeCurrentTime % safeDuration;
  const loopedTime = remainder < 0 ? remainder + safeDuration : remainder;
  const progress = loopedTime / safeDuration;

  return ARENA_433_VIDEO_LOOP_CAMERA_BOUNDARIES.findIndex((boundary) => progress < boundary.until);
}

export function arena433VideoLoopIdForPlayback(
  currentTime: number | null | undefined,
  duration: number | null | undefined,
): Arena433VideoLoopId {
  const loopIndex = arena433VideoLoopIndexForPlayback(currentTime, duration);
  return ARENA_433_VIDEO_LOOP_CAMERA_BOUNDARIES[loopIndex]?.loopId ?? "wide-touchline";
}

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
      goalkeeper: [{ x: 18, y: 77, heightVh: 6 }],
      defender: [{ x: 35, y: 68, heightVh: 6 }, { x: 35, y: 74, heightVh: 6 }, { x: 35, y: 80, heightVh: 6 }, { x: 35, y: 86, heightVh: 6 }],
      midfielder: [{ x: 53, y: 70, heightVh: 6 }, { x: 53, y: 78, heightVh: 6 }, { x: 53, y: 86, heightVh: 6 }],
      forward: [{ x: 71, y: 70, heightVh: 6 }, { x: 71, y: 78, heightVh: 6 }, { x: 71, y: 86, heightVh: 6 }],
    },
    "tablet-landscape": {
      goalkeeper: [{ x: 18, y: 78, heightVh: 6.4 }],
      defender: [{ x: 35, y: 69, heightVh: 6.4 }, { x: 35, y: 75, heightVh: 6.4 }, { x: 35, y: 81, heightVh: 6.4 }, { x: 35, y: 87, heightVh: 6.4 }],
      midfielder: [{ x: 53, y: 71, heightVh: 6.4 }, { x: 53, y: 79, heightVh: 6.4 }, { x: 53, y: 87, heightVh: 6.4 }],
      forward: [{ x: 71, y: 71, heightVh: 6.4 }, { x: 71, y: 79, heightVh: 6.4 }, { x: 71, y: 87, heightVh: 6.4 }],
    },
    "phone-landscape": {
      goalkeeper: [{ x: 18, y: 79, heightVh: 7.8 }],
      defender: [{ x: 35, y: 69, heightVh: 7.8 }, { x: 35, y: 75, heightVh: 7.8 }, { x: 35, y: 81, heightVh: 7.8 }, { x: 35, y: 87, heightVh: 7.8 }],
      midfielder: [{ x: 53, y: 71, heightVh: 7.8 }, { x: 53, y: 79, heightVh: 7.8 }, { x: 53, y: 87, heightVh: 7.8 }],
      forward: [{ x: 71, y: 71, heightVh: 7.8 }, { x: 71, y: 79, heightVh: 7.8 }, { x: 71, y: 87, heightVh: 7.8 }],
    },
  },
  "side-sweep": {
    desktop: {
      goalkeeper: [{ x: 20, y: 77, heightVh: 5.8 }],
      defender: [{ x: 38, y: 68, heightVh: 5.8 }, { x: 38, y: 74, heightVh: 5.8 }, { x: 38, y: 80, heightVh: 5.8 }, { x: 38, y: 86, heightVh: 5.8 }],
      midfielder: [{ x: 56, y: 70, heightVh: 5.8 }, { x: 56, y: 78, heightVh: 5.8 }, { x: 56, y: 86, heightVh: 5.8 }],
      forward: [{ x: 74, y: 70, heightVh: 5.8 }, { x: 74, y: 78, heightVh: 5.8 }, { x: 74, y: 86, heightVh: 5.8 }],
    },
    "tablet-landscape": {
      goalkeeper: [{ x: 20, y: 78, heightVh: 6.2 }],
      defender: [{ x: 38, y: 69, heightVh: 6.2 }, { x: 38, y: 75, heightVh: 6.2 }, { x: 38, y: 81, heightVh: 6.2 }, { x: 38, y: 87, heightVh: 6.2 }],
      midfielder: [{ x: 56, y: 71, heightVh: 6.2 }, { x: 56, y: 79, heightVh: 6.2 }, { x: 56, y: 87, heightVh: 6.2 }],
      forward: [{ x: 74, y: 71, heightVh: 6.2 }, { x: 74, y: 79, heightVh: 6.2 }, { x: 74, y: 87, heightVh: 6.2 }],
    },
    "phone-landscape": {
      goalkeeper: [{ x: 20, y: 79, heightVh: 7.6 }],
      defender: [{ x: 38, y: 69, heightVh: 7.6 }, { x: 38, y: 75, heightVh: 7.6 }, { x: 38, y: 81, heightVh: 7.6 }, { x: 38, y: 87, heightVh: 7.6 }],
      midfielder: [{ x: 56, y: 71, heightVh: 7.6 }, { x: 56, y: 79, heightVh: 7.6 }, { x: 56, y: 87, heightVh: 7.6 }],
      forward: [{ x: 74, y: 71, heightVh: 7.6 }, { x: 74, y: 79, heightVh: 7.6 }, { x: 74, y: 87, heightVh: 7.6 }],
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

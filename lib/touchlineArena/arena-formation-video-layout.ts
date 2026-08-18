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
  /** Visual landmark on the filmed pitch that the card is anchored to. */
  landmark: string;
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
// Arena stage. These are filmed-pitch landmarks (goal mouth, penalty area,
// midfield stripe and attacking third), not an abstract lineup grid.  A nearer
// landmark receives a modestly larger card so the formation follows the camera
// perspective while remaining 1 / 4 / 3 / 3 in every landscape viewport.
export const ARENA_433_VIDEO_COORDINATES: Record<
  Arena433VideoLoopId,
  Record<ArenaVideoViewport, Arena433VideoLayout>
> = {
  "wide-touchline": {
    desktop: {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 78, heightVh: 8.4 }],
      defender: [
        { landmark: "far-defensive-third", x: 21, y: 65, heightVh: 7.8 },
        { landmark: "left-penalty-area", x: 27.5, y: 71, heightVh: 8.1 },
        { landmark: "near-defensive-third", x: 31, y: 78, heightVh: 8.5 },
        { landmark: "near-touchline-defensive-third", x: 36, y: 85, heightVh: 8.9 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 39, y: 67, heightVh: 8 },
        { landmark: "centre-circle", x: 47, y: 76, heightVh: 8.5 },
        { landmark: "near-midfield-stripe", x: 55, y: 85, heightVh: 9 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 58, y: 67, heightVh: 8 },
        { landmark: "central-attacking-third", x: 67, y: 76, heightVh: 8.5 },
        { landmark: "near-attacking-third", x: 76, y: 85, heightVh: 9 },
      ],
    },
    "tablet-landscape": {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 79, heightVh: 8.8 }],
      defender: [
        { landmark: "far-defensive-third", x: 21, y: 66, heightVh: 8.1 },
        { landmark: "left-penalty-area", x: 27.5, y: 72, heightVh: 8.5 },
        { landmark: "near-defensive-third", x: 31, y: 79, heightVh: 8.9 },
        { landmark: "near-touchline-defensive-third", x: 36, y: 86, heightVh: 9.3 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 39, y: 68, heightVh: 8.4 },
        { landmark: "centre-circle", x: 47, y: 77, heightVh: 8.9 },
        { landmark: "near-midfield-stripe", x: 55, y: 86, heightVh: 9.4 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 58, y: 68, heightVh: 8.4 },
        { landmark: "central-attacking-third", x: 67, y: 77, heightVh: 8.9 },
        { landmark: "near-attacking-third", x: 76, y: 86, heightVh: 9.4 },
      ],
    },
    "phone-landscape": {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 80, heightVh: 9.8 }],
      defender: [
        { landmark: "far-defensive-third", x: 21, y: 67, heightVh: 9 },
        { landmark: "left-penalty-area", x: 27.5, y: 73, heightVh: 9.4 },
        { landmark: "near-defensive-third", x: 31, y: 80, heightVh: 9.8 },
        { landmark: "near-touchline-defensive-third", x: 36, y: 87, heightVh: 10.2 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 39, y: 69, heightVh: 9.3 },
        { landmark: "centre-circle", x: 47, y: 78, heightVh: 9.8 },
        { landmark: "near-midfield-stripe", x: 55, y: 87, heightVh: 10.3 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 58, y: 69, heightVh: 9.3 },
        { landmark: "central-attacking-third", x: 67, y: 78, heightVh: 9.8 },
        { landmark: "near-attacking-third", x: 76, y: 87, heightVh: 10.3 },
      ],
    },
  },
  "lower-stand": {
    desktop: {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 78, heightVh: 6.9 }],
      defender: [
        { landmark: "far-defensive-third", x: 26, y: 68, heightVh: 6.5 },
        { landmark: "left-penalty-area", x: 31.5, y: 74, heightVh: 6.8 },
        { landmark: "near-defensive-third", x: 36, y: 80, heightVh: 7.1 },
        { landmark: "near-touchline-defensive-third", x: 40, y: 86, heightVh: 7.4 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 44, y: 70, heightVh: 6.7 },
        { landmark: "centre-circle", x: 52, y: 78, heightVh: 7.1 },
        { landmark: "near-midfield-stripe", x: 59, y: 86, heightVh: 7.5 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 62, y: 70, heightVh: 6.7 },
        { landmark: "central-attacking-third", x: 71, y: 78, heightVh: 7.1 },
        { landmark: "near-attacking-third", x: 80, y: 86, heightVh: 7.5 },
      ],
    },
    "tablet-landscape": {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 79, heightVh: 7.3 }],
      defender: [
        { landmark: "far-defensive-third", x: 26, y: 69, heightVh: 6.9 },
        { landmark: "left-penalty-area", x: 31.5, y: 75, heightVh: 7.2 },
        { landmark: "near-defensive-third", x: 36, y: 81, heightVh: 7.5 },
        { landmark: "near-touchline-defensive-third", x: 40, y: 87, heightVh: 7.8 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 44, y: 71, heightVh: 7.1 },
        { landmark: "centre-circle", x: 52, y: 79, heightVh: 7.5 },
        { landmark: "near-midfield-stripe", x: 59, y: 87, heightVh: 7.9 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 62, y: 71, heightVh: 7.1 },
        { landmark: "central-attacking-third", x: 71, y: 79, heightVh: 7.5 },
        { landmark: "near-attacking-third", x: 80, y: 87, heightVh: 7.9 },
      ],
    },
    "phone-landscape": {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 80, heightVh: 8.6 }],
      defender: [
        { landmark: "far-defensive-third", x: 26, y: 69, heightVh: 8.1 },
        { landmark: "left-penalty-area", x: 31.5, y: 75, heightVh: 8.4 },
        { landmark: "near-defensive-third", x: 36, y: 81, heightVh: 8.7 },
        { landmark: "near-touchline-defensive-third", x: 40, y: 87, heightVh: 9 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 44, y: 71, heightVh: 8.3 },
        { landmark: "centre-circle", x: 52, y: 79, heightVh: 8.7 },
        { landmark: "near-midfield-stripe", x: 59, y: 87, heightVh: 9.1 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 62, y: 71, heightVh: 8.3 },
        { landmark: "central-attacking-third", x: 71, y: 79, heightVh: 8.7 },
        { landmark: "near-attacking-third", x: 80, y: 87, heightVh: 9.1 },
      ],
    },
  },
  "side-sweep": {
    desktop: {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 78, heightVh: 6.7 }],
      defender: [
        { landmark: "far-defensive-third", x: 28, y: 68, heightVh: 6.3 },
        { landmark: "left-penalty-area", x: 34.5, y: 74, heightVh: 6.6 },
        { landmark: "near-defensive-third", x: 38, y: 80, heightVh: 6.9 },
        { landmark: "near-touchline-defensive-third", x: 42, y: 86, heightVh: 7.2 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 46, y: 70, heightVh: 6.5 },
        { landmark: "centre-circle", x: 55, y: 78, heightVh: 6.9 },
        { landmark: "near-midfield-stripe", x: 62, y: 86, heightVh: 7.3 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 64, y: 70, heightVh: 6.5 },
        { landmark: "central-attacking-third", x: 74, y: 78, heightVh: 6.9 },
        { landmark: "near-attacking-third", x: 82, y: 86, heightVh: 7.3 },
      ],
    },
    "tablet-landscape": {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 79, heightVh: 7.1 }],
      defender: [
        { landmark: "far-defensive-third", x: 28, y: 69, heightVh: 6.7 },
        { landmark: "left-penalty-area", x: 34.5, y: 75, heightVh: 7 },
        { landmark: "near-defensive-third", x: 38, y: 81, heightVh: 7.3 },
        { landmark: "near-touchline-defensive-third", x: 42, y: 87, heightVh: 7.6 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 46, y: 71, heightVh: 6.9 },
        { landmark: "centre-circle", x: 55, y: 79, heightVh: 7.3 },
        { landmark: "near-midfield-stripe", x: 62, y: 87, heightVh: 7.7 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 64, y: 71, heightVh: 6.9 },
        { landmark: "central-attacking-third", x: 74, y: 79, heightVh: 7.3 },
        { landmark: "near-attacking-third", x: 82, y: 87, heightVh: 7.7 },
      ],
    },
    "phone-landscape": {
      goalkeeper: [{ landmark: "left-goal-mouth", x: 12.5, y: 80, heightVh: 8.4 }],
      defender: [
        { landmark: "far-defensive-third", x: 28, y: 69, heightVh: 7.9 },
        { landmark: "left-penalty-area", x: 34.5, y: 75, heightVh: 8.2 },
        { landmark: "near-defensive-third", x: 38, y: 81, heightVh: 8.5 },
        { landmark: "near-touchline-defensive-third", x: 42, y: 87, heightVh: 8.8 },
      ],
      midfielder: [
        { landmark: "far-midfield-stripe", x: 46, y: 71, heightVh: 8.1 },
        { landmark: "centre-circle", x: 55, y: 79, heightVh: 8.5 },
        { landmark: "near-midfield-stripe", x: 62, y: 87, heightVh: 8.9 },
      ],
      forward: [
        { landmark: "far-attacking-third", x: 64, y: 71, heightVh: 8.1 },
        { landmark: "central-attacking-third", x: 74, y: 79, heightVh: 8.5 },
        { landmark: "near-attacking-third", x: 82, y: 87, heightVh: 8.9 },
      ],
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

/**
 * Evidence-backed input calibration for the Arena loop perspectives.
 *
 * This module intentionally contains no projection, layout mutation, DOM access
 * or integration with ArenaClient. It is a versioned contract for a later
 * projection implementation. Each camera profile is measured against the
 * filmed grass, rather than an abstract tactical grid. The measurements are
 * deliberately inset from the painted touchlines so a complete card frame
 * (not just its anchor) stays on the grass.
 */

export const ARENA_PERSPECTIVE_CALIBRATION_REVISION = "2026-09-10.v2" as const;

export type ArenaPerspectiveId = "wide-touchline" | "lower-stand" | "side-sweep";
export type ArenaCalibrationConfidence = "medium-high" | "high";

export type ArenaCalibrationPoint = Readonly<{
  x: number;
  y: number;
}>;

export type ArenaCalibrationViewport = Readonly<{
  width: number;
  height: number;
}>;

export type ArenaLoopWindow = Readonly<{
  startSeconds: number;
  endSeconds: number;
}>;

export type ArenaFourLineGrassCalibration = Readonly<{
  perspective: ArenaPerspectiveId;
  coverage: "four-line-polygon";
  confidence: "medium-high";
  sourceSha256: string;
  sourceViewport: ArenaCalibrationViewport;
  loopWindowSeconds: ArenaLoopWindow;
  /** Clockwise polygon of the visually measured grass boundary. */
  grassPolygon: readonly ArenaCalibrationPoint[];
}>;

export type ArenaPerspectiveCalibration = ArenaFourLineGrassCalibration;

export type ArenaRenderedCardEnvelope = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

const ARENA_LOOP_SOURCE_SHA256 = "74c24fc132e5cecbc280dd60da12542db7a7188a48156541eb396eabb599be02";

/**
 * Measurements preserved from the 2026-09-10 Arena loop audit in the native
 * 1280×720 source frame. Side-sweep was re-measured from frame 17.30s of the
 * verified source file: all four painted boundaries are visible in that pass.
 * The polygon is inset 6–45 source pixels from the lines as a safety gutter.
 */
export const ARENA_PERSPECTIVE_CALIBRATIONS: Readonly<Record<ArenaPerspectiveId, ArenaPerspectiveCalibration>> = {
  "wide-touchline": {
    perspective: "wide-touchline",
    coverage: "four-line-polygon",
    confidence: "medium-high",
    sourceSha256: ARENA_LOOP_SOURCE_SHA256,
    sourceViewport: { width: 1280, height: 720 },
    loopWindowSeconds: { startSeconds: 0, endSeconds: 10.09 },
    grassPolygon: [
      { x: 292, y: 376 },
      { x: 988, y: 376 },
      { x: 1250, y: 645 },
      { x: 30, y: 645 },
    ],
  },
  "lower-stand": {
    perspective: "lower-stand",
    coverage: "four-line-polygon",
    confidence: "medium-high",
    sourceSha256: ARENA_LOOP_SOURCE_SHA256,
    sourceViewport: { width: 1280, height: 720 },
    loopWindowSeconds: { startSeconds: 10.09, endSeconds: 15.56 },
    grassPolygon: [
      { x: 253, y: 402 },
      { x: 1022, y: 402 },
      { x: 1255, y: 640 },
      { x: 25, y: 640 },
    ],
  },
  "side-sweep": {
    perspective: "side-sweep",
    coverage: "four-line-polygon",
    confidence: "medium-high",
    sourceSha256: ARENA_LOOP_SOURCE_SHA256,
    sourceViewport: { width: 1280, height: 720 },
    loopWindowSeconds: { startSeconds: 14.7, endSeconds: 21.025 },
    // Frame sample: 17.30 s. Coordinates trace the internal safe grass area:
    // far touchline left/right, then near touchline right/left clockwise.
    grassPolygon: [
      { x: 300, y: 452 },
      { x: 980, y: 452 },
      { x: 1235, y: 684 },
      { x: 45, y: 684 },
    ],
  },
};

export function hasFourLineGrassPolygon(
  calibration: ArenaPerspectiveCalibration,
): calibration is ArenaFourLineGrassCalibration {
  return calibration.coverage === "four-line-polygon";
}

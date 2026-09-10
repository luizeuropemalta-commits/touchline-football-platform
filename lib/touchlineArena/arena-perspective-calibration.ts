/**
 * Evidence-backed input calibration for the Arena loop perspectives.
 *
 * This module intentionally contains no projection, layout mutation, DOM access
 * or integration with ArenaClient. It is a versioned contract for a later
 * projection implementation. In particular, `side-sweep` is rail-only: it
 * must never be treated as a certified four-line grass polygon.
 */

export const ARENA_PERSPECTIVE_CALIBRATION_REVISION = "2026-09-10.v1" as const;

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
  perspective: "wide-touchline" | "lower-stand";
  coverage: "four-line-polygon";
  confidence: "medium-high";
  sourceSha256: string;
  sourceViewport: ArenaCalibrationViewport;
  loopWindowSeconds: ArenaLoopWindow;
  /** Clockwise polygon of the visually measured grass boundary. */
  grassPolygon: readonly ArenaCalibrationPoint[];
}>;

export type ArenaSideSweepRailMeasurement = Readonly<{
  perspective: "side-sweep";
  sourceSha256: string;
  viewport: ArenaCalibrationViewport;
  sampleTimeSeconds: number;
  stageTop: number;
  carouselTop: number;
  railClearancePx: number;
}>;

export type ArenaSideSweepRailCalibration = Readonly<{
  perspective: "side-sweep";
  /**
   * The near grass boundary is not reliably visible in side-sweep. This is an
   * explicit lower UI exclusion zone only, not a field polygon.
   */
  coverage: "rail-only";
  confidence: "high";
  railMeasurement: ArenaSideSweepRailMeasurement;
}>;

export type ArenaPerspectiveCalibration =
  | ArenaFourLineGrassCalibration
  | ArenaSideSweepRailCalibration;

export type ArenaRenderedCardEnvelope = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

const ARENA_LOOP_SOURCE_SHA256 = "74c24fc132e5cecbc280dd60da12542db7a7188a48156541eb396eabb599be02";

/**
 * Measurements preserved from the 2026-09-10 Arena loop audit. Wide and lower
 * are first-pass visual measurements in the native 1280×720 source frame.
 * Side-sweep is a separate live browser-stage rail measurement at 1440×900.
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
    coverage: "rail-only",
    confidence: "high",
    railMeasurement: {
      perspective: "side-sweep",
      sourceSha256: ARENA_LOOP_SOURCE_SHA256,
      viewport: { width: 1440, height: 900 },
      sampleTimeSeconds: 17.304558,
      stageTop: 0,
      carouselTop: 804,
      railClearancePx: 4,
    },
  },
};

export function hasFourLineGrassPolygon(
  calibration: ArenaPerspectiveCalibration,
): calibration is ArenaFourLineGrassCalibration {
  return calibration.coverage === "four-line-polygon";
}

/**
 * Derives, rather than stores, the lower safe Y coordinate from a measured
 * stage/rail relation. Callers must provide the current live measurement when
 * integrating at any viewport other than the audit sample.
 */
export function calculateSideSweepBottomSafeY(
  measurement: ArenaSideSweepRailMeasurement,
): number | null {
  const values = [
    measurement.stageTop,
    measurement.carouselTop,
    measurement.railClearancePx,
  ];
  if (values.some((value) => !Number.isFinite(value)) || measurement.railClearancePx < 0) return null;

  const bottomSafeY = measurement.carouselTop - measurement.stageTop - measurement.railClearancePx;
  return Number.isFinite(bottomSafeY) ? bottomSafeY : null;
}

/**
 * Tests the complete visual card rectangle. A point anchor is deliberately not
 * accepted because it can remain in bounds while the card overlaps the rail.
 */
export function cardEnvelopeClearsSideSweepRail(
  card: ArenaRenderedCardEnvelope,
  measurement: ArenaSideSweepRailMeasurement,
): boolean {
  const values = [card.left, card.top, card.right, card.bottom];
  if (values.some((value) => !Number.isFinite(value))) return false;
  if (card.right < card.left || card.bottom < card.top) return false;

  const bottomSafeY = calculateSideSweepBottomSafeY(measurement);
  return bottomSafeY !== null && card.bottom <= bottomSafeY;
}

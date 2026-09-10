import {
  ARENA_PERSPECTIVE_CALIBRATIONS,
  calculateSideSweepBottomSafeY,
  hasFourLineGrassPolygon,
  type ArenaCalibrationPoint,
  type ArenaPerspectiveId,
  type ArenaRenderedCardEnvelope,
} from "./arena-perspective-calibration.ts";

/** Display-only full-card containment for the three Arena camera perspectives. */
export const ARENA_CARD_ASPECT_RATIO = 430 / 691;
const SOURCE_FRAME = { width: 1280, height: 720 } as const;

export type ArenaFieldStage = Readonly<{ width: number; height: number; viewportHeight: number; stageTop: number; carouselTop: number | null }>;
export type ArenaFieldSlot = Readonly<{ x: number; y: number; heightVh: number }>;
export type ArenaContainedFieldSlot = Readonly<{
  x: number;
  y: number;
  envelope: ArenaRenderedCardEnvelope;
  coverage: "four-line-polygon" | "rail-only" | "unmeasured";
  adjusted: boolean;
}>;
type HalfPlane = Readonly<{ normalX: number; normalY: number; minimum: number }>;

function finitePositive(value: number) { return Number.isFinite(value) && value > 0; }
function cardDimensions(heightVh: number, viewportHeight: number) {
  const height = (heightVh / 100) * viewportHeight;
  return { width: height * ARENA_CARD_ASPECT_RATIO, height };
}
function projectSourcePointToStage(point: ArenaCalibrationPoint, stage: ArenaFieldStage): ArenaCalibrationPoint {
  const scale = Math.max(stage.width / SOURCE_FRAME.width, stage.height / SOURCE_FRAME.height);
  const drawnWidth = SOURCE_FRAME.width * scale;
  const drawnHeight = SOURCE_FRAME.height * scale;
  return { x: point.x * scale - (drawnWidth - stage.width) / 2, y: point.y * scale - (drawnHeight - stage.height) / 2 };
}
function envelopeForAnchor(anchorX: number, anchorY: number, dimensions: { width: number; height: number }): ArenaRenderedCardEnvelope {
  return { left: anchorX - dimensions.width / 2, top: anchorY - dimensions.height, right: anchorX + dimensions.width / 2, bottom: anchorY };
}
function polygonHalfPlanes(polygon: readonly ArenaCalibrationPoint[], dimensions: { width: number; height: number }): HalfPlane[] {
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;
  return polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    const vectorX = next.x - point.x;
    const vectorY = next.y - point.y;
    const normalX = -vectorY;
    const normalY = vectorX;
    const cornerMargin = Math.abs(vectorX) * halfHeight + Math.abs(vectorY) * halfWidth;
    const edgeConstant = normalX * point.x + normalY * point.y;
    return { normalX, normalY, minimum: edgeConstant + cornerMargin };
  });
}
function constrainCenterToConvexPolygon(center: ArenaCalibrationPoint, planes: readonly HalfPlane[]): ArenaCalibrationPoint {
  let candidate = { ...center };
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let changed = false;
    for (const plane of planes) {
      const actual = plane.normalX * candidate.x + plane.normalY * candidate.y;
      const deficit = plane.minimum - actual;
      if (deficit <= 0.001) continue;
      const magnitude = plane.normalX ** 2 + plane.normalY ** 2;
      candidate = { x: candidate.x + (deficit * plane.normalX) / magnitude, y: candidate.y + (deficit * plane.normalY) / magnitude };
      changed = true;
    }
    if (!changed) break;
  }
  return candidate;
}
function sameCoordinate(left: number, right: number) { return Math.abs(left - right) < 0.01; }

/** Wide/lower use four-line polygons; side-sweep is explicitly rail-only. */
export function containArenaFieldCard(slot: ArenaFieldSlot, perspective: ArenaPerspectiveId, stage: ArenaFieldStage | null): ArenaContainedFieldSlot {
  if (!stage || !finitePositive(stage.width) || !finitePositive(stage.height) || !finitePositive(stage.viewportHeight)) {
    return { x: slot.x, y: slot.y, envelope: { left: Number.NaN, top: Number.NaN, right: Number.NaN, bottom: Number.NaN }, coverage: "unmeasured", adjusted: false };
  }
  const dimensions = cardDimensions(slot.heightVh, stage.viewportHeight);
  const originalAnchor = { x: (slot.x / 100) * stage.width, y: (slot.y / 100) * stage.height };
  const calibration = ARENA_PERSPECTIVE_CALIBRATIONS[perspective];
  if (hasFourLineGrassPolygon(calibration)) {
    const polygon = calibration.grassPolygon.map((point) => projectSourcePointToStage(point, stage));
    const originalCenter = { x: originalAnchor.x, y: originalAnchor.y - dimensions.height / 2 };
    const center = constrainCenterToConvexPolygon(originalCenter, polygonHalfPlanes(polygon, dimensions));
    const anchor = { x: center.x, y: center.y + dimensions.height / 2 };
    return { x: (anchor.x / stage.width) * 100, y: (anchor.y / stage.height) * 100, envelope: envelopeForAnchor(anchor.x, anchor.y, dimensions), coverage: "four-line-polygon", adjusted: !sameCoordinate(anchor.x, originalAnchor.x) || !sameCoordinate(anchor.y, originalAnchor.y) };
  }
  if (stage.carouselTop === null || !Number.isFinite(stage.carouselTop)) {
    return { x: slot.x, y: slot.y, envelope: envelopeForAnchor(originalAnchor.x, originalAnchor.y, dimensions), coverage: "unmeasured", adjusted: false };
  }
  const bottomSafeY = calculateSideSweepBottomSafeY({ ...calibration.railMeasurement, stageTop: stage.stageTop, carouselTop: stage.carouselTop });
  if (bottomSafeY === null) {
    return { x: slot.x, y: slot.y, envelope: envelopeForAnchor(originalAnchor.x, originalAnchor.y, dimensions), coverage: "unmeasured", adjusted: false };
  }
  const anchor = { x: originalAnchor.x, y: Math.min(originalAnchor.y, bottomSafeY) };
  return { x: (anchor.x / stage.width) * 100, y: (anchor.y / stage.height) * 100, envelope: envelopeForAnchor(anchor.x, anchor.y, dimensions), coverage: "rail-only", adjusted: !sameCoordinate(anchor.y, originalAnchor.y) };
}

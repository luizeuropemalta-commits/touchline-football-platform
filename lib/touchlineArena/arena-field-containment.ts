import {
  ARENA_PERSPECTIVE_CALIBRATIONS,
  hasFourLineGrassPolygon,
  type ArenaCalibrationPoint,
  type ArenaPerspectiveId,
  type ArenaRenderedCardEnvelope,
} from "./arena-perspective-calibration.ts";

/** Display-only full-card containment for the three Arena camera perspectives. */
export const ARENA_CARD_ASPECT_RATIO = 430 / 691;
const SOURCE_FRAME = { width: 1280, height: 720 } as const;
// The DOM resolves percentage positioning and dvh card dimensions to device
// pixels. Side Sweep's left touchline is diagonal enough that a mathematically
// exact envelope can round a fraction of a pixel outside the filmed grass.
// Reserve a tiny, display-only inset there; it does not alter the measured
// field, card art, formation data, or the other two camera passes.
const SIDE_SWEEP_RENDERED_ENVELOPE_GUTTER_PX = 2;

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
function polygonHalfPlanes(
  polygon: readonly ArenaCalibrationPoint[],
  dimensions: { width: number; height: number },
  renderedEnvelopeGutterPx = 0,
): HalfPlane[] {
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
    // `normal` points into the polygon. Moving the boundary inward by a CSS
    // pixel distance therefore adds its length-scaled amount to the half-plane
    // threshold. This preserves the full card rectangle, not only its anchor.
    const renderedGutter = renderedEnvelopeGutterPx * Math.hypot(normalX, normalY);
    return { normalX, normalY, minimum: edgeConstant + cornerMargin + renderedGutter };
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

/** Every filmed loop uses an independently measured four-line grass polygon. */
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
    const center = constrainCenterToConvexPolygon(
      originalCenter,
      polygonHalfPlanes(
        polygon,
        dimensions,
        perspective === "side-sweep" ? SIDE_SWEEP_RENDERED_ENVELOPE_GUTTER_PX : 0,
      ),
    );
    const anchor = { x: center.x, y: center.y + dimensions.height / 2 };
    return { x: (anchor.x / stage.width) * 100, y: (anchor.y / stage.height) * 100, envelope: envelopeForAnchor(anchor.x, anchor.y, dimensions), coverage: "four-line-polygon", adjusted: !sameCoordinate(anchor.x, originalAnchor.x) || !sameCoordinate(anchor.y, originalAnchor.y) };
  }
  return { x: slot.x, y: slot.y, envelope: envelopeForAnchor(originalAnchor.x, originalAnchor.y, dimensions), coverage: "unmeasured", adjusted: false };
}

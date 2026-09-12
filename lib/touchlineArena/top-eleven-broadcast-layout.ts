import type { TouchlinePublishedTopElevenSlot } from "./published-top-eleven";

export type TouchlineBroadcastPoint = Readonly<{ x: number; y: number }>;

/**
 * The public Best XI is presented on a landscape broadcast pitch, attacking
 * from left to right. These points reserve a full-card envelope at the public
 * compact-card scale; they are deliberately not the tactical coordinates used
 * by the Arena or the squad builder.
 */
export const TOUCHLINE_TOP_ELEVEN_BROADCAST_POINTS: Readonly<Record<string, TouchlineBroadcastPoint>> = Object.freeze({
  gk: { x: 16, y: 50 },
  lb: { x: 36, y: 18 },
  lcb: { x: 36, y: 39 },
  rcb: { x: 36, y: 61 },
  rb: { x: 36, y: 82 },
  lcm: { x: 57, y: 26 },
  cm: { x: 57, y: 50 },
  rcm: { x: 57, y: 74 },
  lw: { x: 78, y: 20 },
  st: { x: 78, y: 50 },
  rw: { x: 78, y: 80 },
});

function isPoint(value: TouchlineBroadcastPoint | undefined): value is TouchlineBroadcastPoint {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y));
}

/** Returns no placement instead of inventing a position for an unknown role. */
export function touchlineTopElevenBroadcastPoint(slot: Pick<TouchlinePublishedTopElevenSlot, "id">): TouchlineBroadcastPoint | null {
  const point = TOUCHLINE_TOP_ELEVEN_BROADCAST_POINTS[slot.id];
  return isPoint(point) ? point : null;
}

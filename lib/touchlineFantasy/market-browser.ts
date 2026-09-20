import type { TouchlineFormationGeometry, TouchlineFormationGeometrySlot } from "../touchlineArena/formation-geometry.ts";
import type { TouchlineMarketPositionBucket } from "../touchlineArena/position-eligibility.ts";
import type { TouchlineFantasySelection } from "./domain.ts";

type BrowsePosition = Exclude<TouchlineMarketPositionBucket, "outfield">;

// Presentation categories only. This does not revive the retired 35-card quotas.
export const TOUCHLINE_FANTASY_BROWSE_POSITIONS = [
  { code: "GK", bucket: "goalkeeper" },
  { code: "RB", bucket: "right-back" },
  { code: "CB", bucket: "centre-back" },
  { code: "LB", bucket: "left-back" },
  { code: "CDM", bucket: "defensive-midfield" },
  { code: "MID", bucket: "midfield" },
  { code: "ATT", bucket: "attacker" },
  { code: "ST", bucket: "centre-forward" },
] as const satisfies readonly { code: string; bucket: BrowsePosition }[];

/** Browsing never changes selections. A compatible slot is only a proposed
 * destination; the existing lineup validator still owns any subsequent edit. */
export function resolveTouchlineFantasyBrowseSlot({ geometry, bucket, activeSlotId, selections }: {
  geometry: TouchlineFormationGeometry | null | undefined;
  bucket: BrowsePosition;
  activeSlotId: string | null;
  selections: readonly TouchlineFantasySelection[];
}): TouchlineFormationGeometrySlot | null {
  const compatible = geometry?.slots.filter((slot) => slot.allowedPositions.includes(bucket)) ?? [];
  return compatible.find((slot) => slot.id === activeSlotId)
    ?? compatible.find((slot) => !selections.some((entry) => entry.slotId === slot.id))
    ?? compatible[0]
    ?? null;
}

/** Fit the whole card + position + status envelope, not just the artwork.
 * Canonical tactical coordinates remain unchanged. Width/height are unscaled
 * layout pixels, so this also respects the existing miniature mobile board. */
export function touchlineFantasyPitchCardWidth(slots: readonly TouchlineFormationGeometrySlot[], width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 48;
  const ratio = 691 / 430;
  const labelHeight = 42;
  const gap = 12;
  const centres = slots.map((slot) => ({ x: Math.min(89, Math.max(11, slot.x)) * width / 100, y: Math.min(86, Math.max(14, slot.y)) * height / 100 }));
  let limit = 96;
  for (const [index, centre] of centres.entries()) {
    limit = Math.min(limit, 2 * Math.min(centre.x, width - centre.x) - gap, (2 * Math.min(centre.y, height - centre.y) - labelHeight - gap) / ratio);
    for (const other of centres.slice(index + 1)) {
      const dx = Math.abs(centre.x - other.x);
      const dy = Math.abs(centre.y - other.y);
      const horizontalLimit = dx >= 64 + gap ? dx - gap : 0;
      limit = Math.min(limit, Math.max(horizontalLimit, (dy - labelHeight - gap) / ratio));
    }
  }
  return Math.max(1, Math.floor(limit));
}

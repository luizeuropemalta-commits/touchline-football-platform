/** Presentation only: all three visual runs use the same published fixtures. */
export const FIXTURE_STRIP_PIXELS_PER_SECOND = 30;

export function wrapFixtureStripOffset(offset: number, cycleWidth: number): number {
  if (!Number.isFinite(cycleWidth) || cycleWidth <= 0) return 0;
  return cycleWidth + ((offset - cycleWidth) % cycleWidth + cycleWidth) % cycleWidth;
}

export function fixtureStripFrameDistance(elapsedMs: number): number {
  // Never catch up after a background tab or a busy main thread.
  return Math.max(0, Math.min(elapsedMs, 50)) * FIXTURE_STRIP_PIXELS_PER_SECOND / 1000;
}

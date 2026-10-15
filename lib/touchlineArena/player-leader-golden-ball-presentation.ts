/**
 * Presentation contract for the player who leads the published overall table.
 *
 * The Golden Ball is decorative and sits above the shared player-card canvas;
 * it never changes ranking authority, card ownership, or market state.
 */
export const TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_ASSET =
  "/touchlineArena/awards/touchline-golden-ball-trophy-v2.png";

export const TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION = Object.freeze({
  /** Base-card pixels; scales with the existing 430px card canvas. */
  width: 108,
  /** Transparent image dimensions: 1230 × 1278. */
  heightRatio: 1278 / 1230,
  /** Clear space between the trophy stand and the card frame. */
  frameClearance: 4,
});

export function touchlinePlayerLeaderGoldenBallStyle(cardScale: number) {
  const scale = Number.isFinite(cardScale) ? Math.max(0, Math.min(1, cardScale)) : 0;
  const width = TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.width * scale;
  const clearance = TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.frameClearance * scale;

  return {
    width,
    /** Align the visible trophy stand just above the player-card frame. */
    top: -((width * TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.heightRatio) + clearance),
  } as const;
}

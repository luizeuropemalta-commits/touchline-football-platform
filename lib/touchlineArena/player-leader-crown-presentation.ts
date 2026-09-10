/**
 * Presentation contract for the approved player-leader crown artwork.
 *
 * The crown is an absolutely positioned, decorative layer. These dimensions
 * deliberately reserve a clear gap above the card frame so it cannot cover
 * the frame's top stone, alter the frame geometry, or capture interaction.
 */
export const TOUCHLINE_PLAYER_LEADER_CROWN_ASSET =
  "/touchlineArena/cards/leadership/touchline-player-leader-crown.png";

export const TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION = Object.freeze({
  /** Base-card pixels; scales with the existing 430px card canvas. */
  width: 122,
  /** The approved transparent PNG's last non-transparent pixel (1153 / 1254). */
  opaqueBottomRatio: 1153 / 1254,
  /** Space between the crown and the top edge / top stone of the card. */
  frameClearance: 8,
});

export function touchlinePlayerLeaderCrownStyle(cardScale: number) {
  const scale = Number.isFinite(cardScale) ? Math.max(0, Math.min(1, cardScale)) : 0;
  const width = TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.width * scale;
  const clearance = TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.frameClearance * scale;

  return {
    width,
    /** Uses the real alpha edge, keeping the visible crown just clear of the frame. */
    top: -((width * TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.opaqueBottomRatio) + clearance),
  } as const;
}

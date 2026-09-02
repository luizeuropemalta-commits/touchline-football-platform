export const TOUCHLINE_SOCIAL_DUEL_FRAME_VERSION = "touchline-duel-frame-feed-v1" as const;
export const TOUCHLINE_PLAYER_DUEL_TEMPLATE_VERSION = "touchline-player-duel-feed-v1" as const;

/**
 * Frozen visual contract approved for every two-player TouchLine duel.
 * A visual change requires a new frame/template version; dynamic football
 * facts remain revision-fenced by the calling content module.
 */
export const TOUCHLINE_SOCIAL_DUEL_FRAME = Object.freeze({
  width: 1080,
  height: 1350,
  contenderCount: 2,
  cardWidth: 292,
  cardAxis: "0deg",
  centreMark: "VS",
  heading: "CLUB LEADERS HEAD-TO-HEAD",
  ratingLabel: "TOTAL RATING",
  leaderLabel: "CURRENT CLUB LEADER",
} as const);

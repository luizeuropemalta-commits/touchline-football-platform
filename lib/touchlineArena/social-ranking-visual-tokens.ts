/**
 * Owner-directed 044 surface contract. Ranking-family layout panels retain a
 * fixed 40% fumê opacity while canonical player cards remain unboxed.
 * Kept separate from locked 041–043 artwork tokens so approved templates do
 * not change when the 044 candidate family evolves during visual review.
 */
export const TOUCHLINE_SOCIAL_RANKING_FUME = Object.freeze({
  opacity: 0.4,
  transparency: 0.6,
});

export const TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES = Object.freeze({
  "--touchline-social-glass-isolated-panel": `rgba(2,18,14,${TOUCHLINE_SOCIAL_RANKING_FUME.opacity})`,
});

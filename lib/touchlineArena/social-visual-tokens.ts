/**
 * Shared social-art glass contract for card frames placed over canonical
 * TouchLine Arena imagery. The two layers remain translucent by design: the
 * Arena must stay perceptible without sacrificing legibility over a bright
 * part of the venue photograph.
 */
export const TOUCHLINE_SOCIAL_ARENA_GLASS = Object.freeze({
  outerStartAlpha: 0.36,
  outerEndAlpha: 0.28,
  innerStartAlpha: 0.45,
  innerEndAlpha: 0.4,
  outerBlurPx: 10,
  innerBlurPx: 8,
  foreground: "#f8fff0",
  minimumContrastRatio: 4.5,
  minimumArenaTransmission: 0.3,
});

export const TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES = Object.freeze({
  "--touchline-social-glass-outer-start": `rgba(2,18,14,${TOUCHLINE_SOCIAL_ARENA_GLASS.outerStartAlpha})`,
  "--touchline-social-glass-outer-end": `rgba(0,8,7,${TOUCHLINE_SOCIAL_ARENA_GLASS.outerEndAlpha})`,
  "--touchline-social-glass-inner-start": `rgba(1,15,12,${TOUCHLINE_SOCIAL_ARENA_GLASS.innerStartAlpha})`,
  "--touchline-social-glass-inner-end": `rgba(0,7,6,${TOUCHLINE_SOCIAL_ARENA_GLASS.innerEndAlpha})`,
  "--touchline-social-glass-outer-filter": `blur(${TOUCHLINE_SOCIAL_ARENA_GLASS.outerBlurPx}px) saturate(.94)`,
  "--touchline-social-glass-inner-filter": `blur(${TOUCHLINE_SOCIAL_ARENA_GLASS.innerBlurPx}px) saturate(.96)`,
});

export function touchlineSocialArenaGlassMinimumTransmission() {
  const highestOuterAlpha = Math.max(
    TOUCHLINE_SOCIAL_ARENA_GLASS.outerStartAlpha,
    TOUCHLINE_SOCIAL_ARENA_GLASS.outerEndAlpha,
  );
  const highestInnerAlpha = Math.max(
    TOUCHLINE_SOCIAL_ARENA_GLASS.innerStartAlpha,
    TOUCHLINE_SOCIAL_ARENA_GLASS.innerEndAlpha,
  );
  return (1 - highestOuterAlpha) * (1 - highestInnerAlpha);
}

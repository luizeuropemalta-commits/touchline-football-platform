import { CARD_ART_PERIMETER_PATHS, resolvePlayerCardArtPerimeterPath } from "@/lib/touchlineArena/card-art-perimeter-paths";
/**
 * Follow the measured silhouette of the unchanged official artwork. All
 * travelling and resting strokes share that path; no geometric overshoot is
 * added below the gem or above the frame. Unknown artwork has no neon.
 * `pathLength` keeps the dash timing independent from rendered card size.
 */
export type TouchlineCardPerimeterTier =
  | "ruby-red"
  | "sapphire-blue"
  | "amethyst-purple"
  | "radiant-gold"
  | "emerald-green"
  | "clear-diamond"
  | "diamond-gold";

type TouchlineCardPerimeterVariant = "player" | "coach";

function isPerimeterTier(tier: string | null | undefined): tier is TouchlineCardPerimeterTier {
  return typeof tier === "string" && Object.hasOwn(CARD_ART_PERIMETER_PATHS.coach, tier);
}

export function TouchlineCardPerimeterTrace({
  tier,
  variant = "player",
  frameUrl,
}: Readonly<{ tier?: string | null; variant?: TouchlineCardPerimeterVariant; frameUrl?: string | null }>) {
  const approvedArtwork = variant === "player"
    ? resolvePlayerCardArtPerimeterPath(frameUrl)
    : isPerimeterTier(tier) ? CARD_ART_PERIMETER_PATHS.coach[tier] : null;
  if (!approvedArtwork || !isPerimeterTier(tier)) return null;
  const path = approvedArtwork;
  const isCoach = variant === "coach";
  return (
    <svg
      data-touchline-card-neon-trace="true"
      data-touchline-card-neon-trace-tier={isPerimeterTier(tier) ? tier : "fallback"}
      data-touchline-card-neon-trace-variant={variant}
      aria-hidden="true"
      focusable="false"
      viewBox={isCoach ? "0 0 810 1080" : "0 0 430 691"}
      preserveAspectRatio={isCoach ? "xMidYMid meet" : "none"}
    >
      <path
        data-touchline-card-neon-trace-halo="base"
        d={path}
        pathLength="100"
        fill="none"
      />
      <path
        data-touchline-card-neon-trace-base="true"
        d={path}
        pathLength="100"
        fill="none"
      />
      {/* One dash animation keeps the touch halo and its sharp core in phase.
          Each stroke follows the same measured artwork path; no bitmap is copied. */}
      <g data-touchline-card-neon-trace-run="true">
        <path data-touchline-card-neon-trace-halo="run-outer" d={path} pathLength="100" fill="none" />
        <path data-touchline-card-neon-trace-halo="run-inner" d={path} pathLength="100" fill="none" />
        <path data-touchline-card-neon-trace-run-core="true" d={path} pathLength="100" fill="none" />
      </g>
    </svg>
  );
}

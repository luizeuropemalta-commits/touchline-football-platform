import { CARD_ART_PERIMETER_PATHS, resolvePlayerCardArtPerimeterPath } from "@/lib/touchlineArena/card-art-perimeter-paths";
/**
 * Owner-approved original trace: centred side rails and proud top/base.
 * Original artwork validation remains required. Unknown artwork has no neon.
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

export const TOUCHLINE_PLAYER_PERIMETER_SIDE_CENTRES: Readonly<Record<TouchlineCardPerimeterTier, readonly [number, number]>> = {
  "ruby-red": [21, 412],
  "sapphire-blue": [18, 412],
  "amethyst-purple": [14, 417],
  "radiant-gold": [15, 414],
  "emerald-green": [25, 411],
  "clear-diamond": [19, 412],
  "diamond-gold": [29, 400],
};

export const TOUCHLINE_COACH_PERIMETER_SIDE_CENTRES: Readonly<Record<TouchlineCardPerimeterTier, readonly [number, number]>> = {
  "ruby-red": [95, 711],
  "sapphire-blue": [79, 726],
  "amethyst-purple": [78, 730],
  "radiant-gold": [89, 715],
  "emerald-green": [78, 725],
  "clear-diamond": [76, 748],
  "diamond-gold": [80, 733],
};

function isPerimeterTier(tier: string | null | undefined): tier is TouchlineCardPerimeterTier {
  return typeof tier === "string" && Object.hasOwn(TOUCHLINE_PLAYER_PERIMETER_SIDE_CENTRES, tier);
}

export function touchlineCardPerimeterPath(
  tier: string | null | undefined,
  variant: TouchlineCardPerimeterVariant = "player",
) {
  if (!isPerimeterTier(tier)) return "";

  if (variant === "coach") {
    const [left, right] = TOUCHLINE_COACH_PERIMETER_SIDE_CENTRES[tier];
    // Keep the approved lower overshoot (y=1063) while centring only the
    // vertical rails on the coach artwork, whose 810×1080 canvas differs
    // from the 430×691 player-card canvas.
    return `M232 28H578L${right} 153V926L578 1063H232L${left} 926V153Z`;
  }

  const [left, right] = TOUCHLINE_PLAYER_PERIMETER_SIDE_CENTRES[tier];
  // Keep the approved lower overshoot (y=680); only the side rails move.
  return `M123 18H307L${right} 98V593L307 680H123L${left} 593V98Z`;
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
  const path = touchlineCardPerimeterPath(tier, variant);
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
          Each stroke follows the same original geometric path; no bitmap is copied. */}
      <g data-touchline-card-neon-trace-run="true">
        <path data-touchline-card-neon-trace-halo="run-outer" d={path} pathLength="100" fill="none" />
        <path data-touchline-card-neon-trace-halo="run-inner" d={path} pathLength="100" fill="none" />
        <path data-touchline-card-neon-trace-run-core="true" d={path} pathLength="100" fill="none" />
      </g>
    </svg>
  );
}

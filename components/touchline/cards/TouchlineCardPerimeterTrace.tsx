/**
 * The card frame artwork stays untouched. This overlay supplies the one
 * continuous, tier-coloured perimeter trace above it, outside any cropped
 * artwork container. `pathLength` keeps the dash animation resolution
 * independent from the rendered card size (full, compact or zoom).
 *
 * The source frames do not share identical transparent gutters: applying one
 * geometric path to every border put a trace on the outside of some frames
 * and on the inside of others. These paths place the two vertical runs at the
 * measured midpoint of each official frame's visible side rail. Measurements
 * were taken from the real 430×691 player templates and the 810×1080 coach
 * zoom templates, over the uninterrupted vertical rail range (not from an
 * illustrative frame or from the lower jewel). The lower point remains at the
 * approved, slightly proud, extent.
 */
export const TOUCHLINE_CARD_PERIMETER_PATH = "M123 18H307L393 98V593L307 680H123L36 593V98Z";

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
  return Boolean(tier && tier in TOUCHLINE_PLAYER_PERIMETER_SIDE_CENTRES);
}

export function touchlineCardPerimeterPath(
  tier: string | null | undefined,
  variant: TouchlineCardPerimeterVariant = "player",
) {
  if (!isPerimeterTier(tier)) return TOUCHLINE_CARD_PERIMETER_PATH;

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
}: Readonly<{ tier?: string | null; variant?: TouchlineCardPerimeterVariant }>) {
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
      preserveAspectRatio="none"
    >
      <path
        data-touchline-card-neon-trace-base="true"
        d={path}
        pathLength="100"
        fill="none"
      />
      <path
        data-touchline-card-neon-trace-run="true"
        d={path}
        pathLength="100"
        fill="none"
      />
    </svg>
  );
}

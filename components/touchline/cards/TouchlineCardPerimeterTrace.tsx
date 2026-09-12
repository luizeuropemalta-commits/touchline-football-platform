/**
 * The card frame artwork stays untouched. This overlay supplies the one
 * continuous, tier-coloured perimeter trace above it, outside any cropped
 * artwork container. `pathLength` keeps the dash animation resolution
 * independent from the rendered card size (full, compact or zoom).
 *
 * The source frames do not share identical transparent gutters: applying one
 * geometric path to every border put a trace on the outside of some frames
 * and on the inside of others. These paths place the two vertical runs at the
 * measured midpoint of each official frame's visible side rail. The lower
 * point remains at the approved, slightly proud, extent.
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

const PLAYER_SIDE_CENTRES: Readonly<Record<TouchlineCardPerimeterTier, readonly [number, number]>> = {
  "ruby-red": [51, 377],
  "sapphire-blue": [42, 387],
  "amethyst-purple": [43, 386],
  "radiant-gold": [50, 379],
  "emerald-green": [37, 391],
  "clear-diamond": [39, 391],
  "diamond-gold": [38, 391],
};

const COACH_SIDE_CENTRES: Readonly<Record<TouchlineCardPerimeterTier, readonly [number, number]>> = {
  "ruby-red": [70, 738],
  "sapphire-blue": [58, 752],
  "amethyst-purple": [54, 751],
  "radiant-gold": [68, 739],
  "emerald-green": [57, 753],
  "clear-diamond": [50, 760],
  "diamond-gold": [54, 756],
};

function isPerimeterTier(tier: string | null | undefined): tier is TouchlineCardPerimeterTier {
  return Boolean(tier && tier in PLAYER_SIDE_CENTRES);
}

export function touchlineCardPerimeterPath(
  tier: string | null | undefined,
  variant: TouchlineCardPerimeterVariant = "player",
) {
  if (!isPerimeterTier(tier)) return TOUCHLINE_CARD_PERIMETER_PATH;

  if (variant === "coach") {
    const [left, right] = COACH_SIDE_CENTRES[tier];
    // Keep the approved lower overshoot (y=1063) while centring only the
    // vertical rails on the coach artwork, whose 810×1080 canvas differs
    // from the 430×691 player-card canvas.
    return `M232 28H578L${right} 153V926L578 1063H232L${left} 926V153Z`;
  }

  const [left, right] = PLAYER_SIDE_CENTRES[tier];
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

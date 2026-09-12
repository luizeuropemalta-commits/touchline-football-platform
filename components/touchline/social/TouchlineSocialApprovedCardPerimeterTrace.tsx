/**
 * The card frame artwork stays untouched. This overlay supplies the one
 * continuous, tier-coloured perimeter trace above it, outside any cropped
 * artwork container. `pathLength` keeps the dash animation resolution
 * independent from the rendered card size (full, compact or zoom).
 */
export const TOUCHLINE_CARD_PERIMETER_PATH = "M123 18H307L393 98V593L307 680H123L36 593V98Z";

export function TouchlineCardPerimeterTrace() {
  return (
    <svg
      data-touchline-card-neon-trace="true"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 430 691"
      preserveAspectRatio="none"
    >
      <path
        data-touchline-card-neon-trace-base="true"
        d={TOUCHLINE_CARD_PERIMETER_PATH}
        pathLength="100"
        fill="none"
      />
      <path
        data-touchline-card-neon-trace-run="true"
        d={TOUCHLINE_CARD_PERIMETER_PATH}
        pathLength="100"
        fill="none"
      />
    </svg>
  );
}

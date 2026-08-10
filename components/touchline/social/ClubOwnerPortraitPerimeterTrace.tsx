/**
 * Decorative-only Club Owner portrait perimeter. It intentionally has no
 * data or colour input: the Club Owner mark is always TouchLine green.
 * The photo remains in its own clipped element, while this SVG stays outside
 * that crop so its continuous centre-line is never cut by the avatar mask.
 */
export function ClubOwnerPortraitPerimeterTrace() {
  return (
    <svg
      data-club-owner-portrait-neon-trace="true"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <circle
        data-club-owner-portrait-neon-trace-base="true"
        cx="50"
        cy="50"
        r="48"
        pathLength="100"
        fill="none"
      />
      <circle
        data-club-owner-portrait-neon-trace-run="true"
        cx="50"
        cy="50"
        r="48"
        pathLength="100"
        fill="none"
      />
    </svg>
  );
}

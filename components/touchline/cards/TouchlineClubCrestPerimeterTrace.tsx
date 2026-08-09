/**
 * Decorative only: a circular centre-line trace that sits above a club crest.
 * The host owns its canonical club colour through --touchline-club-crest-color.
 */
export function TouchlineClubCrestPerimeterTrace() {
  return (
    <svg
      aria-hidden="true"
      data-touchline-card-crest-trace="true"
      focusable="false"
      viewBox="0 0 100 100"
    >
      <circle
        cx="50"
        cy="50"
        data-touchline-card-crest-trace-base="true"
        fill="none"
        pathLength="100"
        r="46.5"
      />
      <circle
        cx="50"
        cy="50"
        data-touchline-card-crest-trace-run="true"
        fill="none"
        pathLength="100"
        r="46.5"
      />
    </svg>
  );
}

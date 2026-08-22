const SETTLED_RESULT_STATUS = /^(?:ft(?:[_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$/i;

/**
 * True only when a fixture has a settled football result. Cancelled,
 * postponed and abandoned fixtures are terminal for navigation but must not
 * settle player or coach scoring as a completed match.
 */
export function isTouchLineSettledFixtureStatus(value?: string | null) {
  return SETTLED_RESULT_STATUS.test(String(value ?? "").trim());
}

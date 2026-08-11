/**
 * Controls the irreversible public cutover from legacy verified cards to the
 * protected manual-publication lifecycle. It defaults OFF so deploying schema
 * and code cannot blank existing cards before backfill evidence exists.
 */
export const TOUCHLINE_CARD_PUBLICATION_GATE_ENV = "TOUCHLINE_CARD_PUBLICATION_GATE";
export const TOUCHLINE_CARD_PUBLICATION_GATE_ENABLED = "enabled";

export function isTouchlineCardPublicationGateEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment[TOUCHLINE_CARD_PUBLICATION_GATE_ENV]?.trim().toLowerCase()
    === TOUCHLINE_CARD_PUBLICATION_GATE_ENABLED;
}

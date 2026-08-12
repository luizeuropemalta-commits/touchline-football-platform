import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_CARD_PUBLICATION_GATE_ENABLED,
  TOUCHLINE_CARD_PUBLICATION_GATE_ENV,
  isTouchlineCardPublicationGateEnabled,
} from "../lib/touchlineArena/card-publication-gate.ts";

test("the manual-publication gate defaults off and accepts only its explicit value", () => {
  assert.equal(isTouchlineCardPublicationGateEnabled({}), false);
  assert.equal(isTouchlineCardPublicationGateEnabled({ [TOUCHLINE_CARD_PUBLICATION_GATE_ENV]: "true" }), false);
  assert.equal(isTouchlineCardPublicationGateEnabled({ [TOUCHLINE_CARD_PUBLICATION_GATE_ENV]: "disabled" }), false);
  assert.equal(isTouchlineCardPublicationGateEnabled({ [TOUCHLINE_CARD_PUBLICATION_GATE_ENV]: TOUCHLINE_CARD_PUBLICATION_GATE_ENABLED }), true);
  assert.equal(isTouchlineCardPublicationGateEnabled({ [TOUCHLINE_CARD_PUBLICATION_GATE_ENV]: " ENABLED " }), true);
});

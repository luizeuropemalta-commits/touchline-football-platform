import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderer = readFileSync(
  new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url),
  "utf8",
);

test("My Club private controls localize their visible operational copy", () => {
  assert.match(renderer, /const clubCopy = isPortuguese \?/);
  assert.match(renderer, /market: "Meu elenco"/);
  assert.match(renderer, /market: "My squad"/);
  assert.match(renderer, /wallet: "Carteira"/);
  assert.match(renderer, /wallet: "Wallet"/);
  assert.match(renderer, /paymentPending: "Secure payment pending integration"/);
  assert.match(renderer, /xiRule: "11 posições"/);
  assert.match(renderer, /xiRule: "11 positions"/);
  assert.doesNotMatch(renderer, /"Ver coleção completa"|"View full collection"/);
  assert.match(renderer, /\{clubCopy\.addCredits\}/);
  assert.match(renderer, /"Build your XI by position"/);
  assert.doesNotMatch(renderer, />Gerir no Mercado de Cards</);
  assert.doesNotMatch(renderer, /club-owner-training|trainingCentre|Training Centre|Centro de Treinamento/);
});

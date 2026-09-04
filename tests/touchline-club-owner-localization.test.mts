import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderer = readFileSync(
  new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url),
  "utf8",
);

test("ClubOwner private controls localize their visible operational copy", () => {
  assert.match(renderer, /const clubCopy = isPortuguese \?/);
  assert.match(renderer, /clubDirection: "Direção do clube"/);
  assert.match(renderer, /clubDirection: "Club direction"/);
  assert.match(renderer, /paymentPending: "Secure payment pending integration"/);
  assert.match(renderer, /"Timeline oficial TouchLine"/);
  assert.match(renderer, /"TouchLine official timeline"/);
  assert.match(renderer, /"Notícias oficiais primeiro"/);
  assert.match(renderer, /"Official news first"/);
  assert.match(renderer, /"View full collection"/);
  assert.match(renderer, /\{clubCopy\.manageMarket\}/);
  assert.doesNotMatch(renderer, />Gerir no Mercado de Cards</);
  assert.doesNotMatch(renderer, /club-owner-training|trainingCentre|Training Centre|Centro de Treinamento/);
});

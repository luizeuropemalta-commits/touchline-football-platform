import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cardSource = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

test("the shared player card localizes every discipline label", () => {
  assert.match(cardSource, /yellowRedCards: "Cartões amarelo e vermelho"/);
  assert.match(cardSource, /yellowCard: "Cartão amarelo"/);
  assert.match(cardSource, /redCard: "Cartão vermelho"/);
  assert.match(cardSource, /yellowCards: "Cartões amarelos"/);
  assert.match(cardSource, /redCards: "Cartões vermelhos"/);
  assert.match(cardSource, /aria-label=\{cardLabels\.yellowRedCards\}/);
  assert.match(cardSource, /label: cardLabels\.yellowCards/);
  assert.match(cardSource, /label: cardLabels\.redCards/);
});

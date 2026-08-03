import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTouchlineCommercialCardPrice,
  formatTouchlineCommercialCardTotal,
  resolveTouchlineCommercialCardPrice,
} from "../lib/touchlineArena/commercial-card-pricing.ts";

test("the same tier retains its nominal number across England, Europe and Brazil", () => {
  const england = resolveTouchlineCommercialCardPrice({ tierKey: "diamond-gold", competition: "england" });
  const europe = resolveTouchlineCommercialCardPrice({ tierKey: "diamond-gold", competition: "europe" });
  const brazil = resolveTouchlineCommercialCardPrice({ tierKey: "diamond-gold", competition: "brazil" });

  assert.deepEqual(england, { tierKey: "diamond-gold", numericPrice: 15, currency: "GBP", amountMinor: 1500 });
  assert.deepEqual(europe, { tierKey: "diamond-gold", numericPrice: 15, currency: "EUR", amountMinor: 1500 });
  assert.deepEqual(brazil, { tierKey: "diamond-gold", numericPrice: 15, currency: "BRL", amountMinor: 1500 });
});

test("currency presentation changes only the official competition symbol", () => {
  assert.equal(formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({ tierKey: "diamond-gold", competition: "england" })), "£15");
  assert.equal(formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({ tierKey: "diamond-gold", competition: "europe" })), "€15");
  assert.equal(formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({ tierKey: "diamond-gold", competition: "brazil" })), "R$15");
});

test("aggregate card values use the same competition currency formatter", () => {
  assert.equal(formatTouchlineCommercialCardTotal({ numericPrice: 37, competition: "england" }), "£37");
  assert.equal(formatTouchlineCommercialCardTotal({ numericPrice: 37, competition: "europe" }), "€37");
  assert.equal(formatTouchlineCommercialCardTotal({ numericPrice: 37, competition: "brazil" }), "R$37");
  assert.throws(() => formatTouchlineCommercialCardTotal({ numericPrice: 1.5, competition: "england" }));
});

test("minor amounts use integer cents, pence or centavos with no conversion", () => {
  const sapphireEngland = resolveTouchlineCommercialCardPrice({ tierKey: "sapphire-blue", competition: "england" });
  const sapphireBrazil = resolveTouchlineCommercialCardPrice({ tierKey: "sapphire-blue", competition: "brazil" });
  assert.equal(sapphireEngland.numericPrice, 1);
  assert.equal(sapphireEngland.amountMinor, 100);
  assert.equal(sapphireBrazil.amountMinor, 100);
  assert.equal(sapphireEngland.numericPrice, sapphireBrazil.numericPrice);
});

test("the zero-priced approved tier stays numeric zero in every competition", () => {
  const price = resolveTouchlineCommercialCardPrice({ tierKey: "ruby-red", competition: "england" });
  assert.deepEqual(price, { tierKey: "ruby-red", numericPrice: 0, currency: "GBP", amountMinor: 0 });
  assert.equal(formatTouchlineCommercialCardPrice(price), "£0");
});

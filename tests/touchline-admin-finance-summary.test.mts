import assert from "node:assert/strict";
import test from "node:test";
import { summarizeInvoiceSample, summarizeFeeSample, formatStripeMinorAmount } from "../lib/admin/finance-summary.ts";

test("invoice sample keeps currencies separate and only totals the supplied window", () => {
  const rows = [
    { currency: "eur", amount_paid: 100, amount_due: 20 },
    { currency: "USD", amount_paid: 300, amount_due: 0 },
    { currency: "EUR", amount_paid: 200, amount_due: 30 },
  ];
  assert.deepEqual(summarizeInvoiceSample(rows), { status: "ready", currencies: [
    { currency: "EUR", paid: 300, due: 50, count: 2 },
    { currency: "USD", paid: 300, due: 0, count: 1 },
  ] });
  assert.deepEqual(summarizeInvoiceSample(rows.slice(0, 1)), { status: "ready", currencies: [
    { currency: "EUR", paid: 100, due: 20, count: 1 },
  ] });
  assert.equal(rows[0].currency, "eur", "caller input remains unchanged");
});

test("failed or missing invoice reads cannot become confirmed zero", () => {
  assert.deepEqual(summarizeInvoiceSample(null), { status: "unavailable", currencies: [] });
  assert.deepEqual(summarizeInvoiceSample([], true), { status: "unavailable", currencies: [] });
  assert.deepEqual(summarizeInvoiceSample([{ currency: "eur", amount_paid: 500, amount_due: 0 }], true), { status: "unavailable", currencies: [] });
  assert.deepEqual(summarizeInvoiceSample([]), { status: "ready", currencies: [] });
  assert.deepEqual(summarizeInvoiceSample([{ currency: "eur", amount_paid: 0, amount_due: 0 }]), { status: "ready", currencies: [{ currency: "EUR", paid: 0, due: 0, count: 1 }] });
});

test("malformed or unsafe amounts never yield a financial total", () => {
  for (const amount of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(summarizeInvoiceSample([{ currency: "eur", amount_paid: amount, amount_due: 0 }]).status, "unavailable");
    assert.equal(summarizeInvoiceSample([{ currency: "eur", amount_paid: 0, amount_due: amount }]).status, "unavailable");
  }
  assert.equal(summarizeInvoiceSample([{ currency: "TC", amount_paid: 100, amount_due: 0 }]).status, "unavailable");
  assert.equal(summarizeInvoiceSample([{ currency: "eur", amount_paid: Number.MAX_SAFE_INTEGER, amount_due: 0 }, { currency: "eur", amount_paid: 1, amount_due: 0 }]).status, "unavailable");
});

test("fee sample is independent, currency grouped and retains fee reversals", () => {
  assert.deepEqual(summarizeFeeSample([{ currency: "usd", fee: 30 }, { currency: "eur", fee: 20 }, { currency: "usd", fee: -10 }]), {
    status: "ready", currencies: [{ currency: "EUR", fees: 20, count: 1 }, { currency: "USD", fees: 20, count: 2 }],
  });
  assert.deepEqual(summarizeFeeSample([]), { status: "ready", currencies: [] });
  assert.deepEqual(summarizeFeeSample(null), { status: "unavailable", currencies: [] });
  assert.deepEqual(summarizeFeeSample([], true), { status: "unavailable", currencies: [] });
  assert.equal(summarizeFeeSample([{ currency: "eur", fee: NaN }]).status, "unavailable");
  assert.equal(summarizeFeeSample([{ currency: "eur", fee: Number.MAX_SAFE_INTEGER }, { currency: "eur", fee: 1 }]).status, "unavailable");
});


test("Stripe minor units preserve EUR/USD and zero-decimal JPY with ISK/UGX exceptions", () => {
  assert.equal(formatStripeMinorAmount(500, "en-US", "EUR"), "€5.00");
  assert.equal(formatStripeMinorAmount(500, "en-US", "usd"), "$5.00");
  assert.equal(formatStripeMinorAmount(500, "en-US", "JPY"), "¥500");
  assert.equal(formatStripeMinorAmount(-500, "en-US", "JPY"), "-¥500");
  assert.match(formatStripeMinorAmount(500, "en-US", "ISK"), /5\.00$/);
  assert.match(formatStripeMinorAmount(500, "en-US", "UGX"), /5\.00$/);
  assert.match(formatStripeMinorAmount(-25, "en-US", "EUR"), /-€0\.25/);
  assert.match(formatStripeMinorAmount(500, "en-US", "MGA"), /500$/);
  assert.match(formatStripeMinorAmount(1000, "en-US", "KWD"), /1\.000$/);
  assert.match(formatStripeMinorAmount(1001, "en-US", "BHD"), /1\.001$/);
  // ISO uses 3/4 decimals here; that alone must not override Stripe's default API unit.
  assert.match(formatStripeMinorAmount(1000, "en-US", "IQD"), /10\.00$/);
  assert.equal(formatStripeMinorAmount(1000, "en-US", "CLF"), "—", "non-currency units excluded by ISO registry");
});

test("invalid currency, locale and amounts render unavailable without throwing", () => {
  for (const currency of ["", "TC", "ZZZ", "EURO", " eur", "12$"]) {
    assert.equal(formatStripeMinorAmount(500, "en-US", currency), "—");
    assert.equal(summarizeInvoiceSample([{ currency, amount_paid: 500, amount_due: 0 }]).status, "unavailable");
  }
  for (const amount of [NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) assert.equal(formatStripeMinorAmount(amount, "en-US", "EUR"), "—");
  assert.equal(formatStripeMinorAmount(500, "invalid_locale", "EUR"), "—");
});

test("original amount due stays original even for a fully paid invoice", () => {
  const summary = summarizeInvoiceSample([{ currency: "eur", amount_paid: 100, amount_due: 100 }]);
  assert.deepEqual(summary, { status: "ready", currencies: [{ currency: "EUR", paid: 100, due: 100, count: 1 }] });
  // This projection never derives outstanding debt by subtraction or status.
  assert.equal("outstanding" in summary.currencies[0], false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { formatTcLedgerSubunits, summarizeTcLedgerSample } from "../lib/admin/tc-ledger-summary.ts";

test("TC sample accepts credits and reversals without converting them to fiat", () => {
  assert.deepEqual(summarizeTcLedgerSample([{ currency: "TC ", amount_cents: 10001 }, { currency: "TC", amount_cents: -100 }]), { subunits: 9901, count: 2 });
  assert.equal(formatTcLedgerSubunits(9901, "pt-BR"), "99,01 TC");
  assert.equal(formatTcLedgerSubunits(-1, "en-GB"), "−0.01 TC");
  assert.equal(formatTcLedgerSubunits(100, "en-GB"), "1 TC");
});

test("failed, noncanonical or unsafe samples never become a zero balance", () => {
  assert.equal(summarizeTcLedgerSample(null), null);
  assert.equal(summarizeTcLedgerSample([], true), null);
  for (const currency of ["EUR", "GBP", "", "tc"]) assert.equal(summarizeTcLedgerSample([{ currency, amount_cents: 100 }]), null);
  for (const amount_cents of [NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) assert.equal(summarizeTcLedgerSample([{ currency: "TC", amount_cents }]), null);
  assert.equal(summarizeTcLedgerSample([{ currency: "TC", amount_cents: Number.MAX_SAFE_INTEGER }, { currency: "TC", amount_cents: 1 }]), null);
  assert.deepEqual(summarizeTcLedgerSample([]), { subunits: 0, count: 0 });
});

test("large TC amounts preserve the original fractional subunits", () => {
  assert.equal(formatTcLedgerSubunits(Number.MAX_SAFE_INTEGER, "en-GB"), "90,071,992,547,409.91 TC");
  assert.equal(formatTcLedgerSubunits(Number.MIN_SAFE_INTEGER, "pt-BR"), "−90.071.992.547.409,91 TC");
});

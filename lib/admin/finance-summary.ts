/** Read-only samples: never combine currencies or infer a reconciled net. */
export type FinanceInvoiceSample = {
  currency: string;
  amount_paid: number;
  /** Original invoice amount_due, not amount_remaining or an outstanding balance. */
  amount_due: number;
};
export type FinanceFeeSample = { currency: string; fee: number };
export type FinanceSample<T> =
  | { status: "unavailable"; currencies: T[] }
  | { status: "ready"; currencies: T[] };
export type InvoiceCurrencySummary = { currency: string; paid: number; due: number; count: number };
export type FeeCurrencySummary = { currency: string; fees: number; count: number };
function currencyCode(value: string): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z]{3}$/.test(value)) return null;
  const code = value.toUpperCase();
  try {
    return Intl.supportedValuesOf("currency").includes(code) ? code : null;
  } catch {
    return null;
  }
}

// Stripe API units, not payout eligibility. ISK/UGX retain two-decimal API units.
// https://docs.stripe.com/currencies#zero-decimal and #special-cases
const stripeZeroDecimal = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "VND", "VUV", "XAF", "XOF", "XPF"]);
// Explicit Stripe three-decimal exceptions; ISO formatting is not API-unit authority.
// https://support.stripe.com/questions/which-payments-methods-and-products-are-available-in-the-uae
const stripeThreeDecimal = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
export function formatStripeMinorAmount(amount: number, locale: string, currency: string): string {
  const code = currencyCode(currency);
  if (!code || !Number.isSafeInteger(amount)) return "—";
  try {
    const digits = code === "ISK" || code === "UGX" ? 2 : stripeZeroDecimal.has(code) ? 0 : stripeThreeDecimal.has(code) ? 3 : 2;
    // Keep fractional fee adjustments visible, even for the compatibility currencies.
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount / 10 ** digits);
  } catch {
    return "—";
  }
}
const validAmount = (value: number) => Number.isSafeInteger(value) && value >= 0;

export function summarizeInvoiceSample(rows: readonly FinanceInvoiceSample[] | null, failed = false): FinanceSample<InvoiceCurrencySummary> {
  if (failed || !rows) return { status: "unavailable", currencies: [] };
  const groups = new Map<string, InvoiceCurrencySummary>();
  for (const row of rows) {
    const currency = currencyCode(row.currency);
    if (!currency || !validAmount(row.amount_paid) || !validAmount(row.amount_due)) return { status: "unavailable", currencies: [] };
    const group = groups.get(currency) ?? { currency, paid: 0, due: 0, count: 0 };
    group.paid += row.amount_paid;
    group.due += row.amount_due;
    group.count += 1;
    if (!Number.isSafeInteger(group.paid) || !Number.isSafeInteger(group.due)) return { status: "unavailable", currencies: [] };
    groups.set(currency, group);
  }
  return { status: "ready", currencies: [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
}

export function summarizeFeeSample(rows: readonly FinanceFeeSample[] | null, failed = false): FinanceSample<FeeCurrencySummary> {
  if (failed || !rows) return { status: "unavailable", currencies: [] };
  const groups = new Map<string, FeeCurrencySummary>();
  for (const row of rows) {
    const currency = currencyCode(row.currency);
    // Stripe adjustments may reverse previously charged fees.
    if (!currency || !Number.isSafeInteger(row.fee)) return { status: "unavailable", currencies: [] };
    const group = groups.get(currency) ?? { currency, fees: 0, count: 0 };
    group.fees += row.fee;
    group.count += 1;
    if (!Number.isSafeInteger(group.fees)) return { status: "unavailable", currencies: [] };
    groups.set(currency, group);
  }
  return { status: "ready", currencies: [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
}

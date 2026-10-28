/** Historical game-credit sample, never company cash or the current wallet. */
export function summarizeTcLedgerSample(rows: readonly { currency: string; amount_cents: number }[] | null, failed = false) {
  if (failed || !rows) return null;
  let total = BigInt(0);
  for (const row of rows) {
    if (typeof row.currency !== "string" || row.currency.trim() !== "TC" || !Number.isSafeInteger(row.amount_cents)) return null;
    total += BigInt(row.amount_cents);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return { subunits: Number(total), count: rows.length };
}

/** 100 ledger subunits = 1 TC. Keep cents exact even near the safe-integer limit. */
export function formatTcLedgerSubunits(subunits: number, locale: string) {
  if (!Number.isSafeInteger(subunits)) return "—";
  const value = BigInt(subunits), magnitude = value < BigInt(0) ? -value : value;
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(magnitude / BigInt(100));
  const fraction = String(magnitude % BigInt(100)).padStart(2, "0").replace(/0+$/, "");
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === "decimal")?.value ?? ".";
  return `${value < BigInt(0) ? "−" : ""}${whole}${fraction ? decimal + fraction : ""} TC`;
}

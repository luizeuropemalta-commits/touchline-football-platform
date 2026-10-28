type CurrencyOverview = {
  currency: string; exponent: number; obligations: string;
  registered: string; paid: string; outstanding: string; overpaid: string;
  overdue: string; overdueCount: string;
};
export type CompanyOverview = { asOf: string; suppliers: string; contracts: string; contractDeadlines: string; currencies: CurrencyOverview[] };
const integer = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9]\d{0,59})$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
export function parseCompanyOverview(value: unknown): CompanyOverview | null {
  if (!object(value) || typeof value.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)
    || !integer(value.suppliers) || !integer(value.contracts) || !integer(value.contractDeadlines)
    || !Array.isArray(value.currencies) || value.currencies.length > 1000) return null;
  const date = new Date(value.asOf + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.asOf) return null;
  const keys = new Set<string>();
  for (const row of value.currencies) {
    if (!object(row) || typeof row.currency !== "string" || !Intl.supportedValuesOf("currency").includes(row.currency)
      || typeof row.exponent !== "number" || !Number.isInteger(row.exponent) || row.exponent < 0 || row.exponent > 4
      || !["obligations", "registered", "paid", "outstanding", "overpaid", "overdue", "overdueCount"].every(key => integer(row[key]))) return null;
    const key = `${row.currency}:${row.exponent}`;
    if (keys.has(key)) return null;
    keys.add(key);
    if (BigInt(row.overdue as string) > BigInt(row.outstanding as string)
      || BigInt(row.overdueCount as string) > BigInt(row.obligations as string)
      || BigInt(row.registered as string) - BigInt(row.paid as string) !== BigInt(row.outstanding as string) - BigInt(row.overpaid as string)) return null;
  }
  return value as unknown as CompanyOverview;
}

export function formatCompanyOverviewAmount(value: string, exponent: number, currency: string, locale: string) {
  const padded = value.padStart(exponent + 1, "0");
  const whole = exponent ? padded.slice(0, -exponent) : padded;
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === "decimal")?.value ?? ".";
  return `${new Intl.NumberFormat(locale).format(BigInt(whole))}${exponent ? decimal + padded.slice(-exponent) : ""} ${currency}`;
}

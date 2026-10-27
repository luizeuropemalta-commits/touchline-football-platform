/** Company fiat obligations only. Not a payment executor, TC wallet or persistent ledger. */
export type CompanyMoney = Readonly<{ currency: string; minor: number; exponent: number }>;
export type CompanySupplier = Readonly<{ id: string; name: string }>;
export type CompanyContract = Readonly<{
  id: string; supplierId: string; title: string; startsOn: string; endsOn: string | null;
  renewalOn: string | null; cancellationDeadlineOn: string | null;
  documentReference: string | null;
}>;
export type CompanyObligation = Readonly<{
  id: string; supplierId: string; contractId: string | null; sourceReference: string;
  issuedOn: string; dueOn: string; amount: CompanyMoney;
}>;
/** Only independently confirmed payment records reduce an obligation. An invoice email does not. */
export type CompanySettlement = Readonly<{
  id: string; obligationId: string; amount: CompanyMoney; paidOn: string;
  confirmation: "PENDING" | "CONFIRMED";
  source: "BANK" | "PROVIDER" | "MANUAL";
  sourceReference: string; confirmedBy: string | null;
}>;
const requireValue = (condition: boolean, reason: string) => { if (!condition) throw new Error(`COMPANY_FINANCE_${reason}`); };
function text(value: string) { return typeof value === "string" && value.trim().length > 0 && value.length <= 1024; }
function date(value: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function validateCompanyMoney(money: CompanyMoney) {
  requireValue(typeof money.currency === "string" && /^[A-Z]{3}$/.test(money.currency)
    && Intl.supportedValuesOf("currency").includes(money.currency), "FIAT_CURRENCY_REQUIRED");
  requireValue(Number.isSafeInteger(money.minor) && money.minor >= 0, "INVALID_AMOUNT");
  // Preserve the source's minor-unit convention; never silently assume cents.
  requireValue(Number.isSafeInteger(money.exponent) && money.exponent >= 0 && money.exponent <= 4, "INVALID_UNIT");
}
export function validateCompanyContract(contract: CompanyContract, supplier: CompanySupplier) {
  requireValue(text(supplier.id) && text(supplier.name) && text(contract.id) && text(contract.title), "INVALID_IDENTITY");
  requireValue(contract.supplierId === supplier.id, "SUPPLIER_MISMATCH");
  requireValue(date(contract.startsOn), "INVALID_DATE");
  for (const value of [contract.endsOn, contract.renewalOn, contract.cancellationDeadlineOn]) {
    requireValue(value === null || date(value), "INVALID_DATE");
  }
  requireValue(contract.endsOn === null || contract.endsOn >= contract.startsOn, "INVALID_TERM");
  requireValue(contract.renewalOn === null || contract.renewalOn >= contract.startsOn, "INVALID_RENEWAL");
  requireValue(contract.cancellationDeadlineOn === null || contract.renewalOn === null
    || contract.cancellationDeadlineOn <= contract.renewalOn, "INVALID_CANCELLATION_DEADLINE");
  requireValue(contract.documentReference === null || text(contract.documentReference), "INVALID_DOCUMENT_REFERENCE");
}
export function companyContractMilestones(contract: CompanyContract, supplier: CompanySupplier, today: string, horizonDays = 30) {
  validateCompanyContract(contract, supplier);
  requireValue(date(today) && Number.isInteger(horizonDays) && horizonDays >= 0 && horizonDays <= 366, "INVALID_HORIZON");
  return ([['CANCELLATION_DEADLINE', contract.cancellationDeadlineOn], ['RENEWAL', contract.renewalOn], ['EXPIRY', contract.endsOn]] as const)
    .flatMap(([kind, on]) => {
      if (!on) return [];
      const days = (Date.parse(`${on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
      return days <= horizonDays ? [{ kind, on, days, state: days < 0 ? "PAST" as const : days === 0 ? "TODAY" as const : "UPCOMING" as const }] : [];
    }).sort((a, b) => a.on.localeCompare(b.on));
}
export function reconcileCompanyObligation(input: Readonly<{
  obligation: CompanyObligation; supplier: CompanySupplier; contract: CompanyContract | null;
  settlements: readonly CompanySettlement[]; today: string;
}>) {
  const { obligation, supplier, contract, today } = input;
  requireValue(text(obligation.id) && text(obligation.sourceReference) && text(supplier.id) && text(supplier.name), "INVALID_IDENTITY");
  requireValue(obligation.supplierId === supplier.id, "SUPPLIER_MISMATCH");
  requireValue(date(today) && date(obligation.issuedOn) && date(obligation.dueOn) && obligation.dueOn >= obligation.issuedOn, "INVALID_DATE");
  if (contract) validateCompanyContract(contract, supplier);
  requireValue(obligation.contractId === (contract?.id ?? null), "CONTRACT_MISMATCH");
  validateCompanyMoney(obligation.amount);
  const seen = new Map<string, string>();
  const sources = new Set<string>();
  let paidMinor = 0;
  for (const entry of input.settlements) {
    requireValue(text(entry.id) && text(entry.sourceReference) && date(entry.paidOn) && entry.paidOn <= today, "INVALID_SETTLEMENT");
    requireValue(entry.obligationId === obligation.id, "OBLIGATION_MISMATCH");
    requireValue(["PENDING", "CONFIRMED"].includes(entry.confirmation) && ["BANK", "PROVIDER", "MANUAL"].includes(entry.source), "INVALID_SETTLEMENT");
    validateCompanyMoney(entry.amount);
    requireValue(entry.amount.currency === obligation.amount.currency && entry.amount.exponent === obligation.amount.exponent, "MONEY_UNIT_MISMATCH");
    requireValue(entry.confirmation !== "CONFIRMED" || (entry.confirmedBy !== null && text(entry.confirmedBy)), "CONFIRMATION_ACTOR_REQUIRED");
    const identity = JSON.stringify([entry.obligationId, entry.amount.currency, entry.amount.minor, entry.amount.exponent, entry.paidOn, entry.confirmation, entry.source, entry.sourceReference, entry.confirmedBy]);
    if (seen.has(entry.id)) { requireValue(seen.get(entry.id) === identity, "CONFLICTING_SETTLEMENT"); continue; }
    seen.set(entry.id, identity);
    const sourceKey = JSON.stringify([entry.source, entry.sourceReference]);
    requireValue(!sources.has(sourceKey), "DUPLICATE_SETTLEMENT_SOURCE"); sources.add(sourceKey);
    if (entry.confirmation === "CONFIRMED") paidMinor += entry.amount.minor;
    requireValue(Number.isSafeInteger(paidMinor), "AMOUNT_OVERFLOW");
  }
  // Overpayment is surfaced for reconciliation; never silently clamp or invent a refund.
  const outstandingMinor = Math.max(0, obligation.amount.minor - paidMinor);
  const overpaidMinor = Math.max(0, paidMinor - obligation.amount.minor);
  return { currency: obligation.amount.currency, exponent: obligation.amount.exponent, paidMinor, outstandingMinor, overpaidMinor,
    settlementState: overpaidMinor > 0 ? "OVERPAID" : outstandingMinor === 0 ? "PAID" : paidMinor > 0 ? "PARTIAL" : "UNPAID",
    dueState: outstandingMinor === 0 ? "SETTLED" : obligation.dueOn < today ? "OVERDUE" : obligation.dueOn === today ? "DUE_TODAY" : "UPCOMING" } as const;
}

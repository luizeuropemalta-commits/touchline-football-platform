import type { TouchlineMarketValueImportRow } from "./market-value-import";

export type LicensedMarketValueSourceRequest = Readonly<{
  competitionId: string;
  season: string;
  playerIds?: readonly string[];
}>;

/**
 * Boundary for a future licensed source. There is deliberately no default
 * implementation and no caller in gameplay. Activation requires a contract,
 * server credentials and explicit owner approval.
 */
export interface LicensedMarketValueSourceAdapter {
  readonly id: string;
  fetchApprovedSnapshot(input: LicensedMarketValueSourceRequest): Promise<readonly TouchlineMarketValueImportRow[]>;
}

export function requireLicensedMarketValueSource(
  adapter: LicensedMarketValueSourceAdapter | null | undefined,
): LicensedMarketValueSourceAdapter {
  if (!adapter) throw new Error("TL_MARKET_VALUE_LICENSED_SOURCE_NOT_CONFIGURED");
  return adapter;
}

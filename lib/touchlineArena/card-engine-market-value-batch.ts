import {
  CARD_ENGINE_IMPORT_MAX_ROWS,
  resolveCardEngineImportRows,
  type CardEngineCandidate,
  type CardEngineImportInput,
  type CardEngineResolvedRow,
} from "./card-engine-editorial-import.ts";
import type { TouchlineMarketValueImportRow } from "./market-value-import.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TouchlineMarketValueBatchSource = "licensed_import" | "manual_approval";

type AuditedMarketValueRaw = CardEngineImportInput & Readonly<{
  marketValueSource: Readonly<{
    source: TouchlineMarketValueBatchSource;
    externalPlayerId: string | null;
    sourceUrl: string | null;
    marketValue: number | null;
    currency: TouchlineMarketValueImportRow["currency"];
  }>;
}>;

function validateRows(rows: readonly TouchlineMarketValueImportRow[]) {
  if (!rows.length || rows.length > CARD_ENGINE_IMPORT_MAX_ROWS) {
    throw new Error(`A Market Values batch must contain between 1 and ${CARD_ENGINE_IMPORT_MAX_ROWS} rows.`);
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const playerId = row.playerId.trim().toLowerCase();
    if (!UUID_PATTERN.test(playerId)) throw new Error("Every Market Values row requires a canonical player UUID.");
    if (seen.has(playerId)) throw new Error("A Market Values batch cannot contain the same canonical player twice.");
    seen.add(playerId);
    if (row.marketValueEur === null || !Number.isSafeInteger(row.marketValueEur) || row.marketValueEur < 0) {
      throw new Error("Every Market Values row requires a whole non-negative EUR value before Card Engine review.");
    }
  }
}

/**
 * Converts the existing Market Values snapshot into the canonical Card Engine
 * row contract. Club is deliberately inferred from the fenced canonical
 * candidate, so a single batch can safely contain players from many clubs.
 */
export function prepareTouchlineMarketValueCardEngineRows(input: Readonly<{
  rows: readonly TouchlineMarketValueImportRow[];
  candidates: readonly CardEngineCandidate[];
  source: TouchlineMarketValueBatchSource;
}>): CardEngineResolvedRow[] {
  validateRows(input.rows);
  const resolved = resolveCardEngineImportRows(
    input.rows.map((row) => ({
      playerId: row.playerId.trim().toLowerCase(),
      marketValueEur: row.marketValueEur,
    })),
    input.candidates,
  );

  return resolved.map((row, index) => ({
    ...row,
    raw: {
      ...row.raw,
      marketValueSource: {
        source: input.source,
        externalPlayerId: input.rows[index]!.externalPlayerId?.trim() || null,
        sourceUrl: input.rows[index]!.sourceUrl?.trim() || null,
        marketValue: input.rows[index]!.marketValue,
        currency: input.rows[index]!.currency,
      },
    } satisfies AuditedMarketValueRaw,
  }));
}

/** Stable ordered payload used to derive batch content/idempotency checksums. */
export function touchlineMarketValueBatchContentIdentity(input: Readonly<{
  scope: string;
  verifiedSeason: string;
  source: TouchlineMarketValueBatchSource;
  jobKey: string;
  competitionId?: string | null;
  clubId?: string | null;
  rows: readonly TouchlineMarketValueImportRow[];
}>) {
  return JSON.stringify({
    scope: input.scope,
    verifiedSeason: input.verifiedSeason,
    source: input.source,
    jobKey: input.jobKey,
    competitionId: input.competitionId ?? null,
    clubId: input.clubId ?? null,
    rows: input.rows.map((row) => ({
      playerId: row.playerId.trim().toLowerCase(),
      externalPlayerId: row.externalPlayerId?.trim() || null,
      sourceUrl: row.sourceUrl?.trim() || null,
      marketValue: row.marketValue,
      currency: row.currency,
      marketValueEur: row.marketValueEur,
    })),
  });
}

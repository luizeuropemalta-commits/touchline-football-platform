import type { TouchlineMarketValueImportRow } from "./market-value-import";

export type TouchlineMarketValueSpreadsheetAdapter = Readonly<{
  /** Optional XLSX/XLS reader supplied by an approved server integration. */
  readRows(input: Uint8Array): Promise<Record<string, unknown>[]>;
}>;

function parseInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[€£$\s,]/g, "");
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(current.trim()); current = ""; }
    else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function marketValueRowsFromRecords(records: readonly Record<string, unknown>[]): TouchlineMarketValueImportRow[] {
  return records.map((record) => {
    const currency = optionalText(record.currency)?.toUpperCase();
    return {
      playerId: optionalText(record.player_id) ?? optionalText(record.playerId) ?? "",
      externalPlayerId: optionalText(record.external_player_id) ?? optionalText(record.transfermarkt_player_id),
      sourceUrl: optionalText(record.source_url) ?? optionalText(record.transfermarkt_url),
      marketValue: parseInteger(record.market_value ?? record.marketValue),
      currency: currency === "EUR" || currency === "GBP" || currency === "USD" ? currency : null,
      marketValueEur: parseInteger(record.market_value_eur ?? record.marketValueEur),
    };
  });
}

/** CSV is supported directly; rows are only parsed, never fetched or approved. */
export function parseTouchlineMarketValueCsv(csv: string): TouchlineMarketValueImportRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return marketValueRowsFromRecords(lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  }));
}

/**
 * XLSX support is intentionally adapter-based: the app has no bundled parser
 * or unlicensed workbook dependency. An approved server-side adapter may be
 * supplied without changing import or gameplay code.
 */
export async function parseTouchlineMarketValueSpreadsheet(
  input: Uint8Array,
  adapter: TouchlineMarketValueSpreadsheetAdapter | null | undefined,
) {
  if (!adapter) throw new Error("TL_MARKET_VALUE_SPREADSHEET_ADAPTER_UNAVAILABLE");
  return marketValueRowsFromRecords(await adapter.readRows(input));
}

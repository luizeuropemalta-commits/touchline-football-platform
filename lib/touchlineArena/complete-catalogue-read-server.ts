import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTouchlinePublishedCardPresentations } from "./card-publication-read-model";
import { isTouchlineProvisionalColumnsUnavailable } from "./card-engine-provisional-schema-compat";
import type { TouchlinePublicEditorialCardPresentation } from "./editorial-card-profile";

const PAGE_SIZE = 150;
const READ_KEYS: Readonly<Record<string, string>> = {
  touchline_card_publications: "player_id",
  football_players: "id",
  football_clubs: "id",
  football_squad_members: "id",
  football_player_market_values: "id",
  touchline_card_editorial_overrides: "id",
  football_player_season_statistics: "id",
  touchline_player_fixture_score_settlements: "id",
};
type Row = Record<string, unknown>;
type Filter = { kind: "eq"; column: string; value: unknown } | { kind: "in"; column: string; values: readonly unknown[] };
type Order = { column: string; ascending: boolean };
type ReadResult = { data: Row[] | null; error: { message: string } | null; count: number | null };

function failure(reason: string, table: string): never {
  // Never expose database messages, query values or provider payloads.
  throw new Error(`TL_CATALOGUE_${reason}:${table}`);
}

function partitions(filters: readonly Filter[]): Filter[][] {
  let result: Filter[][] = [[]];
  for (const filter of filters) {
    const alternatives: Filter[] = filter.kind === "eq" ? [filter] : [];
    if (filter.kind === "in") {
      const values = [...new Set(filter.values)].sort((a, b) => String(a).localeCompare(String(b)));
      for (let index = 0; index < values.length; index += PAGE_SIZE) {
        alternatives.push({ ...filter, values: values.slice(index, index + PAGE_SIZE) });
      }
    }
    result = result.flatMap((prefix) => alternatives.map((alternative) => [...prefix, alternative]));
  }
  return result;
}

async function readComplete(
  admin: SupabaseClient,
  table: string,
  columns: string,
  filters: readonly Filter[],
  orders: readonly Order[],
): Promise<ReadResult> {
  const key = READ_KEYS[table];
  const selected = columns.split(",").map((column) => column.trim());
  const projection = selected.includes(key) || selected.includes("*") ? columns : `${columns},${key}`;
  const ordered = orders.some((order) => order.column === key) ? orders : [...orders, { column: key, ascending: true }];
  const result: Row[] = [];
  const seen = new Set<string>();
  for (const batch of partitions(filters)) {
    let expectedCount: number | null = null;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = admin.from(table).select(projection, { count: "exact" });
      for (const filter of batch) {
        query = filter.kind === "eq"
          ? query.eq(filter.column, filter.value)
          : query.in(filter.column, [...filter.values]);
      }
      for (const order of ordered) query = query.order(order.column, { ascending: order.ascending });
      const response = await query.range(offset, offset + PAGE_SIZE - 1).then(
        (value) => value,
        () => ({ data: null, count: null, error: { message: "transport unavailable" } }),
      );
      if (response.error) {
        // Supplementary stats can be unavailable without hiding the published
        // rating. Discard ALL stats, including any earlier successful batches.
        if (table === "football_player_season_statistics") {
          console.warn("TL_CATALOGUE_SUPPLEMENTARY_STATS_UNAVAILABLE");
          return { data: null, count: null, error: { message: "TL_CATALOGUE_SUPPLEMENTARY_STATS_UNAVAILABLE" } };
        }
        // Preserve the existing publication reader's old-schema retry. Only
        // its first, provenance-aware projection may take this compatibility path.
        if (table === "touchline_card_editorial_overrides"
          && selected.includes("provenance_status")
          && isTouchlineProvisionalColumnsUnavailable(response.error)) return response;
        failure("READ_FAILED", table);
      }
      const { data, count } = response;
      if (count === null || !Number.isSafeInteger(count) || count < 0) failure("COUNT_UNAVAILABLE", table);
      if (expectedCount !== null && expectedCount !== count) failure("COUNT_CHANGED", table);
      expectedCount = count;
      if (!Array.isArray(data) || data.length !== Math.min(PAGE_SIZE, Math.max(0, count - offset))) {
        failure("INCOMPLETE_READ", table);
      }
      for (const value of data) {
        if (!value || typeof value !== "object" || Array.isArray(value)) failure("INVALID_ROW", table);
        const row = value as Row;
        const identity = row[key];
        if (typeof identity !== "string" || !identity.trim()) failure("INVALID_ID", table);
        if (seen.has(identity)) failure("DUPLICATE_ROW", table);
        seen.add(identity);
        result.push(row);
      }
      if (offset + data.length >= count) break;
    }
  }
  return { data: result, error: null, count: result.length };
}

/**
 * Catalogue-only, SELECT-only facade. It lets the existing publication gate
 * and season projection read complete batches without duplicating their rules
 * or loading a different ranking snapshot for each group of players.
 */
export function createCompleteTouchlineCatalogueAdmin<T extends SupabaseClient>(admin: T): T {
  const facade = {
    from(table: string) {
      if (table === "football_competitions" || table === "football_seasons") {
        return { select: (columns: string) => admin.from(table).select(columns) };
      }
      if (!Object.hasOwn(READ_KEYS, table)) failure("UNSUPPORTED_TABLE", table);
      return {
        select(columns: string) {
          const filters: Filter[] = [];
          const orders: Order[] = [];
          let execution: Promise<ReadResult> | undefined;
          const query = {
            eq(column: string, value: unknown) { filters.push({ kind: "eq", column, value }); return query; },
            in(column: string, values: readonly unknown[]) { filters.push({ kind: "in", column, values }); return query; },
            order(column: string, options?: { ascending?: boolean }) {
              orders.push({ column, ascending: options?.ascending !== false }); return query;
            },
            then<TResult1 = ReadResult, TResult2 = never>(
              fulfilled?: ((value: ReadResult) => TResult1 | PromiseLike<TResult1>) | null,
              rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ): Promise<TResult1 | TResult2> {
              execution ??= readComplete(admin, table, columns, filters, orders);
              return execution.then(fulfilled, rejected);
            },
          };
          return query;
        },
      };
    },
  };
  // Existing readers accept the application's Supabase type. The runtime
  // facade deliberately exposes only their SELECT/eq/in/order read subset.
  return facade as unknown as T;
}

export async function loadCompleteTouchlineCataloguePresentations(playerIds: readonly string[], admin: SupabaseClient) {
  const ids = [...new Set(playerIds.map((id) => id.trim().toLowerCase()).filter(Boolean))].sort();
  const result = new Map<string, TouchlinePublicEditorialCardPresentation>();
  for (let index = 0; index < ids.length; index += PAGE_SIZE) {
    const presentations = await loadTouchlinePublishedCardPresentations({
      playerIds: ids.slice(index, index + PAGE_SIZE), providedAdmin: admin,
    });
    for (const [id, presentation] of presentations) result.set(id, presentation);
  }
  return result;
}

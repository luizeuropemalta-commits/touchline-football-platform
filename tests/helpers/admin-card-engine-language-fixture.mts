import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as auth from "../../lib/touchlineArena/auth-i18n.ts";
import * as icons from "lucide-react";
import { cn } from "../../lib/utils.ts";

const paths = ["app/(app)/admin/card-engine/page.tsx", "components/admin-card-engine-console.tsx", "components/arena-admin-ui.tsx", "lib/admin/owner.ts"];
const compiled = new Map(paths.map(path => [path, ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText]));
const ownerEmail = "card-owner@example.test";
export const cardEnginePlayers = [{ id: "player-uuid", providerPlayerId: "123", name: "SYNTHETIC PLAYER", club: "SYNTHETIC CLUB" }];
export const cardEngineBatches = ["draft", "approved", "published", "reverted"].map((status, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, status, rows_received: 1200, matched_rows: 1198, review_rows: 1, conflict_rows: 1, unmatched_rows: 0, created_at: "2026-10-27T12:00:00Z" }));
export const cardEngineOverrides = [{ id: "override-test", field_key: "market_value_eur", status: "provisional", player_id: "player-uuid", effective_value: 1250000, source_batch_id: null, approved_at: null, provenance_status: "PROVISIONAL_MISSING_MARKET_VALUE", provisional_reason: "HISTORICAL_REASON_UNCHANGED", next_verification_at: "invalid" }];
type Options = { user?: { email: string } | null; configured?: boolean; empty?: boolean; errors?: Record<string, string>; nullCount?: boolean };

// Executes the real page, console, owner rule and UI. Only SDK transport and Link
// are replaced. These records are synthetic test inputs, never product facts.
export function cardEngineFixture(options: Options = {}) {
  const calls: unknown[] = [];
  function query(table: string) {
    assert.ok(["football_players", "touchline_card_editorial_batches", "touchline_card_editorial_overrides"].includes(table));
    calls.push(["from", table]); let countOnly = false;
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "order", "limit"]) builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      if (method === "select") countOnly = Boolean((args[1] as { head?: boolean } | undefined)?.head);
      return builder;
    };
    builder.then = (yes: (value: unknown) => unknown, no: (error: unknown) => unknown) => {
      const error = options.errors?.[countOnly ? "count" : table];
      const data = error || countOnly ? null : options.empty ? [] : table === "football_players"
        ? cardEnginePlayers.map(p => ({ id: p.id, provider_player_id: p.providerPlayerId, display_name: p.name, name: p.name, football_clubs: { name: p.club } }))
        : table === "touchline_card_editorial_batches" ? cardEngineBatches : cardEngineOverrides;
      return Promise.resolve({ data, error: error ? { message: error } : null, count: options.nullCount || error ? null : options.empty ? 0 : 1234 }).then(yes, no);
    };
    return builder;
  }
  const cache = new Map<string, Record<string, unknown>>();
  function load(path: string): Record<string, unknown> {
    if (cache.has(path)) return cache.get(path)!;
    assert.ok(compiled.has(path), `Unexpected source ${path}`);
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    runInNewContext(compiled.get(path)!, { exports, Intl, URL, Error, process: { env: { TOUCHLINE_OWNER_EMAILS: ownerEmail } },
      fetch: () => assert.fail("No remote fetch allowed"), require(name: string) {
        if (name === "react") return React;
        if (name === "react/jsx-runtime") return jsx;
        if (name === "lucide-react") return icons;
        if (name === "@/lib/utils") return { cn };
        if (name === "@/lib/touchlineArena/auth-i18n") return auth;
        if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
        if (name === "@/lib/supabase/server") return { createClient: async () => options.configured === false ? null : { auth: { getUser: async () => {
          calls.push(["getUser"]); return { data: { user: options.user === undefined ? { email: ownerEmail } : options.user } };
        } } } };
        if (name === "@/lib/supabase/admin") return { createAdminClient: () => options.configured === false ? null : { from: query } };
        if (name.startsWith("@/")) return load(`${name.slice(2)}${name === "@/lib/admin/owner" ? ".ts" : ".tsx"}`);
        throw Error(`Unexpected dependency ${name}`);
      },
    });
    return exports;
  }
  const Page = load(paths[0]).default as (props: { searchParams: Promise<Record<string, string | string[]>> }) => Promise<React.ReactNode>;
  return { calls, render: async (query: Record<string, string | string[]> = {}) => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(query) })) };
}

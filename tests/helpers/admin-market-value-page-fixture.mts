import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import * as auth from "../../lib/touchlineArena/auth-i18n.ts";
import * as deadline from "../../lib/touchlineArena/server-read-deadline.ts";
import { cn } from "../../lib/utils.ts";
const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const pageCode = compile("../../app/(app)/admin/market-values/page.tsx"), uiCode = compile("../../components/arena-admin-ui.tsx"), ownerCode = compile("../../lib/admin/owner.ts");
export function marketValueFixture(options: { user?: { email: string } | null; state?: "empty" | "populated" | "error" | "rejected"; admin?: boolean } = {}) {
  const calls: string[] = [], filters: string[] = [], exports: Record<string, unknown> = {}, ui: Record<string, unknown> = {}, owner: Record<string, unknown> = {};
  runInNewContext(ownerCode, { exports: owner, process: { env: { TOUCHLINE_OWNER_EMAILS: "owner@example.test" } } });
  const common = (name: string): unknown => {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "lucide-react") return icons;
    if (name === "@/lib/utils") return { cn };
    throw new Error(`Unexpected dependency ${name}`);
  };
  runInNewContext(uiCode, { exports: ui, require: common });
  const query = (table: string) => {
    calls.push(table); let head = false;
    const chain = {
      select(_columns: string, opts?: { head?: boolean }) { head = Boolean(opts?.head); return chain; },
      order() { return chain; }, limit() { return chain; }, returns() { return chain; }, eq() { return chain; }, in() { return chain; },
      ilike(column: string, pattern: string) { filters.push(`${column}:${pattern}`); return chain; },
      then(resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const data = options.state === "populated" ? [
          { player_id: "one", market_value_eur: 1000000, status: "verified", confidence: "verified", last_verified: "invalid", verified_season: "2026-27", football_players: { display_name: "Synthetic Player" } },
          { player_id: "two", market_value_eur: null, status: "pending", confidence: "pending", last_verified: null, verified_season: null, football_players: null },
        ] : [];
        return (options.state === "rejected" ? Promise.reject(new Error("PRIVATE_MARKET_ERROR")) : Promise.resolve({ data: head ? null : data, count: head ? data.length : null, error: options.state === "error" ? { message: "PRIVATE_MARKET_ERROR" } : null })).then(resolve, reject);
      },
    }; return chain;
  };
  runInNewContext(pageCode, { exports, Intl, URL, setTimeout, clearTimeout, fetch: () => assert.fail("No network permitted"),
    require(name: string) {
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
      if (name === "next/navigation") return { notFound: () => { throw new Error("MARKET_DENIED"); } };
      if (name === "@/components/arena-admin-ui") return ui;
      if (name === "@/lib/admin/owner") return owner;
      if (name === "@/lib/touchlineArena/auth-i18n") return auth;
      if (name === "@/lib/touchlineArena/server-read-deadline") return deadline;
      if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.user === undefined ? { email: "owner@example.test" } : options.user } }) } }) };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => options.admin === false ? null : { from: query } };
      return common(name);
    },
  });
  const Page = exports.default as (props: { searchParams: Promise<{ lang: string; q: string }> }) => Promise<React.ReactNode>;
  return { calls, filters, render: async (lang = "pt-BR", q = "") => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ lang, q }) })) };
}

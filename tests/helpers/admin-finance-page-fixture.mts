import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import * as summary from "../../lib/admin/finance-summary.ts";
import * as authI18n from "../../lib/touchlineArena/auth-i18n.ts";

// Integrate the real async page, owner policy and financial projections. Only
// external clients, Next navigation and presentational UI leaves are replaced.
// No SDK, credentials, database, account session, network or browser is loaded.
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
import { cn } from "../../lib/utils.ts";
const pageCode = compile("../../app/(app)/admin/finance/page.tsx");
const ownerCode = compile("../../lib/admin/owner.ts");
const ownerEmail = "owner@example.test";
export const privateFailure = "PRIVATE_FINANCE_FAILURE_SENTINEL";
type Result = { data: unknown; error: unknown };
export type Tile = { label: string; value: string; delta: string };
type Options = {
  realUi?: boolean;
  user?: { id: string; email: string | null; user_metadata?: Record<string, unknown> } | null;
  sessionAvailable?: boolean;
  adminAvailable?: boolean;
  ownerEmails?: string;
  invoices?: Result;
  webhooks?: Result;
  rejectInvoices?: boolean;
  rejectWebhooks?: boolean;
  stripeAvailable?: boolean;
  balance?: unknown;
  transactions?: unknown[];
  rejectBalance?: boolean;
  rejectTransactions?: boolean;
};
export const invoice = (patch: Record<string, unknown> = {}) => ({
  id: "invoice-fixture", status: "paid", currency: "eur", subtotal: 1000, tax: 0, total: 1000,
  amount_paid: 1000, amount_due: 1000, created_at: "2026-10-25T12:00:00Z", paid_at: "2026-10-25T12:00:00Z",
  stripe_invoice_id: "in_synthetic", number: "INVOICE-SENTINEL", ...patch,
});
export const transaction = (patch: Record<string, unknown> = {}) => ({
  id: "txn_synthetic", currency: "eur", amount: 1000, fee: 25, created: 1792929600,
  description: "TRANSACTION-SENTINEL", type: "charge", ...patch,
});

export function fixture(options: Options = {}) {
  const calls: string[] = [], queries: Array<{ table: string; select?: string; order?: string; ascending?: boolean; limit?: number }> = [];
  const tiles: Tile[] = [];
  const user = options.user === undefined ? { id: "synthetic-owner", email: ownerEmail } : options.user;
  const ownerExports: Record<string, unknown> = {};
  runInNewContext(ownerCode, { exports: ownerExports, process: { env: { TOUCHLINE_OWNER_EMAILS: options.ownerEmails ?? ownerEmail } } });
  const owner = ownerExports as { isOwnerEmail: (email?: string | null) => boolean };
  const query = (table: string) => {
    calls.push(`read:${table}`);
    assert.ok(["billing_invoices", "stripe_webhook_events"].includes(table));
    const trace: (typeof queries)[number] = { table }; queries.push(trace);
    const builder = {
      select(columns: string) { trace.select = columns; return builder; },
      order(column: string, order: { ascending: boolean }) { trace.order = column; trace.ascending = order.ascending; return builder; },
      limit(limit: number) { trace.limit = limit; return builder; },
      returns() { return builder; },
      then(yes: (value: Result) => unknown, no: (error: unknown) => unknown) {
        const rejected = table === "billing_invoices" ? options.rejectInvoices : options.rejectWebhooks;
        const result = (table === "billing_invoices" ? options.invoices : options.webhooks) ?? { data: [], error: null };
        return (rejected ? Promise.reject(new Error(privateFailure)) : Promise.resolve(result)).then(yes, no);
      },
    };
    return builder;
  };
  const uiExports: Record<string, unknown> = {};
  if (options.realUi) runInNewContext(compile("../../components/arena-admin-ui.tsx"), { exports: uiExports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return icons;
    if (name === "@/lib/utils") return { cn };
    throw new Error(`Unmocked UI dependency: ${name}`);
  } });
  const pageExports: Record<string, unknown> = {};
  runInNewContext(pageCode, { exports: pageExports, Intl, URL,
    fetch: () => assert.fail("SSR finance integration must never access a network"),
    require(name: string) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react") return icons;
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
      if (name === "next/navigation") return { notFound: () => { calls.push("notFound"); throw new Error("FINANCE_NOT_FOUND"); } };
      if (name === "@/components/arena-admin-ui" && options.realUi) return uiExports;
      if (name === "@/components/arena-admin-ui") return {
        GamePanel: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children),
        LivePill: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children),
        StatTile: ({ label, value, delta }: Tile) => {
          tiles.push({ label, value, delta });
          return React.createElement("dl", null, React.createElement("dt", null, label), React.createElement("dd", null, value), React.createElement("small", null, delta));
        },
      };
      if (name === "@/lib/admin/finance-summary") return summary;
      if (name === "@/lib/admin/owner") return { isOwnerEmail: (email?: string | null) => { calls.push("ownerCheck"); return owner.isOwnerEmail(email); } };
      if (name === "@/lib/touchlineArena/auth-i18n") return authI18n;
      if (name === "@/lib/supabase/server") return { createClient: async () => {
        calls.push("sessionFactory");
        return options.sessionAvailable === false ? null : { auth: { getUser: async () => { calls.push("getUser"); return { data: { user }, error: null }; } } };
      } };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => {
        calls.push("adminFactory"); return options.adminAvailable === false ? null : { from: query };
      } };
      if (name === "@/lib/stripe/client") return { getStripe: () => {
        calls.push("stripeFactory");
        return options.stripeAvailable === false ? null : {
          balance: { retrieve: async () => { calls.push("stripeBalance"); if (options.rejectBalance) throw new Error(privateFailure); return options.balance ?? { available: [], pending: [] }; } },
          balanceTransactions: { list: async (request: { limit: number }) => { calls.push("stripeTransactions"); assert.equal(request.limit, 12); assert.deepEqual(Object.keys(request), ["limit"]); if (options.rejectTransactions) throw new Error(privateFailure); return { data: options.transactions ?? [] }; } },
        };
      } };
      throw new Error(`Unmocked finance dependency: ${name}`);
    },
  }, { filename: "admin-finance-page.integration.cjs" });
  const Page = pageExports.default as (props: { searchParams: Promise<Record<string, string | string[]>> }) => Promise<React.ReactNode>;
  return { calls, queries, tiles, render: async (lang: string | string[] = "en-GB") => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ lang }) })) };
}

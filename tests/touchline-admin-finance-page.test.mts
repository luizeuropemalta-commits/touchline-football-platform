import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import * as summary from "../lib/admin/finance-summary.ts";
import * as authI18n from "../lib/touchlineArena/auth-i18n.ts";

// Integrate the real async page, owner policy and financial projections. Only
// external clients, Next navigation and presentational UI leaves are replaced.
// No SDK, credentials, database, account session, network or browser is loaded.
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const pageCode = compile("../app/(app)/admin/finance/page.tsx");
const ownerCode = compile("../lib/admin/owner.ts");
const ownerEmail = "owner@example.test";
const privateFailure = "PRIVATE_FINANCE_FAILURE_SENTINEL";
type Result = { data: unknown; error: unknown };
type Tile = { label: string; value: string; delta: string };
type Options = {
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
const invoice = (patch: Record<string, unknown> = {}) => ({
  id: "invoice-fixture", status: "paid", currency: "eur", subtotal: 1000, tax: 0, total: 1000,
  amount_paid: 1000, amount_due: 1000, created_at: "2026-10-25T12:00:00Z", paid_at: "2026-10-25T12:00:00Z",
  stripe_invoice_id: "in_synthetic", number: "INVOICE-SENTINEL", ...patch,
});
const transaction = (patch: Record<string, unknown> = {}) => ({
  id: "txn_synthetic", currency: "eur", amount: 1000, fee: 25, created: 1792929600,
  description: "TRANSACTION-SENTINEL", type: "charge", ...patch,
});

function fixture(options: Options = {}) {
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
  const pageExports: Record<string, unknown> = {};
  runInNewContext(pageCode, { exports: pageExports, Intl, URL,
    fetch: () => assert.fail("SSR finance integration must never access a network"),
    require(name: string) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react") return icons;
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
      if (name === "next/navigation") return { notFound: () => { calls.push("notFound"); throw new Error("FINANCE_NOT_FOUND"); } };
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
const tileValue = (tiles: Tile[], label: string) => {
  const found = tiles.filter(tile => tile.label === label);
  assert.equal(found.length, 1, `Expected exactly one tile: ${label}`);
  return found[0].value;
};
const noNet = (html: string, tiles: Tile[]) => {
  assert.ok(tiles.every(tile => !/\bnet\b/i.test(tile.label)), "Unrelated invoice and fee windows must not create a net tile");
  assert.doesNotMatch(html, />\s*(?:Net|Net revenue|Net total|Net income)\s*</i);
  assert.match(html, /No reconciled net is calculated from these different samples/);
  assert.doesNotMatch(html, new RegExp(privateFailure));
};

test("finance SSR owner reads only bounded financial samples and renders no aggregate net", async () => {
  const f = fixture(); const html = await f.render();
  assert.match(html, /Read-only finance/);
  assert.match(html, /href="\/api\/admin\/finance\/export"/);
  assert.equal(f.calls.filter(call => call === "getUser").length, 1);
  assert.ok(f.calls.indexOf("ownerCheck") < f.calls.indexOf("read:billing_invoices"));
  assert.deepEqual(f.queries, [
    { table: "billing_invoices", select: "id,status,currency,subtotal,tax,total,amount_paid,amount_due,created_at,paid_at,stripe_invoice_id,number", order: "created_at", ascending: false, limit: 100 },
    { table: "stripe_webhook_events", select: "stripe_event_id,event_type,processed_at", order: "processed_at", ascending: false, limit: 12 },
  ]);
  assert.equal(f.calls.filter(call => call === "stripeBalance").length, 1);
  assert.equal(f.calls.filter(call => call === "stripeTransactions").length, 1);
  noNet(html, f.tiles);
});

for (const user of [{ id: "customer", email: "other@example.test", user_metadata: { role: "owner" } }, { id: "no-email", email: null }]) {
  test(`finance SSR refuses non-owner ${user.id} before financial reads`, async () => {
    const f = fixture({ user });
    await assert.rejects(f.render(), /FINANCE_NOT_FOUND/);
    assert.deepEqual(f.queries, []);
    assert.equal(f.calls.includes("stripeFactory"), false);
    assert.deepEqual(f.tiles, []);
  });
}

test("finance SSR signed-out or absent session only offers localized sign-in", async () => {
  for (const options of [{ user: null }, { sessionAvailable: false }]) {
    const f = fixture(options); const html = await f.render("pt-BR");
    assert.match(html, /Sign in as owner/);
    assert.ok(html.includes(authI18n.touchLineAuthEntryHref("/login", "pt-BR", authI18n.touchLineAuthHref("/admin/finance", "pt-BR")).replaceAll("&", "&amp;")));
    assert.deepEqual(f.queries, []); assert.equal(f.calls.includes("ownerCheck"), false);
    assert.equal(f.calls.includes("stripeFactory"), false); assert.deepEqual(f.tiles, []);
  }
});

test("finance SSR missing privileged client does not invent confirmed values", async () => {
  const f = fixture({ adminAvailable: false }); const html = await f.render();
  assert.match(html, /Configuration required/); assert.deepEqual(f.queries, []);
  assert.equal(f.calls.includes("stripeFactory"), false); assert.deepEqual(f.tiles, []);
});

test("finance SSR confirmed empty samples are distinct from unavailable reads", async () => {
  const f = fixture(); const html = await f.render();
  assert.match(html, /No invoices in the confirmed sample/);
  assert.match(html, /No transactions in the confirmed fee sample/);
  assert.equal(tileValue(f.tiles, "Open invoices"), "0");
  assert.equal(tileValue(f.tiles, "Uncollectible invoices"), "0");
  assert.equal(tileValue(f.tiles, "Webhooks"), "0");
  assert.doesNotMatch(html, /Invoice sample unavailable|Stripe fee sample unavailable|read unavailable/);
  noNet(html, f.tiles);
});

for (const mode of ["returned-error", "rejected-read", "missing-data"] as const) {
  test(`finance SSR ${mode} cannot become confirmed empty or zero`, async () => {
    const f = fixture({
      invoices: { data: mode === "returned-error" ? [invoice()] : null, error: mode === "returned-error" ? { message: privateFailure } : null },
      webhooks: { data: mode === "returned-error" ? [{ stripe_event_id: "STALE_WEBHOOK" }] : null, error: mode === "returned-error" ? { message: privateFailure } : null },
      rejectInvoices: mode === "rejected-read", rejectWebhooks: mode === "rejected-read", rejectTransactions: true,
    });
    const html = await f.render();
    assert.match(html, /Invoice sample unavailable\. Amounts are not confirmed/);
    assert.match(html, /Stripe fee sample unavailable\. Fees are not confirmed/);
    assert.equal(tileValue(f.tiles, "Open invoices"), "—");
    assert.equal(tileValue(f.tiles, "Uncollectible invoices"), "—");
    assert.equal(tileValue(f.tiles, "Webhooks"), "—");
    assert.doesNotMatch(html, /No invoices in the confirmed sample|No transactions in the confirmed fee sample|INVOICE-SENTINEL/);
    assert.ok(f.tiles.every(tile => !/^(Paid|Original amount due|Fees) ·/.test(tile.label)));
    noNet(html, f.tiles);
  });
}

test("finance SSR keeps EUR USD JPY invoice values and fee reversals in independent currency groups", async () => {
  const f = fixture({ invoices: { error: null, data: [
    invoice({ id: "eur1", currency: "eur", amount_paid: 1000, amount_due: 1000 }),
    invoice({ id: "eur2", currency: "EUR", status: "open", amount_paid: 250, amount_due: 750 }),
    invoice({ id: "usd", currency: "usd", status: "uncollectible", amount_paid: 2000, amount_due: 3000 }),
    invoice({ id: "jpy", currency: "jpy", amount_paid: 700, amount_due: 900 }),
  ] }, transactions: [transaction({ id: "fee-eur", fee: 50 }), transaction({ id: "fee-usd", currency: "usd", fee: 80 }), transaction({ id: "fee-reversal", currency: "USD", fee: -20 }), transaction({ id: "fee-jpy", currency: "jpy", fee: 5 })],
    balance: { available: [{ currency: "eur", amount: 12345 }, { currency: "jpy", amount: 5432 }], pending: [{ currency: "usd", amount: 6789 }] },
  });
  const html = await f.render();
  const expected = (value: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
  for (const [currency, paid, due, fees] of [["EUR", 12.5, 17.5, .5], ["USD", 20, 30, .6], ["JPY", 700, 900, 5]] as const) {
    assert.equal(tileValue(f.tiles, `Paid · ${currency}`), expected(paid, currency));
    assert.equal(tileValue(f.tiles, `Original amount due · ${currency}`), expected(due, currency));
    assert.equal(tileValue(f.tiles, `Fees · ${currency}`), expected(fees, currency));
  }
  assert.equal(f.tiles.length, 12, "Exactly nine currency tiles and three status tiles; no aggregate total/net");
  assert.equal(f.tiles.find(tile => tile.label === "Paid · EUR")?.delta, "2 sampled invoices");
  assert.equal(f.tiles.find(tile => tile.label === "Fees · USD")?.delta, "2 sampled transactions");
  assert.equal(tileValue(f.tiles, "Open invoices"), "1"); assert.equal(tileValue(f.tiles, "Uncollectible invoices"), "1");
  assert.match(html, /Available eur/); assert.match(html, /Available jpy/); assert.match(html, /Pending usd/);
  assert.match(html, /latest 100 records/); assert.match(html, /latest 12 balance transactions/);
  assert.match(html, /not all-time totals/); assert.match(html, /original amount_due, not its outstanding balance/);
  noNet(html, f.tiles);
});

test("finance SSR a failed provider does not erase a confirmed invoice sample", async () => {
  for (const options of [{ stripeAvailable: false }, { rejectBalance: true, rejectTransactions: true }]) {
    const f = fixture({ ...options, invoices: { data: [invoice()], error: null } }); const html = await f.render();
    assert.equal(tileValue(f.tiles, "Paid · EUR"), "€10.00");
    assert.equal(tileValue(f.tiles, "Original amount due · EUR"), "€10.00");
    assert.match(html, /INVOICE-SENTINEL/); assert.match(html, /Stripe fee sample unavailable/);
    assert.match(html, /Stripe balance appears here when the server key is configured and reachable/);
    assert.ok(f.tiles.every(tile => !tile.label.startsWith("Fees ·"))); noNet(html, f.tiles);
  }
});

test("finance SSR an invoice error leaves a confirmed fee sample independent", async () => {
  const f = fixture({ invoices: { data: null, error: { message: privateFailure } }, transactions: [transaction()] });
  const html = await f.render();
  assert.equal(tileValue(f.tiles, "Fees · EUR"), "€0.25");
  assert.equal(tileValue(f.tiles, "Open invoices"), "—");
  assert.match(html, /TRANSACTION-SENTINEL/); assert.doesNotMatch(html, /INVOICE-SENTINEL/);
  noNet(html, f.tiles);
});


test("finance SSR missing owner allow-list cannot authorize a signed-in account", async () => {
  const f = fixture({ ownerEmails: "" });
  await assert.rejects(f.render(), /FINANCE_NOT_FOUND/);
  assert.deepEqual(f.queries, []); assert.equal(f.calls.includes("stripeFactory"), false);
});

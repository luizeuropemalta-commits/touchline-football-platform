import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CircleDollarSign, Download, Receipt, ShieldCheck, TriangleAlert, WalletCards } from "lucide-react";

import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  status: string | null;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  created_at: string;
  paid_at: string | null;
  stripe_invoice_id: string;
  number: string | null;
};

const money = (cents: number, currency = "EUR") => new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format((cents || 0) / 100);
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "-";

function statusCount(rows: InvoiceRow[], status: string) {
  return rows.filter((row) => row.status === status).length;
}

function sum(rows: InvoiceRow[], key: keyof Pick<InvoiceRow, "subtotal" | "tax" | "total" | "amount_paid" | "amount_due">) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function invoiceStatusBreakdown(rows: InvoiceRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = row.status?.trim() || "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <GamePanel className="p-8">
        <LivePill>Owner area</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">Finance Control</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Sign in as owner to inspect payment records.</p>
        <Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/finance", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">Sign in</Link>
      </GamePanel>
    );
  }

  if (!isOwnerEmail(user.email)) notFound();

  if (!admin) {
    return (
      <GamePanel className="p-8">
        <LivePill>Configuration required</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">Finance Control</h1>
        <p className="mt-3 text-sm text-slate-400">Supabase service role is required for protected financial administration.</p>
      </GamePanel>
    );
  }

  const [{ data: invoices }, { data: webhookEvents }] = await Promise.all([
    admin.from("billing_invoices").select("id,status,currency,subtotal,tax,total,amount_paid,amount_due,created_at,paid_at,stripe_invoice_id,number").order("created_at", { ascending: false }).limit(100).returns<InvoiceRow[]>(),
    admin.from("stripe_webhook_events").select("stripe_event_id,event_type,processed_at").order("processed_at", { ascending: false }).limit(12),
  ]);

  const stripe = getStripe();
  const [balance, balanceTransactions] = stripe
    ? await Promise.all([
        stripe.balance.retrieve().catch(() => null),
        stripe.balanceTransactions.list({ limit: 12 }).catch(() => null),
      ])
    : [null, null];

  const invoiceRows = invoices ?? [];
  const currency = invoiceRows[0]?.currency ?? "eur";
  const grossRevenue = sum(invoiceRows, "amount_paid");
  const due = sum(invoiceRows, "amount_due");
  const stripeFees = balanceTransactions?.data.reduce((total, tx) => total + (tx.fee ?? 0), 0) ?? 0;
  const netRevenue = grossRevenue - stripeFees;
  const invoiceStatuses = invoiceStatusBreakdown(invoiceRows);

  return (
    <div className="space-y-6">
      <GamePanel className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
          <div>
            <LivePill>Read-only finance</LivePill>
            <p className="mt-6 text-[10px] font-black text-cyan-300/70">TouchLine England / Secure money view</p>
            <h1 className="mt-2 max-w-4xl text-5xl font-black  italic leading-[.9] text-white md:text-7xl">
              Finance Control
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">
              Read-only reconciliation from Stripe-synchronized billing tables. No bank passwords, no exposed secret keys, no automatic refunds, transfers or account changes.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/api/admin/finance/export" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007]">
                <Download size={14} /> Export CSV
              </a>
              <Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black text-cyan-100">Owner Admin</Link>
            </div>
          </div>
          <div className="rounded-3xl border border-cyan-300/15 bg-black/20 p-5">
            <p className="text-[9px] font-black text-cyan-300">Provider balance</p>
            <div className="mt-5 space-y-4">
              {(balance?.available ?? []).slice(0, 3).map((item) => (
                <div key={`available-${item.currency}`} className="flex justify-between border-b border-white/[.06] pb-3">
                  <span className="text-[10px] font-bold text-slate-500">Available {item.currency}</span>
                  <span className="text-xs font-black  text-white">{money(item.amount, item.currency)}</span>
                </div>
              ))}
              {(balance?.pending ?? []).slice(0, 3).map((item) => (
                <div key={`pending-${item.currency}`} className="flex justify-between border-b border-white/[.06] pb-3">
                  <span className="text-[10px] font-bold text-slate-500">Pending {item.currency}</span>
                  <span className="text-xs font-black  text-white">{money(item.amount, item.currency)}</span>
                </div>
              ))}
              {!balance ? <p className="text-[10px] leading-5 text-slate-500">Stripe balance appears here when the server key is configured and reachable.</p> : null}
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatTile icon={CircleDollarSign} label="Gross" value={money(grossRevenue, currency)} delta="paid invoices" accent="gold" />
        <StatTile icon={Banknote} label="Net" value={money(netRevenue, currency)} delta="minus fetched fees" accent="lime" />
        <StatTile icon={WalletCards} label="Fees" value={money(stripeFees, currency)} delta="provider txs" accent="rose" />
        <StatTile icon={Receipt} label="Pending" value={String(statusCount(invoiceRows, "open"))} delta={money(due, currency)} accent="cyan" />
        <StatTile icon={TriangleAlert} label="Refused" value={String(statusCount(invoiceRows, "uncollectible"))} delta="invoice status" accent="rose" />
        <StatTile icon={ShieldCheck} label="Webhooks" value={String(webhookEvents?.length ?? 0)} delta="recent events" accent="cyan" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[.65fr_1.35fr]">
        <GamePanel className="p-5">
          <p className="text-[10px] font-black text-cyan-300">Invoice status summary</p>
          <h2 className="mt-1 text-2xl font-black italic text-white">Billing Records</h2>
          <div className="mt-4 grid gap-2">
            {Object.entries(invoiceStatuses).map(([status, count]) => (
              <div key={status} className="flex justify-between rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-2 text-[10px] font-bold text-slate-400">
                <span className="capitalize">{status.replaceAll("_", " ")}</span><span>{count}</span>
              </div>
            ))}
            {!Object.keys(invoiceStatuses).length ? <p className="text-[10px] text-slate-500">No invoices synchronized yet.</p> : null}
          </div>
          <p className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-3 text-[10px] leading-5 text-amber-100/80">
            Refunds, transfers and payout account changes are intentionally not available here. Add reinforced confirmation only when operations are legally ready.
          </p>
        </GamePanel>

        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <p className="text-[10px] font-black text-cyan-300">Recent transactions</p>
            <h2 className="mt-1 text-2xl font-black  italic text-white">Reconciliation Feed</h2>
          </div>
          <div className="divide-y divide-white/[.06]">
            {(balanceTransactions?.data ?? []).map((tx) => (
              <div key={tx.id} className="grid gap-2 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="text-sm font-black  italic text-white">{tx.description || tx.type}</p>
                  <p className="mt-1 text-[9px] font-bold text-slate-600">{tx.id.slice(0, 10)}... / {date(new Date(tx.created * 1000).toISOString())}</p>
                </div>
                <span className="text-xs font-black  text-white">{money(tx.amount, tx.currency)}</span>
                <span className="text-xs font-black  text-rose-200">{money(tx.fee, tx.currency)}</span>
              </div>
            ))}
            {!balanceTransactions?.data.length ? (
              invoiceRows.slice(0, 12).map((invoice) => (
                <div key={invoice.id} className="grid gap-2 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <p className="text-sm font-black  italic text-white">{invoice.number ?? "Invoice"}</p>
                    <p className="mt-1 text-[9px] font-bold text-slate-600">{invoice.status ?? "unknown"} / {date(invoice.created_at)}</p>
                  </div>
                  <span className="text-xs font-black  text-white">{money(invoice.total, invoice.currency)}</span>
                  <span className="text-xs font-black  text-cyan-200">{money(invoice.amount_paid, invoice.currency)}</span>
                </div>
              ))
            ) : null}
            {!balanceTransactions?.data.length && !invoiceRows.length ? <div className="p-8 text-center text-xs text-slate-500">No financial records synchronized yet.</div> : null}
          </div>
        </GamePanel>
      </div>
    </div>
  );
}

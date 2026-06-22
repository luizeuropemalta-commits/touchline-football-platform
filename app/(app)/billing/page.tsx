import { AlertTriangle, CalendarDays, CheckCircle2, Download, Receipt, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSubscription } from "@/lib/billing/subscription";
import { planMap } from "@/lib/billing/plans";
import { PortalButton } from "@/components/billing/portal-button";
import Link from "next/link";

const money = (cents: number, currency = "EUR") => new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";

export default async function BillingPage() {
  const subscription = await getCurrentSubscription();
  const supabase = await createClient();
  let invoices: Array<Record<string, unknown>> = [];
  let alerts: Array<Record<string, unknown>> = [];
  if (supabase) {
    const [invoiceResult, alertResult] = await Promise.all([
      supabase.from("billing_invoices").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("billing_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }),
    ]);
    invoices = invoiceResult.data || [];
    alerts = alertResult.data || [];
  }
  const plan = subscription.planKey ? planMap[subscription.planKey] : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300/60">Secure payment operations</p><h1 className="font-display mt-1 text-4xl text-white">Billing Center</h1><p className="mt-2 text-xs text-slate-500">Plans, invoices and payment health in one place.</p></div>
        {plan ? <PortalButton/> : <Link href="/pricing" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#a3ff12] px-5 text-[9px] font-black uppercase tracking-wider text-[#071007]"><Sparkles size={14}/>Choose a plan</Link>}
      </div>

      {alerts.map(alert => <div key={String(alert.id)} className="flex gap-4 rounded-2xl border border-rose-400/25 bg-rose-400/[.07] p-5"><AlertTriangle className="shrink-0 text-rose-300" size={20}/><div><p className="text-xs font-black uppercase tracking-wider text-rose-200">{String(alert.title)}</p><p className="mt-1 text-[11px] text-rose-200/60">{String(alert.message)}</p></div></div>)}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <section className="glass overflow-hidden rounded-2xl p-6">
          <div className="flex items-start justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-slate-600">Current subscription</p><h2 className="mt-2 text-2xl font-black text-white">{plan?.name || "No active plan"}</h2></div><span className="rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-wider text-[#baff4c]">{subscription.status || "inactive"}</span></div>
          {plan && <><div className="my-6 grid grid-cols-2 gap-4 border-y border-white/[.07] py-5 sm:grid-cols-3">
            <div><p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Billing cycle</p><p className="mt-2 text-sm font-bold text-white">{subscription.interval === "year" ? "Yearly" : "Monthly"}</p></div>
            <div><p className="text-[8px] font-black uppercase tracking-wider text-slate-600">{subscription.status === "trialing" ? "Trial ends" : "Renews"}</p><p className="mt-2 text-sm font-bold text-white">{date(subscription.trialEnd || subscription.currentPeriodEnd)}</p></div>
            <div><p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Access</p><p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-[#a3ff12]"><CheckCircle2 size={14}/>Protected</p></div>
          </div><p className="text-[11px] leading-5 text-slate-500">{subscription.cancelAtPeriodEnd ? "Your plan is scheduled to end at the close of the current billing period." : "Your plan renews automatically. Manage payment methods, switching and cancellation through the secure portal."}</p></>}
        </section>
        <section className="glass rounded-2xl p-6">
          <div className="grid size-11 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300"><ShieldCheck size={20}/></div>
          <h2 className="mt-4 text-base font-black text-white">Payment security</h2>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">Card details never touch Touchline servers. Checkout, payment authentication and the customer portal are hosted by Stripe.</p>
          <div className="mt-5 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-cyan-300/60"><CalendarDays size={13}/>Automatic renewals</div>
        </section>
      </div>

      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[.07] p-5"><div className="flex items-center gap-3"><Receipt size={18} className="text-cyan-300"/><div><h2 className="text-sm font-black text-white">Invoice history</h2><p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">Stripe-synchronized records</p></div></div></div>
        {invoices.length ? <div className="divide-y divide-white/[.06]">{invoices.map(invoice => <div key={String(invoice.id)} className="flex flex-wrap items-center gap-4 p-5 text-[11px]">
          <div className="min-w-32"><p className="font-bold text-white">{String(invoice.number || "Invoice")}</p><p className="mt-1 text-slate-600">{date(String(invoice.created_at))}</p></div>
          <span className="rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-slate-400">{String(invoice.status)}</span>
          <p className="ml-auto font-black text-white">{money(Number(invoice.total), String(invoice.currency))}</p>
          {Boolean(invoice.invoice_pdf || invoice.hosted_invoice_url) && <a href={String(invoice.invoice_pdf || invoice.hosted_invoice_url)} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-lg border border-cyan-300/15 text-cyan-300 hover:bg-cyan-300/10" aria-label="Download invoice"><Download size={14}/></a>}
        </div>)}</div> : <div className="p-10 text-center"><Receipt className="mx-auto text-slate-700" size={28}/><p className="mt-3 text-xs font-bold text-slate-400">No invoices yet</p><p className="mt-1 text-[10px] text-slate-600">Your completed Stripe invoices will appear here automatically.</p></div>}
      </section>
    </div>
  );
}

import Link from "next/link";
import { BadgeEuro, CalendarClock, CircleDollarSign } from "lucide-react";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  client_name: string;
  subtotal: number | null;
  tax_amount: number | null;
  total: number | null;
  currency: string | null;
  issued_on: string | null;
  due_on: string | null;
};

function money(value: number | null, currency = "EUR") {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export default async function InvoicesPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: invoices }, { count: pending }, { count: overdue }] = await Promise.all([
    admin.from("invoices").select("id, invoice_number, status, client_name, subtotal, tax_amount, total, currency, issued_on, due_on").eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(50),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).in("status", ["draft", "sent"]),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "overdue"),
  ]);
  const rows = (invoices ?? []) as InvoiceRow[];
  const totalRevenue = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="mb-6"><div className="mb-2 flex items-center gap-3"><LivePill>{rows.length} invoices</LivePill><span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real finance records</span></div><h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Invoices</h1><p className="mt-1.5 text-xs text-slate-500">Monitor fees, receivables, payment schedules and overdue revenue using real invoice records.</p></div>
      <div className="grid gap-3 sm:grid-cols-3"><StatTile icon={CircleDollarSign} label="Total Invoiced" value={money(totalRevenue)} delta="current records" accent="gold" /><StatTile icon={BadgeEuro} label="Pending" value={String(pending ?? 0)} delta="draft/sent" accent="cyan" /><StatTile icon={CalendarClock} label="Overdue" value={String(overdue ?? 0)} delta="needs action" accent="rose" /></div>
      <GamePanel className="mt-6 overflow-hidden">
        <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="Agency finance" title="Invoice History" /></div>
        {rows.length ? (
          <div className="divide-y divide-white/[.06]">
            {rows.map((invoice) => (
              <div key={invoice.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_120px_120px_130px] sm:items-center">
                <div><p className="text-[10px] font-black uppercase italic">{invoice.invoice_number}</p><p className="mt-1 text-[8px] text-slate-600">{invoice.client_name}</p></div>
                <span className="text-[8px] font-black uppercase text-cyan-300">{invoice.status}</span>
                <span className="text-[8px] text-slate-500">Due {invoice.due_on ?? "open"}</span>
                <span className="number-glow text-sm font-black">{money(invoice.total, invoice.currency ?? "EUR")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-7"><p className="text-sm font-black uppercase italic text-white">No invoices yet</p><p className="mt-2 text-xs leading-6 text-slate-500">Create invoices from real deals and commission workflows. Only real records are shown here.</p><Link href="/deals" className="mt-5 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">Open deals</Link></div>
        )}
      </GamePanel>
    </div>
  );
}

import Link from "next/link";
import { CalendarClock, FileSignature, ShieldCheck } from "lucide-react";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type ContractRow = {
  id: string;
  contract_type: string;
  status: string;
  starts_on: string | null;
  expires_on: string | null;
  gross_value: number | null;
  currency: string | null;
  players?: { first_name?: string | null; last_name?: string | null } | Array<{ first_name?: string | null; last_name?: string | null }> | null;
  clubs?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function name(value: ContractRow["players"]) {
  const player = Array.isArray(value) ? value[0] : value;
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "Player";
}

function club(value: ContractRow["clubs"]) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.name ?? "No club";
}

function money(value: number | null, currency = "EUR") {
  if (!value) return "Value open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default async function ContractsPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const now = new Date();
  const ninety = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [{ data: contracts }, { count: total }, { count: active }, { count: expiring }] = await Promise.all([
    admin.from("contracts").select("id, contract_type, status, starts_on, expires_on, gross_value, currency, players:player_id(first_name,last_name), clubs:club_id(name)").eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(50),
    admin.from("contracts").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("contracts").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active"),
    admin.from("contracts").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active").lte("expires_on", ninety),
  ]);
  const rows = (contracts ?? []) as ContractRow[];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="mb-6"><div className="mb-2 flex items-center gap-3"><LivePill>{total ?? 0} contracts</LivePill><span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real legal records</span></div><h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Contracts</h1><p className="mt-1.5 text-xs text-slate-500">Representation agreements, club contracts and critical dates from your Supabase database.</p></div>
      <div className="grid gap-3 sm:grid-cols-3"><StatTile icon={FileSignature} label="Total" value={String(total ?? 0)} delta="records" accent="cyan" /><StatTile icon={ShieldCheck} label="Active" value={String(active ?? 0)} delta="valid contracts" accent="lime" /><StatTile icon={CalendarClock} label="Expiring" value={String(expiring ?? 0)} delta="next 90 days" accent="gold" /></div>
      <GamePanel className="mt-6 overflow-hidden">
        <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="Contract vault" title="Real Contract Records" /></div>
        {rows.length ? (
          <div className="divide-y divide-white/[.06]">
            {rows.map((contract) => (
              <div key={contract.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_130px_130px_120px] sm:items-center">
                <div><p className="text-[10px] font-black uppercase italic">{name(contract.players)}</p><p className="mt-1 text-[8px] text-slate-600">{contract.contract_type} · {club(contract.clubs)}</p></div>
                <span className="text-[8px] font-black uppercase text-cyan-300">{contract.status}</span>
                <span className="text-[8px] text-slate-500">Expires {contract.expires_on ?? "open"}</span>
                <span className="number-glow text-sm font-black">{money(contract.gross_value, contract.currency ?? "EUR")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-7"><p className="text-sm font-black uppercase italic text-white">No contracts yet</p><p className="mt-2 text-xs leading-6 text-slate-500">Create contracts from a player, deal or AI workflow. Only real records are shown here.</p><Link href="/players" className="mt-5 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">Open players</Link></div>
        )}
      </GamePanel>
    </div>
  );
}

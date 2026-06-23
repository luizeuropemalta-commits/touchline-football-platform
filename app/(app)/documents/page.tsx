import Link from "next/link";
import { FileCheck2, FileText, ShieldCheck, Upload, Users } from "lucide-react";
import { GamePanel, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type PlayerDocument = {
  id: string;
  name: string;
  category: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  players?: { first_name?: string | null; last_name?: string | null } | Array<{ first_name?: string | null; last_name?: string | null }> | null;
};

type RepresentationDocument = {
  id: string;
  name: string;
  document_type: string | null;
  ai_validation_status: string | null;
  created_at: string;
};

function playerName(value: PlayerDocument["players"]) {
  const player = Array.isArray(value) ? value[0] : value;
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "Player vault";
}

function sizeLabel(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function safeCount(query: PromiseLike<{ count: number | null }>) {
  try {
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function DocumentsPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: playerDocs }, { data: representationDocs }, players, verified] = await Promise.all([
    admin.from("player_documents").select("id, name, category, mime_type, size_bytes, created_at, players:player_id(first_name,last_name)").eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(80),
    admin.from("representation_documents").select("id, name, document_type, ai_validation_status, created_at").eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(80),
    safeCount(admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("agent_player_associations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "verified_representation")),
  ]);

  const vaultDocs = (playerDocs ?? []) as PlayerDocument[];
  const repDocs = (representationDocs ?? []) as RepresentationDocument[];
  const allDocs = vaultDocs.length + repDocs.length;

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="af-mode-kicker">Touchline / Document Vault</p>
          <h1 className="font-display mt-2 text-3xl uppercase italic sm:text-[42px]">Documents</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">Central view for player vault files and representation proof documents.</p>
        </div>
        <Link href="/players" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]"><Upload size={14} />Upload from player</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={FileText} label="Documents" value={String(allDocs)} delta="vault records" accent="cyan" />
        <StatTile icon={Users} label="Players" value={String(players)} delta="available profiles" accent="lime" />
        <StatTile icon={ShieldCheck} label="Verified Reps" value={String(verified)} delta="approved relationships" accent="gold" />
        <StatTile icon={FileCheck2} label="Proof Docs" value={String(repDocs.length)} delta="representation files" accent="rose" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="Player vault" title="Player Documents" /></div>
          {vaultDocs.length ? (
            <div className="divide-y divide-white/[.06]">
              {vaultDocs.map((doc) => (
                <div key={doc.id} className="live-row grid gap-3 p-5 md:grid-cols-[1fr_120px_110px] md:items-center" style={{ "--row-accent": "#22d3ee" } as React.CSSProperties}>
                  <div><p className="text-sm font-black uppercase italic text-white">{doc.name}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{playerName(doc.players)} · {doc.category ?? "document"}</p></div>
                  <p className="text-[10px] font-bold text-slate-400">{sizeLabel(doc.size_bytes)}</p>
                  <p className="text-[9px] font-bold text-cyan-200">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center"><p className="text-sm font-black uppercase italic text-white">No player documents yet</p><p className="mt-2 text-xs text-slate-500">Open a player and upload passport, contracts, medical reports or videos.</p></div>
          )}
        </GamePanel>

        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="Representation" title="Proof Documents" /></div>
          {repDocs.length ? (
            <div className="divide-y divide-white/[.06]">
              {repDocs.map((doc) => (
                <div key={doc.id} className="live-row grid gap-3 p-5 md:grid-cols-[1fr_150px_120px] md:items-center" style={{ "--row-accent": "#a3ff12" } as React.CSSProperties}>
                  <div><p className="text-sm font-black uppercase italic text-white">{doc.name}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{doc.document_type ?? "supporting document"}</p></div>
                  <p className="text-[10px] font-bold text-[#a3ff12]">{doc.ai_validation_status ?? "pending_review"}</p>
                  <p className="text-[9px] font-bold text-cyan-200">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center"><p className="text-sm font-black uppercase italic text-white">No representation proof yet</p><p className="mt-2 text-xs text-slate-500">Use Agent Verification to add authorization letters and agency contracts.</p><Link href="/verification" className="mt-5 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">Open verification</Link></div>
          )}
        </GamePanel>
      </div>
    </div>
  );
}

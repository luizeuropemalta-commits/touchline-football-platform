import Link from "next/link";
import { ArrowRightLeft, Clock3, FileText, Flame, MessageSquare, Radio, Upload, Users, Zap } from "lucide-react";
import { GamePanel, Meter, SectionHeader, StatTile } from "@/components/game-ui";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type LinkedValue = { name?: string | null; first_name?: string | null; last_name?: string | null } | Array<{ name?: string | null; first_name?: string | null; last_name?: string | null }> | null;

function linkedName(value: LinkedValue, fallback = "Open") {
  const item = Array.isArray(value) ? value[0] : value;
  const name = item?.name ?? `${item?.first_name ?? ""} ${item?.last_name ?? ""}`.trim();
  return name || fallback;
}

export default async function NegotiationCenter() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Negotiation Center</h1>
        <p className="mt-3 text-slate-400">Connect Supabase to activate real deal rooms.</p>
      </GamePanel>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Login required</h1>
        <p className="mt-3 text-slate-400">Login to enter private negotiation rooms.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">Login</Link>
      </GamePanel>
    );
  }

  const { admin, agencyId } = await ensureUserWorkspace(user);
  const [{ data: rooms }, { data: interests }, { data: messages }, { data: files }] = await Promise.all([
    admin
      .from("negotiation_rooms")
      .select("id, title, status, updated_at, players:player_id(first_name,last_name), clubs:club_id(name), interests:interest_id(status, club_name)")
      .eq("agency_id", agencyId)
      .order("updated_at", { ascending: false })
      .limit(100),
    admin.from("player_interests").select("id, status").eq("agency_id", agencyId),
    admin.from("negotiation_messages").select("id").eq("agency_id", agencyId),
    admin.from("negotiation_files").select("id").eq("agency_id", agencyId),
  ]);

  const activeRooms = (rooms ?? []).filter((room) => room.status === "active");
  const negotiating = (interests ?? []).filter((interest) => interest.status === "negotiation").length;
  const closed = (interests ?? []).filter((interest) => interest.status === "deal_closed").length;

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 animate-in">
      <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(163,255,18,.25)" } as React.CSSProperties}>
        <div className="relative z-10 grid min-w-0 gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] 2xl:items-end">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" />Negotiation center live</span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">Private rooms · real data</span>
            </div>
            <p className="af-mode-kicker">Touchline / Negotiation Center</p>
            <h1 className="af-mode-title font-display mt-3 max-w-full text-white">Deal Rooms</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300/80">
              Private environment for club interest, messages, files, pitch documents, internal notes and timeline. Rooms are created automatically when opportunities move into negotiation.
            </p>
            <div className="mt-8">
              <Link href="/opportunities" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-[#071007]">
                <Zap size={14} />Create opportunity
              </Link>
            </div>
          </div>
          <div className="stadium-scoreboard min-w-0 p-5">
            <div className="relative z-10 flex items-center justify-between">
              <div><p className="text-[8px] font-black uppercase tracking-[.22em] text-[#a3ff12]">Active rooms</p><p className="font-display mt-2 text-7xl leading-none text-white">{activeRooms.length}</p></div>
              <Flame className="text-rose-300" size={38} />
            </div>
            <div className="relative z-10 mt-5"><div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500"><span>Negotiation pressure</span><span>{activeRooms.length ? "active" : "quiet"}</span></div><Meter value={Math.min(100, activeRooms.length * 22)} color={activeRooms.length > 2 ? "red" : "cyan"} /></div>
          </div>
        </div>
      </section>

      <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={ArrowRightLeft} label="Active Rooms" value={String(activeRooms.length)} delta="private environments" accent="cyan" />
        <StatTile icon={MessageSquare} label="Messages" value={String(messages?.length ?? 0)} delta="stored automatically" accent="lime" />
        <StatTile icon={Upload} label="Files" value={String(files?.length ?? 0)} delta="contracts/docs" accent="gold" />
        <StatTile icon={Clock3} label="Closed Deals" value={String(closed)} delta={`${negotiating} negotiating`} accent="rose" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_.75fr]">
        <GamePanel className="status-scan overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4">
            <div><p className="text-[8px] font-black uppercase tracking-[.2em] text-rose-300">Private rooms</p><h2 className="mt-1 text-sm font-black uppercase italic">Negotiation Timeline</h2></div>
            <Radio size={16} className="pulse-live text-rose-400" />
          </div>
          {rooms?.length ? (
            <div className="divide-y divide-white/[.06]">
              {rooms.map((room, index) => (
                <div key={room.id} className="live-row grid gap-4 px-5 py-5 md:grid-cols-[1.2fr_.7fr_.7fr_.65fr] md:items-center" style={{ "--row-accent": room.status === "active" ? "#22d3ee" : "#64748b" } as React.CSSProperties}>
                  <div className="flex items-center gap-3">
                    <span className="interactive-icon grid size-9 place-items-center rounded-lg border border-white/[.08] bg-white/[.03] text-[9px] font-black text-slate-500">{String(index + 1).padStart(2, "0")}</span>
                    <div><p className="text-[11px] font-black uppercase italic">{room.title}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{linkedName(room.clubs, "Club")} · {linkedName(room.players, "Player")}</p></div>
                  </div>
                  <div><p className="text-[8px] text-slate-600">STATUS</p><p className="mt-1 text-sm font-black">{room.status.replaceAll("_", " ")}</p></div>
                  <div><p className="text-[8px] text-slate-600">UPDATED</p><p className="mt-1 text-xs font-black text-cyan-100">{new Date(room.updated_at).toLocaleDateString()}</p></div>
                  <div className="md:text-right">
                    <Link href={`/deals/${room.id}`} className="inline-flex h-9 items-center justify-center rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase text-[#caff72] transition hover:border-[#a3ff12]/45 hover:bg-[#a3ff12]/[.16]">
                      Open room →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <MessageSquare size={28} className="text-slate-700" />
              <p className="mt-4 text-xs font-black uppercase text-white">No negotiation rooms yet</p>
              <p className="mt-2 max-w-md text-[10px] leading-5 text-slate-500">Create a club interest from the Club Network to open the first room.</p>
            </div>
          )}
        </GamePanel>

        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Room tools" title="Stored inside each room" />
            <div className="space-y-3">
              {[
                ["Messages", "Club-agent conversation history", MessageSquare],
                ["Files", "Contracts, presentations and documents", FileText],
                ["Contracts", "Drafts and signed agreements", ArrowRightLeft],
                ["Timeline", "Every action stored automatically", Clock3],
              ].map(([title, body, Icon]) => {
                const ToolIcon = Icon as typeof MessageSquare;
                return (
                  <div key={String(title)} className="flex gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4">
                    <ToolIcon size={16} className="text-cyan-300" />
                    <div><p className="text-[10px] font-black uppercase text-white">{String(title)}</p><p className="mt-1 text-[9px] leading-5 text-slate-500">{String(body)}</p></div>
                  </div>
                );
              })}
            </div>
          </GamePanel>
          <GamePanel className="p-5">
            <SectionHeader kicker="Next action" title="Create workflow" />
            <p className="text-xs leading-6 text-slate-500">Use Opportunity Board → Deal to create a private room, attach pitch documents and begin the deal timeline.</p>
            <Link href="/opportunities" className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/45 bg-[#a3ff12] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-[#071007] transition hover:-translate-y-0.5 hover:bg-[#bcff52]">
              <Users size={13} />Open Opportunity Board
            </Link>
          </GamePanel>
        </div>
      </div>
    </div>
  );
}

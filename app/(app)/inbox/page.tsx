import Link from "next/link";
import { Building2, FileSignature, MessageSquare, Search, ShieldCheck } from "lucide-react";
import { GamePanel, LivePill, SectionHeader } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type PlayerJoin = { first_name?: string | null; last_name?: string | null; position?: string | null } | Array<{ first_name?: string | null; last_name?: string | null; position?: string | null }> | null;
type RoomJoin = { title?: string | null; status?: string | null } | Array<{ title?: string | null; status?: string | null }> | null;

type InterestRow = {
  id: string;
  club_name: string;
  sporting_director: string | null;
  position_needed: string | null;
  message: string | null;
  status: string;
  created_at: string;
  players?: PlayerJoin;
};

type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  rooms?: RoomJoin;
};

function playerName(value?: PlayerJoin) {
  const player = Array.isArray(value) ? value[0] : value;
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "Player profile";
}

function roomTitle(value?: RoomJoin) {
  const room = Array.isArray(value) ? value[0] : value;
  return room?.title ?? "Negotiation room";
}

function timeLabel(date: string) {
  const then = new Date(date).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default async function Inbox() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: interestRows }, { data: messageRows }] = await Promise.all([
    admin
      .from("player_interests")
      .select("id, club_name, sporting_director, position_needed, message, status, created_at, players:player_id(first_name,last_name,position)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("negotiation_messages")
      .select("id, body, created_at, rooms:room_id(title,status)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const interests = (interestRows ?? []) as InterestRow[];
  const messages = (messageRows ?? []) as MessageRow[];
  const items = [
    ...interests.map((item) => ({
      id: `interest-${item.id}`,
      kind: "Club interest",
      from: item.club_name,
      title: `${item.club_name} is interested in ${playerName(item.players)}`,
      preview: item.message || `Requirement: ${item.position_needed || "position open"}`,
      status: item.status,
      time: timeLabel(item.created_at),
      icon: Building2,
      urgent: item.status === "new_interest",
    })),
    ...messages.map((item) => ({
      id: `message-${item.id}`,
      kind: "Negotiation message",
      from: roomTitle(item.rooms),
      title: "New negotiation update",
      preview: item.body,
      status: "message",
      time: timeLabel(item.created_at),
      icon: MessageSquare,
      urgent: false,
    })),
  ].sort((a, b) => (a.time === "now" ? -1 : b.time === "now" ? 1 : 0));

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <LivePill>{items.length} real items</LivePill>
          <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Club interests and negotiation messages</span>
        </div>
        <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Inbox</h1>
        <p className="mt-1.5 text-xs text-slate-500">Every item here is created by a real club interest or deal-room action.</p>
      </div>

      <GamePanel className="grid min-h-[650px] overflow-hidden lg:grid-cols-[380px_1fr]">
        <aside className="border-b border-white/[.07] bg-black/[.08] lg:border-b-0 lg:border-r">
          <div className="border-b border-white/[.07] p-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input placeholder="Search real communications..." className="h-9 w-full rounded-lg border border-white/[.07] bg-black/20 pl-9 text-[9px] outline-none transition placeholder:text-slate-700 focus:border-cyan-300/25" />
            </div>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            {items.length ? (
              items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.id} href="/deals" className="live-row flex w-full gap-3 border-b border-white/[.05] p-4 text-left hover:bg-white/[.02]" style={{ "--row-accent": item.urgent ? "#fb7185" : "#22d3ee" } as React.CSSProperties}>
                    <span className={`interactive-icon grid size-9 shrink-0 place-items-center rounded-lg border ${item.urgent ? "border-rose-300/20 bg-rose-300/[.07] text-rose-300" : "border-white/[.07] bg-white/[.03] text-slate-500"}`}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between">
                        <p className="truncate text-[9px] font-black uppercase">{item.from}</p>
                        <span className="text-[7px] text-slate-700">{item.time}</span>
                      </div>
                      <p className="mt-1 truncate text-[9px] font-bold text-slate-300">{item.title}</p>
                      <p className="mt-1 truncate text-[8px] text-slate-600">{item.preview}</p>
                    </div>
                    {item.urgent && <span className="pulse-live mt-1 size-1.5 rounded-full bg-rose-400" />}
                  </Link>
                );
              })
            ) : (
              <div className="p-6 text-sm text-slate-500">Your inbox is empty. Create club interest from the Club Hub or start a negotiation to generate real messages.</div>
            )}
          </div>
        </aside>

        <article className="p-5 sm:p-8">
          <SectionHeader kicker="Private football communications" title="Live message room" action={<ShieldCheck size={17} className="text-[#a3ff12]" />} />
          {items[0] ? (
            <div className="max-w-3xl py-8">
              <div className="flex gap-4">
                <span className="premium-ring grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-300">
                  <FileSignature size={18} />
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-cyan-300">{items[0].kind}</p>
                  <h2 className="mt-2 text-lg font-black uppercase italic">{items[0].title}</h2>
                  <p className="mt-4 text-[11px] leading-7 text-slate-400">{items[0].preview}</p>
                  <Link href="/deals" className="mt-6 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">
                    Open negotiation center
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-300/[.035] p-8">
              <p className="text-sm font-black uppercase italic text-white">No communications yet</p>
              <p className="mt-2 max-w-xl text-xs leading-6 text-slate-500">When clubs click interest, request contact, or negotiate with your players, Touchline creates the inbox feed automatically.</p>
              <Link href="/clubs" className="mt-5 inline-flex h-10 items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">
                Go to Club Hub
              </Link>
            </div>
          )}
        </article>
      </GamePanel>
    </div>
  );
}

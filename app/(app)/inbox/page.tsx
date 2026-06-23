import { InboxCenter, type InboxItem } from "@/components/inbox-center";
import { LivePill } from "@/components/game-ui";
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
  const items: InboxItem[] = [
    ...interests.map((item) => ({
      id: `interest-${item.id}`,
      kind: "Club interest",
      from: item.club_name,
      title: `${item.club_name} is interested in ${playerName(item.players)}`,
      preview: item.message || `Requirement: ${item.position_needed || "position open"}`,
      status: item.status,
      time: timeLabel(item.created_at),
      urgent: item.status === "new_interest",
      type: "interest" as const,
    })),
    ...messages.map((item) => ({
      id: `message-${item.id}`,
      kind: "Negotiation message",
      from: roomTitle(item.rooms),
      title: "New negotiation update",
      preview: item.body,
      status: "message",
      time: timeLabel(item.created_at),
      urgent: false,
      type: "message" as const,
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

      <InboxCenter items={items} />
    </div>
  );
}

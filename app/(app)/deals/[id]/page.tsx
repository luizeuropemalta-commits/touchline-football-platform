import { notFound } from "next/navigation";
import { DealRoomWorkspace, type DealRoomData, type DealRoomDocument, type DealRoomFile, type DealRoomMessage } from "@/components/deal-room-workspace";
import { GamePanel } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type PlayerJoin = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  photo_url?: string | null;
} | Array<{
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  photo_url?: string | null;
}> | null;

type ClubJoin = { name?: string | null; league?: string | null } | Array<{ name?: string | null; league?: string | null }> | null;
type InterestJoin = { status?: string | null; message?: string | null; club_name?: string | null } | Array<{ status?: string | null; message?: string | null; club_name?: string | null }> | null;
type DealJoin = { title?: string | null; status?: string | null; estimated_value?: number | null; currency?: string | null } | Array<{ title?: string | null; status?: string | null; estimated_value?: number | null; currency?: string | null }> | null;

type RoomRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  player_id: string | null;
  players?: PlayerJoin;
  clubs?: ClubJoin;
  interests?: InterestJoin;
  deals?: DealJoin;
};

type MessageRow = { id: string; body: string; created_at: string };
type FileRow = { id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; created_at: string };
type DocumentRow = { id: string; title: string; document_type: string; status: string; created_at: string };

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function playerName(player: ReturnType<typeof one<NonNullable<Exclude<PlayerJoin, unknown[]>>>>) {
  return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "Player profile";
}

export default async function DealRoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const { data: roomData, error: roomError } = await admin
    .from("negotiation_rooms")
    .select("id, title, status, updated_at, player_id, players:player_id(id,first_name,last_name,position,photo_url), clubs:club_id(name,league), interests:interest_id(status,message,club_name), deals:deal_id(title,status,estimated_value,currency)")
    .eq("agency_id", agencyId)
    .eq("id", id)
    .maybeSingle();

  if (roomError) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Could not load deal room</h1>
        <p className="mt-3 text-rose-200">{roomError.message}</p>
      </GamePanel>
    );
  }

  if (!roomData) notFound();

  const roomRow = roomData as RoomRow;
  const player = one(roomRow.players);
  const club = one(roomRow.clubs);
  const interest = one(roomRow.interests);
  const deal = one(roomRow.deals);

  const [{ data: messageRows }, { data: fileRows }, { data: documentRows }] = await Promise.all([
    admin
      .from("negotiation_messages")
      .select("id, body, created_at")
      .eq("agency_id", agencyId)
      .eq("room_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("negotiation_files")
      .select("id, name, storage_path, mime_type, size_bytes, created_at")
      .eq("agency_id", agencyId)
      .eq("room_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    roomRow.player_id
      ? admin
          .from("ai_generated_documents")
          .select("id, title, document_type, status, created_at")
          .eq("agency_id", agencyId)
          .eq("target_type", "player")
          .eq("target_id", roomRow.player_id)
          .eq("document_type", "player_presentation")
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as DocumentRow[] }),
  ]);

  const room: DealRoomData = {
    id: roomRow.id,
    title: roomRow.title,
    status: roomRow.status,
    updatedAt: roomRow.updated_at,
    playerId: roomRow.player_id,
    playerName: playerName(player),
    playerPosition: player?.position ?? null,
    playerPhotoUrl: player?.photo_url ?? null,
    clubName: club?.name ?? interest?.club_name ?? "Club open",
    clubLeague: club?.league ?? null,
    interestStatus: interest?.status ?? null,
    interestMessage: interest?.message ?? null,
    dealTitle: deal?.title ?? null,
    dealStatus: deal?.status ?? null,
    dealValue: deal?.estimated_value ?? null,
    currency: deal?.currency ?? "EUR",
  };

  const messages: DealRoomMessage[] = ((messageRows ?? []) as MessageRow[]).map((item) => ({
    id: item.id,
    body: item.body,
    createdAt: item.created_at,
  }));

  const files: DealRoomFile[] = ((fileRows ?? []) as FileRow[]).map((item) => ({
    id: item.id,
    name: item.name,
    storagePath: item.storage_path,
    mimeType: item.mime_type,
    sizeBytes: item.size_bytes,
    createdAt: item.created_at,
  }));

  const documents: DealRoomDocument[] = ((documentRows ?? []) as DocumentRow[]).map((item) => ({
    id: item.id,
    title: item.title,
    documentType: item.document_type,
    status: item.status,
    createdAt: item.created_at,
  }));

  return <DealRoomWorkspace room={room} messages={messages} files={files} documents={documents} />;
}

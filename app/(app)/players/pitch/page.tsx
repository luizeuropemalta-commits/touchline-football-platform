import Link from "next/link";
import { GamePanel } from "@/components/game-ui";
import { PlayerPitchBuilder, type PitchPlayer } from "@/components/player-pitch-builder";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  position: string | null;
  preferred_foot: string | null;
  market_value: number | null;
  currency: string | null;
  photo_url: string | null;
  contract_end_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  external_market_url: string | null;
  ai_profile: PitchPlayer["aiProfile"];
  clubs?: ClubJoin;
};

type VideoRow = { player_id: string; url: string | null; created_at: string | null };
type DocumentRow = { player_id: string };

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
}

function fullName(player: PlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

function searchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PitchPlayerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;

  const [{ data: playerRows, error: playerError }, { data: videoRows }, { data: documentRows }] = await Promise.all([
    admin
      .from("players")
      .select("id, first_name, last_name, date_of_birth, nationality, position, preferred_foot, market_value, currency, photo_url, contract_end_date, height_cm, weight_kg, external_market_url, ai_profile, clubs:current_club_id(name)")
      .eq("agency_id", agencyId)
      .order("updated_at", { ascending: false })
      .limit(300),
    admin
      .from("player_videos")
      .select("player_id, url, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("player_documents")
      .select("player_id")
      .eq("agency_id", agencyId)
      .limit(1000),
  ]);

  if (playerError) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Could not load Pitch Player</h1>
        <p className="mt-3 text-rose-200">{playerError.message}</p>
      </GamePanel>
    );
  }

  const videosByPlayer = new Map<string, VideoRow[]>();
  for (const video of (videoRows ?? []) as VideoRow[]) {
    const current = videosByPlayer.get(video.player_id) ?? [];
    current.push(video);
    videosByPlayer.set(video.player_id, current);
  }

  const docsByPlayer = new Map<string, number>();
  for (const doc of (documentRows ?? []) as DocumentRow[]) {
    docsByPlayer.set(doc.player_id, (docsByPlayer.get(doc.player_id) ?? 0) + 1);
  }

  const players: PitchPlayer[] = ((playerRows ?? []) as PlayerRow[]).map((player) => {
    const videos = videosByPlayer.get(player.id) ?? [];
    return {
      id: player.id,
      name: fullName(player),
      position: player.position,
      nationality: player.nationality,
      dateOfBirth: player.date_of_birth,
      club: clubName(player.clubs),
      marketValue: player.market_value,
      currency: player.currency,
      photoUrl: player.photo_url,
      contractEndDate: player.contract_end_date,
      preferredFoot: player.preferred_foot,
      heightCm: player.height_cm,
      weightKg: player.weight_kg,
      externalUrl: player.external_market_url,
      aiProfile: player.ai_profile,
      videoCount: videos.length,
      documentCount: docsByPlayer.get(player.id) ?? 0,
      latestVideoUrl: videos[0]?.url ?? null,
    };
  });

  return (
    <div className="space-y-5">
      <PlayerPitchBuilder
        players={players}
        initialPlayerId={searchValue(params?.player)}
        initialTargetClub={searchValue(params?.club) ?? ""}
        initialObjective={searchValue(params?.objective)}
      />
      <div className="mx-auto flex max-w-[1600px] justify-end">
        <Link href="/ai" className="text-[9px] font-black uppercase tracking-[.16em] text-slate-600 hover:text-cyan-300">
          View saved AI documents →
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { PlayerManagement, type RealPlayer } from "@/components/player-management";
import { GamePanel } from "@/components/game-ui";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
}

export default async function PlayersPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Player Management</h1>
        <p className="mt-3 text-slate-400">Connect Supabase to activate real player management.</p>
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
        <p className="mt-3 text-slate-400">Login to manage your real player portfolio.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          Login
        </Link>
      </GamePanel>
    );
  }

  const { admin, agencyId } = await ensureUserWorkspace(user);
  const { data, error } = await admin
    .from("players")
    .select("id, first_name, last_name, date_of_birth, nationality, position, preferred_foot, status, market_value, currency, photo_url, contract_end_date, height_cm, weight_kg, external_market_provider, external_market_player_id, external_market_url, ai_profile, clubs:current_club_id(name)")
    .eq("agency_id", agencyId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Could not load players</h1>
        <p className="mt-3 text-rose-200">{error.message}</p>
      </GamePanel>
    );
  }

  const players: RealPlayer[] = (data ?? []).map((player) => ({
    id: player.id,
    name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player",
    firstName: player.first_name,
    lastName: player.last_name,
    dateOfBirth: player.date_of_birth,
    nationality: player.nationality,
    position: player.position,
    preferredFoot: player.preferred_foot,
    status: player.status,
    marketValue: player.market_value,
    currency: player.currency,
    photoUrl: player.photo_url,
    contractEndDate: player.contract_end_date,
    heightCm: player.height_cm,
    weightKg: player.weight_kg,
    club: clubName(player.clubs as ClubJoin),
    externalProvider: player.external_market_provider,
    externalPlayerId: player.external_market_player_id,
    externalUrl: player.external_market_url,
    aiProfile: player.ai_profile,
  }));

  return <PlayerManagement initialPlayers={players} />;
}

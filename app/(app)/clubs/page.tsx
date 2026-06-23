import Link from "next/link";
import { ClubNetwork, type ClubNetworkClub, type ClubNetworkPlayer } from "@/components/club-network";
import { GamePanel } from "@/components/game-ui";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;
type AssociatedPlayerRow = {
  status: string;
  players?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    nationality: string | null;
    position: string | null;
    market_value: number | null;
    currency: string | null;
    photo_url: string | null;
    external_market_url: string | null;
    clubs?: ClubJoin;
  } | Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    nationality: string | null;
    position: string | null;
    market_value: number | null;
    currency: string | null;
    photo_url: string | null;
    external_market_url: string | null;
    clubs?: ClubJoin;
  }> | null;
};

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
}

export default async function ClubsPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Club Network</h1>
        <p className="mt-3 text-slate-400">Connect Supabase to activate the real club dashboard.</p>
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
        <p className="mt-3 text-slate-400">Login to search real players and create club interest workflows.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          Login
        </Link>
      </GamePanel>
    );
  }

  const { admin, agencyId } = await ensureUserWorkspace(user);
  const [{ data: clubRows }, { data: associationRows }] = await Promise.all([
    admin.from("clubs").select("id, name, country_code, league, crest_url").eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(120),
    admin
      .from("agent_player_associations")
      .select("status, players:player_id(id, first_name, last_name, nationality, position, market_value, currency, photo_url, external_market_url, clubs:current_club_id(name))")
      .eq("agency_id", agencyId)
      .eq("public_visible", true)
      .in("status", ["active_representation", "verified_representation"])
      .order("updated_at", { ascending: false })
      .limit(120),
  ]);

  const clubs: ClubNetworkClub[] = (clubRows ?? []).map((club) => ({
    id: club.id,
    name: club.name,
    countryCode: club.country_code,
    league: club.league,
    crestUrl: club.crest_url,
  }));

  const players: ClubNetworkPlayer[] = ((associationRows ?? []) as AssociatedPlayerRow[]).flatMap((association) => {
    const player = Array.isArray(association.players) ? association.players[0] : association.players;
    if (!player) return [];
    return [{
      id: player.id,
      name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player",
      nationality: player.nationality,
      position: player.position,
      marketValue: player.market_value,
      currency: player.currency,
      photoUrl: player.photo_url,
      externalUrl: player.external_market_url,
      club: clubName(player.clubs as ClubJoin),
      representationStatus: association.status,
    }];
  });

  return <ClubNetwork clubs={clubs} players={players} />;
}

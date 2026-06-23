import Link from "next/link";
import { GamePanel } from "@/components/game-ui";
import { PlayerOpportunities } from "@/components/player-opportunities";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type RelatedValue = { name?: string | null; first_name?: string | null; last_name?: string | null } | Array<{ name?: string | null; first_name?: string | null; last_name?: string | null }> | null;

function relatedName(value: RelatedValue) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.name ?? `${item?.first_name ?? ""} ${item?.last_name ?? ""}`.trim() ?? "";
}

export default async function OpportunitiesPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8">
        <h1 className="text-3xl font-black uppercase italic text-white">Player Opportunities</h1>
        <p className="mt-3 text-slate-400">Connect Supabase to activate real opportunity matching.</p>
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
        <p className="mt-3 text-slate-400">Login to open player opportunities.</p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">Login</Link>
      </GamePanel>
    );
  }

  const { admin, agencyId } = await ensureUserWorkspace(user);
  const [{ data: opportunityRows }, { data: playerRows }] = await Promise.all([
    admin
      .from("player_opportunities")
      .select("id, title, position_needed, match_score, status, players:player_id(first_name,last_name), clubs:club_id(name)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false }),
    admin.from("players").select("id, first_name, last_name, position").eq("agency_id", agencyId).order("updated_at", { ascending: false }).limit(200),
  ]);

  return (
    <PlayerOpportunities
      initialOpportunities={(opportunityRows ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        positionNeeded: item.position_needed,
        matchScore: item.match_score,
        status: item.status,
        clubName: relatedName(item.clubs),
        playerName: relatedName(item.players),
      }))}
      players={(playerRows ?? []).map((player) => ({
        id: player.id,
        name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player",
        position: player.position,
      }))}
    />
  );
}

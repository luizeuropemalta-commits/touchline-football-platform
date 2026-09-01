import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CardEngineCandidate } from "./card-engine-editorial-import";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Loads the one canonical candidate set used by every protected Card Engine
 * entry point. The active membership fence deliberately allows many clubs in
 * one batch while rejecting ambiguous or stale player-to-club identities.
 */
export async function loadTouchlineCardEngineCandidates(admin: SupabaseClient): Promise<CardEngineCandidate[]> {
  const { data: players, error } = await admin
    .from("football_players")
    .select("id,provider_player_id,display_name,name,date_of_birth,source_updated_at,current_club_id,football_clubs:current_club_id(name)")
    .eq("provider", "sportmonks")
    .not("current_club_id", "is", null)
    .limit(1_000);
  if (error) throw new Error(error.message);

  const ids = (players ?? []).map((player) => player.id).filter((id): id is string => UUID_PATTERN.test(id));
  const { data: memberships, error: membershipError } = ids.length
    ? await admin
        .from("football_squad_members")
        .select("player_id,jersey_number,club_id,status,provider")
        .in("player_id", ids)
        .eq("provider", "sportmonks")
        .eq("status", "active")
    : { data: [], error: null };
  if (membershipError) throw new Error(membershipError.message);

  const membershipsByPlayer = new Map<string, Array<{ jersey_number: number | null; club_id: string }>>();
  for (const membership of memberships ?? []) {
    membershipsByPlayer.set(membership.player_id, [
      ...(membershipsByPlayer.get(membership.player_id) ?? []),
      membership,
    ]);
  }

  return (players ?? []).flatMap((player) => {
    const club = Array.isArray(player.football_clubs) ? player.football_clubs[0] : player.football_clubs;
    const membershipsForPlayer = membershipsByPlayer.get(player.id) ?? [];
    if (
      !player.provider_player_id
      || membershipsForPlayer.length !== 1
      || membershipsForPlayer[0]!.club_id !== player.current_club_id
    ) return [];

    const member = membershipsForPlayer[0]!;
    return [{
      playerId: player.id,
      providerPlayerId: player.provider_player_id,
      name: player.display_name || player.name || "",
      club: club?.name || null,
      dateOfBirth: player.date_of_birth || null,
      provider: {
        displayName: player.display_name,
        jerseyNumber: member.jersey_number,
        sourceUpdatedAt: player.source_updated_at,
        clubId: member.club_id,
      },
    } satisfies CardEngineCandidate];
  });
}

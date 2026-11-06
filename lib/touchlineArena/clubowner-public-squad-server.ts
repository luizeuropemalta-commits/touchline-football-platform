import "server-only";
import { resolveServerReadWithin } from "./server-read-deadline";
import { readGameweekPlayerAvailability } from "./player-availability-reader";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicMarketDependencies } from "./clubowner-public-market-server";
import { publicOwnersEnabled } from "./clubowner-public-server";
import { publicOwnerId } from "./clubowner-public-contract";
import { createClubCollectionStore } from "../touchlineFantasy/club-collection-server";
import { loadCatalogue, loadCoaches } from "../touchlineFantasy/server";
import { readTouchlineFormationGeometryRegistry } from "./formation-geometry-server";
import { resolveTouchlineFormationGeometry } from "./formation-geometry";
import { publicSquadPlacement } from "./clubowner-public-squad";

/** Member-only, directory-authorized visitor read. No mutation or target impersonation. */
export async function readPublicOwnerSquad(publicId: string) {
  if (!publicOwnersEnabled() || !publicOwnerId(publicId)) return null;
  const access = publicMarketDependencies();
  const actor = await access.actor();
  if (!actor?.allowed || !access.allow(actor.accountId, false)) return null;
  const targetId = await access.target(publicId, actor.accountId);
  if (!targetId) return null;
  const admin = createAdminClient();
  if (!admin) throw new Error("SQUAD_UNAVAILABLE");
  const config = await admin.from("touchline_fantasy_configs").select("season_id")
    .eq("competition_key", "england").eq("status", "active").abortSignal(AbortSignal.timeout(10000)).single();
  if (config.error || !publicOwnerId(config.data?.season_id)) throw new Error("SQUAD_UNAVAILABLE");
  const read = await resolveServerReadWithin(createClubCollectionStore(admin).read(targetId, config.data.season_id).then(state => ({ state })), null, 10000);
  if (!read) throw new Error("SQUAD_UNAVAILABLE");
  const placement = publicSquadPlacement(read.state);
  const [catalogue, coaches, registry] = await Promise.all([
    placement.players.length ? loadCatalogue(admin) : Promise.resolve([]),
    placement.coachId ? loadCoaches(admin) : Promise.resolve([]),
    readTouchlineFormationGeometryRegistry(),
  ]);
  const ids = new Set(placement.players.map(player => player.playerId));
  const weeks = await admin.from("touchline_fantasy_gameweeks").select("id,state")
    .eq("season_id", config.data.season_id).order("gameweek_number", { ascending: true }).abortSignal(AbortSignal.timeout(10000));
  const week = weeks.data?.find(row => row.state === "MARKET_OPEN") ?? weeks.data?.find(row => row.state === "LIVE" || row.state === "LOCKED");
  const availability = !weeks.error && week ? await readGameweekPlayerAvailability(admin, config.data.season_id, week.id, [...ids], catalogue) : null;
  return {
    availability,
    players: placement.players,
    geometry: resolveTouchlineFormationGeometry(placement.formationCode, registry),
    cards: catalogue.filter(card => ids.has(card.canonicalPlayerId ?? card.id)),
    coach: coaches.find(coach => coach.id === placement.coachId) ?? null,
    hasCoach: placement.coachId !== null,
  };
}
export type PublicOwnerSquad = NonNullable<Awaited<ReturnType<typeof readPublicOwnerSquad>>>;

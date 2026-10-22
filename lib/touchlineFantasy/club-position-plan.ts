import { CLUB_POSITION_LIMITS, type ClubOwnedPlayer } from "./club-acquisition.ts";
import type { TouchlineFormationGeometry } from "../touchlineArena/formation-geometry.ts";
import type { ExchangePosition } from "./exchange-eligibility.ts";
import { eligiblePrimaryDetails, primaryPositionFitsTacticalSlot } from "./club-primary-position-policy.ts";
import { ownedClubPrimaryDetail, type ClubPrimaryPositionIndex } from "./club-primary-position-index.ts";
import { clubPlayerPosition } from "./club-position.ts";
import { validateClubRoster } from "./club-roster.ts";

/** Owner approved: nine fixed bench places, left to right. */
export const CLUB_RESERVE_POSITIONS: readonly ExchangePosition[] = Object.freeze(["GK", "CB", "RB", "LB", "DM", "MID", "RW", "LW", "CF"]);
const positions = Object.keys(CLUB_POSITION_LIMITS) as ExchangePosition[];

/** Read-only feasibility plan. Existing contracts and outside slot IDs remain
 * untouched. Vacant XI places use role-compatible quota categories; occupied
 * places must additionally have a verified, compatible primary detail. */
export function collectionSlotPlan(geometry: TouchlineFormationGeometry | null | undefined,
  players: readonly Pick<ClubOwnedPlayer, "playerId" | "area" | "slot" | "position" | "primaryDetail">[] = [], primaryDetails?: ClubPrimaryPositionIndex) {
  if (!geometry || geometry.slots.length !== 11 || new Set(geometry.slots.map(s => s.id)).size !== 11
    || validateClubRoster(players).length) return null;
  const remaining = { ...CLUB_POSITION_LIMITS };
  const outside: (ExchangePosition | null)[] = Array(15).fill(null);
  for (const position of CLUB_RESERVE_POSITIONS) remaining[position]--;
  for (const player of players) {
    if (!Object.hasOwn(CLUB_POSITION_LIMITS, player.position) || !ownedClubPrimaryDetail(player, primaryDetails)) return null;
    if (player.area === "reserves" && CLUB_RESERVE_POSITIONS[player.slot] !== player.position) return null;
    if (player.area === "outside") {
      outside[player.slot] = player.position;
      if (--remaining[player.position] < 0) return null;
    }
  }
  const starters: ExchangePosition[] = [];
  const assign = (index: number): boolean => {
    if (index === 11) return true;
    const slot = geometry.slots[index];
    const owned = players.find(player => player.area === "starters" && player.slot === index);
    const detail = owned ? ownedClubPrimaryDetail(owned, primaryDetails) : null;
    if (owned && !primaryPositionFitsTacticalSlot(detail, geometry.formationCode, slot.id)) return false;
    const allowed = [...new Set(eligiblePrimaryDetails(geometry.formationCode, slot.id)
      .map(clubPlayerPosition).filter((p): p is ExchangePosition => p !== null))];
    // Prefer the formation's normal quota category while retaining all explicit
    // function alternatives. This only plans empty slots, never classifies a player.
    if (/CM$/.test(slot.id) && allowed.includes("MID")) allowed.sort((a,b) => Number(b === "MID") - Number(a === "MID"));
    const candidates = owned ? allowed.filter(position => position === owned.position) : allowed;
    for (const position of candidates) {
      if (remaining[position] <= 0) continue;
      remaining[position]--; starters[index] = position;
      if (assign(index + 1)) return true;
      remaining[position]++;
    }
    return false;
  };
  if (!assign(0)) return null;
  const vacancies = positions.flatMap(position => Array<ExchangePosition>(remaining[position]).fill(position));
  if (vacancies.length !== outside.filter(position => position === null).length) return null;
  let next = 0;
  return { starters, reserves: CLUB_RESERVE_POSITIONS, outside: outside.map(position => position ?? vacancies[next++]) };
}

import type { TouchlinePublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fantasy-fixture";

const NUMERIC_ID = /^[0-9]{1,20}$/;

export type TouchlineSocialLineupContract = Readonly<{
  teamId: string;
  side: "home" | "away";
  formation: string;
  lineupAvailableAt: string;
  starterPlayerIds: readonly string[];
}>;

export type TouchlineSocialLineupContractResult =
  | Readonly<{ ok: true; value: TouchlineSocialLineupContract }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Fail-closed gate for a social line-up draft. The provider feed must already
 * be persisted, lifecycle-confirmed and complete. A preview, partial XI or
 * inferred shirt number can never cross this boundary.
 */
export function validateTouchlineSocialLineupContract(
  detail: TouchlinePublicFantasyFixtureMatchDetail,
  teamIdInput: string,
): TouchlineSocialLineupContractResult {
  const teamId = teamIdInput.trim();
  if (!NUMERIC_ID.test(teamId)) return { ok: false, reason: "invalid-team-id" };
  if (!detail.lineupAvailableAt || !Number.isFinite(Date.parse(detail.lineupAvailableAt))) {
    return { ok: false, reason: "lineup-not-confirmed" };
  }

  const homeTeamId = String(detail.fixture.homeTeam?.id ?? "").trim();
  const awayTeamId = String(detail.fixture.awayTeam?.id ?? "").trim();
  const side = teamId === homeTeamId ? "home" : teamId === awayTeamId ? "away" : null;
  if (!side) return { ok: false, reason: "team-not-in-fixture" };

  const starters = detail.lineups.filter((member) => (
    member.teamId === teamId && member.isStarter === true
  ));
  const starterPlayerIds = starters.map((member) => String(member.playerId ?? "").trim());
  if (starters.length !== 11 || starterPlayerIds.some((id) => !NUMERIC_ID.test(id))) {
    return { ok: false, reason: "starting-xi-incomplete" };
  }
  if (new Set(starterPlayerIds).size !== 11) {
    return { ok: false, reason: "starting-xi-duplicate-player" };
  }
  if (starters.some((member) => (
    !Number.isInteger(member.jerseyNumber)
    || Number(member.jerseyNumber) <= 0
    || Number(member.jerseyNumber) > 99
  ))) {
    return { ok: false, reason: "starting-xi-invalid-shirt-number" };
  }
  const formationPositions = starters.map((member) => Number.parseInt(String(member.formationPosition ?? ""), 10));
  if (formationPositions.some((position) => !Number.isInteger(position) || position < 1 || position > 11)) {
    return { ok: false, reason: "starting-xi-invalid-formation-position" };
  }
  if (new Set(formationPositions).size !== 11) {
    return { ok: false, reason: "starting-xi-duplicate-formation-position" };
  }

  const formations = detail.formations.filter((item) => item.teamId === teamId && item.formation?.trim());
  if (formations.length !== 1) return { ok: false, reason: "formation-unavailable" };

  return {
    ok: true,
    value: {
      teamId,
      side,
      formation: formations[0]!.formation!.trim(),
      lineupAvailableAt: detail.lineupAvailableAt,
      starterPlayerIds,
    },
  };
}

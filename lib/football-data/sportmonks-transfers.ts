import { asNumber, asString, providerId } from "./http.ts";
import type { TouchlineTransfer } from "./types.ts";

type SportmonksTransferEntity = Record<string, unknown>;

function relationEntity(
  raw: SportmonksTransferEntity,
  ...keys: string[]
): SportmonksTransferEntity | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entity = value as SportmonksTransferEntity;
    const data = entity.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as SportmonksTransferEntity;
    }
    return entity;
  }
  return undefined;
}

export function mapSportmonksTransfer(
  raw: SportmonksTransferEntity,
): TouchlineTransfer | null {
  const id = asString(raw.id);
  if (!id) return null;

  const player = relationEntity(raw, "player");
  const fromTeam = relationEntity(raw, "fromTeam", "fromteam", "from_team");
  const toTeam = relationEntity(raw, "toTeam", "toteam", "to_team");
  const type = relationEntity(raw, "type");

  return {
    id: providerId("sportmonks", id),
    providerId: id,
    provider: "sportmonks",
    playerId: asString(raw.player_id) ?? asString(player?.id),
    playerName:
      asString(player?.display_name) ??
      asString(player?.name) ??
      ([asString(player?.firstname), asString(player?.lastname)]
        .filter(Boolean)
        .join(" ") || undefined),
    fromTeamId: asString(raw.from_team_id) ?? asString(fromTeam?.id),
    fromTeamName: asString(fromTeam?.name),
    toTeamId: asString(raw.to_team_id) ?? asString(toTeam?.id),
    toTeamName: asString(toTeam?.name),
    date: asString(raw.date),
    type: asString(type?.name) ?? asString(type?.code) ?? asString(raw.type_name),
    amount: asNumber(raw.amount),
    currency: asString(raw.currency) ?? asString(raw.currency_code),
    source: { provider: "sportmonks", providerId: id },
  };
}

export function sortSportmonksTransfersNewestFirst(
  transfers: TouchlineTransfer[],
) {
  return [...transfers].sort((left, right) => {
    const leftTime = left.date ? Date.parse(left.date) : Number.NaN;
    const rightTime = right.date ? Date.parse(right.date) : Number.NaN;
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return safeRight - safeLeft;
  });
}

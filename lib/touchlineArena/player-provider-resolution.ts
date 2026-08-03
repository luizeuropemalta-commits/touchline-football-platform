import type {
  FootballDataProvider,
  TouchlinePlayer,
} from "../football-data/types.ts";
import { normalizeTouchLineProviderPlayerId } from "./player-links.ts";

function normalizedPlayerName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function playerMatchesName(player: TouchlinePlayer, expectedName: string) {
  const expected = normalizedPlayerName(expectedName);
  return [player.name, player.displayName]
    .map(normalizedPlayerName)
    .some((candidate) => candidate === expected);
}

export async function resolveTouchLineProviderPlayer(
  provider: Pick<FootballDataProvider, "getPlayerById" | "searchPlayers">,
  input: { name: string; candidateId?: string | number | null },
) {
  const candidateId = normalizeTouchLineProviderPlayerId(input.candidateId);

  if (candidateId) {
    const result = await provider.getPlayerById(candidateId);
    if (result.ok && result.data && playerMatchesName(result.data, input.name)) {
      return result.data;
    }
  }

  const result = await provider.searchPlayers({ query: input.name, limit: 10 });
  if (!result.ok) return null;

  const exactByProvider = new Map<string, TouchlinePlayer>();
  result.data
    .filter((player) => playerMatchesName(player, input.name))
    .forEach((player) => exactByProvider.set(player.providerId, player));

  return exactByProvider.size === 1
    ? [...exactByProvider.values()][0]
    : null;
}

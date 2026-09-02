import { writeFile } from "node:fs/promises";
import path from "node:path";

import { TOUCHLINE_ENGLAND_CLUBS } from "../../lib/touchlineArena/demo-data.ts";

const QA_READ_BASE_URL = "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const MIN_COMPLETE_MARKET_CLUB_CARDS = 20;
const OUTPUT_PATH = path.resolve("app/visual-qa/market-premium-pitch/catalogue.snapshot.json");

type PublicSquadResponse = Readonly<{
  ok?: boolean;
  teamId?: string;
  team?: Readonly<{ providerId?: string; name?: string }>;
  players?: readonly Record<string, unknown>[];
  dataQuality?: Readonly<{ cardEligiblePlayers?: number }>;
  fetchedAt?: string;
}>;

async function readClub(teamId: string, clubName: string) {
  const endpoint = new URL("/api/football-data/premier-squad", QA_READ_BASE_URL);
  endpoint.searchParams.set("teamId", teamId);
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Canonical squad read failed for team ${teamId}.`);
  const payload = await response.json() as PublicSquadResponse;
  const players = Array.isArray(payload.players) ? payload.players : [];
  if (
    payload.ok !== true
    || payload.teamId !== teamId
    || payload.team?.providerId !== teamId
    || players.length < MIN_COMPLETE_MARKET_CLUB_CARDS
    || payload.dataQuality?.cardEligiblePlayers !== players.length
  ) {
    throw new Error(`Canonical squad is incomplete for team ${teamId}.`);
  }
  return { teamId, clubName, fetchedAt: payload.fetchedAt ?? null, players };
}

const clubs = await Promise.all(
  TOUCHLINE_ENGLAND_CLUBS.map((club) => readClub(club.teamId, club.name)),
);
const playerIds = clubs.flatMap((club) => club.players.map((player) => player.canonicalPlayerId));
if (playerIds.some((playerId) => typeof playerId !== "string") || new Set(playerIds).size !== playerIds.length) {
  throw new Error("Canonical catalogue contains a missing or duplicate player identity.");
}

await writeFile(OUTPUT_PATH, `${JSON.stringify({
  schemaVersion: "touchline.market.visual-catalogue.v1",
  generatedAt: new Date().toISOString(),
  source: "touchline-persisted-public-read-model",
  clubs,
}, null, 2)}\n`, "utf8");

process.stdout.write(`Wrote ${playerIds.length} canonical cards across ${clubs.length} clubs to ${OUTPUT_PATH}.\n`);

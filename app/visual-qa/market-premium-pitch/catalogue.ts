import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  publicPremierSquadPlayerToCard,
  type PublicPremierSquadPlayer,
} from "@/lib/football-data/public-premier-squad-server";
import { TOUCHLINE_ENGLAND_CLUBS, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";

const MIN_COMPLETE_MARKET_CLUB_CARDS = 20;
const SNAPSHOT_PATH = path.resolve("app/visual-qa/market-premium-pitch/catalogue.snapshot.json");

type VisualQaMarketSnapshot = Readonly<{
  schemaVersion?: string;
  generatedAt?: string;
  source?: string;
  clubs?: readonly Readonly<{
    teamId?: string;
    clubName?: string;
    fetchedAt?: string | null;
    players?: readonly PublicPremierSquadPlayer[];
  }>[];
}>;

export type VisualQaMarketCatalogueRead = Readonly<{
  state: "ready" | "unavailable";
  catalogue: readonly ClubOwnerSquadCard[];
  clubCounts: Readonly<Record<string, number>>;
  capturedAt: string | null;
  reason: string | null;
}>;

function readClubCatalogue(snapshot: VisualQaMarketSnapshot, teamId: string, clubName: string) {
  const club = snapshot.clubs?.find((entry) => entry.teamId === teamId);
  const players = Array.isArray(club?.players) ? club.players : [];
  if (club?.clubName !== clubName || players.length < MIN_COMPLETE_MARKET_CLUB_CARDS) {
    throw new Error("canonical-squad-incomplete");
  }
  const cards = players.map((player) => publicPremierSquadPlayerToCard(player, clubName));
  if (new Set(cards.map((card) => card.canonicalPlayerId)).size !== cards.length) {
    throw new Error("canonical-squad-duplicate-player");
  }
  return { cards, capturedAt: club.fetchedAt ?? null };
}

/**
 * Local visual-QA reader. It consumes a locally frozen export of the
 * persisted TouchLine public read model and performs no runtime network or
 * database calls. Every club must be complete; otherwise the preview fails
 * closed instead of presenting a misleading one-player catalogue.
 */
export async function readVisualQaMarketCatalogue(): Promise<VisualQaMarketCatalogueRead> {
  try {
    const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as VisualQaMarketSnapshot;
    if (
      snapshot.schemaVersion !== "touchline.market.visual-catalogue.v1"
      || snapshot.source !== "touchline-persisted-public-read-model"
      || snapshot.clubs?.length !== TOUCHLINE_ENGLAND_CLUBS.length
    ) throw new Error("canonical-catalogue-snapshot-invalid");
    const clubReads = TOUCHLINE_ENGLAND_CLUBS.map((club) => ({
      teamId: club.teamId,
      ...readClubCatalogue(snapshot, club.teamId, club.name),
    }));
    const catalogue = clubReads.flatMap((entry) => entry.cards);
    const canonicalIds = catalogue.map((card) => card.canonicalPlayerId).filter(Boolean);
    if (canonicalIds.length !== catalogue.length || new Set(canonicalIds).size !== catalogue.length) {
      throw new Error("canonical-catalogue-identity-conflict");
    }
    const clubCounts = Object.fromEntries(clubReads.map((entry) => [entry.teamId, entry.cards.length]));
    const capturedAt = clubReads
      .map((entry) => entry.capturedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(0) ?? null;
    return { state: "ready", catalogue, clubCounts, capturedAt, reason: null };
  } catch (error) {
    return {
      state: "unavailable",
      catalogue: [],
      clubCounts: {},
      capturedAt: null,
      reason: error instanceof Error ? error.message : "canonical-catalogue-read-failed",
    };
  }
}

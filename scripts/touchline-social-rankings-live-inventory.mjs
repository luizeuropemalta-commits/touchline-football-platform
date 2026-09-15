import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { deriveRankingsLive } from "../lib/social-rankings-live-contract.ts";
import { compareTouchlineRankingPlayers } from "../lib/touchlineArena/card-ranking.ts";

const directory = path.resolve("artifacts/social-studio/rankings");
const sourceBytes = await readFile(path.join(directory, "snapshot-20260914.json"));
const evidenceBytes = await readFile(path.join(directory, "settlement-evidence-20260914.json"));
const ratingFeedsBytes = await readFile(path.join(directory, "rating-lineup-evidence-20260914.json"));
const source = JSON.parse(sourceBytes), evidence = JSON.parse(evidenceBytes);
evidence.ratingFeeds = JSON.parse(ratingFeedsBytes).feeds;
const revision = createHash("sha256").update(sourceBytes).update(evidenceBytes).update(ratingFeedsBytes).digest("hex");
// Inventory only. Render input must pass the canonical public-card reader too.
const result = deriveRankingsLive(source, evidence, evidence.publishedPlayerIds, revision);
const summary = {
  status: "LOCAL_DERIVATION_PENDING_PUBLIC_CARD_REVALIDATION",
  provenance: result.provenance, completedFixtures: result.table.coverage.completedFixtures,
  seasonPlayers: result.seasonRanking.snapshot.players.length,
  weeklyPlayers: result.weeklyRanking.snapshot.players.length,
  overall: result.overall, weeklyLeaders: result.weeklyLeaders,
  selection: result.selection, coach: result.coaches[0], table: result.table,
  goldenBoot: result.goldenBoot, gates: result.gates,
};
if (process.argv.includes("--write")) await writeFile(path.join(directory, "factual-inventory-20260914.json"), JSON.stringify(summary, null, 2) + "\n");
const matchPreviewLeaders = ["Brentford", "Chelsea"].map((name) => {
  const club = source.clubs.find((c) => c.name === name);
  const ids = new Set(evidence.players.filter((p) => p.current_club_id === club.id).map((p) => p.id));
  const player = [...result.seasonRanking.snapshot.players].filter((p) => ids.has(p.playerId)).sort(compareTouchlineRankingPlayers)[0];
  return { clubId: club.id, clubProviderId: club.provider_team_id, clubName: name, player };
});
if (process.argv.includes("--write")) await writeFile(path.join(directory, "match-preview-leaders-20260914.json"), JSON.stringify({ ...summary.provenance, status: "LOCAL_DERIVATION_PENDING_PUBLIC_CARD_REVALIDATION", publishable: false, leaders: matchPreviewLeaders }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ matchPreviewLeaders }) + "\n");
process.stdout.write(JSON.stringify({ ...summary, selection: summary.selection.players.map((p) => ({ slot: p.label, name: p.player.name, totalRating: p.player.totalRating })), table: summary.table.rows.slice(0, 5).map((r) => ({ rank: r.sportsRank, club: r.team.name, points: r.points, played: r.played })), overall: { name: result.overall.name, totalRating: result.overall.totalRating }, weeklyLeaders: result.weeklyLeaders.map((p) => ({ position: p.positionGroup, name: p.name, rating: p.totalRating })) }, null, 2) + "\n");

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { deriveRankingsLive, RANKINGS_LIVE_ART_IDS } from "../lib/social-rankings-live-contract.ts";
import { applyRankingsGoldenBootEvidence } from "../lib/social-rankings-live-golden-boot.ts";
import { rankingsLiveCaptions, rankingsLiveDispatchProposal } from "../lib/social-rankings-live-editorial.ts";
import { readTouchlineMatchPreviewReplayApprovalDraft } from "../lib/touchlineArena/social-match-preview-live-replay-draft.ts";
import { matchPreviewLivePlatformCaptions } from "../lib/touchlineArena/social-match-preview-live-caption.ts";
import { TOUCHLINE_MATCH_PREVIEW_TRIGGER_LEAD_MS } from "../lib/touchlineArena/social-match-preview-live-dispatch-plan.ts";
import { socialLineupLiveEditorial } from "../lib/touchlineArena/social-lineup-live-editorial.ts";

const root = path.resolve("artifacts/social-studio/rankings");
const files = ["snapshot-20260914.json", "settlement-evidence-20260914.json", "rating-lineup-evidence-20260914.json", "golden-boot-reconciliation-20260914.json"];
const bytes = await Promise.all(files.map(file => readFile(path.join(root, file))));
const [source, evidence, feeds, goldenBoot] = bytes.map(buffer => JSON.parse(buffer));
evidence.ratingFeeds = feeds.feeds;
const revision = createHash("sha256"); bytes.forEach(buffer => revision.update(buffer));
const data = applyRankingsGoldenBootEvidence(deriveRankingsLive(source, evidence, evidence.publishedPlayerIds, revision.digest("hex")), source, goldenBoot);
const match = await readTouchlineMatchPreviewReplayApprovalDraft();
const lineup = JSON.parse(await readFile("artifacts/social-studio/lineup/render-reference-20260914.json", "utf8"));
const club = teamId => {
  const found = source.clubs.find(row => row.provider_team_id === teamId);
  if (!found) throw new Error("LINEUP_EDITORIAL_CLUB_MISSING");
  return { teamId, name: found.name };
};
const lineupEditorial = socialLineupLiveEditorial(lineup, { club: club(lineup.teamId), home: club(lineup.homeTeamId), away: club(lineup.awayTeamId) });
const placements = captions => ["FEED", "STORY"].map(placement => ({ placement, captions, artworkApproval: "PENDING", captionApproval: "PENDING", videoReview: "PENDING_DECODE_AND_TWO_LOOPS" }));
const pack = {
  generatedAt: new Date().toISOString(), status: "PRIVATE_EDITORIAL_PROPOSAL_NOT_MEDIA_APPROVAL", publishable: false, outbound: "DISABLED",
  provenance: data.provenance,
  sources: files.map((file, i) => ({ filePath: path.relative(process.cwd(), path.join(root, file)), sha256: `sha256:${createHash("sha256").update(bytes[i]).digest("hex")}` })),
  cards: "Ranking eligibility uses captured canonical published IDs; runtime export still requires current publication revalidation.",
  facts: { overall: data.overall, weeklyTopCard: data.weeklyOverall, weeklyLeaders: data.weeklyLeaders,
    seasonXI: data.selection, weeklyXI: data.weeklySelection, seasonCoaches: data.coaches, weeklyCoaches: data.weeklyCoaches,
    table: data.table, goldenBoot: data.goldenBoot },
  rankings: RANKINGS_LIVE_ART_IDS.map(artId => ({ artId, placements: ["FEED", "STORY"].map(placement => ({ placement, captions: rankingsLiveCaptions(data, artId, placement), artworkApproval: "PENDING", captionApproval: "PENDING", videoReview: "PENDING_DECODE_AND_TWO_LOOPS" })), dispatch: rankingsLiveDispatchProposal(data, artId) })),
  matchPreview: { artId: "MATCH_PREVIEW", source: match, placements: placements(matchPreviewLivePlatformCaptions(match.draft.caption)),
    dispatch: { enabled: false, outbound: "DISABLED", editorialSchedule: null, ownerEditable: true,
      suggestedAt: new Date(Date.parse(match.draft.startsAt) - TOUCHLINE_MATCH_PREVIEW_TRIGGER_LEAD_MS).toISOString(),
      destinations: ["INSTAGRAM", "FACEBOOK"].flatMap(platform => ["FEED", "STORY"].map(placement => ({ platform, placement, accountId: null, selected: false }))),
      internal: { providerTeamIds: [match.draft.home.teamId, match.draft.away.teamId], selected: false, state: "BOTH_CLUB_FEEDS_PENDING_OWNER_APPROVAL" },
      rules: ["24h is a suggestion; owner must set schedule.", "Independent Feed/Story approvals and fresh source revalidation.", "Account/placement/factual-instance idempotence; uncertain attempts reconcile before retry.", "Remote ranking snapshot mismatch blocks dispatch."] } },
  lineup: { artId: "LINEUP", fixtureId: lineup.fixtureId, mode: lineup.mode, placements: placements(lineupEditorial.captions), dispatch: lineupEditorial.dispatch },
  gates: data.gates,
};
const output = path.join(root, "editorial-pack-20260915.json");
const result = Buffer.from(`${JSON.stringify(pack, null, 2)}\n`);
await writeFile(output, result, { flag: "wx" });
console.log(JSON.stringify({ output, sha256: `sha256:${createHash("sha256").update(result).digest("hex")}`, rankingArts: pack.rankings.length, separatePlacements: (pack.rankings.length + 2) * 2, publishable: false }));

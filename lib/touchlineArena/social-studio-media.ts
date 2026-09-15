import type { StudioMedia } from "./social-studio-contract.ts";

/** Add only measured MP4 artifacts. This manifest conveys no owner approval or publication permission. */
const fullTimeCaption = `⚽ Full-time rewind · 14 September 2026

Leeds United 4–1 Newcastle United at Elland Road.

Leeds' goals: Lewis Miley 32' (own goal), Jayden Bogle 34', Dominic Calvert-Lewin 45+1' and Noah Okafor 59'. Bazoumana Touré replied for Newcastle at 90'.

📊 Dominic Calvert-Lewin had the highest recorded Match Rating in the match: 7.68.

🛡️ Explore the match's player cards and build your starting XI on TouchLine.

#TouchLine #LeedsUnited #NewcastleUnited #PremierLeague`;

const fullTimeProvenance = {
  source: "PERSISTED_SPORTMONKS_FINAL_MATCH_REVIEW",
  fetchedAt: "2026-09-14T22:29:39Z",
  asOf: "2026-09-14T21:09:00.253Z",
  validUntil: "2026-09-15T22:29:39.000Z",
  competitionId: "ce833f5a-4121-47d7-86f6-2e37f2f74a2a",
  seasonId: "1e83121b-b778-459b-b9a0-7cf1eaff5729",
  fixtureIds: ["9c41023d-85c6-4765-ac89-9433c277a1dc"],
  teamIds: ["447f347c-c75e-4590-b28e-f3ea106efdb2", "098c43cd-4779-4ee0-ad41-95999508ceee"],
  playerIds: ["a99426b9-bf17-4b59-a4af-10e411e3cd98"],
  snapshotSha256: "sha256:42113499ee97de52ec0d073592356dcfd71b11055caa7003159801a9c5cdd906",
};

/**
 * QA-only visual-review candidates. The files are private, measured and
 * checksum-bound. Their retrospective source expires on 15 September 2026,
 * so they deliberately remain incapable of automatic publication.
 */
export const STUDIO_MEDIA: readonly StudioMedia[] = [
  {
    artId: "FULL_TIME", version: "events-retrospective-v2", placement: "FEED",
    filePath: "artifacts/social-studio/events/render-20260915021352620/full-time-feed/full-time-feed.mp4",
    sha256: "sha256:66e5dd3432695d09e5444c05def6c6b1e3962e4662723d276ca27e00aeec1ae2",
    width: 1080, height: 1350, durationSeconds: 6, byteSize: 2975622,
    objectKey: "v1/FULL_TIME/FEED/66e5dd3432695d09e5444c05def6c6b1e3962e4662723d276ca27e00aeec1ae2.mp4",
    etag: "\"d3ecfb50a3930be340939bf8fee2dd40\"",
    caption: fullTimeCaption,
    captions: { INSTAGRAM: fullTimeCaption, FACEBOOK: fullTimeCaption.replace("#TouchLine #LeedsUnited #NewcastleUnited #PremierLeague", "#TouchLine") },
    verification: {
      reportPath: "artifacts/social-studio/events/render-20260915021352620/full-time-feed/decode-two-loops/probe.json",
      reportSha256: "sha256:fa11d3b1131c778324847d0b75d31e6d68f8c652a9e4a236473c0952450c8a96",
    },
    provenance: { ...fullTimeProvenance, snapshotPath: "artifacts/social-studio/events/render-20260915021352620/full-time-feed/factual-snapshot.json" },
  },
  {
    artId: "FULL_TIME", version: "events-retrospective-v2", placement: "STORY",
    filePath: "artifacts/social-studio/events/render-20260915021352620/full-time-story/full-time-story.mp4",
    sha256: "sha256:3c96f91d1ca7083b88a0db5ed9464eca2f61ca64d24fa22ba1977e95088ac3e2",
    width: 1080, height: 1920, durationSeconds: 6, byteSize: 2880665,
    objectKey: "v1/FULL_TIME/STORY/3c96f91d1ca7083b88a0db5ed9464eca2f61ca64d24fa22ba1977e95088ac3e2.mp4",
    etag: "\"a6345eef6419c397405b17b2ccfa1f31\"",
    caption: fullTimeCaption,
    captions: { INSTAGRAM: fullTimeCaption, FACEBOOK: fullTimeCaption.replace("#TouchLine #LeedsUnited #NewcastleUnited #PremierLeague", "#TouchLine") },
    verification: {
      reportPath: "artifacts/social-studio/events/render-20260915021352620/full-time-story/decode-two-loops/probe.json",
      reportSha256: "sha256:f3d0db2b7f9ad628ded81b0ce32c84af43e44d143f385743933c85df80485169",
    },
    provenance: { ...fullTimeProvenance, snapshotPath: "artifacts/social-studio/events/render-20260915021352620/full-time-story/factual-snapshot.json" },
  },
];

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const TOUCHLINE_APPROVED_SOCIAL_SNAPSHOT_FILES = Object.freeze({
  "touchline-match-preview-feed-v1": [
    "components/touchline/social/TouchlineSocialApprovedMatchPreviewDraft.tsx",
    "components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx",
    "components/touchline/social/TouchlineSocialApprovedExactCard.tsx",
    "public/touchlineArena/cards/templates/clubs/Manchester City/market-tiers/diamond-gold.png",
  ],
  "touchline-full-time-feed-v1": [
    "components/touchline/social/TouchlineSocialApprovedFinalScoreDraft.tsx",
    "components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx",
    "components/touchline/social/TouchlineSocialApprovedExactCard.tsx",
    "public/touchlineArena/cards/templates/clubs/Manchester City/market-tiers/diamond-gold.png",
  ],
  "touchline-final-score-story-v1": [
    "components/touchline/social/TouchlineSocialApprovedFinalScoreDraft.tsx",
    "components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx",
    "components/touchline/social/TouchlineSocialApprovedExactCard.tsx",
    "public/touchlineArena/cards/templates/clubs/Manchester City/market-tiers/diamond-gold.png",
  ],
  "touchline-goal-event-feed-v1": [
    "components/touchline/social/TouchlineSocialApprovedGoalHatLayoutDemo.tsx",
    "components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx",
    "components/touchline/social/TouchlineSocialApprovedExactCard.tsx",
    "public/touchlineArena/cards/templates/clubs/Manchester City/market-tiers/diamond-gold.png",
  ],
  "touchline-hat-trick-feed-v1": [
    "components/touchline/social/TouchlineSocialApprovedGoalHatLayoutDemo.tsx",
    "components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx",
    "components/touchline/social/TouchlineSocialApprovedExactCard.tsx",
    "public/touchlineArena/cards/templates/clubs/Manchester City/market-tiers/diamond-gold.png",
  ],
} as const);

export type TouchlineApprovedSnapshotTemplate = keyof typeof TOUCHLINE_APPROVED_SOCIAL_SNAPSHOT_FILES;
export type TouchlineApprovedSnapshotAssessment = Readonly<{ state: "approved" | "missing" | "diverged"; checksum?: string; files: readonly string[] }>;

// Filled only from the immutable source bundle; visual/identity owner hashes stay in the approval records.
export const TOUCHLINE_APPROVED_SOCIAL_SNAPSHOT_CHECKSUMS: Readonly<Partial<Record<TouchlineApprovedSnapshotTemplate, string>>> = Object.freeze({
  "touchline-match-preview-feed-v1": "sha256:ed317dd61ef858e8dd46b5785bf450082ba4bce32b1c6e6492b23c1468145961",
  "touchline-full-time-feed-v1": "sha256:7a542b114443faadd47f8d6bc33a945dea7a0cc34915973472b2f7e9f5842cc8",
  "touchline-final-score-story-v1": "sha256:a13de907d13953ec9ee6b226891d6137b5e5e8d49efccd475d6a7714ba79eeb3",
  "touchline-goal-event-feed-v1": "sha256:fc309b4ce901b447728ec4827eee10ca2a1bd14edef84450f9a1621fdbb2f7ac",
  "touchline-hat-trick-feed-v1": "sha256:ac5630dda87ff226deadf9aea73202ae1a68cc36e8f14eead8c8345b5975bfdd",
});

export async function assessTouchlineApprovedSocialSnapshot(
  template: string,
  projectRoot = process.cwd(),
  readBytes: (absolutePath: string) => Promise<Buffer> = readFile,
): Promise<TouchlineApprovedSnapshotAssessment> {
  const files = TOUCHLINE_APPROVED_SOCIAL_SNAPSHOT_FILES[template as TouchlineApprovedSnapshotTemplate];
  if (!files) return { state: "missing", files: [] };
  const root = path.resolve(projectRoot);
  const hash = createHash("sha256");
  hash.update("touchline-approved-social-snapshot-v1\0", "utf8");
  hash.update(template, "utf8"); hash.update("\0", "utf8");
  try {
    for (const relativePath of [...files].sort()) {
      const absolutePath = path.resolve(root, relativePath);
      if (!absolutePath.startsWith(`${root}${path.sep}`)) return { state: "diverged", files };
      hash.update(relativePath, "utf8"); hash.update("\0", "utf8"); hash.update(await readBytes(absolutePath)); hash.update("\0", "utf8");
    }
  } catch { return { state: "missing", files }; }
  const checksum = `sha256:${hash.digest("hex")}`;
  const expected = TOUCHLINE_APPROVED_SOCIAL_SNAPSHOT_CHECKSUMS[template as TouchlineApprovedSnapshotTemplate];
  return { state: expected === checksum ? "approved" : "diverged", checksum, files };
}

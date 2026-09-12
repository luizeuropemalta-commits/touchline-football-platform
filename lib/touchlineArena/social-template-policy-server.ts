import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS,
  buildTouchlineSocialTemplateIdentity,
  type TouchlineSocialTemplateIdentity,
} from "./social-template-policy-contract.ts";
import { reconcileTouchlineOwnerApprovedSnapshot } from "./social-template-approval-lock.ts";
import { assessTouchlineApprovedSocialSnapshot } from "./social-approved-snapshot-manifest.ts";

const LEXICON_PATH = "docs/touchline-arena/social-publishing-playbook/CANONICAL_SOCIAL_ICON_LEXICON.md";
type TemplateSource = Readonly<{
  /**
   * Stable identity recorded in the owner approval checksum.  This is not an
   * arbitrary alias: the approved social renderer is a byte-for-byte snapshot
   * of this historical source at the approved revision.
   */
  identityPath: string;
  /** The actual, immutable source used by the social template at runtime. */
  filePath: string;
  /**
   * A frozen renderer has one mechanical import rewrite so it can depend on
   * the frozen card snapshot. Its approval digest remains over the original
   * owner-reviewed source bytes and original source path.
   */
  canonicalizeForApproval?: (bytes: Buffer) => Buffer;
}>;

const source = (
  identityPath: string,
  filePath = identityPath,
  canonicalizeForApproval?: TemplateSource["canonicalizeForApproval"],
): TemplateSource => ({ identityPath, filePath, canonicalizeForApproval });

function restoreApprovedCardImport(bytes: Buffer) {
  return Buffer.from(
    bytes
      .toString("utf8")
      .replace(
        "@/components/touchline/social/TouchlineSocialApprovedExactCard",
        "@/components/touchline/cards/TouchlineEliteExactCard",
      )
      .replace(
        "@/components/touchline/social/TouchlineSocialApprovedCardPerimeterTrace",
        "@/components/touchline/cards/TouchlineCardPerimeterTrace",
      )
      .replace(
        "@/components/touchline/social/touchline-social-approved-master-shirt-back-layout.json",
        "@/public/touchlineArena/card-layouts/master-shirt-back-layout.json",
      ),
    "utf8",
  );
}

// Kept as the explicit historical-path evidence for the 043 approval record.
// Runtime no longer invokes it: the 043 renderer is an independent snapshot.
function restoreApprovedGoalHatRendererImport(bytes: Buffer) {
  return Buffer.from(bytes.toString("utf8").replace(
    "@/components/touchline/social/TouchlineSocialApprovedExactCard",
    "@/components/touchline/cards/TouchlineEliteExactCard",
  ), "utf8");
}
void restoreApprovedGoalHatRendererImport;

const SHARED_VISUAL_SOURCES = [
  source("lib/touchlineArena/social-visual-tokens.ts"),
  source(
    "components/touchline/cards/TouchlineEliteExactCard.tsx",
    "components/touchline/social/TouchlineSocialApprovedExactCard.tsx",
    restoreApprovedCardImport,
  ),
  source(
    "components/touchline/cards/TouchlineCardPerimeterTrace.tsx",
    "components/touchline/social/TouchlineSocialApprovedCardPerimeterTrace.tsx",
  ),
  source(
    "public/touchlineArena/card-layouts/master-shirt-back-layout.json",
    "components/touchline/social/touchline-social-approved-master-shirt-back-layout.json",
  ),
] as const;

const TEMPLATE_PATHS = Object.freeze({
  "touchline-lineup-feed-v1": {
    visual: [
      ...SHARED_VISUAL_SOURCES,
      source("components/touchline/pitch/TouchlinePitchSurface.tsx"),
      source("components/touchline/pitch/TouchlinePitchSurface.module.css"),
      source("components/touchline/social/TouchlineSocialLineupDraft.tsx"),
      source("components/touchline/social/TouchlineSocialLineupDraft.module.css"),
    ],
    copy: ["lib/touchlineArena/social-lineup-caption.ts"],
  },
  "touchline-match-preview-feed-v1": {
    visual: [
      source("components/touchline/social/TouchlineSocialApprovedMatchPreviewDraft.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedExactCard.tsx"),
    ],
    copy: ["lib/touchlineArena/social-match-preview-caption.ts"],
  },
  "touchline-full-time-feed-v1": {
    visual: [
      source("components/touchline/social/TouchlineSocialApprovedFinalScoreDraft.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedExactCard.tsx"),
    ],
    copy: ["lib/touchlineArena/social-final-result-caption.ts"],
  },
  "touchline-final-score-story-v1": {
    visual: [
      source("components/touchline/social/TouchlineSocialApprovedFinalScoreDraft.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedExactCard.tsx"),
    ],
    copy: ["lib/touchlineArena/social-final-result-caption.ts"],
  },
  "touchline-goal-event-feed-v1": {
    visual: [
      source("components/touchline/social/TouchlineSocialApprovedGoalHatLayoutDemo.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedExactCard.tsx"),
    ],
    copy: ["lib/touchlineArena/social-confirmed-event-caption.ts"],
  },
  "touchline-hat-trick-feed-v1": {
    visual: [
      source("components/touchline/social/TouchlineSocialApprovedGoalHatLayoutDemo.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx"),
      source("components/touchline/social/TouchlineSocialApprovedExactCard.tsx"),
    ],
    copy: ["lib/touchlineArena/social-confirmed-event-caption.ts"],
  },
  "touchline-red-card-confirmed-story-v1": {
    visual: [
      ...SHARED_VISUAL_SOURCES,
      source("components/touchline/social/TouchlineSocialConfirmedEventDraft.tsx"),
      source("components/touchline/social/TouchlineSocialConfirmedEventDraft.module.css"),
    ],
    copy: ["lib/touchlineArena/social-confirmed-event-caption.ts"],
  },
  "touchline-social-ranking-feed-v1": {
    visual: [
      ...SHARED_VISUAL_SOURCES,
      source("components/touchline/social/TouchlineSocialRankingDraft.tsx"),
      source("components/touchline/social/TouchlineSocialRankingDraft.module.css"),
    ],
    copy: ["lib/touchlineArena/social-ranking-family-caption.ts"],
  },
} as const);

async function checksumFiles(projectRoot: string, sources: readonly TemplateSource[]) {
  const hash = createHash("sha256");
  const seenIdentityPaths = new Set<string>();
  for (const templateSource of [...sources].sort((left, right) => left.identityPath.localeCompare(right.identityPath))) {
    if (seenIdentityPaths.has(templateSource.identityPath)) throw new Error("TL_SOCIAL_TEMPLATE_SOURCE_IDENTITY_DUPLICATED");
    seenIdentityPaths.add(templateSource.identityPath);
    const absolutePath = path.resolve(projectRoot, templateSource.filePath);
    if (!absolutePath.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) {
      throw new Error("TL_SOCIAL_TEMPLATE_SOURCE_PATH_INVALID");
    }
    const bytes = templateSource.canonicalizeForApproval
      ? templateSource.canonicalizeForApproval(await readFile(absolutePath))
      : await readFile(absolutePath);
    hash.update(templateSource.identityPath, "utf8");
    hash.update("\0", "utf8");
    hash.update(bytes);
    hash.update("\0", "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Runtime paths for a frozen snapshot differ from the historical paths used
 * in the owner approval record.  This separate digest binds every executable
 * byte (including copy/lexicon) plus the declared template contract before a
 * historical identity may be restored.  It is intentionally raw: no import
 * rewrite or path alias can conceal a changed runtime source.
 */
async function checksumFrozenApprovalBundle(
  projectRoot: string,
  definition: typeof TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS[number],
  sources: Readonly<{ visual: readonly TemplateSource[]; copy: readonly string[] }>,
) {
  const hash = createHash("sha256");
  hash.update("__touchline_template_metadata__", "utf8");
  hash.update("\0", "utf8");
  hash.update(JSON.stringify(definition), "utf8");
  hash.update("\0", "utf8");
  const bundle = [
    ...sources.visual.map((item) => item.filePath),
    ...sources.copy,
    LEXICON_PATH,
  ];
  if (new Set(bundle).size !== bundle.length) throw new Error("TL_SOCIAL_TEMPLATE_SOURCE_PATH_DUPLICATED");
  for (const relativePath of [...bundle].sort()) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    if (!absolutePath.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) {
      throw new Error("TL_SOCIAL_TEMPLATE_SOURCE_PATH_INVALID");
    }
    hash.update(relativePath, "utf8");
    hash.update("\0", "utf8");
    hash.update(await readFile(absolutePath));
    hash.update("\0", "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function readTouchlineSocialTemplateRegistry(
  projectRoot = process.cwd(),
): Promise<readonly TouchlineSocialTemplateIdentity[]> {
  const lexiconChecksum = await checksumFiles(projectRoot, [source(LEXICON_PATH)]);
  const cache = new Map<string, { visualTemplateChecksum: string; baseCopyChecksum: string }>();
  const identities: TouchlineSocialTemplateIdentity[] = [];
  for (const definition of TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS) {
    const sources = TEMPLATE_PATHS[definition.templateVersion as keyof typeof TEMPLATE_PATHS];
    if (!sources) throw new Error("TL_SOCIAL_TEMPLATE_SOURCE_MANIFEST_MISSING");
    let checksums = cache.get(definition.templateVersion);
    if (!checksums) {
      checksums = {
        visualTemplateChecksum: await checksumFiles(projectRoot, sources.visual),
        baseCopyChecksum: await checksumFiles(projectRoot, sources.copy.map((filePath) => source(filePath))),
      };
      cache.set(definition.templateVersion, checksums);
    }
    const identity = buildTouchlineSocialTemplateIdentity({
      ...definition,
      ...checksums,
      lexiconChecksum,
    });
    const approvedSnapshot = await assessTouchlineApprovedSocialSnapshot(definition.templateVersion, projectRoot);
    // Snapshot templates fail closed: a source or transitively declared asset
    // divergence can never inherit the historic owner identity.
    const frozenBundleChecksum = approvedSnapshot.state === "approved"
      ? approvedSnapshot.checksum!
      : await checksumFrozenApprovalBundle(projectRoot, definition, sources);
    identities.push(reconcileTouchlineOwnerApprovedSnapshot(identity, frozenBundleChecksum));
  }
  return Object.freeze(identities);
}

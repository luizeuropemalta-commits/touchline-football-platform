import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS,
  buildTouchlineSocialTemplateIdentity,
  type TouchlineSocialTemplateIdentity,
} from "./social-template-policy-contract.ts";

const LEXICON_PATH = "docs/touchline-arena/social-publishing-playbook/CANONICAL_SOCIAL_ICON_LEXICON.md";
const SHARED_VISUAL_PATHS = [
  "lib/touchlineArena/social-visual-tokens.ts",
  "components/touchline/cards/TouchlineEliteExactCard.tsx",
] as const;

const TEMPLATE_PATHS = Object.freeze({
  "touchline-lineup-feed-v1": {
    visual: [
      ...SHARED_VISUAL_PATHS,
      "components/touchline/pitch/TouchlinePitchSurface.tsx",
      "components/touchline/pitch/TouchlinePitchSurface.module.css",
      "components/touchline/social/TouchlineSocialLineupDraft.tsx",
      "components/touchline/social/TouchlineSocialLineupDraft.module.css",
    ],
    copy: ["lib/touchlineArena/social-lineup-caption.ts"],
  },
  "touchline-match-preview-feed-v1": {
    visual: [
      ...SHARED_VISUAL_PATHS,
      "components/touchline/social/TouchlineSocialMatchPreviewDraft.tsx",
      "components/touchline/social/TouchlineSocialMatchPreviewDraft.module.css",
    ],
    copy: ["lib/touchlineArena/social-match-preview-caption.ts"],
  },
  "touchline-full-time-feed-v1": {
    visual: [
      ...SHARED_VISUAL_PATHS,
      "components/touchline/social/TouchlineSocialFinalScoreDraft.tsx",
      "components/touchline/social/TouchlineSocialFinalScoreDraft.module.css",
    ],
    copy: ["lib/touchlineArena/social-final-result-caption.ts"],
  },
  "touchline-final-score-story-v1": {
    visual: [
      ...SHARED_VISUAL_PATHS,
      "components/touchline/social/TouchlineSocialFinalScoreDraft.tsx",
      "components/touchline/social/TouchlineSocialFinalScoreDraft.module.css",
    ],
    copy: ["lib/touchlineArena/social-final-result-caption.ts"],
  },
  "touchline-goal-confirmed-story-v1": {
    visual: [
      ...SHARED_VISUAL_PATHS,
      "components/touchline/social/TouchlineSocialConfirmedEventDraft.tsx",
      "components/touchline/social/TouchlineSocialConfirmedEventDraft.module.css",
    ],
    copy: ["lib/touchlineArena/social-confirmed-event-caption.ts"],
  },
  "touchline-red-card-confirmed-story-v1": {
    visual: [
      ...SHARED_VISUAL_PATHS,
      "components/touchline/social/TouchlineSocialConfirmedEventDraft.tsx",
      "components/touchline/social/TouchlineSocialConfirmedEventDraft.module.css",
    ],
    copy: ["lib/touchlineArena/social-confirmed-event-caption.ts"],
  },
  "touchline-social-ranking-feed-v1": {
    visual: [
      ...SHARED_VISUAL_PATHS,
      "components/touchline/social/TouchlineSocialRankingDraft.tsx",
      "components/touchline/social/TouchlineSocialRankingDraft.module.css",
    ],
    copy: ["lib/touchlineArena/social-ranking-family-caption.ts"],
  },
} as const);

async function checksumFiles(projectRoot: string, relativePaths: readonly string[]) {
  const hash = createHash("sha256");
  for (const relativePath of [...relativePaths].sort()) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    if (!absolutePath.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) {
      throw new Error("TL_SOCIAL_TEMPLATE_SOURCE_PATH_INVALID");
    }
    const bytes = await readFile(absolutePath);
    hash.update(relativePath, "utf8");
    hash.update("\0", "utf8");
    hash.update(bytes);
    hash.update("\0", "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function readTouchlineSocialTemplateRegistry(
  projectRoot = process.cwd(),
): Promise<readonly TouchlineSocialTemplateIdentity[]> {
  const lexiconChecksum = await checksumFiles(projectRoot, [LEXICON_PATH]);
  const cache = new Map<string, { visualTemplateChecksum: string; baseCopyChecksum: string }>();
  const identities: TouchlineSocialTemplateIdentity[] = [];
  for (const definition of TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS) {
    const sources = TEMPLATE_PATHS[definition.templateVersion as keyof typeof TEMPLATE_PATHS];
    if (!sources) throw new Error("TL_SOCIAL_TEMPLATE_SOURCE_MANIFEST_MISSING");
    let checksums = cache.get(definition.templateVersion);
    if (!checksums) {
      checksums = {
        visualTemplateChecksum: await checksumFiles(projectRoot, sources.visual),
        baseCopyChecksum: await checksumFiles(projectRoot, sources.copy),
      };
      cache.set(definition.templateVersion, checksums);
    }
    identities.push(buildTouchlineSocialTemplateIdentity({
      ...definition,
      ...checksums,
      lexiconChecksum,
    }));
  }
  return Object.freeze(identities);
}

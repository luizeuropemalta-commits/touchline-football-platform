import { assessTouchlineTemplateApprovalLock } from "./social-template-approval-lock.ts";
import { assessTouchlineApprovedSocialSnapshot } from "./social-approved-snapshot-manifest.ts";
import { readTouchlineSocialTemplateRegistry } from "./social-template-policy-server.ts";

/**
 * Readiness contract for the future 041 animated delivery pair.
 *
 * This is deliberately not a Meta adapter: it neither connects an account,
 * creates media containers, selects music, nor sends a request. Its role is
 * to prevent a UI or scheduler from presenting a Reel/Story as ready when
 * the immutable approved source, animated assets, provider capability, or
 * external delivery gate is missing.
 */

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/i;

export type TouchlineReelStoryReadiness =
  | Readonly<{ state: "ready-for-reviewed-test"; reel: TouchlineAnimatedExport; story: TouchlineAnimatedExport }>
  | Readonly<{ state: "blocked"; reasons: readonly TouchlineReelStoryBlockReason[] }>;

export type TouchlineReelStoryBlockReason =
  | "OUTBOUND_DELIVERY_DISABLED"
  | "MATCH_PREVIEW_NOT_APPROVED"
  | "SOURCE_FACTS_NOT_CURRENT"
  | "REEL_ASSET_UNAVAILABLE"
  | "STORY_ASSET_UNAVAILABLE"
  | "PROVIDER_REELS_CAPABILITY_UNVERIFIED"
  | "PROVIDER_STORIES_CAPABILITY_UNVERIFIED"
  | "MUSIC_CATALOG_CAPABILITY_UNVERIFIED";

export type TouchlineAnimatedExport = Readonly<{
  mimeType: "video/mp4";
  width: 1080;
  height: 1920;
  publicHttpsUrl: string;
  checksum: string;
}>;

export type TouchlineReelStoryReadinessInput = Readonly<{
  sourceFactsCurrent: boolean;
  /** Kept false until the separate outbound connector, credentials and Fiscal gate exist. */
  outboundDeliveryEnabled: boolean;
  provider: Readonly<{
    reelsPublishingVerified: boolean;
    storiesPublishingVerified: boolean;
    /** Music remains a provider-side choice; TouchLine must not select a track itself. */
    platformMusicCatalogVerified: boolean;
  }>;
  reel: unknown;
  story: unknown;
}>;

function isAnimatedExport(value: unknown): value is TouchlineAnimatedExport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const exportValue = value as Record<string, unknown>;
  return exportValue.mimeType === "video/mp4"
    && exportValue.width === 1080
    && exportValue.height === 1920
    && typeof exportValue.publicHttpsUrl === "string"
    && HTTPS_URL.test(exportValue.publicHttpsUrl)
    && typeof exportValue.checksum === "string"
    && SHA256.test(exportValue.checksum);
}

/**
 * The same motion source may produce two independently approved containers;
 * it must not be silently substituted with a PNG or a different aspect ratio.
 *
 * Template identity is deliberately read from the executable registry here,
 * rather than accepted from the caller.  A document checksum in a request is
 * evidence at most; it cannot make a diverged executable template ready.
 */
export async function assessTouchline041ReelStoryReadiness(
  input: TouchlineReelStoryReadinessInput,
): Promise<TouchlineReelStoryReadiness> {
  const reasons: TouchlineReelStoryBlockReason[] = [];
  if (!input.outboundDeliveryEnabled) reasons.push("OUTBOUND_DELIVERY_DISABLED");
  try {
    const registry = await readTouchlineSocialTemplateRegistry();
    const executableTemplate = registry.find((template) => (
      template.templateVersion === "touchline-match-preview-feed-v1"
      && template.contentType === "MATCH_PREVIEW"
      && template.placement === "INSTAGRAM_FEED"
    ));
    const approval = executableTemplate
      ? assessTouchlineTemplateApprovalLock({
        templateVersion: executableTemplate.templateVersion,
        visualTemplateChecksum: executableTemplate.visualTemplateChecksum,
        templateIdentityChecksum: executableTemplate.templateIdentityChecksum,
      })
      : Object.freeze({ state: "unavailable" as const, reason: "APPROVED_TEMPLATE_LOCK_MISSING" as const });
    const snapshot = await assessTouchlineApprovedSocialSnapshot("touchline-match-preview-feed-v1");
    if (approval.state !== "approved" || snapshot.state !== "approved") reasons.push("MATCH_PREVIEW_NOT_APPROVED");
  } catch {
    // Missing or unreadable executable sources cannot inherit an approval.
    reasons.push("MATCH_PREVIEW_NOT_APPROVED");
  }
  if (!input.sourceFactsCurrent) reasons.push("SOURCE_FACTS_NOT_CURRENT");
  if (!isAnimatedExport(input.reel)) reasons.push("REEL_ASSET_UNAVAILABLE");
  if (!isAnimatedExport(input.story)) reasons.push("STORY_ASSET_UNAVAILABLE");
  if (!input.provider.reelsPublishingVerified) reasons.push("PROVIDER_REELS_CAPABILITY_UNVERIFIED");
  if (!input.provider.storiesPublishingVerified) reasons.push("PROVIDER_STORIES_CAPABILITY_UNVERIFIED");
  if (!input.provider.platformMusicCatalogVerified) reasons.push("MUSIC_CATALOG_CAPABILITY_UNVERIFIED");
  if (reasons.length) return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
  return Object.freeze({ state: "ready-for-reviewed-test", reel: input.reel as TouchlineAnimatedExport, story: input.story as TouchlineAnimatedExport });
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  assessTouchline041ReelStoryReadiness,
  type TouchlineReelStoryReadinessInput,
} from "../lib/touchlineArena/social-reel-story-readiness.ts";

const asset = Object.freeze({
  mimeType: "video/mp4" as const,
  width: 1080 as const,
  height: 1920 as const,
  publicHttpsUrl: "https://media.touchline.example/041/fixture.mp4",
  checksum: `sha256:${"a".repeat(64)}`,
});

test("041 Reel/Story readiness fails closed until every reviewed external prerequisite exists", async () => {
  assert.deepEqual(await assessTouchline041ReelStoryReadiness({
    sourceFactsCurrent: true,
    outboundDeliveryEnabled: false,
    provider: { reelsPublishingVerified: false, storiesPublishingVerified: false, platformMusicCatalogVerified: false },
    reel: null,
    story: null,
  }), {
    state: "blocked",
    reasons: [
      "OUTBOUND_DELIVERY_DISABLED",
      "MATCH_PREVIEW_NOT_APPROVED",
      "REEL_ASSET_UNAVAILABLE",
      "STORY_ASSET_UNAVAILABLE",
      "PROVIDER_REELS_CAPABILITY_UNVERIFIED",
      "PROVIDER_STORIES_CAPABILITY_UNVERIFIED",
      "MUSIC_CATALOG_CAPABILITY_UNVERIFIED",
    ],
  });
});

test("041 readiness never accepts a PNG or a non-vertical animated asset as a Reel or Story", async () => {
  const result = await assessTouchline041ReelStoryReadiness({
    sourceFactsCurrent: true,
    outboundDeliveryEnabled: true,
    provider: { reelsPublishingVerified: true, storiesPublishingVerified: true, platformMusicCatalogVerified: true },
    reel: { ...asset, mimeType: "image/png" },
    story: { ...asset, height: 1350 },
  });
  assert.deepEqual(result, {
    state: "blocked",
    reasons: ["MATCH_PREVIEW_NOT_APPROVED", "REEL_ASSET_UNAVAILABLE", "STORY_ASSET_UNAVAILABLE"],
  });
});

test("041 remains unavailable even when every external prerequisite exists until the frozen visual receives a new approval", async () => {
  const result = await assessTouchline041ReelStoryReadiness({
    sourceFactsCurrent: true,
    outboundDeliveryEnabled: true,
    provider: { reelsPublishingVerified: true, storiesPublishingVerified: true, platformMusicCatalogVerified: true },
    reel: asset,
    story: { ...asset, publicHttpsUrl: "https://media.touchline.example/041/fixture-story.mp4", checksum: `sha256:${"b".repeat(64)}` },
  });
  assert.deepEqual(result, {
    state: "blocked",
    reasons: ["MATCH_PREVIEW_NOT_APPROVED"],
  });
});

test("041 ignores caller-injected documentary hashes and reads only the executable approved registry", async () => {
  const forgedDocumentaryHashes = {
    visualTemplateChecksum: "sha256:181fbf97fa849795a73a3f68f214072057dbff92d8d59902476057f74ac331da",
    templateIdentityChecksum: "sha256:64fd190e2d20d081b4b8a138a0cc563a23fbf82f423e01877534cc04d3fba1f4",
  };
  const input = {
    // This is intentionally an unknown, caller-supplied field.  The public
    // readiness contract does not accept it and must not consult it.
    matchPreviewTemplate: forgedDocumentaryHashes,
    sourceFactsCurrent: true,
    outboundDeliveryEnabled: true,
    provider: { reelsPublishingVerified: true, storiesPublishingVerified: true, platformMusicCatalogVerified: true },
    reel: asset,
    story: { ...asset, checksum: `sha256:${"b".repeat(64)}` },
  } as TouchlineReelStoryReadinessInput & { matchPreviewTemplate: typeof forgedDocumentaryHashes };
  const result = await assessTouchline041ReelStoryReadiness(input);
  assert.deepEqual(result, {
    state: "blocked",
    reasons: ["MATCH_PREVIEW_NOT_APPROVED"],
  });
});

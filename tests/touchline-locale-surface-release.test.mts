import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_LOCALE_SURFACE_RELEASE_MANIFEST,
  createTouchLineLocaleSurfaceReviewTemplate,
  validateTouchLineLocaleSurfaceReview,
} from "../lib/touchlineArena/locale-surface-release-manifest.ts";
import { TOUCHLINE_APPROVED_LOCALES } from "../lib/touchlineArena/i18n.ts";

test("the locale release matrix covers the exact approved vocabulary and every required surface", () => {
  assert.deepEqual(
    TOUCHLINE_APPROVED_LOCALES.map((locale) => locale.code),
    ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"],
  );
  assert.deepEqual(
    TOUCHLINE_LOCALE_SURFACE_RELEASE_MANIFEST.map((surface) => surface.id),
    [
      "root-document-and-navigation",
      "clubhub-and-profiles",
      "live-rankings-and-tables",
      "market-and-card-surfaces",
      "authentication-and-recovery",
      "private-owner-and-administration",
      "metadata-pwa-and-recovery",
    ],
  );
  assert.ok(TOUCHLINE_LOCALE_SURFACE_RELEASE_MANIFEST.every((surface) => surface.paths.length > 0));
  assert.ok(TOUCHLINE_LOCALE_SURFACE_RELEASE_MANIFEST.every((surface) => surface.requires.length > 0));
});

test("a missing human catalogue or surface evidence never qualifies a locale for release", () => {
  const spanish = createTouchLineLocaleSurfaceReviewTemplate("es-ES", "clubhub-and-profiles");
  const result = validateTouchLineLocaleSurfaceReview(spanish);

  assert.equal(result.ready, false);
  assert.ok(result.reasons.includes("catalogue-not-complete"));
  assert.ok(result.reasons.includes("content-review-incomplete"));
  assert.ok(result.reasons.includes("metadata-review-incomplete"));
  assert.ok(result.reasons.includes("viewport-review-incomplete"));
  assert.ok(result.reasons.includes("persistence-review-incomplete"));
});

test("Arabic remains blocked until both human and RTL review evidence exists", () => {
  const arabic = createTouchLineLocaleSurfaceReviewTemplate("ar-SA", "root-document-and-navigation");
  arabic.contentReviewed = true;
  arabic.metadataReviewed = true;
  arabic.viewportReviewed = true;
  arabic.persistenceReviewed = true;

  const result = validateTouchLineLocaleSurfaceReview(arabic);
  assert.equal(result.ready, false);
  assert.ok(result.reasons.includes("catalogue-not-complete"));
  assert.ok(result.reasons.includes("rtl-review-incomplete"));
});

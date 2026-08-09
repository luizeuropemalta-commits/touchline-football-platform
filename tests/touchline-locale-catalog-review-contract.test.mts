import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_LOCALE_CATALOGUE_NAMESPACES,
  createTouchLineLocaleReviewTemplate,
  isTouchLineLocaleReviewReady,
  validateTouchLineLocaleReviewRecord,
} from "../lib/touchlineArena/locale-catalog-review-contract.ts";
import { TOUCHLINE_APPROVED_LOCALES } from "../lib/touchlineArena/i18n.ts";

test("the review contract covers exactly the owner-approved locales", () => {
  assert.deepEqual(
    TOUCHLINE_APPROVED_LOCALES.map((locale) => locale.code),
    ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"],
  );
  assert.deepEqual(TOUCHLINE_LOCALE_CATALOGUE_NAMESPACES, [
    "core", "auth", "market", "rankings", "public-routes", "errors",
  ]);
});

test("a draft template is fail-closed and never qualifies a locale for rendering", () => {
  const draft = createTouchLineLocaleReviewTemplate("es-ES");
  const result = validateTouchLineLocaleReviewRecord(draft);

  assert.equal(result.ready, false);
  assert.equal(isTouchLineLocaleReviewReady(draft), false);
  assert.ok(result.reasons.includes("catalogue-not-published"));
  assert.ok(result.reasons.includes("missing-translator"));
  assert.ok(result.reasons.includes("namespace-incomplete:auth"));
  assert.ok(result.reasons.includes("route-qa-incomplete"));
});

test("Arabic cannot publish without explicit RTL evidence", () => {
  const arabic = createTouchLineLocaleReviewTemplate("ar-SA");
  arabic.state = "published";
  arabic.sourceCatalogueRevision = "en-GB-revision";
  arabic.sourceCatalogueHash = "source-hash";
  arabic.catalogueHash = "arabic-hash";
  arabic.translator = "reviewed-translator";
  arabic.reviewer = "independent-reviewer";
  arabic.reviewedAt = "2026-08-09T00:00:00.000Z";
  for (const namespace of TOUCHLINE_LOCALE_CATALOGUE_NAMESPACES) arabic.namespaces[namespace] = true;
  arabic.qa.routeMatrixComplete = true;
  arabic.qa.viewportMatrixComplete = true;
  arabic.qa.persistenceComplete = true;
  arabic.qa.metadataComplete = true;

  assert.deepEqual(validateTouchLineLocaleReviewRecord(arabic).reasons, ["rtl-qa-incomplete"]);
  arabic.qa.rtlComplete = true;
  assert.equal(isTouchLineLocaleReviewReady(arabic), true);
});

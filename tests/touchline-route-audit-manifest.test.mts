import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTouchlineRouteAuditManifest,
  renderTouchlineRouteAuditMarkdown,
} from "../scripts/qa/build-touchline-route-audit-manifest.mts";

const rows = buildTouchlineRouteAuditManifest();

function row(route: string) {
  const match = rows.find((candidate) => candidate.route === route);
  assert.ok(match, `missing route ${route}`);
  return match;
}

test("inventories every page, API method, proxy, metadata route, and error boundary", () => {
  assert.equal(rows.filter((item) => item.kind === "PAGE").length, 71);
  assert.equal(rows.filter((item) => item.kind === "API").length, 74);
  assert.equal(rows.filter((item) => item.kind === "BOUNDARY").length, 7);
  assert.equal(rows.filter((item) => item.kind === "METADATA").length, 3);
  assert.equal(rows.filter((item) => item.kind === "PROXY").length, 1);
  assert.equal(new Set(rows.map((item) => item.route)).size, rows.length);
});

test("records no Server Actions instead of assuming an uninspected mutation surface", () => {
  assert.equal(row("SERVER_ACTIONS").status, "NONE_FOUND");
  assert.equal(row("SERVER_ACTIONS").data, "NONE_FOUND");
});

test("separates public, authenticated, ClubOwner, Admin, audit, and isolated preview pages", () => {
  assert.equal(row("/touchline-clubs").auth, "PUBLIC");
  assert.equal(row("/market-transfer").auth, "AUTHENTICATED");
  assert.equal(row("/club-owner/me/substitution").auth, "CLUBOWNER_SELF");
  assert.equal(row("/admin/cards").auth, "ADMIN");
  assert.equal(row("/admin/login").auth, "ADMIN");
  assert.equal(row("/admin/login").role, "OWNER_ADMIN");
  assert.equal(row("/visual-qa/representative-package").role, "OWNER_ADMIN");
  assert.equal(row("/visual-qa/social-lineup").auth, "ADMIN");
  assert.equal(row("/visual-qa/social-lineup").role, "OWNER_ADMIN");
  assert.equal(row("/visual-qa/social-lineup").data, "QA_VERIFIED_OFFICIAL_LINEUP_DRAFT");
  assert.equal(row("/visual-qa/social-match-preview").auth, "ADMIN");
  assert.equal(row("/visual-qa/social-match-preview").role, "OWNER_ADMIN");
  assert.equal(row("/visual-qa/social-match-preview").data, "QA_VERIFIED_MATCH_PREVIEW_DRAFT");
  assert.equal(row("/visual-qa/social-full-time").auth, "ADMIN");
  assert.equal(row("/visual-qa/social-full-time").data, "QA_VERIFIED_FULL_TIME_DRAFT");
  assert.equal(row("/visual-qa/social-full-time").status, "OWNER_ART_APPROVED_LOCAL");
  assert.equal(row("/visual-qa/social-final-score").auth, "ADMIN");
  assert.equal(row("/visual-qa/social-final-score").data, "QA_VERIFIED_FINAL_SCORE_STORY_DRAFT");
  assert.equal(row("/visual-qa/social-confirmed-event").auth, "ADMIN");
  assert.equal(row("/visual-qa/social-confirmed-event").data, "QA_VERIFIED_CONFIRMED_EVENT_STORY_DRAFT");
  assert.equal(row("/visual-qa/social-ranking").auth, "ADMIN");
  assert.equal(row("/visual-qa/social-ranking").data, "QA_VERIFIED_RANKING_FAMILY_DRAFT");
  assert.equal(row("/visual-qa/social-next-three").auth, "ADMIN");
  assert.equal(row("/visual-qa/social-ranking-catalogue").auth, "ADMIN");
  assert.equal(row("/visual-qa/clubhub-next-fixture-post").role, "OWNER_ADMIN");
  assert.equal(row("/visual-qa/clubhub-premium-redesign").role, "OWNER_ADMIN");
  assert.equal(row("/visual-qa/market-premium-pitch").role, "OWNER_ADMIN");
  assert.equal(row("/audit-index").auth, "AUDIT_TOKEN");
  assert.equal(row("/preview").auth, "ISOLATED_PREVIEW");
});

test("distinguishes read methods, disabled ingestion, local editors, user writes, and signed webhooks", () => {
  assert.equal(row("GET /api/football-data/fixture-schedule").auth, "PUBLIC");
  assert.equal(row("GET /api/touchline-arena/live-presentation-state").data, "PUBLIC_ACTIVE_RANKING_AND_FIXTURE_REVISIONS");
  assert.equal(row("GET /api/football-data/provider-diagnostic").auth, "OWNER_SESSION");
  assert.equal(row("GET /api/qa/environment-precheck").auth, "PUBLIC");
  assert.equal(row("GET /api/qa/environment-precheck").data, "SANITIZED_QA_CONFIGURATION_ONLY");
  assert.equal(row("GET /api/qa/environment-precheck").status, "QA_DEPLOY_REQUIRED");
  assert.equal(row("GET /api/admin/qa-environment").auth, "QA_OWNER_SESSION");
  assert.equal(row("GET /api/admin/qa-environment").data, "SANITIZED_QA_ENVIRONMENT_AND_CREDENTIAL_COHERENCE");
  assert.equal(row("POST /api/football-data/fixture-schedule").status, "METHOD_DISABLED");
  assert.equal(row("GET /api/football-data/live-sync").status, "METHOD_DISABLED");
  assert.equal(row("POST /api/football-data/live-sync").auth, "QA_SCHEDULER_SECRET");
  assert.equal(row("POST /api/touchline-arena/formation-locks").auth, "LOCAL_EDITOR");
  assert.equal(row("POST /api/touchline-arena/market/checkout").auth, "AUTHENTICATED");
  assert.equal(row("DELETE /api/touchline-arena/coach").auth, "AUTHENTICATED_SAME_ORIGIN");
  assert.equal(row("POST /api/stripe/webhook").auth, "WEBHOOK_SIGNATURE");
  assert.equal(row("POST /api/touchline-fantasy/lineup").auth, "AUTHENTICATED_SAME_ORIGIN");
  assert.equal(row("POST /api/touchline-fantasy/subscription/webhook").role, "STRIPE_TEST");
  assert.equal(row("GET /api/touchline-social/share-art/[postId]").auth, "PUBLIC");
  assert.equal(row("GET /api/touchline-social/share-art/[postId]").data, "CURRENT_APPROVED_SOCIAL_ARTWORK_PROXY");
  assert.equal(row("POST /api/admin/cards").auth, "ADMIN");
  assert.equal(row("POST /api/admin/card-engine").data, "SUPABASE_CARD_ENGINE_EDITORIAL_BATCH");
  assert.equal(row("PATCH /api/admin/card-engine").role, "OWNER_ADMIN");
  assert.equal(row("POST /api/admin/formation-geometries").data, "SUPABASE_FORMATION_GEOMETRY_VERSIONS");
  assert.equal(row("GET /api/admin/social-publications/source").auth, "QA_RENDER_SECRET_COOKIE");
  assert.equal(row("GET /api/admin/social-publications/source").role, "SERVER_JOB");
  assert.equal(row("GET /api/admin/social-publications/source").data, "CURRENT_VERIFIED_SOCIAL_RENDER_SOURCE");
  assert.equal(row("POST /api/admin/social-publications/template-policy").auth, "ADMIN_SAME_ORIGIN");
  assert.equal(row("POST /api/admin/social-publications/template-policy").data, "SUPABASE_SOCIAL_TEMPLATE_VERSION_POLICY");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]").auth, "QA_PREVIEW_ONLY");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]").role, "LOCAL_READ_MIRROR");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]").data, "SANITIZED_VERSIONED_PUBLIC_CLUBHUB_READ_MODEL");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]").status, "QA_DEPLOY_REQUIRED");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]/feed-art/[publicId]").auth, "QA_PREVIEW_ONLY");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]/feed-art/[publicId]").role, "LOCAL_READ_MIRROR");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]/feed-art/[publicId]").data, "BOUNDED_PUBLISHED_CLUB_FEED_ARTWORK_PROXY");
  assert.equal(row("GET /api/touchline-qa/read/clubhub/[teamId]/feed-art/[publicId]").browser, "MEDIA_HTTP_CONTRACT");
});

test("does not claim browser PASS before observed page-by-page QA", () => {
  const navigablePages = rows.filter((item) => item.kind === "PAGE" && item.browser === "REQUIRED");
  assert.ok(navigablePages.length > 40);
  assert.equal(navigablePages.some((item) => item.status === "PASS"), false);
});

test("renders the canonical six-column audit table", () => {
  const markdown = renderTouchlineRouteAuditMarkdown(rows);
  assert.match(markdown, /\| ROUTE \| AUTH \| ROLE \| DATA \| BROWSER \| STATUS \|/);
  assert.match(markdown, /Production was not changed/);
  assert.match(markdown, /Server Actions were not found/);
  assert.match(markdown, /\/market-transfer/);
});

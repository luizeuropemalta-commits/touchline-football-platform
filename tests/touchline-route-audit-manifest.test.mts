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
  assert.equal(rows.filter((item) => item.kind === "PAGE").length, 56);
  assert.equal(rows.filter((item) => item.kind === "API").length, 53);
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
  assert.equal(row("/visual-qa/representative-package").role, "OWNER_ADMIN");
  assert.equal(row("/audit-index").auth, "AUDIT_TOKEN");
  assert.equal(row("/preview").auth, "ISOLATED_PREVIEW");
});

test("distinguishes read methods, disabled ingestion, local editors, user writes, and signed webhooks", () => {
  assert.equal(row("GET /api/football-data/fixture-schedule").auth, "PUBLIC");
  assert.equal(row("POST /api/football-data/fixture-schedule").status, "METHOD_DISABLED");
  assert.equal(row("POST /api/touchline-arena/formation-locks").auth, "LOCAL_EDITOR");
  assert.equal(row("POST /api/touchline-arena/market/checkout").auth, "AUTHENTICATED");
  assert.equal(row("POST /api/stripe/webhook").auth, "WEBHOOK_SIGNATURE");
  assert.equal(row("POST /api/admin/cards").auth, "ADMIN");
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

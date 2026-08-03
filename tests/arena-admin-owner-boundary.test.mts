import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/(app)/admin/page.tsx", import.meta.url),
  "utf8",
);

test("Arena owner dashboard has no professional SaaS data or controls", () => {
  const forbidden = [
    /AdminOwnerActions/,
    /ownerGrantSubscriptionId/,
    /\bplanMap\b/,
    /\bPlanKey\b/,
    /STRIPE_PRICE_/,
    /\.from\(["']agencies["']\)/,
    /\.from\(["']players["']\)/,
    /\.from\(["']clubs["']\)/,
    /\.from\(["'](?:global_|market_radar|player_documents|representation_|billing_|stripe_)/,
  ];

  forbidden.forEach((pattern) => assert.doesNotMatch(source, pattern));
});

test("Arena owner dashboard reads only approved Arena and identity tables", () => {
  const tables = [...source.matchAll(/\.from\(["']([^"']+)["']\)/g)].map((match) => match[1]);

  assert.ok(tables.length > 0, "expected protected database reads");
  tables.forEach((table) => {
    assert.match(
      table,
      /^(?:users|football_[a-z0-9_]+|touchline_[a-z0-9_]+|clubowner_credit_ledger)$/,
      `unexpected table in Arena owner dashboard: ${table}`,
    );
  });

  [
    "football_players",
    "football_clubs",
    "touchline_card_inventory",
    "touchline_analytics_sessions",
    "touchline_beta_tc_grants",
    "touchline_user_arena_state",
    "clubowner_credit_ledger",
  ].forEach((table) => assert.ok(tables.includes(table), `missing official source: ${table}`));
});

test("Arena owner dashboard is read-only, resilient and links every official subpanel", () => {
  assert.match(source, /async function safeRows/);
  assert.match(source, /async function safeCount/);
  assert.match(source, /function countText/);
  assert.match(source, /affected values are shown as unavailable/);
  assert.doesNotMatch(source, /safe zero-value fallbacks/);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete|rpc)\s*\(/);

  [
    "/admin/cards",
    "/admin/analytics",
    "/admin/promotions",
    "/admin/football-data",
    "/admin/finance",
  ].forEach((href) => assert.match(source, new RegExp(`href: "${href}"`)));
});

test("Stripe health is generic and does not inspect retired plan configuration", () => {
  assert.match(source, /hasEnv\("STRIPE_SECRET_KEY"\)/);
  assert.match(source, /hasEnv\("STRIPE_WEBHOOK_SECRET"\)/);
  assert.match(source, /CONFIGURED_NOT_VERIFIED/);
  assert.match(source, /webhook delivery are not probed here/);
  assert.doesNotMatch(source, /STRIPE_PRICE_|starter_agent|pro_agent|elite_agency|club_basic|club_pro|club_elite|founder_yearly/i);
});

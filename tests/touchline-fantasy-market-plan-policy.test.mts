import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS,
  TOUCHLINE_FANTASY_BETA_BUDGET_EUR,
  isTouchlineFantasyMarketAccess,
  isTouchlineFantasyMarketClubAllowed,
  resolveTouchlineFantasyMarketAccess,
} from "../lib/touchlineFantasy/market-plan-policy.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20261011010000_touchline_fantasy_market_plan_policy.sql", import.meta.url),
  "utf8",
);
const server = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8");

test("the server resolver requires a persisted plan and never grants the retired fallback budget", () => {
  assert.equal(resolveTouchlineFantasyMarketAccess(null), null);
  assert.deepEqual(resolveTouchlineFantasyMarketAccess("beta"), {
    planKey: "beta",
    budgetEur: TOUCHLINE_FANTASY_BETA_BUDGET_EUR,
    allowedClubTeamIds: TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS,
  });
  assert.deepEqual(resolveTouchlineFantasyMarketAccess("standard"), {
    planKey: "standard",
    budgetEur: 400_000_000,
    allowedClubTeamIds: null,
  });
  assert.deepEqual(resolveTouchlineFantasyMarketAccess("pro"), { planKey: "pro", budgetEur: 650_000_000, allowedClubTeamIds: null });
  assert.deepEqual(resolveTouchlineFantasyMarketAccess("master"), { planKey: "master", budgetEur: 850_000_000, allowedClubTeamIds: null });
  assert.deepEqual(resolveTouchlineFantasyMarketAccess("vip"), { planKey: "vip", budgetEur: 1_000_000_000, allowedClubTeamIds: null });
  assert.equal(resolveTouchlineFantasyMarketAccess("preview"), null);
});

test("all tiers enforce their exact budget and VIP cannot remain unlimited", () => {
  for (const plan of ["beta", "standard", "pro", "master", "vip"]) {
    const access = resolveTouchlineFantasyMarketAccess(plan)!;
    assert.equal(isTouchlineFantasyMarketAccess(access), true);
    for (const budgetEur of [null, 0, Infinity, access.budgetEur! + 1, access.budgetEur! - 1]) {
      assert.equal(isTouchlineFantasyMarketAccess({ ...access, budgetEur }), false);
    }
  }
});

test("market access rejects a malformed or unrestricted Beta payload and fails club checks closed", () => {
  const beta = resolveTouchlineFantasyMarketAccess("beta")!;
  assert.equal(isTouchlineFantasyMarketAccess(beta), true);
  assert.equal(isTouchlineFantasyMarketAccess({
    planKey: "beta", budgetEur: 500_000_000, allowedClubTeamIds: null,
  }), false);
  assert.equal(isTouchlineFantasyMarketAccess({
    planKey: "beta", budgetEur: 50_000_000, allowedClubTeamIds: ["22", "117", "116", "999"],
  }), false);

  for (const teamId of TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS) {
    assert.equal(isTouchlineFantasyMarketClubAllowed(beta, teamId), true);
  }
  assert.equal(isTouchlineFantasyMarketClubAllowed(beta, "19"), false);
  assert.equal(isTouchlineFantasyMarketClubAllowed(beta, 22), true);
  assert.equal(isTouchlineFantasyMarketClubAllowed(null, "22"), false);
  assert.equal(isTouchlineFantasyMarketClubAllowed({ planKey: "beta" }, "22"), false);
  assert.equal(isTouchlineFantasyMarketClubAllowed(undefined, "19"), false, "missing plan access fails closed");
});

test("the SQL contract is server-owned, locks entitlement policy, and applies canonical-club enforcement", () => {
  assert.match(migration, /add column if not exists plan_key text/i);
  assert.match(migration, /plan_key is null or plan_key in \('beta', 'standard', 'pro', 'master', 'vip'\)/i);
  assert.doesNotMatch(migration, /update\s+public\.touchline_fantasy_entitlements/i);
  assert.match(migration, /entitlement\.user_id = p_user_id/i);
  assert.match(migration, /entitlement\.entitlement_key = ''fantasy_access''/i);
  assert.match(migration, /for share;/i);
  assert.match(migration, /v_effective_budget := case when v_plan_key = ''beta'' then 50000000/i);
  assert.match(migration, /v_allowed_team_ids := case when v_plan_key = ''beta'' then array\[''22'',''117'',''116'',''52''\]::text\[\]/i);
  assert.match(migration, /policy_club\.provider = ''sportmonks''/i);
  assert.match(migration, /policy_club\.provider_team_id::text = any\(v_allowed_team_ids\)/i);
  assert.match(migration, /if v_previous\.id is not null and v_plan_key = 'beta' then/i);
  assert.match(migration, /if v_beta_carry_allowed then/i);
  assert.match(migration, /count\(\*\) = 11 and count\(distinct player_id\) = 11/i);
  assert.match(migration, /sum\(market_value_eur\), 0\) <= v_effective_budget/i);
  assert.match(migration, /<= v_config\.max_players_per_club/i);
  assert.match(migration, /elsif v_previous\.id is not null then/i);
});

test("snapshot queries plan_key server-side and fails closed when that read or policy resolution fails", () => {
  assert.match(server, /\.select\("status,current_period_start,current_period_end,plan_key"\)/);
  assert.match(server, /if \(entitlementError\) return null;/);
  assert.match(server, /resolveTouchlineFantasyMarketAccess\(entitlement\?\.plan_key\)/);
  assert.match(server, /if \(!marketAccess\) \{/);
  assert.match(server, /if \(entitlementData !== null \|\| projection !== "full"\) return null;/);
  assert.match(server, /marketAccess,/);
  assert.match(server, /budgetEur: marketAccess\.budgetEur/);
});

test("competitive rankings exclude Beta and unknown snapshots before loading scores", () => {
  const rankingSource = server.slice(server.indexOf("async function loadRankings("),server.indexOf("async function loadCoaches("));
  assert.match(rankingSource, /\.in\("market_plan_key_snapshot", \["standard", "pro", "master", "vip"\]\)/);
  assert.ok(rankingSource.indexOf('"market_plan_key_snapshot"') < rankingSource.indexOf('"touchline_fantasy_user_gameweek_scores"'));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migration, retirementMigration, arenaAccessService, adminRoute, adminActions, adminPage] = await Promise.all([
  readFile(new URL("../supabase/migrations/027_touchline_tc_wallet_integrity.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/037_deactivate_touchline_beta_welcome_bonus.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/server/touchline-arena-access.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/promotions/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/admin-promotions-actions.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/(app)/admin/promotions/page.tsx", import.meta.url), "utf8"),
]);

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("an incremental migration makes the game ledger canonically TC", () => {
  assert.match(migration, /update public\.clubowner_credit_ledger[\s\S]*set currency = 'TC'/);
  assert.match(migration, /alter column currency set default 'TC'/);
  assert.match(migration, /clubowner_credit_ledger_canonical_currency/);
  assert.match(migration, /check \(btrim\(currency\) = 'TC'\)/);
  assert.match(migration, /100 stored units equal 1 TC/);
});

test("checkout and inventory read only TC and checkout debits TC", () => {
  const checkout = between(
    migration,
    "create or replace function public.checkout_touchline_market_cart",
    "create or replace function public.get_touchline_market_inventory",
  );
  const inventory = between(
    migration,
    "create or replace function public.get_touchline_market_inventory",
    "revoke all on function public.normalize_touchline_credit_currency",
  );

  assert.match(checkout, /from public\.clubowner_credit_ledger[\s\S]*btrim\(currency\) = 'TC'/);
  assert.match(checkout, /-\(total_tc \* 100\),[\s\S]*'TC',[\s\S]*'purchase_use'/);
  assert.match(inventory, /from public\.clubowner_credit_ledger as ledger[\s\S]*btrim\(ledger\.currency\) = 'TC'/);
});

test("the retired automatic welcome bonus now returns 0 TC without writing ledger rows", () => {
  assert.match(retirementMigration, /create or replace function public\.claim_touchline_beta_welcome_grant/);
  assert.match(retirementMigration, /'campaignClosed', true/);
  assert.match(retirementMigration, /'amountTc', 0/);
  assert.doesNotMatch(retirementMigration, /insert into public\.clubowner_credit_ledger/);
  assert.doesNotMatch(retirementMigration, /set balance_cents = balance_cents \+/);
});

test("owner accounts are persisted and repaired without creating a ClubOwner profile", () => {
  assert.match(migration, /create table if not exists public\.touchline_platform_owner_accounts/);
  assert.match(migration, /references auth\.users\(id\)/);
  assert.match(migration, /register_touchline_platform_owner/);
  assert.match(migration, /touchline-beta-owner-reversal:/);
  assert.match(migration, /delete from public\.touchline_beta_tc_grants/);
  assert.match(migration, /TL_BETA_OWNER_EXCLUDED/);

  assert.ok(
    arenaAccessService.indexOf("isOwnerEmail(user.email)") <
      arenaAccessService.indexOf("ensureArenaUserProfile(user, admin)"),
  );
  assert.match(arenaAccessService, /register_touchline_platform_owner/);
});

test("Arena access grants application access only and never automatic TC", () => {
  assert.match(arenaAccessService, /export async function ensureTouchlineArenaAccess/);
  assert.match(arenaAccessService, /amountTc:\s*0/);
  assert.match(arenaAccessService, /await markTouchLineArenaAccess\(user, admin\)/);
  assert.doesNotMatch(arenaAccessService, /claim_touchline_beta_welcome_grant/);
  assert.doesNotMatch(arenaAccessService, /amountTc:\s*35/);
  assert.doesNotMatch(arenaAccessService, /parseTouchlineBetaWelcomeGrant/);
});

test("admin credit controls use TouchLine Credits, never fiat currency formatting", () => {
  assert.match(adminRoute, /currency: "TC"/);
  assert.doesNotMatch(adminRoute, /body\.currency/);
  assert.match(adminActions, /placeholder="Amount in TC"/);
  assert.doesNotMatch(adminActions, /Amount in EUR|Amount in GBP/);
  assert.match(adminPage, /touchlineCredits/);
  assert.match(adminPage, /\} TC`/);
  assert.doesNotMatch(adminPage, /style:\s*"currency"/);
});

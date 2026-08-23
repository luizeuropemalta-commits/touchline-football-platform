import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { evaluateTouchlineCardCompleteness } from "../lib/touchlineArena/card-review-state.ts";

const complete = {
  displayName: "Ada Touchline", shirtNumber: 28, countryCode3: "ENG", position: "CM",
  hasVerifiedMarketValue: true, hasClubAsset: true,
} as const;

test("complete card is full-colour eligible", () => {
  assert.deepEqual(evaluateTouchlineCardCompleteness(complete), { state: "COMPLETE", missingFields: [] });
});

test("publication is derived and never a manual REVIEW_REQUIRED input", () => {
  const result = evaluateTouchlineCardCompleteness(complete);
  assert.equal(result.state, "COMPLETE");
  assert.equal(result.missingFields.includes("editorial_publication" as never), false);
});

for (const [label, patch, field] of [
  ["market value", { hasVerifiedMarketValue: false }, "market_value"],
  ["shirt number", { shirtNumber: null }, "shirt_number"],
  ["nationality", { countryCode3: "N/A" }, "nationality"],
  ["position", { position: null }, "position"],
] as const) {
  test(`missing ${label} requires a grayscale review card`, () => {
    const result = evaluateTouchlineCardCompleteness({ ...complete, ...patch });
    assert.equal(result.state, "REVIEW_REQUIRED");
    assert.ok(result.missingFields.includes(field));
  });
}

test("several missing fields remain visible and enumerate every real blocker", () => {
  const result = evaluateTouchlineCardCompleteness({ ...complete, shirtNumber: null, countryCode3: null, hasVerifiedMarketValue: false });
  assert.deepEqual(result.missingFields, ["shirt_number", "nationality", "market_value"]);
});

test("saving one field keeps review on until the final actual blocker clears", () => {
  const afterShirt = evaluateTouchlineCardCompleteness({ ...complete, hasVerifiedMarketValue: false });
  assert.equal(afterShirt.state, "REVIEW_REQUIRED");
  const afterValue = evaluateTouchlineCardCompleteness(complete);
  assert.equal(afterValue.state, "COMPLETE");
});

test("Card Engine storage keeps provider facts and identity immutable", () => {
  const route = readFileSync(new URL("../app/api/admin/manual-card-editorial/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260819150000_touchline_card_review_engine.sql", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../lib/football-data/qa-twenty-club-roster-sync.ts", import.meta.url), "utf8");
  assert.match(route, /\["displayName", "shirtNumber", "countryCode3", "position"\]/);
  assert.match(route, /const unexpected = Object\.keys\(fields\)/);
  assert.match(migration, /drop constraint if exists touchline_card_editorial_overrides_field_key_check/);
  assert.match(migration, /'countryCode3', 'position'/);
  assert.match(migration, /touchline_card_editorial_override_audit_immutable/);
  assert.match(migration, /revoke all on public\.touchline_card_editorial_override_audit from public, anon, authenticated/);
  assert.doesNotMatch(sync, /touchline_card_editorial_overrides/);
});

test("only the owner-gated server command can mutate Card Engine overrides", () => {
  const securityMigration = readFileSync(new URL("../supabase/migrations/20260819212404_touchline_card_editorial_overrides_security.sql", import.meta.url), "utf8");
  assert.match(securityMigration, /enable row level security/);
  assert.match(securityMigration, /force row level security/);
  assert.match(securityMigration, /drop policy if exists/);
  assert.match(securityMigration, /revoke all on public\.touchline_card_editorial_overrides from public, anon, authenticated/);
  assert.match(securityMigration, /grant select, insert, update, delete on public\.touchline_card_editorial_overrides to service_role/);
});

test("complete inputs auto-publish atomically while incomplete inputs stay in review", () => {
  const route = readFileSync(new URL("../app/api/admin/manual-card-editorial/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260819205247_touchline_card_engine_auto_publication.sql", import.meta.url), "utf8");
  assert.match(route, /touchline_apply_card_editorial_review/);
  assert.match(route, /const publicationState = cardReview\.state === "COMPLETE" \? "published" : "ready_for_review"/);
  assert.doesNotMatch(route, /const publicationState = text\(body\.publicationState/);
  assert.match(migration, /v_publication\.id is null/);
  assert.match(migration, /when 'shirtNumber' then v_provider_shirt_number::text/);
  assert.match(migration, /public\.touchline_apply_derived_card_publication/);
  assert.match(migration, /v_publication_synced := true/);
  assert.match(migration, /begin;[\s\S]*?commit;/);
  assert.match(migration, /TL_CARD_REVIEW_COMMAND_INVALID/);
  assert.match(migration, /revoke all on function public\.touchline_apply_card_editorial_review/);
});

test("VALUE REQUIRED accepts only a verified non-negative integer market value", () => {
  const page = readFileSync(new URL("../app/(app)/admin/manual-card-editorial/page.tsx", import.meta.url), "utf8");
  assert.match(page, /player_id,status,confidence,market_value_eur/);
  assert.match(page, /Number\.isSafeInteger\(marketValueByPlayerId\.get\(player\.id\)\?\.market_value_eur\)/);
  assert.match(page, /market_value_eur \?\? -1\) >= 0/);
});

test("derived publication never fabricates a market-value review", () => {
  const derivedPublication = readFileSync(new URL("../supabase/migrations/20260819213430_touchline_card_engine_publication_only.sql", import.meta.url), "utf8");
  assert.match(derivedPublication, /touchline_apply_derived_card_publication/);
  assert.match(derivedPublication, /TL_DERIVED_PUBLICATION_MARKET_VALUE_NOT_VERIFIED/);
  assert.match(derivedPublication, /membership\.player_id = p_player_id/);
  assert.match(derivedPublication, /never writes football_player_market_values or its history/);
  assert.doesNotMatch(derivedPublication, /insert into public\.football_player_market_values/);
  assert.doesNotMatch(derivedPublication, /insert into public\.football_player_market_value_history/);
});

test("unchanged manual values are idempotent and do not create a valuation event", () => {
  const idempotenceMigration = readFileSync(new URL("../supabase/migrations/20260819214415_touchline_card_engine_manual_value_idempotence.sql", import.meta.url), "utf8");
  assert.match(idempotenceMigration, /v_value\.market_value_eur = p_market_value_eur/);
  assert.match(idempotenceMigration, /return query select v_publication\.id/);
  assert.match(idempotenceMigration, /touchline_apply_manual_card_publication_with_market_value/);
});

test("the audit records a real review-to-complete transition", () => {
  const auditMigration = readFileSync(new URL("../supabase/migrations/20260819211414_touchline_card_engine_audit_state.sql", import.meta.url), "utf8");
  assert.match(auditMigration, /new\.effective_before/);
  assert.match(auditMigration, /new\.card_state_before := case when v_missing then 'REVIEW_REQUIRED' else 'COMPLETE' end/);
  assert.match(auditMigration, /before insert on public\.touchline_card_editorial_override_audit/);
});

test("final-field save resolves tier/template publication without another manual action", () => {
  const actions = readFileSync(new URL("../components/admin-manual-card-editorial-actions.tsx", import.meta.url), "utf8");
  const inbox = readFileSync(new URL("../components/card-engine-inbox.tsx", import.meta.url), "utf8");
  assert.match(actions, /Card Engine/);
  assert.doesNotMatch(actions, /setPublicationState|<select value=\{publicationState\}/);
  assert.match(inbox, /SAVE & REVALIDATE/);
  assert.match(inbox, /action=save-review/);
});

test("Club Hub uses the shared premium review card rather than a generic pending square", () => {
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
  assert.match(lineup, /evaluateTouchlineCardCompleteness/);
  assert.doesNotMatch(lineup, /CARD PENDING REVIEW|DATA PENDING|pendingCard/);
  assert.match(card, /data-card-editorial-state=\{reviewRequired \? "review_required"/);
  assert.match(card, /filter: reviewRequired \? "grayscale\(1\)/);
  assert.match(card, /Card review required/);
});

test("provider position conflicts are routed to Card Engine while TouchLine remains authoritative", () => {
  const page = readFileSync(new URL("../app/(app)/admin/manual-card-editorial/page.tsx", import.meta.url), "utf8");
  const inbox = readFileSync(new URL("../components/card-engine-inbox.tsx", import.meta.url), "utf8");
  assert.match(page, /touchlineMarketPositionBucket\(override\.position\)/);
  assert.match(page, /resolution: "TOUCHLINE_AUTHORITY"/);
  assert.match(page, /cardReview\.state === "REVIEW_REQUIRED" \|\| positionConflict/);
  assert.match(inbox, /POSITION CONFLICT/);
  assert.match(inbox, /approved TouchLine override remains final authority/);
});

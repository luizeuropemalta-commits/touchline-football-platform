import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR,
  planTouchlineCardProvisionalFields,
  shouldResolveTouchlineProvisionalMarketValue,
  shouldResolveTouchlineProvisionalShirt,
} from "../lib/touchlineArena/card-engine-provisional-policy.ts";
import { selectTouchlineOfficialLineupShirtFacts } from "../lib/football-data/card-engine-provisional-lineup-sync.ts";
import {
  formatTouchlineMarketValueEur,
  formatTouchlinePublicShirtNumber,
  parseTouchlinePublicEditorialCardPresentation,
} from "../lib/touchlineArena/editorial-card-profile.ts";
import { resolveTouchlinePublicCardPresentation } from "../lib/touchlineArena/public-card-presentation.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260901090000_touchline_card_engine_provisional_fields.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollback/20260901090000_touchline_card_engine_provisional_fields.sql", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../lib/touchlineArena/card-engine-provisional-server.ts", import.meta.url),
  "utf8",
);

const PLAYER_UUID = "11111111-1111-4111-8111-111111111111";

function completeFeed() {
  const lineups = ["15", "19"].flatMap((teamId, teamIndex) => [
    ...Array.from({ length: 11 }, (_, index) => ({
      playerId: String(1000 + teamIndex * 100 + index),
      teamId,
      jerseyNumber: index + 1,
      formationPosition: String(index + 1),
      isStarter: true,
      isSubstitute: false,
    })),
    ...Array.from({ length: 9 }, (_, index) => ({
      playerId: String(1050 + teamIndex * 100 + index),
      teamId,
      jerseyNumber: index + 20,
      formationPosition: undefined,
      isStarter: false,
      isSubstitute: true,
    })),
  ]);
  return {
    fixture: {
      provider: "sportmonks",
      providerId: "19722192",
      homeTeam: { providerId: "15" },
      awayTeam: { providerId: "19" },
    },
    lineups,
    formations: [],
    sidelined: [],
    events: [],
  } as never;
}

test("permanent fallbacks are exact, explicit and never replace canonical/manual values", () => {
  assert.deepEqual(planTouchlineCardProvisionalFields({ canonicalPlayerId: PLAYER_UUID }), {
    shirtNumber: { value: 0, provenance: "PROVISIONAL_MISSING_SHIRT" },
    marketValue: { valueEur: 1_000_000, provenance: "PROVISIONAL_MISSING_MARKET_VALUE" },
  });
  assert.deepEqual(planTouchlineCardProvisionalFields({
    canonicalPlayerId: PLAYER_UUID,
    canonicalShirtNumber: 19,
    verifiedMarketValueEur: 22_000_000,
  }), { shirtNumber: null, marketValue: null });
  assert.deepEqual(planTouchlineCardProvisionalFields({
    canonicalPlayerId: PLAYER_UUID,
    approvedManualShirtNumber: 33,
    approvedManualMarketValueEur: 1,
  }), { shirtNumber: null, marketValue: null });
  assert.throws(() => planTouchlineCardProvisionalFields({ canonicalPlayerId: "player-by-name" }), /canonical player UUID/);
});

test("only the exact provisional fences may resolve", () => {
  assert.equal(shouldResolveTouchlineProvisionalShirt({
    currentValue: 0,
    currentProvenance: "PROVISIONAL_MISSING_SHIRT",
    approvedManualValue: null,
    officialLineupValue: 21,
  }), true);
  assert.equal(shouldResolveTouchlineProvisionalShirt({
    currentValue: 0,
    currentProvenance: "PROVISIONAL_MISSING_SHIRT",
    approvedManualValue: 40,
    officialLineupValue: 21,
  }), false);
  assert.equal(shouldResolveTouchlineProvisionalMarketValue({
    currentValueEur: TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR,
    currentProvenance: "PROVISIONAL_MISSING_MARKET_VALUE",
    currentStatus: "provisional",
    currentConfidence: "provisional",
    trustedValueEur: 28_000_000,
  }), true);
  assert.equal(shouldResolveTouchlineProvisionalMarketValue({
    currentValueEur: 28_000_000,
    currentProvenance: "OWNER_EDITORIAL_OVERRIDE",
    currentStatus: "verified",
    currentConfidence: "verified",
    trustedValueEur: 30_000_000,
  }), false);
});

test("official shirt facts require exact 11+9 sheets and formation positions", () => {
  const feed = completeFeed();
  const facts = selectTouchlineOfficialLineupShirtFacts(feed);
  assert.equal(facts.length, 40);
  assert.deepEqual(facts.slice(0, 2).map((fact) => fact.formationPosition), [1, 2]);
  const partial = structuredClone(feed) as { lineups: unknown[] };
  partial.lineups.pop();
  assert.deepEqual(selectTouchlineOfficialLineupShirtFacts(partial as never), []);
  const duplicate = structuredClone(feed) as { lineups: Array<{ playerId: string }> };
  duplicate.lineups[39]!.playerId = duplicate.lineups[0]!.playerId;
  assert.deepEqual(selectTouchlineOfficialLineupShirtFacts(duplicate as never), []);
  const invalidPosition = structuredClone(feed) as { lineups: Array<{ formationPosition?: string }> };
  invalidPosition.lineups[0]!.formationPosition = "12";
  assert.deepEqual(selectTouchlineOfficialLineupShirtFacts(invalidPosition as never), []);
});

test("public presentation accepts only the exact labelled provisional values", () => {
  const base = {
    tierKey: "ruby-red",
    cardPrice: { amountMinor: 0, currency: "GBP" },
    lastReviewedAt: "2026-09-01T10:00:00.000Z",
  } as const;
  assert.ok(parseTouchlinePublicEditorialCardPresentation({
    ...base,
    marketValueEur: 1_000_000,
    marketValueState: "provisional",
    shirtNumber: 0,
    shirtNumberState: "provisional",
  }));
  assert.equal(parseTouchlinePublicEditorialCardPresentation({
    ...base,
    marketValueEur: 2_000_000,
    marketValueState: "provisional",
  }), null);
  assert.equal(parseTouchlinePublicEditorialCardPresentation({
    ...base,
    shirtNumber: 9,
    shirtNumberState: "provisional",
  }), null);
  const visible = resolveTouchlinePublicCardPresentation({
    marketValue: "€1m",
    marketValueSource: "provisional-fallback",
    marketValueState: "provisional",
    classificationState: "provisional",
    cardTier: "ruby-red",
  });
  assert.equal(visible.visualState, "provisional");
  assert.equal(visible.tierKey, "ruby-red");
  assert.equal(visible.hasVerifiedMarketValue, false);
  const invalid = resolveTouchlinePublicCardPresentation({
    marketValue: "€2m",
    marketValueSource: "provisional-fallback",
    marketValueState: "provisional",
    classificationState: "provisional",
    cardTier: "ruby-red",
  });
  assert.equal(invalid.visualState, "unavailable");
  assert.equal(invalid.tierKey, null);
});

test("public provisional card labels are exactly 00 and EUR 1M", () => {
  assert.equal(formatTouchlinePublicShirtNumber(0), "00");
  assert.equal(formatTouchlinePublicShirtNumber("0"), "00");
  assert.equal(formatTouchlinePublicShirtNumber(9), "9");
  assert.equal(formatTouchlinePublicShirtNumber(null), null);
  assert.equal(formatTouchlinePublicShirtNumber("unknown"), null);
  assert.equal(formatTouchlineMarketValueEur(TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR, "en-GB"), "€1M");
});

test("SQL is service-role-only, monitored, immutable-fenced and safely reversible", () => {
  for (const required of [
    "touchline_card_engine_ensure_provisional_defaults",
    "touchline_card_engine_reconcile_official_lineup_shirts",
    "touchline_card_engine_resolve_provisional_market_value",
    "PROVISIONAL_MISSING_SHIRT",
    "PROVISIONAL_MISSING_MARKET_VALUE",
    "TL_CARD_PROVISIONAL_APPROVED_MARKET_VALUE_MISMATCH",
    "TL_CARD_PROVISIONAL_MARKET_FENCE_FAILED",
    "count(*) filter(where fact->>'role'='STARTER')",
    "team.formation_positions <> 11",
    "last_verification_at",
    "next_verification_at",
    "sources_consulted",
  ]) assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /revoke all on function public\.touchline_card_engine_ensure_provisional_defaults[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.touchline_card_engine_ensure_provisional_defaults[\s\S]+to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,180}to authenticated/);
  assert.match(server, /^import "server-only";/m);
  assert.match(server, /canonicalPlayerId/);
  assert.doesNotMatch(server, /displayName|playerName|fetch\s*\(/);
  assert.match(rollback, /TL_CARD_PROVISIONAL_ROLLBACK_DATA_PRESENT/);
  assert.doesNotMatch(rollback, /delete from|truncate /i);
});

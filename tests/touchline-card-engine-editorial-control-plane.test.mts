import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseCardEngineDelimitedInput,
  resolveCardEngineImportRows,
  summarizeCardEngineRows,
} from "../lib/touchlineArena/card-engine-editorial-import.ts";
import {
  prepareTouchlineMarketValueCardEngineRows,
  touchlineMarketValueBatchContentIdentity,
} from "../lib/touchlineArena/card-engine-market-value-batch.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260818100529_touchline_card_engine_editorial_control_plane.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/card-engine/route.ts", import.meta.url), "utf8");
const marketValuesRoute = readFileSync(new URL("../app/api/admin/market-values/import/route.ts", import.meta.url), "utf8");
const batchServer = readFileSync(new URL("../lib/touchlineArena/card-engine-batch-server.ts", import.meta.url), "utf8");
const candidatesServer = readFileSync(new URL("../lib/touchlineArena/card-engine-candidates-server.ts", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../components/admin-card-engine-console.tsx", import.meta.url), "utf8");

const candidates = [{
  playerId: "11111111-1111-4111-8111-111111111111", providerPlayerId: "101", name: "Ada Lovelace", club: "TouchLine FC", dateOfBirth: "2000-01-01",
  provider: { displayName: "Ada Lovelace", jerseyNumber: 8, sourceUpdatedAt: "2026-08-18T00:00:00Z" },
}] as const;

test("Card Engine resolves provider id first and makes name plus club manual-review-only", () => {
  const provider = resolveCardEngineImportRows([{ providerPlayerId: "101", displayName: "A. Lovelace" }], candidates);
  assert.equal(provider[0]?.matchStatus, "matched"); assert.equal(provider[0]?.matchStrategy, "provider_player_id");
  const nameOnly = resolveCardEngineImportRows([{ name: "Ada Lovelace", club: "TouchLine FC", displayName: "A. Lovelace" }], candidates);
  assert.equal(nameOnly[0]?.matchStatus, "review"); assert.equal(nameOnly[0]?.matchStrategy, "name_club_manual");
  assert.deepEqual(summarizeCardEngineRows(nameOnly), { matched: 0, review: 1, conflict: 0, unmatched: 0 });
});

test("Card Engine rejects formula-like cells and bounds delimited imports", () => {
  const rows = parseCardEngineDelimitedInput("provider_player_id,display_name\n101,=HYPERLINK(\"x\")");
  assert.equal(rows.length, 1);
  const resolved = resolveCardEngineImportRows(rows, candidates);
  assert.notEqual(resolved[0]?.matchStatus, "matched");
  assert.match(resolved[0]?.errors.join(",") ?? "", /no-supported-editorial-change|formula/);
});

test("a multi-club Market Values snapshot becomes one reviewable Card Engine batch without publishing", () => {
  const multiClubCandidates = [
    candidates[0]!,
    {
      playerId: "22222222-2222-4222-8222-222222222222",
      providerPlayerId: "202",
      name: "Grace Hopper",
      club: "Second Club FC",
      dateOfBirth: "2001-02-02",
      provider: { displayName: "Grace Hopper", jerseyNumber: 9, sourceUpdatedAt: "2026-08-18T00:00:00Z", clubId: "club-2" },
    },
  ] as const;
  const rows = [
    { playerId: candidates[0]!.playerId, externalPlayerId: "tm-1", sourceUrl: "https://licensed.example/1", marketValue: 12_000_000, currency: "EUR" as const, marketValueEur: 12_000_000 },
    { playerId: multiClubCandidates[1].playerId, externalPlayerId: "tm-2", sourceUrl: "https://licensed.example/2", marketValue: 22_000_000, currency: "EUR" as const, marketValueEur: 22_000_000 },
  ];
  const resolved = prepareTouchlineMarketValueCardEngineRows({ rows, candidates: multiClubCandidates, source: "licensed_import" });
  assert.deepEqual(summarizeCardEngineRows(resolved), { matched: 2, review: 0, conflict: 0, unmatched: 0 });
  assert.deepEqual(resolved.map((row) => row.proposed.marketValueEur), [12_000_000, 22_000_000]);
  assert.equal((resolved[1]!.raw as { marketValueSource?: { sourceUrl?: string } }).marketValueSource?.sourceUrl, "https://licensed.example/2");
  assert.notEqual(
    touchlineMarketValueBatchContentIdentity({ scope: "league", verifiedSeason: "2026-27", source: "licensed_import", jobKey: "annual_full_refresh", rows }),
    touchlineMarketValueBatchContentIdentity({ scope: "league", verifiedSeason: "2026-27", source: "licensed_import", jobKey: "annual_full_refresh", rows: rows.slice(0, 1) }),
  );
  assert.throws(
    () => prepareTouchlineMarketValueCardEngineRows({ rows: [rows[0]!, rows[0]!], candidates: multiClubCandidates, source: "licensed_import" }),
    /same canonical player twice/,
  );
});

test("Card Engine migration is protected, atomic, audited, idempotent and reversible", () => {
  for (const required of [
    "touchline_card_editorial_batches", "touchline_card_editorial_batch_items", "touchline_card_editorial_overrides", "touchline_card_editorial_audit_events",
    "provider_value", "touchline_override", "effective_value", "touchline_card_editorial_effective_values", "is_stale",
    "touchline_card_engine_create_batch", "TL_CARD_ENGINE_IDEMPOTENCY_PAYLOAD_MISMATCH", "touchline_card_engine_approve_batch", "touchline_card_engine_publish_batch", "touchline_card_engine_revert_batch",
    "TL_CARD_ENGINE_PROVIDER_IDENTITY_FENCE_FAILED", "TL_CARD_ENGINE_BATCH_REVIEW_REQUIRED", "security definer", "enable row level security", "from public, anon, authenticated", "to service_role",
  ]) assert.ok(migration.includes(required), `missing ${required}`);
  assert.match(migration, /begin;[\s\S]*commit;/);
  assert.match(migration, /field_key in \('displayName', 'shirtNumber', 'marketValueEur', 'cardTemplateKey'\)/);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)[\s\S]*\bto\s+(?:anon|authenticated)\b/i);
});

test("server route enforces owner access, same-origin writes, bounds and never writes provider facts directly", () => {
  assert.match(route, /isOwnerEmail/); assert.match(route, /hasTouchLineArenaAccess/); assert.match(route, /isSameOrigin/); assert.match(route, /MAX_IMPORT_BYTES/); assert.match(route, /readBoundedJson/); assert.match(route, /reader\.cancel/);
  assert.match(route, /createTouchlineCardEngineBatch/); assert.match(route, /transitionTouchlineCardEngineBatch/);
  assert.match(batchServer, /touchline_card_engine_create_batch/); assert.match(batchServer, /touchline_card_engine_approve_batch/); assert.match(batchServer, /touchline_card_engine_publish_batch/); assert.match(batchServer, /touchline_card_engine_revert_batch/);
  assert.doesNotMatch(route, /\.from\("football_players"\)[\s\S]{0,240}\.(?:update|upsert|insert|delete)\(/);
  assert.doesNotMatch(route, /sportmonks\.com|fetch\s*\(/);
  assert.doesNotMatch(route, /"xlsx"/);
  assert.doesNotMatch(consoleSource, /from "xlsx"|\.xlsx|XLSX\./);
});

test("the existing Market Values entry point is connected to Card Engine review and supports canonical multi-club candidates", () => {
  assert.match(marketValuesRoute, /createMarketValueReviewBatch/);
  assert.match(marketValuesRoute, /createTouchlineCardEngineBatch/);
  assert.match(marketValuesRoute, /prepareTouchlineMarketValueCardEngineRows/);
  assert.match(marketValuesRoute, /nextAction: "review_in_card_engine"/);
  assert.match(marketValuesRoute, /status: "card_engine_review_required"/);
  assert.match(marketValuesRoute, /isSameOrigin/);
  assert.doesNotMatch(marketValuesRoute, /applyTouchlineMarketValueImport/);
  assert.doesNotMatch(marketValuesRoute, /football_player_market_values/);
  assert.match(candidatesServer, /membershipsForPlayer\.length !== 1/);
  assert.doesNotMatch(candidatesServer, /\.eq\("club_id"/);
});

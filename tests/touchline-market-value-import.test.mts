import assert from "node:assert/strict";
import test from "node:test";

import { decideTouchlineMarketValueImport } from "../lib/touchlineArena/market-value-import.ts";
import { parseTouchlineMarketValueCsv, parseTouchlineMarketValueSpreadsheet } from "../lib/touchlineArena/market-value-import-file.ts";
import { requireLicensedMarketValueSource } from "../lib/touchlineArena/licensed-market-value-source.ts";
import { TOUCHLINE_MARKET_VALUE_SCHEDULES, touchlineMarketValueRunDate } from "../lib/touchlineArena/market-value-schedule.ts";
import { readFileSync } from "node:fs";

const validRow = {
  playerId: "player-1",
  externalPlayerId: "154421",
  sourceUrl: "https://licensed.example/player/154421",
  marketValue: 200_000_000,
  currency: "EUR" as const,
  marketValueEur: 200_000_000,
};

test("market-value imports are server-owned validated snapshots, not live gameplay requests", () => {
  assert.deepEqual(decideTouchlineMarketValueImport({ row: validRow, verifiedSeason: "2026/27" }), { status: "ready" });
  assert.deepEqual(decideTouchlineMarketValueImport({
    row: validRow,
    verifiedSeason: "2026/27",
    existing: { marketValue: 200_000_000, currency: "EUR", marketValueEur: 200_000_000, verifiedSeason: "2026/27" },
  }), { status: "unchanged" });
});

test("CSV rows are parsed as integer snapshots and spreadsheet parsing stays behind an approved adapter", async () => {
  assert.deepEqual(parseTouchlineMarketValueCsv(
    "player_id,external_player_id,source_url,market_value,currency,market_value_eur\nplayer-1,154421,https://licensed.example/player/154421,200000000,EUR,200000000",
  ), [validRow]);
  await assert.rejects(parseTouchlineMarketValueSpreadsheet(new Uint8Array(), null), /SPREADSHEET_ADAPTER_UNAVAILABLE/);
  assert.throws(() => requireLicensedMarketValueSource(null), /LICENSED_SOURCE_NOT_CONFIGURED/);
});

test("seasonal schedule is fixed at 30 and 7 days and transfer-window detection cannot become repricing", () => {
  const annual = TOUCHLINE_MARKET_VALUE_SCHEDULES.find((job) => job.key === "annual_full_refresh");
  const delta = TOUCHLINE_MARKET_VALUE_SCHEDULES.find((job) => job.key === "final_delta_refresh");
  const detection = TOUCHLINE_MARKET_VALUE_SCHEDULES.find((job) => job.key === "transfer_window_roster_detection");
  assert.equal(annual?.leadDays, 30);
  assert.equal(delta?.leadDays, 7);
  assert.match(detection?.description ?? "", /never reprices cards/i);
  assert.equal(touchlineMarketValueRunDate(new Date("2026-08-15T12:00:00.000Z"), annual!).toISOString(), "2026-07-16T12:00:00.000Z");
});

test("migration freezes legacy automatic card reclassification and protects immutable history", () => {
  const migration = readFileSync(new URL("../supabase/migrations/050_touchline_market_value_engine.sql", import.meta.url), "utf8");
  assert.match(migration, /rename to touchline_card_market_value_history/i);
  assert.match(migration, /before update or delete on public\.football_player_market_value_history/i);
  assert.match(migration, /drop trigger if exists football_players_sync_touchline_market_value/i);
  assert.match(migration, /annual_full_refresh/i);
  assert.match(migration, /final_delta_refresh/i);
  assert.match(migration, /transfer_window_roster_detection/i);
});

test("public consumers use only the approved TouchLine value read model", () => {
  const profile = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  const roster = readFileSync(new URL("../lib/touchlineArena/authoritative-roster-server.ts", import.meta.url), "utf8");
  assert.match(profile, /loadTouchlinePublicPlayerProjections/);
  assert.doesNotMatch(profile, /loadTouchlineVerifiedMarketValueByProviderPlayerId/);
  assert.match(roster, /football_player_market_values/);
  assert.match(roster, /approvedMarketValuesByPlayerId/);
});

test("missing or unsafe values become explicit queue states instead of invented tiers", () => {
  assert.deepEqual(decideTouchlineMarketValueImport({
    row: { ...validRow, marketValue: null, currency: null, marketValueEur: null },
    verifiedSeason: "2026/27",
  }), { status: "pending" });
  assert.deepEqual(decideTouchlineMarketValueImport({
    row: { ...validRow, marketValue: -1 },
    verifiedSeason: "2026/27",
  }), { status: "rejected", failureCode: "invalid-value" });
});

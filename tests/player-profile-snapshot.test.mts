import assert from "node:assert/strict";
import test from "node:test";

import type { TouchLineOfficialPlayerProfile } from "../lib/touchlineArena/player-profile-official.ts";
import {
  buildTouchLineOfficialProfileSnapshot,
  hydrateTouchLineOfficialProfileSnapshot,
} from "../lib/touchlineArena/player-profile-snapshot.ts";

function liveProfile(): TouchLineOfficialPlayerProfile {
  return {
    status: "live",
    player: {
      id: "sportmonks:154421",
      providerId: "154421",
      provider: "sportmonks",
      name: "Erling Haaland",
      displayName: "Erling Haaland",
      position: "Attacker",
      marketValue: 200_000_000,
      marketValueCurrency: "EUR",
      source: {
        provider: "sportmonks",
        providerId: "154421",
        raw: { mustNotPersist: true },
      },
    },
    providerPlayerId: "154421",
    seasonId: "25583",
    seasonName: "2025/2026",
    fetchedAt: "2026-07-22T01:00:00.000Z",
    stats: [{
      typeId: "52",
      code: "goals",
      name: "Goals",
      value: 27,
      label: "Goals",
      group: "summary",
    }],
    transferStatus: "live",
    transfers: [{
      id: "sportmonks:1",
      providerId: "1",
      provider: "sportmonks",
      fromTeamName: "Borussia Dortmund",
      toTeamName: "Manchester City",
      date: "2022-07-01",
      source: {
        provider: "sportmonks",
        providerId: "1",
        raw: { mustNotPersist: true },
      },
    }],
    transfersFetchedAt: "2026-07-22T01:00:01.000Z",
  };
}

test("builds a normalized official snapshot without raw provider payloads", () => {
  const snapshot = buildTouchLineOfficialProfileSnapshot({
    profile: liveProfile(),
    capturedAt: "2026-07-22T01:01:00.000Z",
  });

  assert.ok(snapshot);
  assert.equal(snapshot.statisticsStatus, "live");
  assert.equal(snapshot.transferStatus, "live");
  assert.equal("raw" in snapshot.player.source, false);
  assert.equal("marketValue" in snapshot.player, false);
  assert.equal("marketValueCurrency" in snapshot.player, false);
  assert.equal("raw" in snapshot.transfers[0].source, false);
  assert.equal(snapshot.stats[0].value, 27);
});

test("keeps the last verified section when one provider resource fails", () => {
  const previous = buildTouchLineOfficialProfileSnapshot({ profile: liveProfile() });
  assert.ok(previous);

  const partial: TouchLineOfficialPlayerProfile = {
    ...liveProfile(),
    status: "error",
    fetchedAt: null,
    stats: [],
    reason: "provider_error",
    transferStatus: "live",
    transfers: [{
      ...liveProfile().transfers[0],
      providerId: "2",
      id: "sportmonks:2",
      date: "2025-07-01",
    }],
    transfersFetchedAt: "2026-07-22T02:00:00.000Z",
  };
  const merged = buildTouchLineOfficialProfileSnapshot({ profile: partial, previous });

  assert.ok(merged);
  assert.equal(merged.stats[0].value, 27);
  assert.equal(merged.statisticsFetchedAt, "2026-07-22T01:00:00.000Z");
  assert.equal(merged.transfers[0].providerId, "2");
  assert.equal(merged.transfersFetchedAt, "2026-07-22T02:00:00.000Z");
});

test("hydrates a persisted snapshot as official fallback data", () => {
  const snapshot = buildTouchLineOfficialProfileSnapshot({ profile: liveProfile() });
  assert.ok(snapshot);

  const profile = hydrateTouchLineOfficialProfileSnapshot(snapshot);
  assert.equal(profile.status, "live");
  assert.equal(profile.transferStatus, "live");
  assert.equal(profile.reason, "persisted-official-snapshot");
  assert.equal(profile.providerPlayerId, "154421");
});

test("removes legacy market values when hydrating an older snapshot", () => {
  const snapshot = buildTouchLineOfficialProfileSnapshot({ profile: liveProfile() });
  assert.ok(snapshot);

  const legacySnapshot = {
    ...snapshot,
    player: {
      ...snapshot.player,
      marketValue: 180_000_000,
      marketValueCurrency: "EUR",
    },
  } as typeof snapshot;
  const profile = hydrateTouchLineOfficialProfileSnapshot(legacySnapshot);

  assert.ok(profile.player);
  assert.equal("marketValue" in profile.player, false);
  assert.equal("marketValueCurrency" in profile.player, false);
});

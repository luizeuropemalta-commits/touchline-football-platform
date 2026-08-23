import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalizeArenaLineupForPersistence,
  reconcileStoredArenaFormationLayouts,
  reconcileStoredArenaLineupWithAuthoritativeRoster,
  sanitizeArenaFormationLayoutsForPersistence,
} from "../lib/touchlineArena/authoritative-arena-state.ts";
import {
  mapAuthoritativeRosterRows,
  validateLineupInventoryOwnership,
} from "../lib/touchlineArena/authoritative-roster-server.ts";
import { parseAuthoritativeRosterResponse } from "../lib/touchlineArena/authoritative-roster-client.ts";
import {
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
} from "../lib/touchlineArena/demo-data.ts";
import { TOUCHLINE_CARD_TIER_KEYS } from "../lib/touchlineArena/card-rules.ts";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const CONTRACT_ID = "123e4567-e89b-42d3-a456-426614174001";
const INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174002";
const PLAYER_ID = "123e4567-e89b-42d3-a456-426614174003";
const CLUB_ID = "123e4567-e89b-42d3-a456-426614174004";
const OTHER_INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174005";
const RELEASED_INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174006";
const PUBLISHED_EDITORIAL_CARD = {
  tierKey: "emerald-green" as const,
  cardPrice: { amountMinor: 4_900, currency: "GBP" as const },
  lastReviewedAt: "2026-08-11T00:00:00.000Z",
};

function publishedCards() {
  return new Map([[PLAYER_ID, PUBLISHED_EDITORIAL_CARD]]);
}

function authoritativeCard(): ClubOwnerSquadCard {
  return {
    id: PLAYER_ID,
    name: "Erling Haaland",
    shortName: "Haaland",
    role: "forward",
    position: "ST",
    clubName: "Manchester City",
    shirtNumber: 9,
    countryCode3: "NOR",
    marketValue: "",
    marketValueSource: "unavailable",
    cardTier: "emerald-green",
    cardPriceVersion: "2026-07-premier-v1",
    cardPriceAuthority: "active-contract",
    editorialCard: null,
    inventoryId: INVENTORY_ID,
    touchlinePoints: 12,
    seasonTouchlinePoints: 12,
  };
}

function completeRows() {
  return {
    contracts: [{
      id: CONTRACT_ID,
      user_id: USER_ID,
      card_id: INVENTORY_ID,
      status: "active",
      purchase_tier: "ruby-red",
      purchase_price_table_version: "2026-07-premier-v1",
      metadata: { touchlinePoints: 12 },
    }],
    inventories: [{
      id: INVENTORY_ID,
      player_id: PLAYER_ID,
      club_id: CLUB_ID,
      player_name: "Erling Haaland",
      club_name: "Manchester City",
      competition_tier: "emerald-green",
      price_table_version: "2026-07-premier-v1",
      metadata: {},
    }],
    players: [{
      id: PLAYER_ID,
      provider_player_id: "117",
      current_club_id: CLUB_ID,
      name: "Erling Braut Haaland",
      display_name: "Erling Haaland",
      nationality: "Norway",
      country_id: "157",
      position: "Centre Forward",
    }],
    clubs: [{
      id: CLUB_ID,
      provider_team_id: "9",
      name: "Manchester City",
      short_code: "MCI",
    }],
    squadMembers: [{
      player_id: PLAYER_ID,
      club_id: CLUB_ID,
      jersey_number: 9,
      position: "ST",
      status: "active",
    }],
  };
}

test("maps active contracts to complete canonical roster cards with real UUIDs", () => {
  const result = mapAuthoritativeRosterRows(completeRows(), publishedCards());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.snapshot.activeContractCount, 1);
  assert.equal(result.snapshot.ownedContractCount, 1);
  assert.equal(result.snapshot.representedClubCount, 1);
  assert.deepEqual(result.snapshot.inventoryIds, [INVENTORY_ID]);
  assert.deepEqual(result.snapshot.cards[0], {
    id: PLAYER_ID,
    name: "Erling Haaland",
    shortName: "Haaland",
    role: "forward",
    position: "ST",
    clubName: "Manchester City",
    shirtNumber: 9,
    countryCode3: "NOR",
    canonicalPlayerId: PLAYER_ID,
    marketValue: "",
    marketValueSource: "unavailable",
    cardTier: "emerald-green",
    inventoryId: INVENTORY_ID,
    touchlinePoints: 12,
    seasonTouchlinePoints: 12,
    matchTouchlinePoints: null,
    editorialCard: PUBLISHED_EDITORIAL_CARD,
  });
});

test("counts represented clubs from active-contract inventory club IDs only", () => {
  const rows = completeRows();
  rows.contracts.push({
    ...rows.contracts[0],
    id: "123e4567-e89b-42d3-a456-426614174007",
    card_id: OTHER_INVENTORY_ID,
  });
  rows.inventories.push({
    ...rows.inventories[0],
    id: OTHER_INVENTORY_ID,
    player_id: "123e4567-e89b-42d3-a456-426614174008",
    club_id: null,
  });
  rows.players.push({
    ...rows.players[0],
    id: "123e4567-e89b-42d3-a456-426614174008",
    current_club_id: "123e4567-e89b-42d3-a456-426614174009",
  });
  const result = mapAuthoritativeRosterRows(rows, new Map([
    ...publishedCards(),
    ["123e4567-e89b-42d3-a456-426614174008", PUBLISHED_EDITORIAL_CARD],
  ]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.ownedContractCount, 2);
  assert.equal(result.snapshot.representedClubCount, 1);
});

test("the browser accepts the exact published roster contract emitted by the server", () => {
  const mapped = mapAuthoritativeRosterRows(completeRows(), publishedCards());
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;

  const parsed = parseAuthoritativeRosterResponse({
    ok: true,
    state: "authenticated",
    source: "supabase",
    activeContractCount: mapped.snapshot.activeContractCount,
    cards: mapped.snapshot.cards,
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.cards.length, 1);
  assert.equal(parsed.cards[0].inventoryId, INVENTORY_ID);
  assert.equal(parsed.cards[0].editorialCard?.tierKey, "emerald-green");
  assert.equal(parsed.cards[0].cardPriceAuthority, undefined);
});

test("rejects a partial database roster instead of hiding an owned card", () => {
  const rows = completeRows();
  rows.inventories = [];
  assert.deepEqual(mapAuthoritativeRosterRows(rows), {
    ok: false,
    error: "TL_ROSTER_DATA_INCOMPLETE",
  });
});

test("rejects malformed active-contract rows instead of treating them as an empty roster", () => {
  const rows = completeRows();
  rows.contracts = [null] as unknown as typeof rows.contracts;
  assert.deepEqual(mapAuthoritativeRosterRows(rows), {
    ok: false,
    error: "TL_ROSTER_DATA_INCOMPLETE",
  });
});

test("uses only the published editorial card instead of legacy inventory tiers or price tables", () => {
  const missingTier = completeRows();
  missingTier.inventories[0].competition_tier = null;
  missingTier.contracts[0].purchase_tier = null;
  const missingTierResult = mapAuthoritativeRosterRows(missingTier, publishedCards());
  assert.equal(missingTierResult.ok, true);
  if (!missingTierResult.ok) return;
  assert.equal(missingTierResult.snapshot.cards[0]?.editorialCard?.tierKey, "emerald-green");

  const staleTable = completeRows();
  staleTable.inventories[0].price_table_version = "obsolete-price-table";
  const staleTableResult = mapAuthoritativeRosterRows(staleTable, publishedCards());
  assert.equal(staleTableResult.ok, true);
  if (!staleTableResult.ok) return;
  assert.equal(staleTableResult.snapshot.cards[0]?.editorialCard?.cardPrice.amountMinor, 4_900);
});

test("keeps an active contract card in the private owner roster without publishing it", () => {
  const result = mapAuthoritativeRosterRows(completeRows(), new Map());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.snapshot.ownedContractCount, 1);
  assert.equal(result.snapshot.activeContractCount, 1);
  assert.equal(result.snapshot.cards.length, 1);
  assert.equal(result.snapshot.cards[0]?.editorialCard, null);
  assert.equal(result.snapshot.cards[0]?.cardTier, "ruby-red");
  assert.equal(result.snapshot.cards[0]?.cardPriceAuthority, "active-contract");
  assert.equal(result.snapshot.cards[0]?.cardPriceVersion, "2026-07-premier-v1");
});

test("keeps a published card independent from a retired inventory price-table identifier", () => {
  const rows = completeRows();
  rows.inventories[0].price_table_version = "2026-07-tc-v2";
  const result = mapAuthoritativeRosterRows(rows, publishedCards());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.cards[0].cardTier, "emerald-green");
  assert.equal(result.snapshot.cards[0].editorialCard?.cardPrice.amountMinor, 4_900);
  const exactCardPlayer = squadCardToExactPlayer(result.snapshot.cards[0], { useSuppliedTier: true });
  assert.equal(exactCardPlayer.editorialCard?.tierKey, "emerald-green");
});

test("strict lineup ownership guard reports missing, foreign and duplicate cards", () => {
  const result = validateLineupInventoryOwnership([
    { id: PLAYER_ID, card: { inventoryId: INVENTORY_ID } },
    { id: "missing-inventory" },
    { id: "foreign", inventoryId: OTHER_INVENTORY_ID },
    { id: "duplicate", card: { inventoryId: INVENTORY_ID } },
  ], [INVENTORY_ID]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.inventoryIds, [
    INVENTORY_ID,
    OTHER_INVENTORY_ID,
    INVENTORY_ID,
  ]);
  assert.deepEqual(result.missingInventoryIndexes, [1]);
  assert.deepEqual(result.foreignInventoryIds, [OTHER_INVENTORY_ID]);
  assert.deepEqual(result.duplicateInventoryIds, [INVENTORY_ID]);
});

test("strict lineup ownership guard accepts only unique active inventory ids", () => {
  assert.deepEqual(validateLineupInventoryOwnership([
    { id: PLAYER_ID, card: { inventoryId: INVENTORY_ID } },
  ], [INVENTORY_ID]), {
    ok: true,
    inventoryIds: [INVENTORY_ID],
    missingInventoryIndexes: [],
    foreignInventoryIds: [],
    duplicateInventoryIds: [],
  });
});

test("Arena persistence rebuilds spoofed card identity, tier, value, points and stats from the authoritative roster", () => {
  const result = canonicalizeArenaLineupForPersistence([{
    id: "attacker-controlled-id",
    name: "Spoofed Name",
    shortName: "Spoof",
    role: "goalkeeper",
    asset: "https://attacker.invalid/player.png",
    x: 68.04,
    y: 52.06,
    heightVh: 14.04,
    card: {
      inventoryId: INVENTORY_ID,
      playerName: "Spoofed Name",
      clubName: "Spoofed Club",
      shirtNumber: 99,
      position: "GK",
      countryCode3: "XXX",
      fantasyPoints: 999_999,
      marketValue: "€999B",
      marketValueSource: "provider",
      cardTier: "diamond-gold",
      cardPriceVersion: "attacker-version",
      cardPrice: "999 TC",
      tcValue: 999,
      frameUrl: "https://attacker.invalid/frame.png",
      matchStats: { goals: 999, assists: 999, cards: -999 },
    },
  }], [authoritativeCard()]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lineup.length, 1);
  const [player] = result.lineup;
  assert.equal(player.id, `field-${INVENTORY_ID}`);
  assert.equal(player.name, "Erling Haaland");
  assert.equal(player.shortName, "Haaland");
  assert.equal(player.role, "forward");
  assert.equal(player.asset, "/touchlineArena/players/haaland/man-city/v1/approved/full_body_static_transparent.png");
  assert.deepEqual({ x: player.x, y: player.y, heightVh: player.heightVh }, {
    x: 68,
    y: 52.1,
    heightVh: 14,
  });
  assert.deepEqual(player.card, {
    templateUrl: "/touchlineArena/cards/templates/clubs/Manchester%20City/market-tiers/emerald-green.png",
    playerName: "Erling Haaland",
    shirtNumber: 9,
    clubName: "Manchester City",
    position: "ST",
    countryCode3: "NOR",
    flagUrl: null,
    fantasyPoints: 12,
    matchFantasyPoints: null,
    marketValue: "",
    marketValueSource: "unavailable",
    cardTier: "emerald-green",
    cardPriceVersion: "2026-07-premier-v1",
    cardPriceAuthority: "active-contract",
    editorialCard: null,
    inventoryId: INVENTORY_ID,
  });
  assert.equal("frameUrl" in (player.card as Record<string, unknown>), false);
  assert.equal("cardPrice" in (player.card as Record<string, unknown>), false);
  assert.equal("tcValue" in (player.card as Record<string, unknown>), false);
});

test("Arena persistence preserves the canonical published editorial card presentation", () => {
  const rosterCard = {
    ...authoritativeCard(),
    editorialCard: PUBLISHED_EDITORIAL_CARD,
  };
  const result = canonicalizeArenaLineupForPersistence([{
    inventoryId: INVENTORY_ID,
    x: 68,
    y: 52,
    heightVh: 14,
    card: {
      inventoryId: INVENTORY_ID,
      cardTier: "ruby-red",
      editorialCard: null,
    },
  }], [rosterCard]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.lineup[0]?.card?.editorialCard, PUBLISHED_EDITORIAL_CARD);
});

test("Arena persistence preserves every canonical published editorial tier", () => {
  for (const tierKey of TOUCHLINE_CARD_TIER_KEYS) {
    const editorialCard = {
      ...PUBLISHED_EDITORIAL_CARD,
      tierKey,
    };
    const result = canonicalizeArenaLineupForPersistence([{
      inventoryId: INVENTORY_ID,
      x: 68,
      y: 52,
      heightVh: 14,
      card: {
        inventoryId: INVENTORY_ID,
        cardTier: "ruby-red",
        editorialCard: null,
      },
    }], [{
      ...authoritativeCard(),
      editorialCard,
    }]);

    assert.equal(result.ok, true, tierKey);
    if (!result.ok) continue;
    assert.deepEqual(result.lineup[0]?.card?.editorialCard, editorialCard, tierKey);
  }
});

test("Arena persistence rejects malformed tactical coordinates instead of storing browser payloads", () => {
  const result = canonicalizeArenaLineupForPersistence([{
    inventoryId: INVENTORY_ID,
    x: 999,
    y: 52,
    heightVh: 14,
  }], [authoritativeCard()]);

  assert.deepEqual(result, {
    ok: false,
    error: "TL_ARENA_LINEUP_INVALID",
    lineupTooLarge: false,
    missingInventoryIndexes: [],
    foreignInventoryIds: [],
    duplicateInventoryIds: [],
    invalidTacticalIndexes: [0],
  });
});

test("Arena state distinguishes the XI from the 35-card roster on writes and reads", () => {
  const roster = Array.from({ length: 12 }, (_, index): ClubOwnerSquadCard => {
    const suffix = String(index + 16).padStart(12, "0");
    return {
      ...authoritativeCard(),
      id: `123e4567-e89b-42d3-a456-${suffix}`,
      name: `Player ${index + 1}`,
      shortName: `P${index + 1}`,
      inventoryId: `223e4567-e89b-42d3-a456-${suffix}`,
    };
  });
  const lineup = roster.map((card) => ({
    inventoryId: card.inventoryId,
    x: 68,
    y: 52,
    heightVh: 14,
  }));

  const write = canonicalizeArenaLineupForPersistence(lineup, roster);
  assert.equal(write.ok, false);
  if (!write.ok) assert.equal(write.lineupTooLarge, true);

  const read = reconcileStoredArenaLineupWithAuthoritativeRoster(lineup, roster);
  assert.equal(read.length, 11);
  assert.deepEqual(
    read.map((player) => player.card?.inventoryId),
    roster.slice(0, 11).map((card) => card.inventoryId),
  );
});

test("Arena GET reconciliation drops foreign, released, duplicate and incomplete cards and repairs tactics", () => {
  const result = reconcileStoredArenaLineupWithAuthoritativeRoster([
    {
      inventoryId: INVENTORY_ID,
      x: "68",
      y: null,
      heightVh: 999,
      name: "Spoofed on old state",
      card: { inventoryId: INVENTORY_ID, cardTier: "diamond-gold", matchStats: { goals: 99 } },
    },
    { inventoryId: OTHER_INVENTORY_ID, x: 68, y: 52, heightVh: 14 },
    { inventoryId: RELEASED_INVENTORY_ID, x: 68, y: 52, heightVh: 14 },
    { inventoryId: INVENTORY_ID, x: 68, y: 52, heightVh: 14 },
    { id: "missing-inventory", x: 68, y: 52, heightVh: 14 },
  ], [authoritativeCard()]);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Erling Haaland");
  assert.equal(result[0].card?.cardTier, "emerald-green");
  assert.equal(result[0].card?.matchStats, undefined);
  assert.deepEqual({ x: result[0].x, y: result[0].y, heightVh: result[0].heightVh }, {
    x: 68,
    y: 52,
    heightVh: 14,
  });
});

test("Arena formation layouts accept only known numeric tactical slots", () => {
  const valid = sanitizeArenaFormationLayoutsForPersistence({
    "4-3-3": {
      goalkeeper: [{ x: 10.04, y: 50.06, heightVh: 14.04 }],
      cameras: {
        "wide-touchline": {
          forward: [{ x: 68.04, y: 70.06, heightVh: 11.24 }],
        },
      },
    },
  });
  assert.deepEqual(valid, {
    ok: true,
    layouts: {
      "4-3-3": {
        goalkeeper: [{ x: 10, y: 50.1, heightVh: 14 }],
        cameras: {
          "wide-touchline": {
            forward: [{ x: 68, y: 70.1, heightVh: 11.2 }],
          },
        },
      },
    },
  });

  assert.deepEqual(sanitizeArenaFormationLayoutsForPersistence([]), {
    ok: false,
    error: "TL_ARENA_FORMATION_LAYOUT_INVALID",
  });
  assert.deepEqual(sanitizeArenaFormationLayoutsForPersistence({
    "4-3-3": { goalkeeper: [{ x: "10", y: 50, heightVh: 14 }] },
  }), {
    ok: false,
    error: "TL_ARENA_FORMATION_LAYOUT_INVALID",
  });
  assert.deepEqual(sanitizeArenaFormationLayoutsForPersistence({
    "4-3-3": { metadata: { injected: true } },
  }), {
    ok: false,
    error: "TL_ARENA_FORMATION_LAYOUT_INVALID",
  });

  assert.deepEqual(sanitizeArenaFormationLayoutsForPersistence({
    "4-3-3": {
      cameras: {
        "qa-manual-lower-stand-tablet-landscape": {
          goalkeeper: [{ x: 12.5, y: 78, heightVh: 12 }],
        },
      },
    },
  }), {
    ok: true,
    layouts: {
      "4-3-3": {
        cameras: {
          "qa-manual-lower-stand-tablet-landscape": {
            goalkeeper: [{ x: 12.5, y: 78, heightVh: 12 }],
          },
        },
      },
    },
  });

  assert.deepEqual(sanitizeArenaFormationLayoutsForPersistence({
    "4-3-3": { cameras: { "qa-manual-lower-stand-portrait": { goalkeeper: [] } } },
  }), {
    ok: false,
    error: "TL_ARENA_FORMATION_LAYOUT_INVALID",
  });
});

test("Arena formation sanitizer preserves the current official 4-3-3 and 4-4-2 layouts", () => {
  const official = JSON.parse(readFileSync(
    new URL("../data/touchline-arena-formation-locks.json", import.meta.url),
    "utf8",
  )) as Record<string, unknown>;
  const selected = {
    "4-3-3": official["4-3-3"],
    "4-4-2": official["4-4-2"],
  };

  assert.deepEqual(sanitizeArenaFormationLayoutsForPersistence(selected), {
    ok: true,
    layouts: selected,
  });
});

test("Arena GET layout reconciliation never returns unknown saved layout fields", () => {
  assert.deepEqual(reconcileStoredArenaFormationLayouts({
    "4-3-3": {
      goalkeeper: [{ x: 10, y: 50, heightVh: 14 }],
      injected: { html: "unsafe" },
    },
    "3-5-2": {
      goalkeeper: [{ x: 10, y: 50, heightVh: 14 }],
    },
  }), {});
});

test("roster endpoint derives identity from the session and exposes explicit states", () => {
  const route = readFileSync(
    new URL("../app/api/touchline-arena/roster/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(route, /searchParams|get\(["']userId["']\)/);
  assert.match(route, /state:\s*"authenticated"/);
  assert.match(route, /state:\s*"anonymous"/);
  assert.match(route, /state:\s*"unavailable"/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /readAuthoritativeTouchlineRoster\(admin,\s*user\.id\)/);
});

test("server roster query is restricted to the authenticated user's active contracts", () => {
  const helper = readFileSync(
    new URL("../lib/touchlineArena/authoritative-roster-server.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    helper,
    /\.from\("touchline_card_contracts"\)[\s\S]*?\.eq\("user_id", requestedUserId\)[\s\S]*?\.eq\("status", "active"\)/,
  );
  assert.match(helper, /import\("\.\/card-publication-read-model\.ts"\)/);
  assert.match(helper, /loadTouchlinePublishedCardPresentations/);
  assert.doesNotMatch(helper, /\.from\("football_player_market_values"\)/);
  assert.doesNotMatch(helper, /resolveTouchlineVerifiedPlayerEconomy/);
  assert.doesNotMatch(helper, /cookie|localStorage|sessionStorage/);
});

test("Arena state PUT validates ownership and persists only a canonical lineup", () => {
  const route = readFileSync(
    new URL("../app/api/touchline-arena/state/route.ts", import.meta.url),
    "utf8",
  );
  const validationIndex = route.indexOf("validateLineupInventoryOwnership(");
  const canonicalIndex = route.indexOf("canonicalizeArenaLineupForPersistence(");
  const upsertIndex = route.indexOf('.from("touchline_user_arena_state").upsert(');

  assert.match(route, /readAuthoritativeTouchlineRoster\(admin, user\.id\)/);
  assert.match(route, /Array\.isArray\(body\?\.lineup\)\s*&&\s*body\.lineup\.length > 0\s*&&\s*body\.lineup\.length <= 11/);
  assert.ok(validationIndex > 0);
  assert.ok(canonicalIndex > validationIndex);
  assert.ok(upsertIndex > canonicalIndex);
  assert.match(route, /TL_ARENA_LINEUP_OWNERSHIP_INVALID/);
  assert.match(route, /status: 409/);
  assert.match(route, /lineup:\s*canonicalLineup\.lineup/);
  assert.match(route, /saved_formation_layouts:\s*sanitizedLayouts\.layouts/);
});

test("Arena state GET reconstructs stored lineup from active contracts and never returns the raw array", () => {
  const route = readFileSync(
    new URL("../app/api/touchline-arena/state/route.ts", import.meta.url),
    "utf8",
  );
  const stateReadIndex = route.indexOf('.from("touchline_user_arena_state")');
  const rosterReadIndex = route.indexOf("readAuthoritativeTouchlineRoster(admin, user.id)");
  const reconciliationIndex = route.indexOf("reconcileStoredArenaLineupWithAuthoritativeRoster(");
  const responseIndex = route.indexOf("{ ok: true, userId: user.id, state }");

  assert.ok(stateReadIndex > 0);
  assert.ok(rosterReadIndex > stateReadIndex);
  assert.ok(reconciliationIndex > rosterReadIndex);
  assert.ok(responseIndex > reconciliationIndex);
  assert.match(route, /lineup:\s*reconcileStoredArenaLineupWithAuthoritativeRoster\(/);
  assert.match(route, /saved_formation_layouts:\s*reconcileStoredArenaFormationLayouts\(/);
  assert.match(route, /Cache-Control["']:\s*["']private, no-store/);
  assert.match(route, /rosterReadFailure\(roster\.error, user\.id\)/);
  assert.match(route, /resolveServerReadWithin\([\s\S]*?readAuthoritativeTouchlineRoster\(admin, user\.id\)[\s\S]*?TL_ROSTER_READ_TIMEOUT[\s\S]*?ARENA_STATE_ROSTER_READ_TIMEOUT_MS/);
});

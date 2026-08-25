import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLUB_OWNER_SQUAD_CARDS,
} from "../lib/touchlineArena/demo-data.ts";
import {
  serializeClubOwnerRoster,
} from "../lib/touchlineArena/club-owner-roster.ts";
import {
  resolveTouchlineServerPageRoster,
} from "../lib/touchlineArena/server-page-roster.ts";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174001";

function authenticatedRoster() {
  return {
    ok: true as const,
    snapshot: {
      source: "supabase" as const,
      ownedContractCount: 1,
      activeContractCount: 1,
      representedClubCount: 1,
      inventoryIds: [INVENTORY_ID],
      cards: [{
        ...CLUB_OWNER_SQUAD_CARDS[0],
        id: USER_ID,
        inventoryId: INVENTORY_ID,
        name: "Authoritative player",
      }],
    },
  };
}

test("authenticated server pages use only the authoritative contract roster", () => {
  const result = resolveTouchlineServerPageRoster({
    authenticatedUserId: USER_ID,
    authoritativeRoster: authenticatedRoster(),
    publicCookieValue: serializeClubOwnerRoster(CLUB_OWNER_SQUAD_CARDS.slice(1, 3)),
  });

  assert.equal(result.state, "authenticated");
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0]?.name, "Authoritative player");
  assert.equal(result.cards[0]?.inventoryId, INVENTORY_ID);
});

test("authenticated server pages never turn a database failure into demo cards", () => {
  const result = resolveTouchlineServerPageRoster({
    authenticatedUserId: USER_ID,
    authoritativeRoster: {
      ok: false,
      error: "TL_ROSTER_CONTRACTS_UNAVAILABLE",
    },
    publicCookieValue: serializeClubOwnerRoster(CLUB_OWNER_SQUAD_CARDS),
  });

  assert.deepEqual(result, {
    state: "unavailable",
    cards: [],
    error: "TL_ROSTER_CONTRACTS_UNAVAILABLE",
  });
});

test("authenticated server pages stay empty when the admin client or read throws", () => {
  assert.deepEqual(resolveTouchlineServerPageRoster({
    authenticatedUserId: USER_ID,
    authoritativeRoster: null,
    publicCookieValue: serializeClubOwnerRoster(CLUB_OWNER_SQUAD_CARDS),
  }), {
    state: "unavailable",
    cards: [],
    error: "TL_ROSTER_SERVER_UNAVAILABLE",
  });
});

test("public pages retain the isolated demo cookie and demo fallback", () => {
  const publicCards = CLUB_OWNER_SQUAD_CARDS.slice(0, 2);
  const fromCookie = resolveTouchlineServerPageRoster({
    authenticatedUserId: null,
    authoritativeRoster: authenticatedRoster(),
    publicCookieValue: serializeClubOwnerRoster(publicCards),
  });
  const fallback = resolveTouchlineServerPageRoster({
    authenticatedUserId: null,
    publicCookieValue: null,
  });

  assert.equal(fromCookie.state, "public-demo");
  assert.deepEqual(fromCookie.cards.map((card) => card.id), publicCards.map((card) => card.id));
  assert.equal(fallback.state, "public-demo");
  assert.equal(fallback.cards.length, CLUB_OWNER_SQUAD_CARDS.length);
});

test("account-aware server pages gate cookies behind the public branch", () => {
  const pagePaths = [
    "../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx",
    "../app/touchline-tables/page.tsx",
  ];

  for (const pagePath of pagePaths) {
    const source = readFileSync(new URL(pagePath, import.meta.url), "utf8");
    assert.match(
      source,
      /if \((user|activeClubOwnerUser) && admin\)[\s\S]*?readAuthoritativeTouchlineRoster\(admin, \1\.id\)/,
    );
    assert.match(source, /const publicRosterCookieValue = (user|activeClubOwnerUser)\s*\? null\s*:/);
    assert.match(source, /resolveTouchlineServerPageRoster\(\{/);
    assert.doesNotMatch(source, /kind:\s*["']authenticated["']/);
    assert.doesNotMatch(source, /fallback:\s*user\s*\?/);
  }
});

test("the league-wide player ranking never reads a private roster or demo cookie", () => {
  const source = readFileSync(
    new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.doesNotMatch(source, /readAuthoritativeTouchlineRoster/);
  assert.doesNotMatch(source, /resolveTouchlineServerPageRoster/);
  assert.doesNotMatch(source, /publicRosterCookieValue|cookies\(\)/);
});

test("the authenticated profile bounds its private avatar lookup before identity rendering", () => {
  const source = readFileSync(
    new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const \{ data: storedProfile \} = await resolveServerReadWithin(?:<[^>]+>)?\([\s\S]*?\.from\("users"\)[\s\S]*?\.maybeSingle\(\)[\s\S]*?\{ data: null \},[\s\S]*?CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS/,
  );
});

test("the authenticated profile reads the Gameweek XI only for the server-derived owner", () => {
  const source = readFileSync(
    new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const fantasySnapshotRead = activeClubOwnerUser[\s\S]*?resolveServerReadWithin\(loadTouchlineFantasySnapshot\(activeClubOwnerUser\), null, CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS\)[\s\S]*?: Promise\.resolve\(null\)/,
  );
  assert.match(source, /<TouchlineGameweekTeamSnapshot snapshot=\{fantasySnapshot\}/);
  assert.doesNotMatch(source, /const arenaStateRead = activeClubOwnerUser/);
});

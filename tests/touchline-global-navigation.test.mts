import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTouchlineGlobalNavigationCurrent,
  resolveTouchlineGlobalNavigationItems,
  touchlineGlobalNavigationArenaHref,
} from "../lib/touchlineArena/global-navigation.ts";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("global public navigation keeps the fixed safe order and no private destination", () => {
  const items = resolveTouchlineGlobalNavigationItems("pt-BR", "public");

  assert.deepEqual(items.map((item) => item.key), ["clubHub", "live", "market", "rankings"]);
  assert.deepEqual(items.map((item) => item.href), [
    "/touchline-clubs?lang=pt-BR",
    "/live?lang=pt-BR",
    "/market-transfer?lang=pt-BR",
    "/touchline-tables?lang=pt-BR",
  ]);
  assert.equal(touchlineGlobalNavigationArenaHref("pt-BR"), "/arena?lang=pt-BR");
  assert.equal(resolveTouchlineGlobalNavigationItems("es-ES", "auth")[0]?.href, "/touchline-clubs?lang=en-GB");
  assert.doesNotMatch(JSON.stringify(items), /club-owner|manchester|luiz-lopez/i);
});

test("authenticated navigation may add only the server-resolved My Club boundary", () => {
  const items = resolveTouchlineGlobalNavigationItems("en-GB", "authenticated");

  assert.deepEqual(items.map((item) => item.key), ["clubHub", "live", "market", "rankings", "myClub"]);
  assert.equal(items.at(-1)?.href, "/club-owner/me?lang=en-GB");
  assert.doesNotMatch(JSON.stringify(items), /luiz-lopez|manchester-united|manchester-city/i);
});

test("global navigation exposes an honest current state only for its exact general route", () => {
  assert.equal(isTouchlineGlobalNavigationCurrent("live", "live"), true);
  assert.equal(isTouchlineGlobalNavigationCurrent("clubProfile", "clubHub"), false);
  assert.equal(isTouchlineGlobalNavigationCurrent("notFound", "market"), false);
});

test("Club Profile, Live and 404 use the shared public navigation without duplicate Arena returns", () => {
  const clubProfile = source("app/touchline-clubs/[club]/page.tsx");
  const live = source("components/touchline/match-centre/TouchlineMatchCentre.tsx");
  const notFound = source("components/touchline/TouchlineNotFound.tsx");
  const player = source("app/touchline-players/[player]/page.tsx");
  const tables = source("app/touchline-tables/touchline-tables-client.tsx");
  const rankings = source("app/touchline-player-card-rankings/page.tsx");
  const clubDiscovery = source("app/touchline-clubs/page.tsx");
  const clubOwnerProfile = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");
  const clubOwnerHistory = source("components/touchline/club-owner/ClubOwnerSeasonHistoryRenderer.tsx");
  const clubOwnerRenewals = source("components/touchline/club-owner/ClubOwnerRenewalCenterRenderer.tsx");
  const navigationStyles = source("components/touchline/TouchlineGlobalNavigation.module.css");

  assert.match(clubProfile, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="clubProfile"[\s\S]*?surface="public"[\s\S]*?trustedContext=\{\{/);
  assert.match(live, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="live"[\s\S]*?surface="public"/);
  assert.match(notFound, /<TouchlineGlobalNavigation locale=\{locale\} currentRoute="notFound" surface="public"/);
  assert.doesNotMatch(live, /className=\{styles\.return\}/);
  assert.doesNotMatch(notFound, /touchlineClubHubHref|touchlineArenaHref/);
  assert.match(notFound, /overflow-visible/);
  assert.match(navigationStyles, /\.arena \{[\s\S]*?min-height: 48px/);
  assert.match(navigationStyles, /\.link,[\s\S]*?min-height: 44px/);
  assert.match(navigationStyles, /@media \(max-width: 620px\)[\s\S]*?\.more \{ display: block/);
  assert.match(player, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="playerProfile"[\s\S]*?surface=\{navigationSurface\}/);
  assert.match(tables, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="rankings"[\s\S]*?surface=\{navigationSurface\}/);
  assert.match(rankings, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="rankings"[\s\S]*?surface=\{user \? "authenticated" : "public"\}/);
  assert.doesNotMatch(player, /TouchlineProfileQuickNav/);
  assert.doesNotMatch(tables, /TouchlineProfileQuickNav/);
  assert.doesNotMatch(rankings, /TouchlineProfileQuickNav/);
  assert.match(clubDiscovery, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="clubHub"[\s\S]*?surface="public"/);
  assert.doesNotMatch(clubDiscovery, /className=\{styles\.quickNav\}/);
  assert.match(clubOwnerProfile, /<TouchlineGlobalNavigation[\s\S]*?currentRoute=\{ownerIdentity\.isAuthenticatedClubOwner \? "myClub" : "clubProfile"\}[\s\S]*?surface=\{ownerIdentity\.isAuthenticatedClubOwner \? "authenticated" : "public"\}/);
  assert.match(clubOwnerHistory, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="clubOwnerHistory"[\s\S]*?surface=\{isOwner \? "authenticated" : "public"\}/);
  assert.match(clubOwnerRenewals, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="clubOwnerRenewals"[\s\S]*?surface=\{isOwner \? "authenticated" : "public"\}/);
  assert.doesNotMatch(clubOwnerProfile, /TouchlineProfileQuickNav/);
  assert.doesNotMatch(clubOwnerHistory, /TouchlineProfileQuickNav|touchlineArenaHref/);
  assert.doesNotMatch(clubOwnerRenewals, /TouchlineProfileQuickNav|touchlineArenaHref/);
});

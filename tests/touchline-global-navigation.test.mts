import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTouchlineGlobalNavigationCurrent,
  resolveTouchlineGlobalNavigationItems,
  resolveTouchlineGlobalNavigationSurface,
  touchlineGlobalNavigationArenaHref,
} from "../lib/touchlineArena/global-navigation.ts";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("global public navigation keeps sports links and the primary Market destination", () => {
  const items = resolveTouchlineGlobalNavigationItems("pt-BR", "public");

  assert.deepEqual(items.map((item) => item.key), ["clubHub", "live", "rankings"]);
  assert.deepEqual(items.map((item) => item.href), [
    "/touchline-clubs?lang=pt-BR",
    "/live?lang=pt-BR",
    "/touchline-tables?lang=pt-BR",
  ]);
  assert.equal(touchlineGlobalNavigationArenaHref("pt-BR"), "/market-transfer?lang=pt-BR");
  assert.equal(resolveTouchlineGlobalNavigationItems("es-ES", "auth")[0]?.href, "/touchline-clubs?lang=en-GB");
  assert.doesNotMatch(JSON.stringify(items), /club-owner|manchester|luiz-lopez/i);
});

test("authenticated navigation does not duplicate the game with a separate My Club entry", () => {
  const items = resolveTouchlineGlobalNavigationItems("en-GB", "authenticated");

  assert.deepEqual(items.map((item) => item.key), ["clubHub", "live", "rankings"]);
  assert.equal(items.at(-1)?.href, "/touchline-tables?lang=en-GB");
  assert.doesNotMatch(JSON.stringify(items), /luiz-lopez|manchester-united|manchester-city/i);
});

test("global navigation exposes My Club only to an authenticated ClubOwner", () => {
  assert.equal(resolveTouchlineGlobalNavigationSurface({ isAuthenticated: false, isAdmin: false }), "public");
  assert.equal(resolveTouchlineGlobalNavigationSurface({ isAuthenticated: true, isAdmin: true }), "auth");
  assert.equal(resolveTouchlineGlobalNavigationSurface({ isAuthenticated: true, isAdmin: false }), "authenticated");
  assert.doesNotMatch(
    JSON.stringify(resolveTouchlineGlobalNavigationItems("en-GB", "auth")),
    /club-owner\/me/,
  );
});

test("global navigation exposes an honest current state only for its exact general route", () => {
  assert.equal(isTouchlineGlobalNavigationCurrent("live", "live"), true);
  assert.equal(isTouchlineGlobalNavigationCurrent("clubProfile", "clubHub"), false);
  assert.equal(isTouchlineGlobalNavigationCurrent("notFound", "rankings"), false);
});

test("Club Profile, Live and 404 use the shared public navigation without duplicate Arena returns", () => {
  const clubProfile = source("app/touchline-clubs/[club]/page.tsx");
  const coachProfile = source("app/touchline-coaches/[coach]/page.tsx");
  const live = source("components/touchline/match-centre/TouchlineMatchCentre.tsx");
  const notFound = source("components/touchline/TouchlineNotFound.tsx");
  const player = source("app/touchline-players/[player]/page.tsx");
  const tables = source("app/touchline-tables/page.tsx");
  const rankings = source("app/touchline-player-card-rankings/page.tsx");
  const clubDiscovery = source("app/touchline-clubs/page.tsx");
  const navigationStyles = source("components/touchline/TouchlineGlobalNavigation.module.css");

  assert.match(clubProfile, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="clubProfile"[\s\S]*?surface="public"[\s\S]*?trustedContext=\{\{/);
  assert.match(coachProfile, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="coachProfile"[\s\S]*?surface="public"/);
  assert.doesNotMatch(coachProfile, /<Link href=\{`\/market-transfer/);
  assert.match(live, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="live"[\s\S]*?surface="public"/);
  assert.match(notFound, /<TouchlineGlobalNavigation locale=\{locale\} currentRoute="notFound" surface="public"/);
  assert.doesNotMatch(live, /className=\{styles\.return\}/);
  assert.doesNotMatch(notFound, /touchlineClubHubHref|touchlineArenaHref/);
  assert.match(notFound, /overflow-visible/);
  assert.match(navigationStyles, /\.arena \{[\s\S]*?min-height: 48px/);
  assert.match(navigationStyles, /\.link,[\s\S]*?min-height: 44px/);
  assert.match(navigationStyles, /\.arena::after,[\s\S]*?\.moreLink::after \{[^}]*border-radius: inherit[^}]*pointer-events: none/);
  assert.match(navigationStyles, /\.link:hover::after,[\s\S]*?\.arena:focus-visible::after \{[^}]*opacity: 1/);
  assert.match(navigationStyles, /\.link:focus-visible,[\s\S]*?\.arena:focus-visible \{[^}]*outline: 2px solid #efffd2[^}]*outline-offset: 3px/);
  assert.doesNotMatch(navigationStyles, /box-shadow: 0 0 10px rgba\(185, 255, 86, \.5\), 0 0 24px rgba\(185, 255, 86, \.18\)/);
  assert.match(navigationStyles, /@media \(max-width: 620px\)[\s\S]*?\.more \{ display: block/);
  assert.match(player, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="playerProfile"[\s\S]*?surface=\{navigationSurface\}/);
  assert.match(tables, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="rankings"[\s\S]*?surface=\{navigationSurface\}/);
  assert.match(rankings, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="rankings"[\s\S]*?surface=\{resolveTouchlineGlobalNavigationSurface\(/);
  assert.doesNotMatch(player, /TouchlineProfileQuickNav/);
  assert.doesNotMatch(tables, /TouchlineProfileQuickNav/);
  assert.doesNotMatch(rankings, /TouchlineProfileQuickNav/);
  assert.match(clubDiscovery, /<TouchlineGlobalNavigation[\s\S]*?currentRoute="clubHub"[\s\S]*?surface="public"/);
  assert.doesNotMatch(clubDiscovery, /className=\{styles\.quickNav\}/);
});

test("shared navigation keeps crisp borders and no blurred neon ring", () => {
  const css = source("components/touchline/TouchlineGlobalNavigation.module.css");
  assert.match(css, /border: 1px solid rgba\(234, 255, 199, \.36\)/);
  assert.match(css, /\.moreLink::after \{[^}]*box-shadow: none/);
});

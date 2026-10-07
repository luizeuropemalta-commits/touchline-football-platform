import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { touchlineGlobalNavigationArenaHref } from "../lib/touchlineArena/global-navigation.ts";
import { touchlineMyClubHref } from "../lib/touchlineArena/club-owner-routes.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Market is the game destination and the legacy My Club link redirects without losing locale", () => {
  assert.equal(touchlineMyClubHref("pt-BR"), "/my-club?lang=pt-BR");
  assert.equal(
    touchlineGlobalNavigationArenaHref("en-GB"),
    "/clubowner?lang=en-GB",
  );
  assert.match(source("app/my-club/page.tsx"), /redirect\(`\/clubowner\?\$\{forwarded\.toString\(\)\}`\)/);
  assert.match(source("app/clubowner/page.tsx"), /auth\.getUser\(/);
  assert.match(source("app/clubowner/page.tsx"), /if \(isOwnerEmail\(user\.email\)\) notFound\(\)/);
  assert.match(source("proxy.ts"), /const isRetiredClubOwnerRoute = matchesRoute\(pathname, "\/club-owner"\)/);
  assert.match(source("proxy.ts"), /function retiredClubOwnerRedirect[\s\S]*?new URL\("\/clubowner", request\.url\)/);
  assert.match(source("proxy.ts"), /const isMyClubRoute = pathname === "\/my-club"/);
  assert.match(source("proxy.ts"), /if \(isMyClubRoute && !user\) return loginRedirect\(request, response, draftLocalesEnabled\)/);
});

test("local My Club reaches the same customer-only identity gates as QA", () => {
  const proxy = source("proxy.ts");
  const routeClassification = proxy.indexOf('const isMyClubRoute = pathname === "/my-club";');
  const localPublicShortcut = proxy.indexOf("if (isLocalDev && !isMyClubRoute) return nextResponseWithPresentationLocale(request, draftLocalesEnabled);");
  const identityLookup = proxy.indexOf("supabase.auth.getUser()");
  const anonymousGate = proxy.indexOf("if (isMyClubRoute && !user) return loginRedirect(request, response, draftLocalesEnabled);");
  const adminGate = proxy.indexOf("if (isMyClubRoute && isAdmin) return clubOwnerNotFoundResponse(request, response);");

  assert.ok(routeClassification >= 0);
  assert.ok(routeClassification < localPublicShortcut);
  assert.ok(localPublicShortcut < identityLookup);
  assert.ok(identityLookup < anonymousGate);
  assert.ok(anonymousGate < adminGate);
  assert.doesNotMatch(proxy, /if \(isLocalDev\) return nextResponseWithPresentationLocale\(request\)/);
});

test("My Club opens pitch-first while preserving strict position-only replacement", () => {
  const market = source("app/fantasy/FantasyGameweekClient.tsx");

  assert.match(market, /useState<"squad" \| "tactical">\("tactical"\)/);
  assert.match(market, /squadView === "tactical" \? <TouchlinePitchSurface/);
  assert.match(market, /className=\{styles\.squadBoard\}/);
  assert.match(market, /touchlineFantasySlotAcceptsPlayer\(activeSlot, player\)/);
  assert.match(market, /setFeedback\(workflowCopy\.slotNotEligible\)/);
  assert.equal(getTouchlineFantasyMarketWorkflowCopy("pt-BR").slotNotEligible, "Este card não é elegível para a vaga selecionada.");
  assert.match(market, /replaceTouchlineFantasyPlayerAtSlot/);
  assert.match(market, /removeTouchlineFantasyPlayerFromSlot/);
});

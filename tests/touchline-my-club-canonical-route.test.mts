import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveTouchlineGlobalNavigationItems } from "../lib/touchlineArena/global-navigation.ts";
import { touchlineMyClubHref } from "../lib/touchlineArena/club-owner-routes.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("My Club is the only product-facing navigation destination", () => {
  assert.equal(touchlineMyClubHref("pt-BR"), "/my-club?lang=pt-BR");
  assert.equal(
    resolveTouchlineGlobalNavigationItems("en-GB", "authenticated").at(-1)?.href,
    "/my-club?lang=en-GB",
  );
  assert.match(source("app/my-club/page.tsx"), /ClubOwnerProfileRenderer searchParams=\{searchParams\}/);
  assert.match(source("app/market-transfer/page.tsx"), /\/my-club\?\$\{forwarded\.toString\(\)\}#my-club-squad/);
  assert.match(source("proxy.ts"), /pathname === "\/club-owner\/me"[\s\S]*?canonicalUrl\.pathname = "\/my-club"/);
  assert.match(source("proxy.ts"), /const isMyClubRoute = pathname === "\/my-club"/);
  assert.match(source("proxy.ts"), /if \(isMyClubRoute && !user\) return loginRedirect\(request, response\)/);
});

test("local My Club reaches the same customer-only identity gates as QA", () => {
  const proxy = source("proxy.ts");
  const routeClassification = proxy.indexOf('const isMyClubRoute = pathname === "/my-club";');
  const localPublicShortcut = proxy.indexOf("if (isLocalDev && !isMyClubRoute) return nextResponseWithPresentationLocale(request);");
  const identityLookup = proxy.indexOf("supabase.auth.getUser()");
  const anonymousGate = proxy.indexOf("if (isMyClubRoute && !user) return loginRedirect(request, response);");
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
  const owner = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");

  assert.match(market, /useState<"squad" \| "tactical">\("tactical"\)/);
  assert.match(market, /squadView === "tactical" \? <TouchlinePitchSurface/);
  assert.match(market, /className=\{styles\.squadBoard\}/);
  assert.match(market, /touchlineFantasySlotAcceptsPlayer\(activeSlot, player\)/);
  assert.match(market, /setFeedback\(pt \? "Este card não é elegível para a vaga selecionada/);
  assert.match(market, /replaceTouchlineFantasyPlayerAtSlot/);
  assert.match(market, /removeTouchlineFantasyPlayerFromSlot/);
  assert.match(owner, /club-owner-wallet/);
  assert.doesNotMatch(owner, /<TouchlineClubSocialFeed/);
});

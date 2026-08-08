import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveTouchlineClubOwnerRouteAccess } from "../lib/touchlineArena/club-owner-route-access.ts";
import { resolveTouchlineClubOwnerSelfNavigation } from "../lib/touchlineArena/club-owner-self-navigation.ts";

const ana = {
  id: "owner-ana",
  email: "ana@example.com",
  user_metadata: { full_name: "Ana Silva" },
};

const bruno = {
  id: "owner-bruno",
  email: "bruno@example.com",
  user_metadata: { full_name: "Bruno Costa" },
};

const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const quickNavSource = readFileSync(
  new URL("../components/touchline/TouchlineProfileQuickNav.tsx", import.meta.url),
  "utf8",
);
const profileRendererSource = readFileSync(
  new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url),
  "utf8",
);
const legacySubstitutionSource = readFileSync(
  new URL("../app/club-owner/luiz-lopez/substitution/page.tsx", import.meta.url),
  "utf8",
);

test("self navigation derives the authenticated ClubOwner only and never uses the public demo identity", () => {
  const signedOut = resolveTouchlineClubOwnerSelfNavigation({
    area: "history",
    locale: "pt-BR",
    user: null,
    isClubOwner: false,
  });
  assert.deepEqual(signedOut, {
    kind: "login",
    href: "/login?lang=pt-BR&returnTo=%2Fclub-owner%2Fme%2Fhistory%3Flang%3Dpt-BR",
  });

  assert.deepEqual(
    resolveTouchlineClubOwnerSelfNavigation({ area: "renewals", locale: "en-GB", user: ana, isClubOwner: true }),
    { kind: "owner", ownerSlug: "ana-silva", href: "/club-owner/ana-silva/renewals?lang=en-GB" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerSelfNavigation({ area: "substitution", locale: "pt-BR", user: bruno, isClubOwner: true }),
    { kind: "owner", ownerSlug: "bruno-costa", href: "/club-owner/bruno-costa/substitution?lang=pt-BR" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerSelfNavigation({ area: "profile", locale: "en-GB", user: ana, isClubOwner: false }),
    { kind: "denied", reason: "not-a-club-owner" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerSelfNavigation({
      area: "profile",
      locale: "en-GB",
      user: { id: "reserved", email: "me@example.com", user_metadata: { full_name: "Me" } },
      isClubOwner: true,
    }),
    { kind: "denied", reason: "invalid-owner-slug" },
  );
});

test("owner route access fails closed for a different ClubOwner and keeps public profile context separate", () => {
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/me/history",
      isAuthenticated: false,
    }),
    { action: "login", area: "history" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/me/history",
      isAuthenticated: true,
      ownerSlug: "ana-silva",
    }),
    { action: "allow", kind: "self" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/ana-silva/renewals",
      isAuthenticated: true,
      ownerSlug: "ana-silva",
    }),
    { action: "allow", kind: "own-private" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/bruno-costa/renewals",
      isAuthenticated: true,
      ownerSlug: "ana-silva",
    }),
    { action: "not-found" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/bruno-costa/substitution",
      isAuthenticated: true,
      ownerSlug: "ana-silva",
    }),
    { action: "not-found" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/bruno-costa",
      isAuthenticated: true,
      ownerSlug: "ana-silva",
    }),
    { action: "not-found" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/luiz-lopez",
      isAuthenticated: false,
    }),
    { action: "allow", kind: "public-profile" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/luiz-lopez/history",
      isAuthenticated: false,
    }),
    { action: "login", area: "history" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/luiz-lopez/substitution",
      isAuthenticated: true,
      ownerSlug: "bruno-costa",
    }),
    { action: "redirect-self", area: "substitution" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/me",
      isAuthenticated: true,
      ownerSlug: "me",
    }),
    { action: "not-found" },
  );
  assert.deepEqual(
    resolveTouchlineClubOwnerRouteAccess({
      pathname: "/club-owner/Ana-Silva/history",
      isAuthenticated: true,
      ownerSlug: "ana-silva",
    }),
    { action: "not-found" },
  );
});

test("all self route pages are server-resolved and legacy substitution no longer renders a public demo squad", () => {
  for (const path of [
    "../app/club-owner/me/page.tsx",
    "../app/club-owner/me/history/page.tsx",
    "../app/club-owner/me/renewals/page.tsx",
    "../app/club-owner/me/substitution/page.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /redirectTouchlineClubOwnerSelfRoute/);
    assert.doesNotMatch(source, /PUBLIC_CLUB_OWNER|luiz-lopez|params:\s*Promise/);
  }
  assert.match(legacySubstitutionSource, /redirectTouchlineClubOwnerSelfRoute\(\{ area: "substitution"/);
  assert.doesNotMatch(legacySubstitutionSource, /<ClubOwnerSubstitutionRenderer/);
});

test("private navigation is self-scoped and foreign public profiles cannot expose another owner's areas", () => {
  assert.match(quickNavSource, /canAccessPrivateClubOwnerAreas/);
  assert.match(quickNavSource, /touchlineClubOwnerSelfHref\(locale, "history"\)/);
  assert.match(quickNavSource, /touchlineClubOwnerSelfHref\(locale, "renewals"\)/);
  assert.match(quickNavSource, /touchlineClubOwnerSelfHref\(locale, "substitution"\)/);
  assert.doesNotMatch(quickNavSource, /touchlineClubOwnerHistoryHref\(locale, clubOwnerSlug\)/);
  assert.match(profileRendererSource, /<TouchlineGlobalNavigation[\s\S]*?currentRoute=\{ownerIdentity\.isAuthenticatedClubOwner \? "myClub" : "clubProfile"\}[\s\S]*?surface=\{ownerIdentity\.isAuthenticatedClubOwner \? "authenticated" : "public"\}/);
  assert.doesNotMatch(profileRendererSource, /TouchlineProfileQuickNav/);
});

test("proxy authorizes ClubOwner routes before streaming and returns a real safe 404", () => {
  assert.match(proxySource, /resolveTouchlineClubOwnerRouteAccess/);
  assert.match(proxySource, /clubOwnerLoginRedirect\(request, clubOwnerAccess\.area, response\)/);
  assert.match(proxySource, /clubOwnerSelfRedirect\(request, clubOwnerAccess\.area, response\)/);
  assert.match(proxySource, /clubOwnerNotFoundResponse\(request, response\)/);
  assert.match(proxySource, /status:\s*404/);
  assert.match(proxySource, /touchlineClubOwnerSlugForUser/);
  assert.doesNotMatch(proxySource, /TOUCHLINE_DEFAULT_CLUB_OWNER_SLUG/);
});

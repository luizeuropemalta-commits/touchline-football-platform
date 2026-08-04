import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const arenaUserSource = fs.readFileSync(new URL("../lib/server/arena-user.ts", import.meta.url), "utf8");
const arenaAccessSource = fs.readFileSync(new URL("../app/api/touchline-arena/access/route.ts", import.meta.url), "utf8");
const arenaAccessServiceSource = fs.readFileSync(new URL("../lib/server/touchline-arena-access.ts", import.meta.url), "utf8");
const authFormSource = fs.readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
const authLayoutSource = fs.readFileSync(new URL("../components/auth-layout.tsx", import.meta.url), "utf8");
const authI18nSource = fs.readFileSync(new URL("../lib/touchlineArena/auth-i18n.ts", import.meta.url), "utf8");
const authAccessSource = fs.readFileSync(new URL("../lib/touchlineArena/auth-access.ts", import.meta.url), "utf8");
const registerPageSource = fs.readFileSync(new URL("../app/(auth)/register/page.tsx", import.meta.url), "utf8");
const callbackSource = fs.readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
const proxySource = fs.readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const marketPageSource = fs.readFileSync(new URL("../app/market-transfer/page.tsx", import.meta.url), "utf8");
const arenaClientSource = fs.readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
const protectedArenaApiSources = [
  "../lib/touchlineArena/api-access.ts",
  "../app/api/touchline-arena/market/checkout/route.ts",
  "../app/api/touchline-arena/market/inventory/route.ts",
  "../app/api/touchline-arena/contracts/release/route.ts",
  "../app/api/touchline-arena/roster/route.ts",
  "../app/api/touchline-arena/state/route.ts",
  "../app/api/notifications/preferences/route.ts",
  "../app/api/touchline-analytics/route.ts",
  "../app/api/admin/cards/route.ts",
  "../app/api/admin/promotions/route.ts",
  "../app/api/admin/finance/export/route.ts",
  "../app/api/football-data/foundation/route.ts",
  "../app/api/football-data/sync-starter/route.ts",
  "../app/api/football-data/validate/route.ts",
].map((path) => ({ path, source: fs.readFileSync(new URL(path, import.meta.url), "utf8") }));

test("Arena registration guarantees only the public user profile", () => {
  assert.match(arenaUserSource, /\.from\("users"\)\.upsert\(profile/);
  assert.match(arenaUserSource, /onConflict:\s*"id"/);
  assert.match(arenaUserSource, /ignoreDuplicates:\s*true/);
  assert.doesNotMatch(arenaUserSource, /\.from\("agencies"\)/);
  assert.doesNotMatch(arenaUserSource, /ensureUserWorkspace/);
  assert.doesNotMatch(arenaUserSource, /agency_id\s*:/);
});

test("the Arena access endpoint no longer grants automatic TC or provisions legacy workspaces", () => {
  assert.match(arenaAccessSource, /ensureTouchlineArenaAccess\(user\)/);
  assert.match(arenaAccessServiceSource, /ensureArenaUserProfile\(user, admin\)/);
  assert.match(arenaAccessServiceSource, /amountTc:\s*0/);
  assert.doesNotMatch(arenaAccessServiceSource, /claim_touchline_beta_welcome_grant/);
  assert.doesNotMatch(arenaAccessServiceSource, /parseTouchlineBetaWelcomeGrant/);
  assert.doesNotMatch(arenaAccessServiceSource, /amountTc:\s*35/);
  assert.doesNotMatch(arenaAccessServiceSource, /ensureUserWorkspace/);
});

test("email confirmation and OAuth callback finish the same idempotent Arena access", () => {
  assert.match(callbackSource, /exchangeCodeForSession\(code\)/);
  assert.match(callbackSource, /ensureTouchlineArenaAccess\(data\.user\)/);
  assert.match(callbackSource, /const isPasswordRecovery = redirectType === "recovery"/);
  assert.match(callbackSource, /if \(isPasswordRecovery\)/);
  assert.ok(
    callbackSource.indexOf("exchangeCodeForSession(code)") <
      callbackSource.indexOf("ensureTouchlineArenaAccess(data.user)"),
  );
  assert.match(callbackSource, /Unable to finish Arena access/);
  assert.match(callbackSource, /await signOutFailedAuthentication\(supabase\)/);
});

test("the shared Arena access service excludes the platform owner before creating a ClubOwner profile", () => {
  assert.match(arenaAccessServiceSource, /isOwnerEmail\(user\.email\)/);
  assert.match(arenaAccessServiceSource, /register_touchline_platform_owner/);
  assert.match(arenaAccessServiceSource, /reason: "owner_admin"/);
  assert.ok(
    arenaAccessServiceSource.indexOf("isOwnerEmail(user.email)") <
      arenaAccessServiceSource.indexOf("ensureArenaUserProfile(user, admin)"),
  );
});

test("password login and immediate-session registration require Arena access before navigation", () => {
  assert.match(authFormSource, /async function finishTouchlineArenaAccess/);
  assert.match(authFormSource, /!response\.ok \|\| payload\?\.ok !== true/);
  assert.doesNotMatch(
    authFormSource,
    /await fetch\("\/api\/touchline-beta\/welcome", \{ method: "POST" \}\)\.catch/,
  );
  assert.match(authFormSource, /await fetch\("\/api\/touchline-arena\/access"/);

  const passwordLogin = authFormSource.slice(
    authFormSource.indexOf('if (mode === "login")'),
    authFormSource.indexOf('} else if (mode === "register")'),
  );
  assert.ok(passwordLogin.indexOf("await finishTouchlineArenaAccessOrSignOut(") < passwordLogin.indexOf("await enterArena(arenaHref)"));

  const registration = authFormSource.slice(
    authFormSource.indexOf('} else if (mode === "register")'),
    authFormSource.indexOf("} else {", authFormSource.indexOf('} else if (mode === "register")') + 1),
  );
  assert.match(registration, /if \(data\.session\)/);
  assert.ok(registration.indexOf("await finishTouchlineArenaAccessOrSignOut(") < registration.indexOf("await enterArena(firstEntryHref)"));
  assert.match(authFormSource, /const \{ error: signOutError \} = await supabase\.auth\.signOut/);
  assert.match(authFormSource, /if \(signOutError\) throw new Error/);
});

test("protected routes require the server-owned welcome completion predicate", () => {
  assert.match(authAccessSource, /TOUCHLINE_ARENA_ACCESS_METADATA_KEY/);
  assert.match(authAccessSource, /app_metadata\?\.\[TOUCHLINE_ARENA_ACCESS_METADATA_KEY\] === true/);
  assert.match(arenaAccessServiceSource, /admin\.auth\.admin\.updateUserById\(user\.id/);
  assert.match(arenaAccessServiceSource, /await markTouchLineArenaAccess\(user, admin\)/);
  assert.match(proxySource, /const hasArenaAccess = hasTouchLineArenaAccess\(user\)/);
  assert.match(proxySource, /if \(user && isProtectedArenaRoute && !hasArenaAccess\) return loginRedirect/);
  assert.match(proxySource, /if \(user && hasArenaAccess && isAuthEntry\)/);
  for (const api of protectedArenaApiSources) {
    assert.match(api.source, /hasTouchLineArenaAccess/, `${api.path} must enforce completed Arena access`);
  }
});

test("Market inventory authenticates before validating a requested team", () => {
  const marketInventorySource = protectedArenaApiSources.find(
    ({ path }) => path.endsWith("market/inventory/route.ts"),
  )?.source;
  assert.ok(marketInventorySource);
  assert.ok(
    marketInventorySource.indexOf("supabase.auth.getUser()") < marketInventorySource.indexOf("TEAM_ID_PATTERN.test(teamId)"),
    "an anonymous request must receive 401 before request-parameter validation",
  );
});

test("all authentication continuations stay inside the Arena", () => {
  assert.doesNotMatch(authFormSource, /next=\/settings/);
  assert.match(authFormSource, /resetPasswordForEmail\([\s\S]*buildTouchLineAuthCallbackUrl\(resetPasswordHref\)/);
  assert.match(authFormSource, /const arenaHref = touchLinePostAuthHref\(normalizedReturnTo, normalizedLocale\)/);
  assert.match(authFormSource, /normalizeTouchLineAuthReturnTo\(returnTo\)/);
  assert.match(authFormSource, /touchLineAuthHref\(touchlineClubOwnerBasePath\(\), normalizedLocale\)/);
  assert.match(authFormSource, /const resetPasswordHref = touchLineAuthHref\("\/reset-password", normalizedLocale\)/);
  assert.doesNotMatch(proxySource, /new URL\("\/dashboard"/);
  assert.match(proxySource, /touchLinePostAuthHref\(returnTo, lang\)/);
});

test("authentication presents only the current TouchLine Arena product", () => {
  assert.match(authI18nSource, /Build your squad, manage official player contracts/);
  assert.match(authI18nSource, /Market Transfer and live rankings/);
  assert.match(authI18nSource, /Create secure access for TouchLine Arena/);
  assert.doesNotMatch(authLayoutSource, /Agent, club and player profile tools/);
  assert.doesNotMatch(authLayoutSource, /Agents, clubs and profiles coming next/);
  assert.doesNotMatch(registerPageSource, /Professional modules come later/);
});

test("the proxy protects the Arena itself and its current operations without legacy billing gates", () => {
  assert.match(proxySource, /protectedArenaPaths\s*=\s*\["\/arena", "\/market-transfer", "\/admin", "\/notifications", "\/inbox", "\/football-search", "\/visual-qa"\]/);
  assert.match(proxySource, /adminOnlyArenaPaths\s*=\s*\["\/admin", "\/visual-qa"\]/);
  assert.match(proxySource, /if \(!user && isProtectedArenaRoute\) return loginRedirect\(request, response\)/);
  assert.match(proxySource, /if \(user && isAdminOnlyArenaRoute && !isAdmin\) return arenaRedirect\(request, response\)/);
  assert.match(proxySource, /loginUrl\.searchParams\.set\("returnTo"/);
  assert.match(proxySource, /sourceResponse\?\.cookies\.getAll\(\)/);
  assert.match(proxySource, /if \(isEmergencyOffline && user && !isAdmin && !isAuth\) return offlineResponse\(\)/);
  assert.doesNotMatch(proxySource, /isPublicArenaPreview/);
  assert.doesNotMatch(proxySource, /@\/lib\/billing\/plans/);
  assert.doesNotMatch(proxySource, /billing_subscriptions/);
  assert.doesNotMatch(proxySource, /featureForPath|canAccess|betaFullAccess/);
  assert.doesNotMatch(proxySource, /"\/dashboard"|"\/players"|"\/agencies"|"\/deals"|"\/scouting"/);
});

test("the standalone Market Transfer cannot lose its active panel during URL synchronization", () => {
  assert.match(marketPageSource, /standaloneMarket/);
  assert.match(marketPageSource, /initialPanel="market"/);
  assert.match(arenaClientSource, /const standaloneExperience = standaloneMarket \? "market" : standalonePanel \?\? null/);
  assert.match(arenaClientSource, /if \(standaloneExperience\) \{[\s\S]*setActiveArenaPanel\(standaloneExperience === "live" \? null : standaloneExperience\)/);
  assert.match(arenaClientSource, /\[initialPanel, standaloneExperience\]/);
  assert.match(arenaClientSource, /const isArenaFunctionalReady = Boolean\(standaloneExperience\) \|\| \(/);
});

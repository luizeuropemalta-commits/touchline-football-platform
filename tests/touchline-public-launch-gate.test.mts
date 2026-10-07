import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTouchlinePublicErrorCopy } from "../lib/touchlineArena/public-error-i18n.ts";

const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const arenaSource = readFileSync(new URL("../app/arena/page.tsx", import.meta.url), "utf8");
const comingSoonSource = readFileSync(new URL("../app/coming-soon/page.tsx", import.meta.url), "utf8");

test("the public root and retired pre-launch route both enter the canonical Arena", () => {
  assert.match(homeSource, /redirect\(`\/intro\?lang=\$\{encodeURIComponent\(locale\)\}`\)/);
  assert.match(comingSoonSource, /redirect\(`\/intro\?lang=\$\{encodeURIComponent\(locale\)\}`\)/);
  assert.doesNotMatch(homeSource, /TouchlinePublicLaunchGate|resolveTouchlinePublicLaunchGate|launchPreview/);
  assert.doesNotMatch(comingSoonSource, /TouchlinePublicLaunchGate|TouchlineComingSoonLanding|resolveTouchlinePublicLaunchGate|launchPreview/);
});

test("no middleware flag, branch or query can rewrite public product routes to pre-launch content", () => {
  assert.doesNotMatch(proxySource, /public-launch-gate|TOUCHLINE_PUBLIC_LAUNCH_GATE|launchPreview/);
  assert.doesNotMatch(proxySource, /touchlinePublicLaunchRewrite|x-touchline-launch-gate/);
  assert.doesNotMatch(proxySource, /new URL\("\/coming-soon"/);
});

test("anonymous visitors may enter the Arena while account-backed product operations stay protected", () => {
  assert.match(
    proxySource,
    /protectedArenaPaths\s*=\s*\["\/clubowner", "\/fantasy", "\/admin", "\/notifications", "\/inbox", "\/football-search", "\/visual-qa"\]/,
  );
  assert.doesNotMatch(proxySource, /protectedArenaPaths\s*=\s*\[[^\]]*"\/arena"/);
  assert.match(proxySource, /if \(!user && isProtectedArenaRoute\) return loginRedirect\(request, response, draftLocalesEnabled\)/);
  assert.match(proxySource, /if \(user && hasArenaAccess && isAuthEntry\)/);
  assert.match(arenaSource, /redirect\(`\/intro\?/);
  assert.doesNotMatch(arenaSource, /ArenaClient|createClient|loadTouchlineFantasy|qaEditor|qaReadOnly/);
});

test("the live public entry files contain no pre-launch admission copy", () => {
  const publicEntrySource = [homeSource, comingSoonSource, proxySource].join("\n");
  assert.doesNotMatch(
    publicEntrySource,
    /A ARENA ESTÁ QUASE PRONTA|THE ARENA IS ALMOST READY|LANÇAMENTO EM BREVE|LAUNCHING SOON|early registration|site is in testing|TouchLine Beta/i,
  );
  assert.match(proxySource, /getTouchlinePublicErrorCopy\(locale, draftLocalesEnabled\)\.offline/);
  assert.equal(getTouchlinePublicErrorCopy("pt-BR").offline.title, "TouchLine — Temporariamente indisponível");
  assert.equal(getTouchlinePublicErrorCopy("en-GB").offline.title, "TouchLine — Temporarily unavailable");
});

test("Admin and OWNER-only boundaries remain fail-closed", () => {
  assert.match(proxySource, /adminOnlyArenaPaths\s*=\s*\["\/admin", "\/visual-qa"\]/);
  assert.match(proxySource, /if \(user && isAdminOnlyArenaRoute && !isAdmin\) return introRedirect/);
  assert.match(proxySource, /isOwnerEmail\(user\?\.email\)/);
});

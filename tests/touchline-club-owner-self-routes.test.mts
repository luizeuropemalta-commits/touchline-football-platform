import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const legacyMarketSource = readFileSync(
  new URL("../app/market-transfer/page.tsx", import.meta.url),
  "utf8",
);

test("Market discards unused contract context and keeps the authenticated customer destination", () => {
  assert.match(legacyMarketSource, /const destination = `\/market-transfer\?lang=/);
  assert.match(legacyMarketSource, /if \(!user\) redirect\(touchLineAuthEntryHref\("\/login", locale, destination\)\)/);
  assert.doesNotMatch(legacyMarketSource, /contractPlayer|contractName|contractClub/);
});

test("proxy retains My Club's real safe 404 without resolving retired owner identities", () => {
  assert.doesNotMatch(proxySource, /resolveTouchlineClubOwnerRouteAccess|touchlineClubOwnerSlugForUser/);
  assert.match(proxySource, /if \(isRetiredClubOwnerRoute\) return retiredClubOwnerRedirect\(request\)/);
  assert.match(proxySource, /if \(isMyClubRoute && isAdmin\) return clubOwnerNotFoundResponse\(request, response\)/);
  assert.match(proxySource, /clubOwnerNotFoundResponse\(request, response\)/);
  assert.match(proxySource, /status:\s*404/);
  assert.doesNotMatch(proxySource, /TOUCHLINE_DEFAULT_CLUB_OWNER_SLUG/);
});

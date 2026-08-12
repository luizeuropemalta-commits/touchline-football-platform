import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixture = readFileSync(
  new URL("../app/visual-qa/twenty-club-card-gallery/page.tsx", import.meta.url),
  "utf8",
);
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

test("the twenty-club gallery is static, protected and covers all canonical clubs", () => {
  assert.match(proxy, /protectedArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(proxy, /adminOnlyArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(fixture, /data-twenty-club-card-gallery="static"/);
  assert.match(fixture, /TOUCHLINE_ENGLAND_CLUBS\.map/);
  assert.match(fixture, /TOUCHLINE_CARD_TIER_KEYS/);
  assert.match(fixture, /cardPrice: \{ amountMinor: nominalPriceGbp \* 100, currency: "GBP" \}/);
  assert.match(fixture, /ADMIN-GATED · STATIC LOCAL VISUAL QA/);
  assert.match(fixture, /robots: \{ index: false, follow: false \}/);
  assert.match(fixture, /resolveTouchlineVisualQaLocale/);
});

test("the gallery cannot access or mutate runtime data", () => {
  for (const forbidden of [
    /\bfetch\s*\(/,
    /\/api\//,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bcreateClient\b/,
    /\bcreateAdminClient\b/,
    /\bprocess\.env\b/,
    /\bSPORTMONKS\b/,
    /\bSupabase\b/,
    /\bonLayoutChange\b/,
  ]) assert.doesNotMatch(fixture, forbidden);

  for (const required of [
    "persistLayoutToMaster={false}",
    "ignoreStoredLayout={true}",
    "subscribeToRanking={false}",
    "enableInteractiveNeon={false}",
    "showCardActions={false}",
    "showProfileAction={false}",
    "showSocialMetrics={false}",
    'rankingMode="preview"',
  ]) assert.ok(fixture.includes(required), `missing static safety prop: ${required}`);
});

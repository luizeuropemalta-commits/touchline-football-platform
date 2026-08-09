import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixtureSource = readFileSync(
  new URL("../app/visual-qa/card-neon-trace/page.tsx", import.meta.url),
  "utf8",
);
const proxySource = readFileSync(
  new URL("../proxy.ts", import.meta.url),
  "utf8",
);

test("the card perimeter-trace fixture is static, local and admin-gated", () => {
  assert.match(proxySource, /protectedArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(proxySource, /adminOnlyArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(fixtureSource, /data-card-neon-trace-fixture="static"/);
  assert.match(fixtureSource, /ADMIN-GATED · STATIC LOCAL VISUAL QA/);
  assert.match(fixtureSource, /robots: \{ index: false, follow: false \}/);
});

test("the fixture exercises both shared card implementations with canonical local tokens", () => {
  assert.match(fixtureSource, /import TouchlineCoachCard/);
  assert.match(fixtureSource, /import TouchlineEliteExactCard/);
  assert.match(fixtureSource, /findTouchLineClub\("manchester-city"\)/);
  assert.match(fixtureSource, /cardTier: "radiant-gold"/);
  assert.match(fixtureSource, /marketValue: "€20M"/);
  assert.match(fixtureSource, /marketValueState: "verified"/);
  assert.match(fixtureSource, /classificationState: "verified"/);
  assert.match(fixtureSource, /clubAccent=\{club\.accent\}/);
  assert.match(fixtureSource, /layoutOverride=\{TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT\}/);
  assert.match(fixtureSource, /completes one calm loop[\s\S]*?restarts automatically/);
  assert.doesNotMatch(fixtureSource, /forceNeonActive/);
});

test("the fixture cannot read or mutate runtime data", () => {
  for (const forbidden of [
    /\bfetch\s*\(/,
    /\/api\//,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bwindow\./,
    /\bdocument\./,
    /\bcreateClient\b/,
    /\bcreateAdminClient\b/,
    /\bprocess\.env\b/,
    /\bSPORTMONKS\b/,
    /\bSupabase\b/,
    /\bonLayoutChange\b/,
    /\beditable\b/,
  ]) {
    assert.doesNotMatch(fixtureSource, forbidden);
  }

  for (const required of [
    "persistLayoutToMaster={false}",
    "ignoreStoredLayout={true}",
    "subscribeToRanking={false}",
    "enableInteractiveNeon={false}",
    "showCardActions={false}",
    "showProfileAction={false}",
    "showSocialMetrics={false}",
    "rankingMode=\"preview\"",
  ]) {
    assert.ok(fixtureSource.includes(required), `missing static safety prop: ${required}`);
  }
});

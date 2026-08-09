import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixtureSource = readFileSync(
  new URL("../app/visual-qa/card-value-states/page.tsx", import.meta.url),
  "utf8",
);
const proxySource = readFileSync(
  new URL("../proxy.ts", import.meta.url),
  "utf8",
);

test("the card value-state fixture is an admin-gated static route", () => {
  assert.match(proxySource, /protectedArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(proxySource, /adminOnlyArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(fixtureSource, /data-card-value-states-fixture="static"/);
  assert.match(fixtureSource, /data-visual-qa-locale=\{locale\}/);
  assert.match(fixtureSource, /resolveTouchlineVisualQaLocale/);
  assert.match(fixtureSource, /ADMIN-GATED · STATIC LOCAL VISUAL QA/);
});

test("the fixture supplies exactly the three canonical value-state cases", () => {
  const fixtureIds = [...fixtureSource.matchAll(/\n  \{\n    id: "(verified|pending|active-contract)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(fixtureIds, ["verified", "pending", "active-contract"]);
  assert.match(fixtureSource, /data-card-fixture=\{fixture\.id\}/);

  assert.match(fixtureSource, /marketValue: "€20M"/);
  assert.match(fixtureSource, /marketValueSource: "verified-cache"/);
  assert.match(fixtureSource, /marketValueState: "verified"/);
  assert.match(fixtureSource, /classificationState: "verified"/);
  assert.match(fixtureSource, /cardTier: "radiant-gold"/);

  assert.match(fixtureSource, /marketValue: null/);
  assert.match(fixtureSource, /marketValueSource: "unavailable"/);
  assert.match(fixtureSource, /marketValueState: "pending"/);
  assert.match(fixtureSource, /classificationState: "pending"/);
  assert.match(fixtureSource, /cardTier: null/);

  assert.match(fixtureSource, /cardTier: "emerald-green"/);
  assert.match(fixtureSource, /cardPriceAuthority: "active-contract"/);
  assert.match(fixtureSource, /cardPriceVersion: "2026-07-premier-v1"/);

  // Keep the static shirt identifiers short enough for the fixed artwork's
  // mobile nameplate; semantic fixture labels above carry the longer context.
  for (const shirtName of ["VERIFIED", "PENDING", "ACTIVE"]) {
    assert.match(fixtureSource, new RegExp(`name: "${shirtName}"`));
  }
  assert.doesNotMatch(fixtureSource, /STATIC (VERIFIED|PENDING|ACTIVE CONTRACT) FIXTURE/);
});

test("the fixture disables card interactivity, persistence and data subscriptions", () => {
  for (const prop of [
    "isEditable={false}",
    "persistLayoutToMaster={false}",
    "ignoreStoredLayout={true}",
    "startUnlocked={false}",
    "isRemovalMarkerEnabled={false}",
    "subscribeToRanking={false}",
    "enableInteractiveNeon={false}",
    "showCardActions={false}",
    "showProfileAction={false}",
    "showMatchPoints={false}",
    "showSocialMetrics={false}",
    "forceNeonActive={false}",
    'rankingMode="preview"',
    "runtimeLocaleOverride={locale}",
  ]) {
    assert.ok(fixtureSource.includes(prop), `missing disabled fixture prop: ${prop}`);
  }

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
    /\blayoutStorageKey\b/,
    /\bmarkerStorageKey\b/,
    /\bplayerProfileHref\b/,
    /\bonShare\b/,
    /<button\b/,
    /<a\b/,
  ]) {
    assert.doesNotMatch(fixtureSource, forbidden);
  }
});

test("the fixture supports only the reviewed EN/PT visual QA locales", () => {
  assert.match(fixtureSource, /VERIFICADO · €20M/);
  assert.match(fixtureSource, /PENDENTE · SEM VALOR/);
  assert.match(fixtureSource, /Estados canônicos de valor do card/);
  assert.match(fixtureSource, /searchParams: Promise<Readonly<\{ lang\?: string \}>>/);
});

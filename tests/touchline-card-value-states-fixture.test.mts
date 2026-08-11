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

test("the fixture supplies exactly the three editorial publication cases", () => {
  const fixtureIds = [...fixtureSource.matchAll(/\n  \{\n    id: "(published|review|draft)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(fixtureIds, ["published", "review", "draft"]);
  assert.match(fixtureSource, /data-card-fixture=\{fixture\.id\}/);
  assert.match(fixtureSource, /data-editorial-state=\{fixture\.editorialState\}/);

  assert.match(fixtureSource, /editorialState: "published"/);
  assert.match(fixtureSource, /editorialState: "review"/);
  assert.match(fixtureSource, /editorialState: "draft"/);
  assert.match(fixtureSource, /editorialCard: \{[\s\S]*?tierKey: "radiant-gold"/);
  assert.match(fixtureSource, /cardPrice: \{ amountMinor: 1500, currency: "GBP" \}/);
  assert.match(fixtureSource, /lastReviewedAt: "2026-08-10T09:00:00Z"/);

  // Review and draft carry no public editorial profile. The component receives
  // only neutral compatibility values and cannot display a hidden price/tier.
  assert.equal((fixtureSource.match(/editorialCard: \{/g) ?? []).length, 1);
  assert.equal((fixtureSource.match(/marketValue: null/g) ?? []).length, 3);
  assert.equal((fixtureSource.match(/cardTier: null/g) ?? []).length, 3);

  // Keep the static shirt identifiers short enough for the fixed artwork's
  // mobile nameplate; semantic fixture labels above carry the longer context.
  for (const shirtName of ["PUBLISHED", "REVIEW", "DRAFT"]) {
    assert.match(fixtureSource, new RegExp(`name: "${shirtName}"`));
  }
  assert.doesNotMatch(fixtureSource, /cardPriceAuthority:/);
  assert.doesNotMatch(fixtureSource, /active-contract/);
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
  assert.match(fixtureSource, /PUBLICADO · PERFIL MANUAL/);
  assert.match(fixtureSource, /EM REVISÃO · NÃO PÚBLICO/);
  assert.match(fixtureSource, /Estados editoriais do card/);
  assert.match(fixtureSource, /searchParams: Promise<Readonly<\{ lang\?: string \}>>/);
});

test("the fixture contains no public valuation vocabulary, placeholders or euro valuation", () => {
  for (const forbidden of [
    /market\s+value/i,
    /valor\s+de\s+mercado/i,
    /\bpending\b/i,
    /\bpendente\b/i,
    /\bupdating\b/i,
    /\batualizando\b/i,
    /€/,
    /currency: "EUR"/,
  ]) {
    assert.doesNotMatch(fixtureSource, forbidden);
  }
});

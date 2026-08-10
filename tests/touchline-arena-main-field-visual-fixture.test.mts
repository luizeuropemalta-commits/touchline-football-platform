import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixtureSource = readFileSync(
  new URL("../app/visual-qa/arena-main-field/page.tsx", import.meta.url),
  "utf8",
);
const fixtureStyles = readFileSync(
  new URL("../app/visual-qa/arena-main-field/arena-main-field.module.css", import.meta.url),
  "utf8",
);
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

test("the static Arena main-field fixture is admin-gated and supports the EN/PT viewport matrix", () => {
  assert.match(proxySource, /protectedArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(proxySource, /adminOnlyArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(fixtureSource, /data-arena-main-field-fixture="static"/);
  assert.match(fixtureSource, /robots: \{ index: false, follow: false \}/);
  assert.match(fixtureSource, /resolveTouchlineVisualQaLocale/);
  assert.match(fixtureSource, /data-visual-qa-locale=\{locale\}/);
  assert.match(fixtureSource, /value === "390" \|\| value === "768" \|\| value === "1280"/);
  assert.match(fixtureSource, /viewport=\$\{frameViewport\}&lang=\$\{locale\}/);
  assert.match(fixtureSource, /style=\{\{ width: Number\(frameViewport\), height: Number\(height\) \}\}/);
  assert.match(fixtureSource, /Campo principal da Arena · contrato visual/);
  assert.match(fixtureSource, /Arena main field · visual contract/);
});

test("the fixture shows exactly a static 4-3-3, technical coach, and premium score rail without a date", () => {
  assert.match(fixtureSource, /const STATIC_FIELD_SLOTS = \[/);
  assert.equal((fixtureSource.match(/\{ id: "/g) ?? []).length, 11);
  assert.match(fixtureSource, /<TouchlinePitchSurface/);
  assert.match(fixtureSource, /STATIC_FIELD_SLOTS\.map/);
  assert.match(fixtureSource, /<TouchlineCoachCard/);
  assert.match(fixtureSource, /data-static-arena-score="live"/);
  assert.match(fixtureSource, /data-static-arena-score="final"/);
  assert.match(fixtureSource, /LIVE · 63′/);
  assert.match(fixtureSource, /FT/);
  assert.match(fixtureSource, /sem data nesta superfície/);
  assert.doesNotMatch(fixtureSource, /formatFixtureDateTime|<time\b|startsAt|kickoff/i);
});

test("the fixture isolates every rendered card and cannot read, save, or drag runtime state", () => {
  for (const required of [
    "persistLayoutToMaster={false}",
    "ignoreStoredLayout={true}",
    "subscribeToRanking={false}",
    "enableInteractiveNeon={false}",
    "showCardActions={false}",
    "showProfileAction={false}",
    "showSocialMetrics={false}",
    "rankingMode=\"preview\"",
    "layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}",
  ]) {
    assert.ok(fixtureSource.includes(required), `missing static isolation prop: ${required}`);
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
    /\bprocess\.env\b/,
    /SPORTMONKS_API|createFootballDataProvider|Supabase|onPointer(?:Down|Move|Up)|onDrag/i,
  ]) {
    assert.doesNotMatch(fixtureSource, forbidden);
  }

  assert.match(fixtureStyles, /\.fieldPlayer:focus-visible/);
  assert.match(fixtureStyles, /text-overflow:\s*clip/);
  assert.doesNotMatch(fixtureStyles, /text-overflow:\s*ellipsis/i);
  assert.doesNotMatch(fixtureStyles, /touch-action\s*:\s*none/);
  assert.match(fixtureStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

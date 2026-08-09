import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixtureSource = readFileSync(
  new URL("../app/visual-qa/club-owner-portrait-neon/page.tsx", import.meta.url),
  "utf8",
);
const proxySource = readFileSync(
  new URL("../proxy.ts", import.meta.url),
  "utf8",
);

test("the Club Owner portrait trace fixture is static and admin-gated", () => {
  assert.match(proxySource, /protectedArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(proxySource, /adminOnlyArenaPaths = \[[\s\S]*?"\/visual-qa"/);
  assert.match(fixtureSource, /data-club-owner-portrait-neon-fixture="static"/);
  assert.match(fixtureSource, /ADMIN-GATED · STATIC LOCAL VISUAL QA/);
  assert.match(fixtureSource, /robots: \{ index: false, follow: false \}/);
  assert.match(fixtureSource, /clubOwnerPortraitTrace/);
  assert.match(fixtureSource, /portraitTraceActive/);
  assert.match(fixtureSource, /accent=\{TOUCHLINE_LOGO_GREEN\}/);
  assert.match(fixtureSource, /\/touchlineArena\/club-owner\/avatars\/luiz-lopez-owner-avatar-v1\.png/);
});

test("the Club Owner portrait trace fixture cannot read or mutate runtime state", () => {
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
    /\bownerIdentity\b/,
    /\bmarketValue\b/,
    /\bcontract\b/i,
  ]) {
    assert.doesNotMatch(fixtureSource, forbidden);
  }
});

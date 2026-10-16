import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const loader = readFileSync(new URL("../lib/touchlineArena/card-editorial-overrides.ts", import.meta.url), "utf8");

test("profile loads country presentation by canonical UUID and only approved overrides", () => {
  assert.match(page, /loadTouchlineCardEditorialOverrides\(canonicalPlayerId \? \[canonicalPlayerId\] : \[\]\)/);
  assert.match(loader, /row\.status !== "approved"/);
  assert.match(page, /editorialOverrides\.get\(canonicalPlayerId\.toLowerCase\(\)\)\?\.countryCode3/);
});

test("approved country reaches all ExactCards and flag, while raw nationality remains provider-backed", () => {
  assert.match(page, /approvedCountryCode3 !== "N\/A"\s*\? approvedCountryCode3\s*: officialCountryCode3/);
  assert.match(page, /exactPlayer\.countryCode3 = profileCountryCode3/);
  assert.match(page, /profileFlagUrl = touchlineCountryFlagUrl\(profileCountryCode3\)/);
  assert.match(page, /displayNationality = localizedCountryLabel\(canonicalIdentity\?\.nationality/);
  assert.doesNotMatch(page, /canonicalIdentity\.nationality\s*=/);
});

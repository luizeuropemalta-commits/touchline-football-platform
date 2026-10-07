import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { getTouchlinePlayerPerformanceCopy } from "../lib/touchlineArena/player-performance-i18n.ts";

const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const expression = source.match(/<p className=\{styles\.biography\}>\s*\{([\s\S]*?)\}\s*<\/p>/)?.[1];
assert.ok(expression);
function render(overrides = {}) {
  return runInNewContext(expression!, {
    canonicalIdentity: null,
    officialLookup: { providerPlayerId: "31504" },
    official: { player: null },
    card: { name: "Untrusted fallback" },
    displayNationality: "Germany",
    displayPosition: "Central midfield",
    localizedCountryLabel: (value: unknown) => value,
    localizedPositionLabel: (value: unknown) => value,
    locale: "en-GB",
    draftLocalesEnabled: false,
    performanceCopy: getTouchlinePlayerPerformanceCopy("en-GB"),
    text: { syncPending: "Season sync pending", identityPending: "Verified identity unavailable" },
    ...overrides,
  });
}
test("canonical biography survives an unavailable independent provider lookup", () => {
  assert.equal(render({ canonicalIdentity: { displayName: "Pascal Groß", name: "Pascal Groß", nationality: "Germany", position: "Central midfield" } }), "Pascal Groß · Germany · Central midfield");
});
test("missing canonical fields are omitted rather than replaced by card defaults", () => {
  assert.equal(render({ canonicalIdentity: { name: "Pascal Groß", nationality: null, position: null } }), "Pascal Groß");
});
test("numeric profiles without canonical identity cannot borrow legacy identity or claim season sync failure", () => {
  assert.equal(render({ official: { player: { displayName: "Other player" } } }), "Verified player identity is currently unavailable.");
  assert.equal(render(), "Verified player identity is currently unavailable.");
});
test("non-numeric legacy profiles retain their permitted identity summary", () => {
  assert.equal(render({ officialLookup: { providerPlayerId: null }, official: { player: { displayName: "Legacy player" } } }), "Legacy player · Germany · Central midfield");
});

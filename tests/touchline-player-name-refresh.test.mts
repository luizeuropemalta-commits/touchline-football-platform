import assert from "node:assert/strict";
import test from "node:test";
import { resolveTouchlineRefreshedPlayerNames } from "../lib/touchlineArena/player-identity.ts";

const saved = { providerId: "123", name: "Pascal Gross", shortName: "Gross", playerName: "Pascal Gross" };
const current = { providerId: "123", name: "Pascal Groß", shortName: "Groß" };
test("same player ID refreshes all Arena display names together without mutating saved state", () => {
  const before = JSON.stringify(saved);
  assert.deepEqual(resolveTouchlineRefreshedPlayerNames(saved, current), { name: "Pascal Groß", shortName: "Groß", playerName: "Pascal Groß" });
  assert.equal(JSON.stringify(saved), before);
});
test("name-only matches, conflicting IDs and blank fresh names cannot replace identity", () => {
  const expected = { name: saved.name, shortName: saved.shortName, playerName: saved.playerName };
  for (const candidate of [{ ...current, providerId: undefined }, { ...current, providerId: "999" }, { ...current, name: " " }]) {
    assert.deepEqual(resolveTouchlineRefreshedPlayerNames(saved, candidate), expected);
  }
  assert.deepEqual(resolveTouchlineRefreshedPlayerNames({ ...saved, canonicalPlayerId: "one" }, { ...current, canonicalPlayerId: "two" }), expected);
});
test("canonical identity can refresh presentation even without a legacy builder provider ID", () => {
  assert.equal(resolveTouchlineRefreshedPlayerNames({ ...saved, providerId: null, canonicalPlayerId: "same" }, { ...current, canonicalPlayerId: "same" }).name, current.name);
});

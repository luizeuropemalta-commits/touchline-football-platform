import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { socialLineupLiveEditorial } from "../lib/touchlineArena/social-lineup-live-editorial.ts";
const reference = JSON.parse(readFileSync(new URL("../artifacts/social-studio/lineup/render-reference-20260914.json", import.meta.url), "utf8"));
const clubs = { club: { teamId: "236", name: "Brentford" }, home: { teamId: "52", name: "AFC Bournemouth" }, away: { teamId: "236", name: "Brentford" } };
const now = Date.parse("2026-09-14T22:00:00Z");
test("lineup captions remain retrospective, factual and disclose disputed shape", () => {
  const value = socialLineupLiveEditorial(reference, clubs, now);
  for (const caption of Object.values(value.captions)) {
    assert.match(caption, /Relembre os 11 titulares e os 9 reservas/);
    assert.match(caption, /2 x 2 Brentford · 12\/09\/2026/);
    assert.match(caption, /4-2-3-1.*4-3-3/);
    assert.match(caption, /Monte seu XI na TouchLine/);
    assert.doesNotMatch(caption, /https?:|escalação de hoje/i);
  }
  assert.equal(value.dispatch.enabled, false);
  assert.equal(value.dispatch.suggestedAt, null);
  assert.equal(value.dispatch.providerPublishedAt, null);
  assert.equal(value.dispatch.destinations.length, 4);
  assert.deepEqual(value.dispatch.internal.providerTeamIds, ["236"]);
});
test("lineup copy rejects the wrong club and expired proof", () => {
  assert.throws(() => socialLineupLiveEditorial(reference, { ...clubs, club: clubs.home }, now), /SOURCE_INVALID/);
  assert.throws(() => socialLineupLiveEditorial(reference, clubs, Date.parse(reference.validUntil)), /SOURCE_INVALID/);
});

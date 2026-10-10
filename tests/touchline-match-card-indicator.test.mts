import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalSportmonksPlayerId, cardShownForCanonicalPlayer, cardShownForFixturePlayer } from "../lib/touchlineArena/match-card-indicator.ts";
import type { TouchlineFantasyEvent } from "../lib/football-data/types.ts";

const event = (id: string, type: string, overrides: Partial<TouchlineFantasyEvent> = {}): TouchlineFantasyEvent => ({
  id: `sportmonks:${id}`, providerId: id, provider: "sportmonks", fixtureId: "100", playerId: "42",
  type, status: "recorded", ...overrides,
});

test("one normal match yellow card is shown without using season suspension art", () => {
  assert.deepEqual(cardShownForFixturePlayer([event("1", "Yellowcard")], "100", "42"), { kind: "yellow", eventId: "1" });
});

test("the exact recorded red or second-yellow event takes precedence over yellow", () => {
  assert.deepEqual(cardShownForFixturePlayer([
    event("1", "Yellow Card"), event("2", "Yellowredcard"),
  ], "100", "42"), { kind: "red", eventId: "2" });
});

test("wrong fixture, player, provider, rescinded, unknown and tentative events cannot draw a card", () => {
  const invalid = [
    event("1", "Yellowcard", { fixtureId: "101" }),
    event("2", "Redcard", { playerId: "43" }),
    event("3", "Yellowcard", { provider: "api-football" }),
    event("4", "Redcard", { status: "rescinded" }),
    event("5", "Yellowcard", { status: undefined }),
    event("6", "Goal"),
    event("7", "Yellowcard", { info: "VAR review" }),
  ];
  assert.equal(cardShownForFixturePlayer(invalid, "100", "42"), null);
  assert.equal(cardShownForFixturePlayer([event("1", "Yellowcard")], "", "42"), null);
  assert.equal(cardShownForFixturePlayer([event("1", "Yellowcard")], "100", ""), null);
});

test("rescinded duplicate of the same provider event cancels its earlier recorded version", () => {
  assert.equal(cardShownForFixturePlayer([
    event("1", "Yellowcard"), event("1", "Yellowcard", { status: "rescinded" }),
  ], "100", "42"), null);
});

test("explicit cancellation word forms in either text field suppress recorded cards", () => {
  for (const word of ["overturned", "rescinded", "cancelled", "canceled", "disallowed"]) {
    for (const field of ["info", "addition"] as const) {
      assert.equal(cardShownForFixturePlayer([event("1", "Redcard", { [field]: `Card ${word}.` })], "100", "42"), null, `${field}: ${word}`);
    }
  }
  // Whole-word matching must not mistake an unrelated prefix or a completed
  // review with an explicitly upheld card for a cancellation.
  for (const info of ["Professional foul", "Previewed incident", "Reviewed and upheld"]) {
    assert.deepEqual(cardShownForFixturePlayer([event("1", "Yellowcard", { info })], "100", "42"), { kind: "yellow", eventId: "1" });
  }
});

test("a rescission outside the exact provider fixture and player cannot cancel a valid card", () => {
  assert.deepEqual(cardShownForFixturePlayer([
    event("1", "Yellowcard"), event("1", "Yellowcard", { status: "rescinded", fixtureId: "101" }),
    event("1", "Yellowcard", { status: "rescinded", playerId: "43" }),
    event("1", "Yellowcard", { status: "rescinded", provider: "api-football" }),
  ], "100", "42"), { kind: "yellow", eventId: "1" });
});

test("canonical selection resolves only its exact Sportmonks player and fixture", () => {
  const card = { id: "10000000-0000-4000-8000-000000000001", canonicalPlayerId: "10000000-0000-4000-8000-000000000001", providerPlayerId: "42" };
  const feed = { provider: "sportmonks", providerFixtureId: "100", events: [event("8", "Yellowcard")] };
  assert.deepEqual(cardShownForCanonicalPlayer(feed, card.id, card), { kind: "yellow", eventId: "8" });
  assert.equal(cardShownForCanonicalPlayer(feed, "10000000-0000-4000-8000-000000000002", card), null);
  assert.equal(cardShownForCanonicalPlayer(feed, card.id, { ...card, canonicalPlayerId: null }), null);
  assert.equal(cardShownForCanonicalPlayer(feed, card.id, { ...card, providerPlayerId: null }), null);
  assert.equal(cardShownForCanonicalPlayer({ ...feed, providerFixtureId: "101" }, card.id, card), null);
  assert.equal(cardShownForCanonicalPlayer({ ...feed, provider: "unknown" }, card.id, card), null);
  assert.equal(cardShownForCanonicalPlayer(null, card.id, card), null);
});

test("published catalogue gets a provider ID only from the same canonical Sportmonks row", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  assert.equal(canonicalSportmonksPlayerId({ id, provider: "sportmonks", provider_player_id: "42" }, id), "42");
  assert.equal(canonicalSportmonksPlayerId({ id, provider: "other", provider_player_id: "42" }, id), null);
  assert.equal(canonicalSportmonksPlayerId({ id, provider: "sportmonks", provider_player_id: "42" }, "10000000-0000-4000-8000-000000000002"), null);
  assert.equal(canonicalSportmonksPlayerId({ id, provider: "sportmonks", provider_player_id: "0" }, id), null);
});

test("Fantasy catalogue reads the provider identity and uses the guarded bridge", () => {
  const source = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8");
  assert.match(source, /\.select\("id,provider,provider_player_id,display_name/);
  assert.match(source, /providerPlayerId: canonicalSportmonksPlayerId\(player, playerId\)/);
});

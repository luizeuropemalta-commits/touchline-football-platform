import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  FootballDataProvider,
  FootballDataResult,
  TouchlinePlayer,
} from "../lib/football-data/types.ts";
import { resolveTouchLineProviderPlayer } from "../lib/touchlineArena/player-provider-resolution.ts";
import { resolveTouchLineOfficialLookup } from "../lib/touchlineArena/player-links.ts";

function player(providerId: string, name: string): TouchlinePlayer {
  return {
    id: `sportmonks:${providerId}`,
    providerId,
    provider: "sportmonks",
    name,
    displayName: name,
    source: { provider: "sportmonks", providerId },
  };
}

function ok<T>(data: T): FootballDataResult<T> {
  return { ok: true, data, provider: "sportmonks", fetchedAt: "2026-07-21T00:00:00.000Z" };
}

function provider(input: {
  byId?: TouchlinePlayer | null;
  search?: TouchlinePlayer[];
}) {
  return {
    async getPlayerById() {
      return ok(input.byId ?? null);
    },
    async searchPlayers() {
      return ok(input.search ?? []);
    },
  } satisfies Pick<FootballDataProvider, "getPlayerById" | "searchPlayers">;
}

describe("TouchLine official player resolution", () => {
  it("uses the verified squad name for provider lookup while preserving card aliases", () => {
    assert.deepEqual(
      resolveTouchLineOfficialLookup({
        providerPlayerId: "129820",
        requestedName: "Alisson",
        fallbackName: "Alisson Becker",
      }),
      { providerPlayerId: "129820", name: "Alisson" },
    );
  });

  it("ignores an unverified query name when no numeric provider id exists", () => {
    assert.deepEqual(
      resolveTouchLineOfficialLookup({
        providerPlayerId: "invalid",
        requestedName: "Different Player",
        fallbackName: "Alisson Becker",
      }),
      { providerPlayerId: null, name: "Alisson Becker" },
    );
  });

  it("accepts a verified id only when it belongs to the expected athlete", async () => {
    const expected = player("100", "Erling Haaland");
    const resolved = await resolveTouchLineProviderPlayer(
      provider({ byId: expected }),
      { name: "Erling Haaland", candidateId: "sportmonks:100" },
    );
    assert.equal(resolved?.providerId, "100");
  });

  it("does not replace the numeric identity with another athlete named in the URL", async () => {
    const resolved = await resolveTouchLineProviderPlayer(
      provider({
        byId: player("999", "Different Player"),
        search: [player("100", "Erling Haaland")],
      }),
      { name: "Erling Haaland", candidateId: "999" },
    );
    assert.equal(resolved?.providerId, "999");
  });

  it("accepts official spelling changes without searching for another identity", async () => {
    const resolved = await resolveTouchLineProviderPlayer({
      async getPlayerById(id) { assert.equal(id, "100"); return ok(player("100", "Pascal Groß")); },
      async searchPlayers() { assert.fail("numeric identity must not fall back to a name search"); },
    }, { candidateId: "100", name: "PASCAL GROSS" });
    assert.equal(resolved?.displayName, "Pascal Groß");
  });

  it("rejects a mismatched provider response even when the name matches", async () => {
    const resolved = await resolveTouchLineProviderPlayer({
      async getPlayerById() { return ok(player("200", "Alex Smith")); },
      async searchPlayers() { assert.fail("identity mismatch must remain unavailable"); },
    }, { candidateId: "100", name: "Alex Smith" });
    assert.equal(resolved, null);
  });

  it("does not substitute name search results when the requested identity is missing", async () => {
    const resolved = await resolveTouchLineProviderPlayer({
      async getPlayerById() { return ok(null); },
      async searchPlayers() { assert.fail("missing identity must remain unavailable"); },
    }, { candidateId: "100", name: "Alex Smith" });
    assert.equal(resolved, null);
  });

  it("does not guess when an exact name is ambiguous", async () => {
    const resolved = await resolveTouchLineProviderPlayer(
      provider({
        search: [player("100", "Alex Smith"), player("101", "Alex Smith")],
      }),
      { name: "Alex Smith", candidateId: "invalid" },
    );
    assert.equal(resolved, null);
  });
});

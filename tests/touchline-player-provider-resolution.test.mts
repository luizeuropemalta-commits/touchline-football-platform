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

  it("falls back to one exact name when a stale id points to another player", async () => {
    const resolved = await resolveTouchLineProviderPlayer(
      provider({
        byId: player("999", "Different Player"),
        search: [player("100", "Erling Haaland")],
      }),
      { name: "Erling Haaland", candidateId: "999" },
    );
    assert.equal(resolved?.providerId, "100");
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

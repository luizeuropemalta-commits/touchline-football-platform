import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { touchlinePlayerIdentityMatches } from "../lib/touchlineArena/player-identity.ts";

describe("TouchLine player identity", () => {
  it("recognizes the same player across market and bench IDs", () => {
    assert.equal(
      touchlinePlayerIdentityMatches(
        { name: "Rodri", clubName: "Manchester City" },
        { providerId: "123", name: "Rodrigo Hernandez", shortName: "Rodri", clubName: "Manchester City" },
      ),
      true,
    );
  });

  it("does not merge equal names from different clubs", () => {
    assert.equal(
      touchlinePlayerIdentityMatches(
        { name: "Gabriel", clubName: "Arsenal FC" },
        { name: "Gabriel", clubName: "Manchester City" },
      ),
      false,
    );
  });

  it("uses authoritative provider IDs when both sides have one", () => {
    assert.equal(
      touchlinePlayerIdentityMatches(
        { providerId: "101", name: "Same Player", clubName: "Same Club" },
        { providerId: "202", name: "Same Player", clubName: "Same Club" },
      ),
      false,
    );
  });

  it("normalizes accents and punctuation without weakening the club check", () => {
    assert.equal(
      touchlinePlayerIdentityMatches(
        { name: "Joško Gvardiol", clubName: "Manchester City" },
        { name: "Josko Gvardiol", clubName: "Manchester-City" },
      ),
      true,
    );
  });

  it("recognizes the same club with or without FC and AFC", () => {
    assert.equal(
      touchlinePlayerIdentityMatches(
        { name: "Alisson", clubName: "Liverpool FC" },
        { name: "Alisson", clubName: "Liverpool" },
      ),
      true,
    );
    assert.equal(
      touchlinePlayerIdentityMatches(
        { name: "Tyler Adams", clubName: "AFC Bournemouth" },
        { name: "Tyler Adams", clubName: "Bournemouth" },
      ),
      true,
    );
  });
});

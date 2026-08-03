import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeTouchLineProviderPlayerId,
  normalizeTouchLinePlayerKey,
  touchlinePlayerProfileHref,
} from "../lib/touchlineArena/player-links.ts";
import { resolveTouchLinePlayerProfile } from "../lib/touchlineArena/player-profile.ts";
import { touchlineDemoTierForPlayer } from "../lib/touchlineArena/demo-card-tier.ts";

describe("TouchLine player profile links", () => {
  it("normalizes accented names into stable player slugs", () => {
    assert.equal(normalizeTouchLinePlayerKey("Rúben Dias"), "ruben-dias");
  });

  it("extracts a safe numeric provider id from plain and namespaced ids", () => {
    assert.equal(normalizeTouchLineProviderPlayerId("123"), "123");
    assert.equal(normalizeTouchLineProviderPlayerId("sportmonks:456"), "456");
    assert.equal(normalizeTouchLineProviderPlayerId("demo-erling-haaland"), null);
  });

  it("carries safe identity metadata without competitive or financial values", () => {
    const href = touchlinePlayerProfileHref(
      {
        sportmonksPlayerId: 123,
        name: "Erling Haaland",
        clubName: "Manchester City",
        position: "ST",
        shirtNumber: 9,
        countryCode3: "NOR",
      },
      "pt-BR",
    );

    const url = new URL(href, "https://touchline.test");
    assert.equal(url.pathname, "/touchline-players/erling-haaland");
    assert.equal(url.searchParams.get("lang"), "pt-BR");
    assert.equal(url.searchParams.get("club"), "Manchester City");
    assert.equal(url.searchParams.get("shirt"), "9");
    assert.equal(url.searchParams.get("playerId"), "123");
    assert.equal(url.searchParams.get("points"), null);
    assert.equal(url.searchParams.get("value"), null);
    assert.equal(url.searchParams.get("previewTier"), null);
  });

  it("carries a card tier only when an explicit local preview requests it", () => {
    const href = touchlinePlayerProfileHref(
      { sportmonksPlayerId: "demo-player", name: "Demo Player" },
      "pt-BR",
      { previewTier: "emerald-green" },
    );

    const url = new URL(href, "https://touchline.test");
    assert.equal(url.searchParams.get("previewTier"), "emerald-green");
    assert.equal(url.searchParams.get("points"), null);
    assert.equal(url.searchParams.get("value"), null);
  });
});

describe("TouchLine player profile resolution", () => {
  it("keeps one demo tier for the same player across id and name variants", () => {
    assert.equal(touchlineDemoTierForPlayer("demo-sven-botman"), "sapphire-blue");
    assert.equal(touchlineDemoTierForPlayer("botman", "Sven Botman"), "sapphire-blue");
  });

  it("resolves Haaland from the shared roster without inventing official data", () => {
    const profile = resolveTouchLinePlayerProfile("haaland");

    assert.equal(profile.isLocalCard, true);
    assert.equal(profile.card.name, "Erling Haaland");
    assert.equal(profile.club?.slug, "manchester-city");
    assert.ok(profile.cardRank && profile.cardRank > 0);
    assert.equal(profile.real.contractUntil, undefined);
    assert.equal(profile.real.career.length, 0);
    assert.equal(profile.real.sources.length, 0);
    assert.equal(profile.exactPlayer.clubLogoUrl, profile.club?.logoUrl);
    assert.equal(profile.exactPlayer.formationPlayerId, "haaland");
  });

  it("builds a safe fallback profile and ignores untrusted competitive values", () => {
    const profile = resolveTouchLinePlayerProfile("new-player", {
      name: "New Player",
      club: "Arsenal FC",
      position: "MID",
      shirt: "18",
      country: "ENG",
      value: "€12M",
      points: "7",
      playerId: "987",
    });

    assert.equal(profile.isLocalCard, false);
    assert.equal(profile.card.name, "New Player");
    assert.equal(profile.card.shirtNumber, 18);
    assert.equal(profile.card.touchlinePoints, 0);
    assert.equal(profile.exactPlayer.formationPlayerId, "987");
    assert.equal(profile.card.marketValue, "Pending");
    assert.equal(profile.card.marketValueSource, "unavailable");
    assert.equal(profile.club?.slug, "arsenal");
    assert.equal(profile.real.career.length, 0);
    assert.equal(profile.exactPlayer.clubLogoUrl, profile.club?.logoUrl);
  });
});

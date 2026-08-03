import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseTouchlineArenaPanel,
  touchlineArenaDemoHref,
  touchlineArenaHref,
  touchlineArenaContractHref,
  touchlineArenaPanelHref,
  touchlineArenaPanelUrl,
  touchlineClubHubHref,
} from "../lib/touchlineArena/arena-navigation.ts";
import {
  touchlineClubOwnerProfileHref,
  touchlineClubOwnerSubstitutionHref,
} from "../lib/touchlineArena/club-owner-routes.ts";

describe("TouchLine Arena navigation", () => {
  it("keeps the official game URL clean and the demo URL explicit", () => {
    assert.equal(touchlineArenaHref("pt-BR"), "/arena?lang=pt-BR");
    assert.equal(touchlineArenaHref("en-GB"), "/arena?lang=en-GB");
    assert.equal(
      touchlineArenaDemoHref("pt-BR"),
      "/arena?demoLineup=1&skipIntro=1&lang=pt-BR",
    );
    assert.doesNotMatch(touchlineArenaHref("pt-BR"), /demoLineup|skipIntro/);
  });

  it("keeps one canonical ClubHub destination when no club context exists", () => {
    assert.equal(
      touchlineClubHubHref("pt-BR"),
      "/touchline-clubs/manchester-united?lang=pt-BR",
    );
    assert.equal(
      touchlineClubHubHref("en-GB", "chelsea"),
      "/touchline-clubs/chelsea?lang=en-GB",
    );
  });

  it("accepts only known Arena panels", () => {
    assert.equal(parseTouchlineArenaPanel("bench"), "bench");
    assert.equal(parseTouchlineArenaPanel(["market", "watch"]), "market");
    assert.equal(parseTouchlineArenaPanel("admin"), null);
    assert.equal(parseTouchlineArenaPanel(undefined), null);
  });

  it("routes former Arena panels to independent full-page experiences", () => {
    assert.equal(
      touchlineArenaPanelHref("formation", "pt-BR"),
      "/club-owner/luiz-lopez/substitution?lang=pt-BR",
    );
    assert.equal(touchlineArenaPanelHref("bench", "pt-BR"), "/club-owner/luiz-lopez/substitution?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("live", "pt-BR"), "/live?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("watch", "pt-BR"), "/live?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("rankings", "pt-BR"), "/touchline-tables?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("news", "pt-BR"), "/club-owner/luiz-lopez?lang=pt-BR");
  });

  it("keeps ClubOwner links centralized while allowing future owner slugs", () => {
    assert.equal(touchlineClubOwnerProfileHref("pt-BR"), "/club-owner/luiz-lopez?lang=pt-BR");
    assert.equal(
      touchlineClubOwnerProfileHref("en-GB", "ana-silva"),
      "/club-owner/ana-silva?lang=en-GB",
    );
    assert.equal(
      touchlineClubOwnerSubstitutionHref("pt-BR", "ana-silva"),
      "/club-owner/ana-silva/substitution?lang=pt-BR",
    );
  });

  it("opens Market Transfer as a dedicated localized page", () => {
    assert.equal(
      touchlineArenaPanelHref("market", "pt-BR"),
      "/market-transfer?lang=pt-BR",
    );
  });

  it("updates only the active panel in an existing Arena URL", () => {
    assert.equal(
      touchlineArenaPanelUrl(
        "http://127.0.0.1:3001/arena?demoLineup=1&skipIntro=1&lang=pt-BR&panel=bench",
        "market",
      ),
      "/arena?demoLineup=1&skipIntro=1&lang=pt-BR&panel=market",
    );
    assert.equal(
      touchlineArenaPanelUrl(
        "/arena?demoLineup=1&skipIntro=1&lang=pt-BR&panel=rankings#top",
        null,
      ),
      "/arena?demoLineup=1&skipIntro=1&lang=pt-BR#top",
    );
  });

  it("opens a player contract on the dedicated localized Market Transfer", () => {
    assert.equal(
      touchlineArenaContractHref({ locale: "pt-BR", playerId: "adams", playerName: "Tyler Adams", clubId: 52 }),
      "/market-transfer?lang=pt-BR&contractPlayer=adams&contractName=Tyler+Adams&contractClub=52",
    );
  });
});

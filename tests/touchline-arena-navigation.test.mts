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


describe("TouchLine Arena navigation", () => {
  it("routes official and former demo entry to the real Market without demo state", () => {
    assert.equal(touchlineArenaHref("pt-BR"), "/market-transfer?lang=pt-BR");
    assert.equal(touchlineArenaHref("en-GB"), "/market-transfer?lang=en-GB");
    assert.equal(
      touchlineArenaDemoHref("pt-BR"),
      "/market-transfer?lang=pt-BR",
    );
    assert.doesNotMatch(touchlineArenaHref("pt-BR"), /demoLineup|skipIntro/);
  });

  it("keeps one canonical ClubHub destination when no club context exists", () => {
    assert.equal(
      touchlineClubHubHref("pt-BR"),
      "/touchline-clubs?lang=pt-BR",
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

  it("routes former bench and formation panels to the one position-led My Club workspace", () => {
    assert.equal(
      touchlineArenaPanelHref("formation", "pt-BR"),
      "/market-transfer?lang=pt-BR#my-club-xi-pitch",
    );
    assert.equal(touchlineArenaPanelHref("bench", "pt-BR"), "/market-transfer?lang=pt-BR#my-club-xi-pitch");
    assert.equal(touchlineArenaPanelHref("live", "pt-BR"), "/live?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("watch", "pt-BR"), "/live?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("rankings", "pt-BR"), "/touchline-tables?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("news", "pt-BR"), "/live?lang=pt-BR");
  });

  it("opens My Club as the localized squad-building destination", () => {
    assert.equal(
      touchlineArenaPanelHref("market", "pt-BR"),
      "/market-transfer?lang=pt-BR",
    );
    assert.equal(touchlineArenaPanelHref("market", "en-GB"), "/market-transfer?lang=en-GB");
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

  it("opens a player contract in the localized My Club workspace", () => {
    assert.equal(
      touchlineArenaContractHref({ locale: "pt-BR", playerId: "adams", playerName: "Tyler Adams", clubId: 52 }),
      "/market-transfer?lang=pt-BR",
    );
  });
});

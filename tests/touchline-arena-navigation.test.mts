import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const arenaClientSource = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);

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
      "/my-club?lang=pt-BR#my-club-squad",
    );
    assert.equal(touchlineArenaPanelHref("bench", "pt-BR"), "/my-club?lang=pt-BR#my-club-squad");
    assert.equal(touchlineArenaPanelHref("live", "pt-BR"), "/live?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("watch", "pt-BR"), "/live?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("rankings", "pt-BR"), "/touchline-tables?lang=pt-BR");
    assert.equal(touchlineArenaPanelHref("news", "pt-BR"), "/arena?lang=pt-BR");
  });

  it("opens My Club as the localized squad-building destination", () => {
    assert.equal(
      touchlineArenaPanelHref("market", "pt-BR"),
      "/my-club?lang=pt-BR",
    );
    assert.equal(touchlineArenaPanelHref("market", "en-GB"), "/my-club?lang=en-GB");
  });

  it("keeps My Club as the only owner-facing Arena destination", () => {
    assert.doesNotMatch(arenaClientSource, /touchlineClubOwnerProfileHref/);
    assert.match(
      arenaClientSource,
      /href=\{`\/my-club\?lang=\$\{encodeURIComponent\(siteLanguage\)\}`\}/,
    );
    assert.match(
      arenaClientSource,
      /if \(\(panel === "bench" \|\| panel === "formation"\) && !initialQaVisualEditor\) \{\s*router\.push\(touchlineArenaPanelHref\(panel, siteLanguage\)\);/,
    );
    assert.match(arenaClientSource, /\{siteLanguage === "pt-BR" \? "Montar meu XI" : "Build my XI"\}/);
  });

  it("keeps primary Arena navigation inside the current document", () => {
    const quickLinks = arenaClientSource.slice(arenaClientSource.indexOf('className="arena-quick-links"'), arenaClientSource.indexOf('{hasEntryVideoFinished ? (', arenaClientSource.indexOf('className="arena-quick-links"')));
    assert.match(arenaClientSource, /import Link from "next\/link"/);
    assert.equal((quickLinks.match(/<Link\b/g) ?? []).length, 3);
    assert.doesNotMatch(quickLinks, /<a\b/);
    assert.doesNotMatch(arenaClientSource, /window\.location\.assign\(touchlineArenaPanelHref/);
  });

  it("anchors the Arena score carousel to one safe viewport edge", () => {
    const rail = arenaClientSource.slice(arenaClientSource.indexOf('<section className="club-symbol-carousel"'), arenaClientSource.indexOf('{selectedLiveSimulationCard ? ('));
    assert.doesNotMatch(rail, /<a\b/, "score rail links must preserve the root audio player");
    assert.equal((rail.match(/<Link\b/g) ?? []).length, 4);
    const carouselRuleBodies = [
      ...arenaClientSource.matchAll(/\.club-symbol-carousel\s*\{([\s\S]*?)\n\s*\}/g),
    ].map((match) => match[1]);
    const carouselBottomDeclarations = carouselRuleBodies.filter((body) => /\bbottom\s*:/.test(body));

    assert.equal(carouselBottomDeclarations.length, 1);
    assert.match(
      carouselBottomDeclarations[0] ?? "",
      /bottom:\s*env\(safe-area-inset-bottom, 0px\);/,
    );
  });

  it("keeps known internal Arena destinations on client navigation", () => {
    const anchors = arenaClientSource.match(/<a\b[\s\S]*?<\/a>/g) ?? [];
    for (const anchor of anchors) {
      assert.ok(anchor.includes('href="https://www.freepik.com"'),
        "only the external artwork credit may remain a native anchor");
    }
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
      "/my-club?lang=pt-BR",
    );
  });
});

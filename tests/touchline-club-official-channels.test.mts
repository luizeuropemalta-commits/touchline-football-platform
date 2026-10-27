import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getTouchlineOfficialClubChannels,
  TOUCHLINE_OFFICIAL_CLUB_CHANNELS,
} from "../lib/touchlineArena/club-official-channels.ts";
import { getTouchlineClubOfficialChannelsCopy } from "../lib/touchlineArena/club-official-channels-i18n.ts";

test("official ClubHub channel allow-list uses HTTPS and never falls back for an unverified club", () => {
  for (const channels of Object.values(TOUCHLINE_OFFICIAL_CLUB_CHANNELS)) {
    for (const destination of Object.values(channels).filter((value): value is { url: string; verifiedFrom: string } =>
      Boolean(value) && typeof value === "object" && "url" in value && "verifiedFrom" in value,
    )) {
      assert.ok(destination);
      assert.equal(new URL(destination.url).protocol, "https:");
      assert.equal(new URL(destination.verifiedFrom).protocol, "https:");
    }
  }

  assert.deepEqual(getTouchlineOfficialClubChannels("not-verified"), {});
  assert.equal(getTouchlineOfficialClubChannels("hull-city").tickets?.url, "https://www.wearehullcity.co.uk/tickets/");
  assert.equal(getTouchlineOfficialClubChannels("hull-city").store?.url, "https://www.tigerleisure.com/");
  assert.equal(getTouchlineOfficialClubChannels("coventry-city").membership?.url, "https://www.ccfc.co.uk/memberships");
  assert.equal(getTouchlineOfficialClubChannels("bournemouth").membership?.url, "https://www.afcb.co.uk/tickets/memberships");
  assert.equal(getTouchlineOfficialClubChannels("hull-city").membership?.url, "https://www.wearehullcity.co.uk/tickets/memberships");
  assert.equal(Object.values(TOUCHLINE_OFFICIAL_CLUB_CHANNELS).filter(channels => channels.membership).length, 20);
  assert.equal(getTouchlineOfficialClubChannels("manchester-city").membershipHeroImage, undefined);
  assert.equal(Object.values(TOUCHLINE_OFFICIAL_CLUB_CHANNELS).filter(channels => channels.store).length, 20);
  assert.deepEqual(Object.entries(TOUCHLINE_OFFICIAL_CLUB_CHANNELS).filter(([, channels]) => channels.playerCollection).map(([slug]) => slug),
    ["arsenal", "manchester-city"], "A club store is not verification of a player-specific collection");
  assert.equal(getTouchlineOfficialClubChannels("manchester-city").store?.url, "https://shop.mancity.com/gb/en/home/");
  assert.equal(getTouchlineOfficialClubChannels("manchester-city").membership?.url, "https://www.mancity.com/memberships");
});

test("official ClubHub channel copy keeps the approved Portuguese labels and every supported locale", () => {
  const portuguese = getTouchlineClubOfficialChannelsCopy("pt-BR", true);
  assert.equal(portuguese.storeTitle, "Loja do clube");
  assert.equal(portuguese.exploreCollection, "Explorar coleção");
  assert.equal(portuguese.ticketsTitle, "Viva o jogo no estádio");
  assert.equal(portuguese.membershipTitle, "Faça parte do clube");

  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const copy = getTouchlineClubOfficialChannelsCopy(locale, true);
    assert.ok(copy.storeTitle.length > 0);
    assert.ok(copy.viewTickets.length > 0);
    assert.ok(copy.learnMembership.length > 0);
  }
});

test("ClubHub places official channels without replacing the existing card zoom", async () => {
  const [page, lineup, zoom] = await Promise.all([
    readFile(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /kind="store"/);
  assert.match(page, /kind="tickets"/);
  assert.match(page, /kind="membership"/);
  assert.match(page, /kind="membership" variant="cover"/);
  assert.match(page, /kind="store" variant="cover"/);
  assert.match(page, /const fixture = matchSnapshot\.publicFixture/);
  assert.match(page, /matchup=\{lineupMatchup\}/);
  assert.match(lineup, /detailsSupplement=/);
  assert.match(zoom, /detailsSupplement\?: ReactNode/);
  assert.match(zoom, /supplement=\{detailsSupplement\}/);
});

// Expected links are the first-party evidence matrix recorded on 25 October 2026.
test("the 18 additional club stores retain their verified destinations and source pages", () => {
  const verified: Record<string, readonly [string, string]> = {
    "aston-villa": [
        "https://shop.avfc.co.uk/en/",
        "https://www.avfc.co.uk/"
    ],
    "bournemouth": [
        "https://superstore.afcb.co.uk/",
        "https://superstore.afcb.co.uk/pages/faqs"
    ],
    "brentford": [
        "https://shop.brentfordfc.com/",
        "https://www.brentfordfc.com/en"
    ],
    "brighton": [
        "https://shop.brightonandhovealbion.com/",
        "https://www.brightonandhovealbion.com/home"
    ],
    "chelsea": [
        "https://store.chelseafc.com/en/",
        "https://www.chelseafc.com/en"
    ],
    "coventry-city": [
        "https://www.ccfcstore.com/",
        "https://www.ccfc.co.uk/"
    ],
    "crystal-palace": [
        "https://shop.cpfc.co.uk/",
        "https://www.cpfc.co.uk/"
    ],
    "everton": [
        "https://store.evertonfc.com/en/",
        "https://www.evertonfc.com/"
    ],
    "fulham": [
        "https://shop.fulhamfc.com/",
        "https://www.fulhamfc.com/"
    ],
    "hull-city": [
        "https://www.tigerleisure.com/",
        "https://www.wearehullcity.co.uk/"
    ],
    "ipswich-town": [
        "https://shop.itfc.co.uk/",
        "https://www.itfc.co.uk/"
    ],
    "leeds-united": [
        "https://shop.leedsunited.com/en/",
        "https://www.leedsunited.com/en"
    ],
    "liverpool": [
        "https://store.liverpoolfc.com/",
        "https://www.liverpoolfc.com/"
    ],
    "manchester-united": [
        "https://store.manutd.com/en",
        "https://www.manutd.com/en"
    ],
    "newcastle-united": [
        "https://shop.newcastleunited.com/",
        "https://www.newcastleunited.com/en"
    ],
    "nottingham-forest": [
        "https://shop.nottinghamforest.co.uk/",
        "https://www.nottinghamforest.co.uk/"
    ],
    "sunderland": [
        "https://www.safcstore.com/en/",
        "https://www.safc.com/"
    ],
    "tottenham-hotspur": [
        "https://shop.tottenhamhotspur.com/",
        "https://www.tottenhamhotspur.com/"
    ]
};
  for (const [slug, [url, verifiedFrom]] of Object.entries(verified)) {
    assert.deepEqual(getTouchlineOfficialClubChannels(slug).store, { url, verifiedFrom });
    assert.equal(new URL(url).search, "", "Do not add advertising parameters");
    assert.equal(getTouchlineOfficialClubChannels(slug).playerCollection, undefined);
  }
  assert.deepEqual(getTouchlineOfficialClubChannels("unverified-club"), {});
});

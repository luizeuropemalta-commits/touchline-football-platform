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
  assert.equal(getTouchlineOfficialClubChannels("hull-city").store, undefined);
  assert.equal(getTouchlineOfficialClubChannels("coventry-city").membership?.url, "https://www.ccfc.co.uk/memberships");
  assert.equal(getTouchlineOfficialClubChannels("bournemouth").membership?.url, "https://www.afcb.co.uk/tickets/memberships");
  assert.equal(getTouchlineOfficialClubChannels("hull-city").membership?.url, "https://www.wearehullcity.co.uk/tickets/memberships");
  assert.equal(Object.values(TOUCHLINE_OFFICIAL_CLUB_CHANNELS).filter(channels => channels.membership).length, 20);
  assert.equal(getTouchlineOfficialClubChannels("manchester-city").membershipHeroImage, "/touchline/club-channels/manchester-city-membership-cutout-v3.png");
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
  assert.match(page, /variant="hero"/);
  assert.match(page, /const fixture = matchSnapshot\.publicFixture/);
  assert.match(page, /matchup=\{lineupMatchup\}/);
  assert.match(lineup, /detailsSupplement=/);
  assert.match(zoom, /detailsSupplement\?: ReactNode/);
  assert.match(zoom, /supplement=\{detailsSupplement\}/);
});

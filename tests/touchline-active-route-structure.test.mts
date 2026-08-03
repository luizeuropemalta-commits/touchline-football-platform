import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("ClubHub compact cards keep navigation outside the zoom trigger", () => {
  const clubHubPage = source("app/touchline-clubs/[club]/page.tsx");
  const officialLineup = source("components/touchline/ClubHubOfficialLineup.tsx");

  for (const compactCardSource of [clubHubPage, officialLineup]) {
    assert.match(
      compactCardSource,
      /playerProfileHref=\{profileHref\}\s+showProfileAction=\{false\}\s+showSocialMetrics=\{false\}/,
    );
  }
  assert.match(clubHubPage, /className="club-hub-card-meta"[\s\S]*?<a\s+href=\{profileHref\}/);
  assert.match(officialLineup, /styles\.playerName/);
  assert.doesNotMatch(officialLineup, /styles\.playerLink/);
});

test("Arena uses the dynamic viewport without a conflicting root minimum or viewport width", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");

  assert.match(
    arenaClient,
    /arena-stage relative h-\[100dvh\] min-h-0 w-full overflow-hidden/,
  );
  assert.doesNotMatch(
    arenaClient,
    /arena-stage relative h-\[100dvh\] min-h-screen w-screen/,
  );
  assert.match(
    arenaClient,
    /\.arena-stage\.is-mobile-fullscreen-fallback[\s\S]*?height: 100dvh !important;[\s\S]*?min-height: 0 !important;/,
  );
});

test("ClubOwner collection rows use the canonical player profile helper", () => {
  const ownerPage = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");

  assert.match(
    ownerPage,
    /sortedClubOwnerSquadCards\.map\(\(card, index\) => \{[\s\S]*?squadCardToExactPlayer\(card, \{ useSuppliedTier: true \}\)[\s\S]*?touchlinePlayerProfileHref\(player, locale, \{ previewTier: card\.cardTier \}\)[\s\S]*?<a key=\{card\.id\} href=\{profileHref\}/,
  );
  assert.doesNotMatch(ownerPage, /\/club-owner\/luiz-lopez\?player=\$\{card\.id\}/);
});

test("market and auth controls do not nest secondary controls inside labels", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const authForm = source("components/auth-form.tsx");
  const resetForm = source("components/reset-password-form.tsx");

  assert.match(arenaClient, /<div className="team-builder-market-search">[\s\S]*?<input[\s\S]*?aria-label=\{marketUi\.searchPlaceholder\}/);
  assert.doesNotMatch(arenaClient, /<label className="team-builder-market-search">/);

  assert.match(authForm, /<label htmlFor="touchline-auth-password"/);
  assert.match(authForm, /<Input id="touchline-auth-password"/);
  assert.match(authForm, /<button type="button" aria-controls="touchline-auth-password"/);

  assert.match(resetForm, /<label htmlFor="touchline-reset-password"/);
  assert.match(resetForm, /<Input id="touchline-reset-password"/);
  assert.match(resetForm, /<button type="button" aria-controls="touchline-reset-password"/);
  assert.match(resetForm, /<label htmlFor="touchline-reset-password-confirmation"/);
});

test("player-card rankings link to the dedicated market and preserve the club", () => {
  const rankingsPage = source("app/touchline-player-card-rankings/page.tsx");
  const marketLinks = rankingsPage.match(/href=\{marketTransferHref\(club\?\.slug\)\}/g) ?? [];

  assert.match(rankingsPage, /touchlineArenaPanelHref\("market", locale\)/);
  assert.match(rankingsPage, /clubSlug \? `\$\{marketHref\}&club=\$\{encodeURIComponent\(clubSlug\)\}` : marketHref/);
  assert.equal(marketLinks.length, 2);
  assert.doesNotMatch(rankingsPage, /href=\{`\/arena\?demoLineup=1&skipIntro=1&club=/);
});

test("ClubOwner identity names cannot overflow their responsive grid track", () => {
  const socialStyles = source("components/touchline/social/TouchlineSocial.module.css");

  assert.match(
    socialStyles,
    /\.identityOnly \.socialName h1 \{[\s\S]*?max-width: 100%;[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/,
  );
});

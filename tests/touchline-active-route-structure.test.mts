import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("ClubHub compact cards keep navigation outside the zoom trigger", () => {
  const squadGrid = source("components/touchline/ClubHubSquadGrid.tsx");
  const officialLineup = source("components/touchline/ClubHubOfficialLineup.tsx");

  for (const compactCardSource of [squadGrid, officialLineup]) {
    assert.match(
      compactCardSource,
      /playerProfileHref=\{profileHref\}[\s\S]*?showProfileAction=\{false\}[\s\S]*?showSocialMetrics=\{false\}/,
    );
  }
  assert.match(squadGrid, /className=\{`club-hub-card-meta \$\{styles.meta\}`\}[\s\S]*?<a\s+href=\{profileHref\}/);
  assert.doesNotMatch(officialLineup, /styles\.playerName/);
  assert.match(officialLineup, /ariaLabel=\{`\$\{isPortuguese \? "Ampliar card de"/);
  assert.doesNotMatch(officialLineup, /styles\.playerLink/);
});

test("market and auth controls do not nest secondary controls inside labels", () => {
  const authForm = source("components/auth-form.tsx");
  const resetForm = source("components/reset-password-form.tsx");


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

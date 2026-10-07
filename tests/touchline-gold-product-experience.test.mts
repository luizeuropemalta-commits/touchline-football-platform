import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchlineClubHubRosterCopy } from "../lib/touchlineArena/club-hub-roster-i18n.ts";
import { getTouchlineFootballSearchCopy } from "../lib/touchlineArena/football-search-i18n.ts";

const read = (file: string) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Arena honours the explicit URL locale on first render", async () => {
  const source = await read("app/arena/page.tsx");
  assert.ok(source.includes("normalizeTouchLineLocale(first(input.lang), draftLocalesEnabled)"));
  assert.ok(source.includes('redirect(`/intro?'));
});

test("Portuguese Notifications and Football Search use first-party localized copy", async () => {
  const [notifications, notificationCopy, search, playerSearch, shell] = await Promise.all([
    read("app/(app)/notifications/page.tsx"),
    read("lib/touchlineArena/notification-centre-i18n.ts"),
    read("app/(app)/football-search/page.tsx"),
    read("components/player-database-search.tsx"),
    read("components/arena-admin-shell.tsx"),
  ]);
  assert.match(notifications, /getTouchlineNotificationCentreCopy\(locale, draftLocalesEnabled\)/);
  assert.match(notificationCopy, /Central de Notificações/);
  assert.match(notificationCopy, /Categorias de Notificação/);
  assert.match(search, /copy\.title/);
  assert.equal(getTouchlineFootballSearchCopy("pt-BR").title, "Pesquisa de futebol TouchLine");
  assert.match(playerSearch, /data-touchline-editorial-card-notice/);
  assert.match(playerSearch, /copy\.editorialTitle/);
  assert.equal(getTouchlineFootballSearchCopy("pt-BR").editorialTitle, "Cards geridos pela equipa editorial");
  assert.doesNotMatch(playerSearch, /visual-qa\/touchline-card-studio/);
  assert.match(shell, /Pesquisa de Futebol/);
});

test("ClubHub mounts its heavy outside-matchday squad cards progressively", async () => {
  const [page, outsideRoster, grid] = await Promise.all([
    read("app/touchline-clubs/[club]/page.tsx"),
    read("components/touchline/ClubHubOutsideMatchRoster.tsx"),
    read("components/touchline/ClubHubSquadGrid.tsx"),
  ]);
  assert.match(page, /<ClubHubOutsideMatchRoster/);
  assert.match(outsideRoster, /<ClubHubSquadGrid/);
  assert.match(grid, /const INITIAL_CARD_COUNT = 8/);
  assert.match(grid, /cards\.slice\(0, visibleCount\)/);
  assert.match(grid, /rosterCopy\.loadMore/);
  assert.equal(getTouchlineClubHubRosterCopy("en-GB").loadMore, "View {count} more");
});

test("active ClubHub, authentication, social and rankings controls retain minimum touch targets", async () => {
  const [clubHub, auth, social, matchCentre, rankings] = await Promise.all([
    read("app/touchline-clubs/[club]/page.tsx"),
    read("components/auth-form.tsx"),
    read("components/touchline/social/TouchlineSocial.module.css"),
    read("components/touchline/match-centre/touchline-match-centre.module.css"),
    read("app/touchline-player-card-rankings/page.tsx"),
  ]);
  assert.match(clubHub, /\.club-hub-section-actions a \{[\s\S]*min-height: 44px/);
  assert.match(auth, /grid size-11/);
  assert.match(social, /\.post footer button, \.post footer a \{[^\n]*min-height: 44px/);
  assert.match(matchCentre, /\.brand \{[^\n]*min-height: 52px/);
  assert.match(rankings, /\.tl-card-rankings-featured-copy a,[\s\S]*min-height: 44px/);
});

test("the shared card localizes its league-statistics label", async () => {
  const source = await read("components/touchline/cards/TouchlineEliteExactCard.tsx");
  assert.equal(getTouchlineExactCardCopy("pt-BR").leagueStats, "Estatísticas da TouchLine England League");
  assert.equal(getTouchlineExactCardCopy("en-GB").leagueStats, "TouchLine England League Stats");
  assert.match(source, /const exactCopy = getTouchlineExactCardCopy\(runtimeLocale, draftLocalesEnabled\)/);
  assert.match(source, /\{exactCopy\.leagueStats\}/);
});

test("browser audit tooling follows the installed Playwright API and includes Firefox", async () => {
  const [goldAudit, marketAudit] = await Promise.all([
    read("scripts/audit-touchline-gold-experience.mjs"),
    read("scripts/audit-touchline-market-journey.mjs"),
  ]);
  for (const source of [goldAudit, marketAudit]) {
    assert.match(source, /from "@playwright\/test"/);
    assert.match(source, /firefox/);
    assert.doesNotMatch(source, /node_modules\/\.pnpm\/playwright@/);
  }
  assert.match(goldAudit, /id: "desktop-720", width: 1280, height: 720/);
});

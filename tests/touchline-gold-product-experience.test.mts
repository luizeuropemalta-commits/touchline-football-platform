import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file: string) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Arena honours the explicit URL locale on first render", async () => {
  const source = await read("app/arena/page.tsx");
  assert.match(source, /initialLocale=\{normalizeTouchLineLocale\(firstValue\(params\.lang\)\)\}/);
});

test("Portuguese Notifications and Football Search use first-party localized copy", async () => {
  const [notifications, search, playerSearch, shell] = await Promise.all([
    read("app/(app)/notifications/page.tsx"),
    read("app/(app)/football-search/page.tsx"),
    read("components/player-database-search.tsx"),
    read("components/arena-admin-shell.tsx"),
  ]);
  assert.match(notifications, /Central de Notificações/);
  assert.match(notifications, /Categorias de Notificação/);
  assert.match(search, /Pesquisa de futebol TouchLine/);
  assert.match(playerSearch, /touchlinePlayerProfileHref/);
  assert.doesNotMatch(playerSearch, /visual-qa\/touchline-card-studio/);
  assert.match(shell, /Pesquisa de Futebol/);
});

test("ClubHub mounts its heavy squad cards progressively", async () => {
  const [page, grid] = await Promise.all([
    read("app/touchline-clubs/[club]/page.tsx"),
    read("components/touchline/ClubHubSquadGrid.tsx"),
  ]);
  assert.match(page, /<ClubHubSquadGrid/);
  assert.match(grid, /const INITIAL_CARD_COUNT = 8/);
  assert.match(grid, /cards\.slice\(0, visibleCount\)/);
  assert.match(grid, /View.*more/);
});

test("Arena exposes a persistent non-financial recovery journey for incomplete clubs", async () => {
  const source = await read("app/arena/ArenaClient.tsx");
  assert.match(source, /needsArenaRosterRecovery/);
  assert.match(source, /Abrir Mercado de Treinadores/);
  assert.match(source, /Abrir Mercado de Jogadores/);
  assert.match(source, /Continuar Montagem do Elenco/);
  assert.match(source, /Voltar ao ClubHub/);
});

test("compact Arena and Market controls retain effective 44px targets", async () => {
  const [source, auth, quickNav, social, matchCentre, rankings] = await Promise.all([
    read("app/arena/ArenaClient.tsx"),
    read("components/auth-form.tsx"),
    read("components/touchline/TouchlineProfileQuickNav.module.css"),
    read("components/touchline/social/TouchlineSocial.module.css"),
    read("components/touchline/match-centre/touchline-match-centre.module.css"),
    read("app/touchline-player-card-rankings/page.tsx"),
  ]);
  assert.match(source, /\.club-symbol-arrow \{ width: 44px; height: 44px/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-position-filters button,[\s\S]*min-height: 44px/);
  assert.match(auth, /grid size-11/);
  assert.match(quickNav, /\.shortcuts a \{[\s\S]*min-height: 44px/);
  assert.match(social, /\.post footer button, \.post footer a \{[^\n]*min-height: 44px/);
  assert.match(matchCentre, /\.brand \{[^\n]*min-height: 44px/);
  assert.match(rankings, /\.tl-card-rankings-featured-copy a,[\s\S]*min-height: 44px/);
});

test("the shared card localizes its league-statistics label", async () => {
  const source = await read("components/touchline/cards/TouchlineEliteExactCard.tsx");
  assert.match(source, /runtimeLocale === "pt-BR" \? "Estatísticas da TouchLine England League"/);
});

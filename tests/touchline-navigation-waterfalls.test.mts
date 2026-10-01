import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PassThrough } from "node:stream";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { createRankingLoadDiagnostics } from "../lib/touchlineArena/ranking-load-diagnostics.ts";
import { projectTouchlineRankingsHighlights, type TouchlineRankingsHighlights } from "../lib/touchlineArena/rankings-highlight-projection.ts";

const require = createRequire(import.meta.url);
function loadPage(path: string, modules: Record<string, unknown>, exportName = "default") {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  // The runtime JSX tree is inspected across isolated transpilation boundaries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name in modules) return modules[name];
    if (name === "@/lib/touchlineArena/ranking-load-diagnostics") return { createRankingLoadDiagnostics: () => createRankingLoadDiagnostics({}) };
    if (name === "@/lib/touchlineArena/rankings-highlight-projection") return { projectTouchlineRankingsHighlights };
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name.endsWith(".css")) return { default: {} };
    return new Proxy({}, { get: () => () => null });
  }});
  return exports[exportName];
}

test("catalogue continuously refills a two-read pool and merges in input order despite reverse completion", async () => {
  const started: string[][] = [];
  const releases: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  const load = loadPage("../lib/touchlineArena/complete-catalogue-read-server.ts", {
    "./card-publication-read-model": { loadTouchlinePublishedCardPresentations: ({ playerIds }: { playerIds: string[] }) => {
      started.push(playerIds);
      active++;
      peak = Math.max(peak, active);
      return new Promise(resolve => releases.push(() => {
        active--;
        resolve(new Map(playerIds.map(id => [id, {}])));
      }));
    } },
  }, "loadCompleteTouchlineCataloguePresentations");
  const ids = Array.from({ length: 451 }, (_, n) => String(n).padStart(4, "0"));
  const result = load(ids, {});
  assert.equal(started.length, 2);
  assert.deepEqual(started.map(batch => batch.length), [150, 150]);
  releases[1]!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 3, "Refill the free slot while the first read is pending");
  assert.equal(active, 2);
  releases[0]!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 4);
  releases[3]!(); releases[2]!();
  assert.deepEqual([...((await result) as Map<string, unknown>).keys()], ids);
  assert.deepEqual(started.map(batch => batch.length), [150, 150, 150, 1]);
  assert.equal(peak, 2);
  assert.equal(active, 0);
});

test("navigation label reflects only the current Link pending state and recovers", () => {
  let pending = false;
  const Label = loadPage("../components/touchline/TouchlineNavigationLabel.tsx", {
    "next/link": { useLinkStatus: () => ({ pending }) },
  });
  const props = { label: "My Club", pendingLabel: "Opening…" };
  assert.equal(Label(props).props.children, "My Club");
  pending = true;
  assert.equal(Label(props).props.children, "Opening…");
  assert.equal(Label(props).props["aria-busy"], true);
  pending = false;
  assert.equal(Label(props).props.children, "My Club");
  assert.equal(Label(props).props["aria-busy"], false);
});

test("ClubHub returns club links before deferred catalogue is requested", async () => {
  let reads = 0;
  const page = loadPage("../app/touchline-clubs/page.tsx", {
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale: () => "en-GB" },
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS_BY_RANK: [{ teamId: 1, slug: "synthetic", name: "Synthetic" }] },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchlinePublishedCardShowcaseCatalog() { reads++; return new Promise(() => {}); } },
  });
  const tree = await page({ searchParams: Promise.resolve({}) });
  assert.equal(tree.type, "main");
  assert.equal(reads, 0);
  const children = tree.props.children;
  assert.equal(children[2].props.children[0].props.href, "/touchline-clubs/synthetic?lang=en-GB");
  assert.equal(children[3].type, require("react").Suspense);
  assert.equal(children[3].props.fallback.props.role, "status");
});

test("Rankings starts independent reads while authentication is pending and shares one ranking", async () => {
  const calls: string[] = [];
  let release!: (value: unknown) => void;
  const pending = new Promise(resolve => { release = resolve; });
  let releaseCatalogue!: (value: unknown[]) => void;
  const catalogue = new Promise<unknown[]>(resolve => { releaseCatalogue = resolve; });
  const ranking = { snapshotId: "same-snapshot" };
  const page = loadPage("../app/touchline-tables/page.tsx", {
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale: () => "en-GB" },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: () => pending } }) },
    "@/lib/touchlineArena/card-ranking-server": {
      loadTouchLineActiveRanking: async () => { calls.push("ranking"); return ranking; },
      loadTouchLinePublishedTopEleven: async (state: unknown) => { assert.equal(state, ranking); calls.push("xi"); return null; },
    },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: async (state: unknown) => { assert.equal(state, ranking); calls.push("catalogue"); return catalogue; } },
    "@/lib/touchlineArena/global-navigation": { resolveTouchlineGlobalNavigationSurface: ({ isAuthenticated, isAdmin }: { isAuthenticated: boolean; isAdmin: boolean }) => { assert.equal(isAuthenticated, true); assert.equal(isAdmin, false); return "authenticated"; } },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: async () => { calls.push("fixtures"); return []; } },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => { calls.push("coaches"); return {}; } },
    "@/lib/touchlineArena/card-publication-read-model": { countTouchlinePublishedPlayerCards: async () => { calls.push("count"); return 0; } },
    "@/lib/touchlineArena/arena-fixture-round": { selectArenaFixtureRound: () => [] },
    "@/lib/touchlineArena/rankings-i18n": { getTouchLineRankingsCopy: () => ({}) },
  });
  const result = page({ searchParams: Promise.resolve({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice().sort(), ["catalogue", "coaches", "count", "fixtures", "ranking", "xi"]);
  release({ data: { user: { email: "synthetic@example.test" } } });
  const shell = await result;
  assert.equal(shell.type, "main");
  const navigation = shell.props.children[0].props.children[0];
  assert.equal(navigation.props.surface, "authenticated");
  const sportingBoundary = shell.props.children[1];
  assert.equal(sportingBoundary.type, require("react").Suspense);
  assert.equal(sportingBoundary.props.fallback.props.role, "status");
  const frameElement = sportingBoundary.props.children;
  const frame = await frameElement.type(frameElement.props);
  assert.equal(frame.props.children[0].props.initialPlayerRankingSnapshotId, ranking.snapshotId);
  const sporting = frame.props.children[2].props.children.props.children[0].props.children;
  let sportingReady = false;
  const complete = sporting.type(sporting.props).then((tree: { props: { rosterCards?: unknown[]; highlights?: TouchlineRankingsHighlights; totalRankedCards?: number } }) => { sportingReady = true; return tree; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sportingReady, false, "Catalogue pending must not block the authenticated shell");
  const allCards = Array.from({ length: 5 }, (_, index) => ({ id: `published-${index}`, editorialCard: {}, seasonTotalRating: index }));
  releaseCatalogue(allCards);
  const loaded = await complete;
  assert.equal(loaded.props.rosterCards, undefined);
  assert.deepEqual(loaded.props.highlights?.topPlayerCards.map(card => card.id), ["published-4", "published-3", "published-2"]);
  const heroElement = frame.props.children[1].props.children;
  const hero = await heroElement.type(heroElement.props);
  assert.equal(hero.props.totalRankedCards, 5, "Do not truncate the catalogue to the top three");
  assert.equal(shell.props.children[0].props.children[0], navigation, "Navigation is owned by the shell, not sporting completion");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const turn = () => new Promise(resolve => setImmediate(resolve));

function rankingsWithDeferredSchedule(extra: Record<string, unknown> = {}) {
  const fixtures = deferred<Array<{ roundName?: string }>>();
  const catalogue = deferred<unknown[]>();
  const auth = deferred<{ data: { user: null } }>();
  const reads: string[] = [];
  const ranking = { snapshotId: "published-snapshot", phase: "ranked" };
  const selection = { snapshotId: ranking.snapshotId, slots: [] };
  const coaches = { snapshotId: "published-coaches" };
  const page = loadPage("../app/touchline-tables/page.tsx", {
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale: (lang: string) => lang },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: () => auth.promise } }) },
    "@/lib/touchlineArena/card-ranking-server": {
      loadTouchLineActiveRanking: async () => { reads.push("ranking"); return ranking; },
      loadTouchLinePublishedTopEleven: async (state: unknown) => { assert.equal(state, ranking); reads.push("xi"); return selection; },
    },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: (state: unknown) => { assert.equal(state, ranking); reads.push("catalogue"); return catalogue.promise; } },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: (options: unknown) => {
      assert.equal(JSON.stringify(options), JSON.stringify({ includeHistorical: true, limit: 240 }));
      reads.push("fixtures"); return fixtures.promise;
    } },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => { reads.push("coaches"); return coaches; } },
    "@/lib/touchlineArena/card-publication-read-model": { countTouchlinePublishedPlayerCards: async () => { reads.push("count"); return 17; } },
    "@/lib/touchlineArena/arena-fixture-round": { selectArenaFixtureRound: (rows: unknown) => rows },
    "@/lib/touchlineArena/rankings-i18n": { getTouchLineRankingsCopy: () => ({ pointsMode: "Published rating", publishedCards: "Published", rankedCards: "Ranked", rankMode: "Mode" }) },
    "@/lib/touchlineArena/global-navigation": { resolveTouchlineGlobalNavigationSurface: () => "public" },
    ...extra,
  });
  return { fixtures, catalogue, auth, reads, selection, coaches, page };
}

test("real React stream publishes the coach table before deferred catalogue and keeps it once", async () => {
  const CoachTable = loadPage("../app/touchline-tables/touchline-tables-client.tsx", {}, "TouchlineCoachRankingTable");
  const PodiumPending = loadPage("../app/touchline-tables/touchline-tables-client.tsx", {}, "TouchlineRankingPodiumPending");
  let refreshes = 0;
  let featuredRenders = 0;
  let projections = 0;
  const passedHighlights: unknown[] = [];
  const h = rankingsWithDeferredSchedule({
    "@/lib/touchlineArena/card-leadership-authority": { buildTouchlineCardLeadershipValue: (ranking: { snapshotId: string }, coach: unknown) => { assert.equal(ranking.snapshotId, "published-snapshot"); assert.equal(coach, h.coaches); return {}; } },
    "@/components/touchline/TouchlineLivePresentationRefresh": { default: ({ initialPlayerRankingSnapshotId, initialCoachRankingSnapshotId }: { initialPlayerRankingSnapshotId: string; initialCoachRankingSnapshotId: string }) => { refreshes++; assert.equal(initialPlayerRankingSnapshotId, "published-snapshot"); assert.equal(initialCoachRankingSnapshotId, "published-coaches"); return null; } },
    "@/lib/touchlineArena/rankings-highlight-projection": { projectTouchlineRankingsHighlights: (...args: Parameters<typeof projectTouchlineRankingsHighlights>) => { projections++; return projectTouchlineRankingsHighlights(...args); } },
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { TouchlineCardLeadershipProvider: ({ children }: { children: ReactNode }) => children },
    "./touchline-tables-client": {
      default: ({ highlights }: { highlights: unknown }) => { passedHighlights.push(highlights); return createElement("div", { "data-loaded-section": "overview" }, "Published player content"); },
      TouchlineRankingPodium: ({ highlights }: { highlights: unknown }) => { passedHighlights.push(highlights); return createElement("div", { "data-loaded-section": "podium" }); },
      TouchlineRankingEnding: () => createElement("div", { "data-loaded-section": "ending" }),
      TouchlineCoachRankingTable: CoachTable,
      TouchlineRankingPodiumPending: PodiumPending,
      TouchlineRankingsHero: () => createElement("header", null, "Rankings"),
      TouchlineFeaturedCoach: ({ coachRanking }: { coachRanking: unknown }) => { featuredRenders++; assert.equal(coachRanking, h.coaches); return createElement("aside", { "data-featured-coach": true }, "Published featured coach"); },
    },
  });
  Object.assign(h.coaches, { phase: "ranked", scoringVersion: "coach_scoring_v2", rows: Array.from({ length: 7 }, (_, i) => ({ coachProviderId: String(i), rank: i + 1, coachName: `Verified coach ${i}`, clubName: "Club", wins: 2, draws: 1, losses: 0, touchlinePoints: 7 })) });
  let pageReady = false;
  const page = h.page({ searchParams: Promise.resolve({ lang: "en-GB" }) }).then((x: ReactNode) => { pageReady = true; return x; });
  await turn();
  assert.equal(pageReady, false, "Authentication still gates the page");
  h.auth.resolve({ data: { user: null } });
  const sink = new PassThrough();
  let html = "";
  sink.on("data", chunk => { html += chunk.toString(); });
  const errors: unknown[] = [];
  const stream = renderToPipeableStream(await page, { onShellReady() { stream.pipe(sink); }, onError(error) { errors.push(error); } });
  try {
    for (let i = 0; i < 10; i++) await turn();
    assert.match(html, /Verified coach 6/, "Real coach rows must stream while catalogue remains pending");
    assert.doesNotMatch(html, /Published player content/);
    assert.match(html, /Published featured coach/);
    assert.equal(featuredRenders, 1);
    h.catalogue.resolve([]); h.fixtures.resolve([]);
    await new Promise<void>(resolve => sink.on("end", resolve));
    assert.equal((html.match(/id="coach-rankings"/g) ?? []).length, 1);
    assert.match(html, /Published player content/);
    assert.equal(h.reads.filter(read => read === "coaches").length, 1);
    assert.equal(refreshes, 1);
    assert.equal(featuredRenders, 1);
    assert.equal((html.match(/data-featured-coach="true"/g) ?? []).length, 1);
    assert.equal(projections, 1);
    assert.equal(passedHighlights.length, 2);
    assert.equal(passedHighlights[0], passedHighlights[1]);
    assert.deepEqual(errors, []);
  } finally { stream.abort(); sink.destroy(); }
});

test("podium loading reserves real card envelopes without fabricated sporting data", () => {
  const Pending = loadPage("../app/touchline-tables/touchline-tables-client.tsx", {}, "TouchlineRankingPodiumPending");
  const html = renderToStaticMarkup(createElement(Pending, { locale: "en-GB" }));
  assert.match(html, /Season Top 3 Cards/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /Loading rankings/);
  assert.doesNotMatch(html, /data-player-podium-rank|data-card-tier|data-best-eleven-player|<button|<img/);
  const css = readFileSync(new URL("../app/touchline-tables/touchline-tables.module.css", import.meta.url), "utf8");
  assert.match(css, /\.playerPodium li,\s*\.podiumPlaceholder\s*\{/);
  assert.match(css, /\.podiumCardPlaceholder\s*\{[^}]*aspect-ratio: 430 \/ 691/);
  assert.doesNotMatch(css, /\.podiumCardPlaceholder\s*\{[^}]*height:\s*\d+px/);
});

test("coach failure is observed before auth and still rejects the leadership frame", async () => {
  const coach = deferred<unknown>();
  const error = new Error("coach evidence unavailable");
  const h = rankingsWithDeferredSchedule({ "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: () => coach.promise } });
  const page = h.page({ searchParams: Promise.resolve({ lang: "en-GB" }) });
  await turn();
  coach.reject(error);
  await turn();
  h.auth.resolve({ data: { user: null } });
  const shell = await page;
  const frame = shell.props.children[1].props.children;
  await assert.rejects(frame.type(frame.props), (reason: unknown) => reason === error);
  h.catalogue.resolve([]); h.fixtures.resolve([]);
});

test("Ranking content resolves while only its round badge awaits the unchanged schedule", async () => {
  const h = rankingsWithDeferredSchedule();
  const result = h.page({ searchParams: Promise.resolve({ lang: "en-GB" }) });
  h.auth.resolve({ data: { user: null } });
  const shell = await result;
  const badge = shell.props.children[0].props.children[1].props.children;
  const frameElement = shell.props.children[1].props.children;
  const frame = await frameElement.type(frameElement.props);
  const sporting = frame.props.children[2].props.children.props.children[0].props.children;
  let badgeReady = false;
  let sportingReady = false;
  const badgeResult = badge.type(badge.props).then((value: unknown) => { badgeReady = true; return value; });
  const sportingResult = sporting.type(sporting.props).then((value: unknown) => { sportingReady = true; return value; });
  await turn();
  assert.equal(sportingReady, false, "Catalogue still gates the sporting content");
  const cards = [{ id: "canonical-published-player" }];
  h.catalogue.resolve(cards);
  await turn();
  try {
    assert.equal(sportingReady, true, "An unused schedule must not gate published sporting content");
    assert.equal(badgeReady, false, "The badge alone still awaits verified round data");
  } finally {
    h.fixtures.resolve([{ roundName: "6" }]);
  }
  const loaded = await sportingResult;
  const client = loaded.props;
  assert.equal(client.rosterCards, undefined);
  assert.deepEqual(client.highlights.gameweekBest, { phase: "unavailable", reason: "incomplete-card-catalogue" });
  assert.equal(frame.props.children[2].props.children.props.children[1].props.coachRanking, h.coaches);
  const heroElement = frame.props.children[1].props.children;
  const hero = await heroElement.type(heroElement.props);
  assert.equal(hero.props.totalPublishedCards, 17);
  assert.equal(hero.props.totalRankedCards, 1);
  assert.equal(client.canEditCardEngine, false);
  assert.equal((await badgeResult).props.children[1], "Matchweek 6");
  assert.deepEqual(h.reads.slice().sort(), ["catalogue", "coaches", "count", "fixtures", "ranking", "xi"]);
});

for (const timing of ["before auth", "after content"] as const) {
  test(`Ranking observes schedule rejection ${timing} without poisoning published content`, async () => {
    const h = rankingsWithDeferredSchedule();
    const error = new Error(`schedule failed ${timing}`);
    const result = h.page({ searchParams: Promise.resolve({ lang: "pt-BR" }) });
    await turn();
    if (timing === "before auth") { h.fixtures.reject(error); await turn(); }
    h.auth.resolve({ data: { user: null } });
    h.catalogue.resolve([]);
    const shell = await result;
    const frameElement = shell.props.children[1].props.children;
    const frame = await frameElement.type(frameElement.props);
    const sporting = frame.props.children[2].props.children.props.children[0].props.children;
    let ready = false;
    const content = sporting.type(sporting.props).then(() => { ready = true; }, (reason: unknown) => reason);
    await turn();
    if (timing === "after content") { h.fixtures.reject(error); await turn(); }
    await content;
    const badge = shell.props.children[0].props.children[1].props.children;
    await assert.rejects(badge.type(badge.props), (reason: unknown) => reason === error);
    assert.equal(ready, true, "Schedule rejection belongs to the round badge, not the sporting boundary");
  });
}

test("Ranking still propagates catalogue rejection while schedule is pending", async () => {
  const h = rankingsWithDeferredSchedule();
  const result = h.page({ searchParams: Promise.resolve({ lang: "en-GB" }) });
  h.auth.resolve({ data: { user: null } });
  const shell = await result;
  const frameElement = shell.props.children[1].props.children;
  const frame = await frameElement.type(frameElement.props);
  const sporting = frame.props.children[2].props.children.props.children[0].props.children;
  const error = new Error("catalogue unavailable");
  const rejected = assert.rejects(sporting.type(sporting.props), (reason: unknown) => reason === error);
  h.catalogue.reject(error);
  await rejected;
  h.fixtures.resolve([]);
  const badge = shell.props.children[0].props.children[1].props.children;
  assert.equal((await badge.type(badge.props)).props.children[1], "Matchweek awaiting provider");
});

test("Live starts authentication alongside schedule but refuses private detail anonymously", async () => {
  let authenticationStarted = false;
  let release!: (value: unknown) => void;
  const schedule = new Promise(resolve => { release = resolve; });
  const page = loadPage("../app/live/page.tsx", {
    "next/headers": { headers: async () => ({ get: () => null }) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { authenticationStarted = true; return { data: { user: null } }; } } }) },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: () => schedule },
    "@/lib/touchlineArena/stadium-catalog": { toTouchlineLiveFixtures: () => [] },
    "@/lib/touchlineArena/match-centre": {
      normalizeTouchlineMatchCentreTimeZone: () => "UTC",
      selectTouchlineMatchCentreSchedule: () => ({ currentFixtures: [], recentResults: [] }),
      selectTouchlineMatchCentreFixture: () => null,
    },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => false },
    "@/lib/football-data/public-fixture-match-detail-server": { readPublicFantasyFixtureMatchDetail: () => assert.fail("Anonymous detail read") },
  });
  const result = page({ searchParams: Promise.resolve({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(authenticationStarted, true);
  release([]);
  assert.equal((await result).props.initialMatchDetail, null);
});

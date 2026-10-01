import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
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
  const sporting = sportingBoundary.props.children;
  let sportingReady = false;
  const complete = sporting.type(sporting.props).then((tree: { props: { children: Array<{ props: { rosterCards?: unknown[]; highlights?: TouchlineRankingsHighlights; totalRankedCards?: number; initialPlayerRankingSnapshotId?: string } }> } }) => { sportingReady = true; return tree; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sportingReady, false, "Catalogue pending must not block the authenticated shell");
  const allCards = Array.from({ length: 5 }, (_, index) => ({ id: `published-${index}`, editorialCard: {}, seasonTotalRating: index }));
  releaseCatalogue(allCards);
  const loaded = await complete;
  assert.equal(loaded.props.children[0].props.initialPlayerRankingSnapshotId, ranking.snapshotId);
  assert.equal(loaded.props.children[1].props.rosterCards, undefined);
  assert.deepEqual(loaded.props.children[1].props.highlights?.topPlayerCards.map(card => card.id), ["published-4", "published-3", "published-2"]);
  assert.equal(loaded.props.children[1].props.totalRankedCards, 5, "Do not truncate the catalogue to the top three");
  assert.equal(shell.props.children[0].props.children[0], navigation, "Navigation is owned by the shell, not sporting completion");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const turn = () => new Promise(resolve => setImmediate(resolve));

function rankingsWithDeferredSchedule() {
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
    "@/lib/touchlineArena/rankings-i18n": { getTouchLineRankingsCopy: () => ({ pointsMode: "Published rating" }) },
    "@/lib/touchlineArena/global-navigation": { resolveTouchlineGlobalNavigationSurface: () => "public" },
  });
  return { fixtures, catalogue, auth, reads, selection, coaches, page };
}

test("Ranking content resolves while only its round badge awaits the unchanged schedule", async () => {
  const h = rankingsWithDeferredSchedule();
  const result = h.page({ searchParams: Promise.resolve({ lang: "en-GB" }) });
  h.auth.resolve({ data: { user: null } });
  const shell = await result;
  const badge = shell.props.children[0].props.children[1].props.children;
  const sporting = shell.props.children[1].props.children;
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
  const client = loaded.props.children[1].props;
  assert.equal(client.rosterCards, undefined);
  assert.deepEqual(client.highlights.gameweekBest, { phase: "unavailable", reason: "incomplete-card-catalogue" });
  assert.equal(client.coachRanking, h.coaches);
  assert.equal(client.totalPublishedCards, 17);
  assert.equal(client.totalRankedCards, 1);
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
    const sporting = shell.props.children[1].props.children;
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
  const sporting = shell.props.children[1].props.children;
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

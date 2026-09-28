import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

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
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name.endsWith(".css")) return { default: {} };
    return new Proxy({}, { get: () => () => null });
  }});
  return exports[exportName];
}

test("catalogue runs two bounded batches and merges in input order despite reverse completion", async () => {
  const started: string[][] = [];
  const releases: Array<() => void> = [];
  const load = loadPage("../lib/touchlineArena/complete-catalogue-read-server.ts", {
    "./card-publication-read-model": { loadTouchlinePublishedCardPresentations: ({ playerIds }: { playerIds: string[] }) => {
      started.push(playerIds);
      return new Promise(resolve => releases.push(() => resolve(new Map(playerIds.map(id => [id, {}])))));
    } },
  }, "loadCompleteTouchlineCataloguePresentations");
  const ids = Array.from({ length: 451 }, (_, n) => String(n).padStart(4, "0"));
  const result = load(ids, {});
  assert.equal(started.length, 2);
  assert.deepEqual(started.map(batch => batch.length), [150, 150]);
  releases[1]!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 2, "Do not start another wave while the first is pending");
  releases[0]!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 4);
  releases[3]!(); releases[2]!();
  assert.deepEqual([...((await result) as Map<string, unknown>).keys()], ids);
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
  const ranking = { snapshotId: "same-snapshot" };
  const page = loadPage("../app/touchline-tables/page.tsx", {
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale: () => "en-GB" },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: () => pending } }) },
    "@/lib/touchlineArena/card-ranking-server": {
      loadTouchLineActiveRanking: async () => { calls.push("ranking"); return ranking; },
      loadTouchLinePublishedTopEleven: async (state: unknown) => { assert.equal(state, ranking); calls.push("xi"); return []; },
    },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: async (state: unknown) => { assert.equal(state, ranking); calls.push("catalogue"); return []; } },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: async () => { calls.push("fixtures"); return []; } },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => { calls.push("coaches"); return {}; } },
    "@/lib/touchlineArena/card-publication-read-model": { countTouchlinePublishedPlayerCards: async () => { calls.push("count"); return 0; } },
    "@/lib/touchlineArena/arena-fixture-round": { selectArenaFixtureRound: () => [] },
    "@/lib/touchlineArena/rankings-i18n": { getTouchLineRankingsCopy: () => ({}) },
  });
  const result = page({ searchParams: Promise.resolve({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice().sort(), ["catalogue", "coaches", "count", "fixtures", "ranking", "xi"]);
  release({ data: { user: null } });
  await result;
});

test("My Club starts roster and wallet while avatar is pending, after identity approval", async () => {
  const calls: string[] = [];
  let release!: (value: unknown) => void;
  const avatar = new Promise(resolve => { release = resolve; });
  const stop = new Error("Reached roster presentation");
  const query = (name: string) => {
    calls.push(name);
    const chain = {
      select: () => chain, eq: () => chain, maybeSingle: () => chain,
      then: (resolve: (value: unknown) => unknown) => (name === "users" ? avatar : Promise.resolve({ data: [] })).then(resolve),
    };
    return chain;
  };
  const page = loadPage("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", {
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS: [] },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from: query }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: query }) },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/club-owner-page-identity": { resolveTouchlineClubOwnerPageIdentity: () => ({ isAuthenticatedClubOwner: true }) },
    "@/lib/touchlineArena/server-read-deadline": { resolveServerReadWithin: (promise: unknown) => promise },
    "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: async () => { calls.push("ranking"); return {}; } },
    "@/lib/touchlineArena/authoritative-roster-server": { readAuthoritativeTouchlineRoster: async (_admin: unknown, id: string) => { assert.equal(id, "owner"); calls.push("roster"); return {}; } },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasySnapshot: async () => { calls.push("fantasy"); return {}; } },
    "@/lib/touchlineArena/server-page-roster": { resolveTouchlineServerPageRoster: () => { throw stop; } },
  });
  const result = page({ searchParams: Promise.resolve({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice().sort(), ["clubowner_credit_ledger", "fantasy", "ranking", "roster", "users"]);
  release({ data: { avatar_url: "/avatar.png" } });
  await assert.rejects(result, error => error === stop);
});

test("My Club refuses a foreign identity before any private reads", async () => {
  const refused = new Error("not-found");
  const noRead = () => { assert.fail("Private read before identity approval"); };
  const page = loadPage("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", {
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS: [] },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from: noRead }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: noRead }) },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/club-owner-page-identity": { resolveTouchlineClubOwnerPageIdentity: () => null },
    "next/navigation": { notFound: () => { throw refused; } },
    "@/lib/touchlineArena/authoritative-roster-server": { readAuthoritativeTouchlineRoster: noRead },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasySnapshot: noRead },
  });
  await assert.rejects(page({ searchParams: Promise.resolve({}), ownerSlug: "foreign" }), error => error === refused);
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

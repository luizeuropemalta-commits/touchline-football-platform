import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { selectCarouselFixtureRound } from "../lib/touchlineArena/carousel-fixture-round.ts";
import { toTouchlineLiveFixtures } from "../lib/touchlineArena/stadium-catalog.ts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";
import { touchlineLiveFreshness } from "../lib/touchlineArena/live-presentation-state.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";
import type { PersistedLiveScoreSnapshot } from "../lib/football-data/live-score-snapshot-contract.ts";
import type { readPersistedLiveRail } from "../lib/touchlineArena/persisted-live-rail-server.ts";
import type { readPersistedLiveRailWithin } from "../lib/touchlineArena/persisted-live-rail-server.ts";

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const readerSource = readSource("../lib/touchlineArena/persisted-live-rail-server.ts");
const routeSource = readSource("../app/api/football-data/fantasy/livescores/route.ts");
const ownerSource = readSource("../app/clubowner/page.tsx");
const now = Date.parse("2030-10-24T12:00:00Z");
const admissionScope = { competitionId: "8" as const, seasonId: "26000" };
const storageSeasonId = "10000000-0000-4000-8000-000000000001";
const seasonTarget = { storageSeasonId, admissionScope };
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
function load(source: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, process: { env: {} }, ...globals,
    require(name: string) { assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name]; },
  });
  return exports;
}
function fixture(id: string, pair = 1, status = "Not Started"): TouchlineFixture {
  return { id: `sportmonks:${id}`, providerId: id, provider: "sportmonks", name: id,
    competitionId: "8", seasonId: "26000", roundId: "8", roundName: "8",
    source: { provider: "sportmonks", providerId: id }, startsAt: new Date(now + 3_600_000).toISOString(), status,
    homeTeam: { id: `team:${pair}`, providerId: String(pair), provider: "sportmonks", name: `Home ${pair}`, source: { provider: "sportmonks", providerId: String(pair) } },
    awayTeam: { id: `team:${pair + 1}`, providerId: String(pair + 1), provider: "sportmonks", name: `Away ${pair}`, source: { provider: "sportmonks", providerId: String(pair + 1) } },
  };
}
const fresh = (age = 0): PersistedLiveScoreSnapshot => ({ fixtures: [fixture("901", 31, "LIVE")], fetchedAt: new Date(now - age).toISOString(), storedAt: now - age });
function harness(options: { admissionScope?: { competitionId: "8"; seasonId: string } | null; snapshot?: PersistedLiveScoreSnapshot | null; schedule?: TouchlineFixture[]; snapshotError?: boolean; scheduleError?: boolean; clockNow?: number; snapshotCompletesAt?: number; scheduleCompletesAt?: number } = {}) {
  const calls: string[] = [];
  const snapshotClocks: (number | undefined)[] = [];
  const scheduleClocks: number[] = [];
  const input = options;
  const reader = load(readerSource, {
    "server-only": {},
    "@/lib/football-data/live-score-persistence": { readPersistedLiveScoreSnapshot: async (options: unknown) => {
      calls.push("snapshot");
      const request = options as { maxAgeMs: number; now?: number };
      assert.equal(request.maxAgeMs, Number.MAX_SAFE_INTEGER);
      if (request.now !== undefined) assert.equal(typeof request.now, "number");
      else assert.equal(Object.hasOwn(request, "now"), false, "Production leaves the persistence completion clock unset");
      snapshotClocks.push(request.now);
      await Promise.resolve();
      if (input.snapshotCompletesAt !== undefined) input.clockNow = input.snapshotCompletesAt;
      if (input.snapshotError) throw new Error("private persistence failure");
      return input.snapshot ?? null;
    } },
    "@/lib/football-data/fixture-schedule-store": { readCurrentPublicCompetitionSeasonTarget: async (request: { isActive: () => boolean }) => {
      calls.push("season");
      assert.equal(typeof request.isActive, "function");
      assert.equal(request.isActive(), true);
      const scope = Object.hasOwn(input, "admissionScope") ? input.admissionScope : admissionScope;
      return scope ? { storageSeasonId, admissionScope: scope } : null;
    }, readPublicCompetitionFixtures: async (...args: unknown[]) => {
      calls.push("schedule"); assert.equal(args.length, 1);
      const request = args[0] as Record<string, unknown>;
      assert.deepEqual(json(request), { seasonId: storageSeasonId, includeHistorical: true, readAllPages: true, strictRead: true });
      assert.equal(typeof request.isActive, "function");
      await Promise.resolve();
      if (input.scheduleCompletesAt !== undefined) input.clockNow = input.scheduleCompletesAt;
      if (input.scheduleError) throw new Error("private schedule failure");
      return input.schedule ?? [];
    } },
    "./carousel-fixture-round": { selectCarouselFixtureRound: (...args: Parameters<typeof selectCarouselFixtureRound>) => {
      scheduleClocks.push(args[1]); return selectCarouselFixtureRound(...args);
    } },
    "./stadium-catalog": { toTouchlineLiveFixtures },
    "./server-read-deadline": { resolveServerReadWithin },
    "./live-presentation-state": { touchlineLiveFreshness },
  }, { Date: class extends Date { static now() { return input.clockNow ?? now; } } });
  const read = reader.readPersistedLiveRail as typeof readPersistedLiveRail;
  const GET = load(routeSource, {
    "@/lib/touchlineArena/persisted-live-rail-server": { readPersistedLiveRail: read },
    "next/server": { NextResponse: { json: (body: unknown, init: { status?: number; headers: Record<string, string> }) => ({ body, status: init.status ?? 200, headers: init.headers }) } },
  }).GET as () => Promise<{ body: Record<string, unknown>; status: number; headers: Record<string, string> }>;
  return { read, GET, calls, snapshotClocks, scheduleClocks };
}
type Element = React.ReactElement<Record<string, unknown>>;
function descendants(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...descendants(child.props.children as React.ReactNode)] : []);
}
async function ownerProps(read: typeof readPersistedLiveRail, params: Record<string, string> = {}) {
  const leaf = () => null;
  const modules: Record<string, unknown> = {
    "react": { Suspense: React.Suspense }, "react/jsx-runtime": jsx,
    "@/components/touchline/TouchlineAccountLoading": { default: () => null },
    "@/components/touchline/cards/TouchlineCardLeadershipLayout": { default: React.Fragment },
    "@/lib/touchlineArena/local-read-timing": { createLocalReadTiming: () => ({ measure: (_name: string, run: () => unknown) => run() }) },
    "@supabase/supabase-js": { AuthSessionMissingError: class extends Error {} },
    "next/headers": { headers: async () => ({ get: () => null }) },
    "next/navigation": { redirect: () => assert.fail("Confirmed customer must not redirect") },
    "@/lib/touchlineArena/persisted-live-rail-server": { readPersistedLiveRailWithin: read },
    "@/lib/touchlineArena/server-read-deadline": { resolveServerReadWithin },
    "@/lib/touchlineArena/match-centre": { normalizeTouchlineMatchCentreTimeZone: () => "UTC" },
    "@/lib/touchlineArena/site-locales-release": { isTouchLineSiteLocalesEnabled: () => false },
    "@/lib/stripe/club-season-offers.server": { readClubSeasonCheckoutOffers: async (accountId: string) => {
      assert.equal(accountId, "customer", "Checkout read must use the same verified customer");
      return {};
    } },
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale: () => "pt-BR" },
    "@/lib/touchlineFantasy/market-workflow-i18n": { getTouchlineFantasyMarketWorkflowCopy: () => ({}) },
    "@/lib/touchlineArena/club-owner-profile-metrics": { clubOwnerRankingPosition: () => null },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ error: null, data: { user: { id: "customer", email: "customer@example.test" } } }) } }) },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/club-owner-page-identity": { resolveTouchlineClubOwnerPageIdentity: () => null },
    "@/lib/touchlineArena/club-owner-avatar-context-server": { createClubOwnerAvatarContextReader: () => async () => null },
    "@/lib/touchlineArena/auth-i18n": { touchLineAuthEntryHref: () => "/login" },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasyReadSnapshot: async () => null },
    "@/lib/touchlineFantasy/club-collection-server": { clubCollectionEnabled: () => false },
    "@/lib/touchlineFantasy/club-collection-read-server": { readClubCollectionServer: async () => ({ status: "unavailable" }) },
    "@/lib/touchlineFantasy/club-collection-presentation": { clubCollectionPresentationEnabled: () => false },
    "@/lib/touchlineFantasy/market-plan-policy": { isTouchlineFantasyMarketAccess: () => false },
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS: [] },
    "@/components/touchline/fantasy/ClubCollectionContext": { ClubCollectionProvider: React.Fragment },
    "@/app/fantasy/FantasyGameweekClient": { default: leaf },
    "./market-game.module.css": { default: {} },
  };
  for (const name of ["ClubOwnerMarketHeader", "ClubSeasonCheckoutReturn", "TouchlineBrandHeader", "TouchlineSignOutButton", "TouchlineGlobalNavigation"]) modules[`@/components/touchline/${name}`] = { default: () => null };
  const page = load(ownerSource, modules).default as (props: { searchParams: Promise<Record<string, string>> }) => Promise<Element>;
  const tree = await page({ searchParams: Promise.resolve({ lang: "pt-BR", ...params }) });
  assert.equal(descendants(tree).some(element => element.type === leaf), false, "The first shell streams before its data body");
  const deferred = descendants(tree).find(element => typeof element.type === "function" && element.type.name === "ClubOwnerDeferredContent");
  assert.ok(deferred, "The real async body must remain behind the streamed shell");
  const renderDeferred = deferred.type as unknown as (props: Record<string, unknown>) => Promise<React.ReactNode>;
  const body = await renderDeferred(deferred.props);
  const client = descendants(body).find(element => element.type === leaf);
  assert.ok(client, "Resolved body must forward the persisted catalogue to Fantasy");
  return client.props;
}

for (const scenario of [
  { name: "fresh visible snapshot with future catalogue", input: { snapshot: fresh(), schedule: [fixture("901", 31, "LIVE"), { ...fixture("1"), roundId: "9", roundName: "9" }] }, ids: ["901", "1"], state: "persisted-live-snapshot", degraded: false, reads: ["season", "snapshot", "schedule"] },
  { name: "exact five-minute SLA", input: { snapshot: fresh(300_000) }, ids: ["901"], state: "persisted-live-snapshot", degraded: false, reads: ["season", "snapshot", "schedule"] },
  { name: "stale snapshot retained alongside canonical schedule", input: { snapshot: fresh(300_001), schedule: [fixture("1"), fixture("2", 3), fixture("3", 5)] }, ids: ["901", "1", "2", "3"], state: "partial-persisted-schedule", degraded: true, reads: ["season", "snapshot", "schedule"] },
  { name: "snapshot failure uses persisted schedule", input: { snapshotError: true, schedule: [fixture("1")] }, ids: ["1"], state: "partial-persisted-schedule", degraded: true, reads: ["season", "snapshot", "schedule"] },
  { name: "stale LKG survives absent schedule", input: { snapshot: fresh(600_000) }, ids: ["901"], state: "persisted-live-snapshot", degraded: true, reads: ["season", "snapshot", "schedule"] },
  { name: "stale LKG survives schedule error", input: { snapshot: fresh(600_000), scheduleError: true }, ids: ["901"], state: "persisted-live-snapshot", degraded: true, reads: ["season", "snapshot", "schedule"] },
]) {
  test(`SSR and GET retain identical scoped catalogue fixtures and metadata: ${scenario.name}`, async () => {
    const h = harness(scenario.input);
    const result = await h.read();
    assert.deepEqual(h.calls, scenario.reads);
    assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), scenario.ids);
    assert.equal(result?.metadata.state, scenario.state);
    assert.equal(result?.metadata.degraded, scenario.degraded);
    if (scenario.state === "partial-persisted-schedule") assert.equal(result?.metadata.fetchedAt, undefined);
    const endpoint = await h.GET();
    const owner = await ownerProps(h.read);
    assert.equal(endpoint.status, 200);
    assert.equal(endpoint.headers["Cache-Control"], "private, no-store");
    assert.deepEqual(json(owner.initialLiveFixtures), json(endpoint.body.data));
    assert.deepEqual(json(owner.initialLiveMetadata), json(result?.metadata));
    assert.deepEqual(json(endpoint.body), json({ ok: true, data: result?.fixtures, admissionScope: result?.admissionScope, ...result?.metadata }));
  });
}
for (const input of [{ admissionScope: null }, { snapshotError: true, scheduleError: true }]) {
  test(`unavailable remains null in SSR and 503 in GET: ${JSON.stringify(input)}`, async () => {
    const h = harness(input);
    assert.equal(await h.read(), null);
    assert.deepEqual(h.calls, input.admissionScope === null ? ["season"] : ["season", "snapshot", "schedule"]);
    const endpoint = await h.GET();
    assert.equal(endpoint.status, 503);
    assert.deepEqual(json(endpoint.body), { ok: false, error: "No coherent persisted live data is available.", status: "persisted-live-data-unavailable" });
    assert.equal(endpoint.headers["Cache-Control"], "private, no-store");
    const owner = await ownerProps(h.read);
    assert.equal(owner.initialLiveFixtures, null);
    assert.equal(owner.initialLiveMetadata, null);
  });
}

test("current admission scope crosses SSR, GET, and ClubHub independently of historical seeds", async () => {
  const admissionScope = { competitionId: "8" as const, seasonId: "26000" };
  const previous = { ...fixture("990", 1, "Full Time"), competitionId: "8", seasonId: "25000",
    startsAt: new Date(now - 86_400_000).toISOString(), homeScore: 2, awayScore: 1 };
  const h = harness({ schedule: [previous], admissionScope });
  const result = await h.read({ now });
  const endpoint = await h.GET();
  const owner = await ownerProps(h.read);
  const hub = await hubComponent({ snapshotPromise: h.read(), locale: "pt-BR", initialNow: now });
  assert.deepEqual(json(result?.fixtures), [], "Historical seasons must not enter the current-season catalogue");
  for (const scope of [result?.admissionScope, endpoint.body.admissionScope, owner.initialLiveAdmissionScope, hub.props.initialAdmissionScope]) {
    assert.deepEqual(json(scope), admissionScope);
  }
  assert.equal(await harness({ schedule: [previous], admissionScope: null }).read(), null,
    "An unavailable canonical scope must not be inferred from prior results");
});

test("confirmed empty archive carries canonical scope for the first live match; failed archive does not", async () => {
  const admissionScope = { competitionId: "8" as const, seasonId: "26000" };
  const h = harness({ schedule: [], admissionScope });
  assert.deepEqual(json(await h.read()), { fixtures: [], admissionScope,
    metadata: { state: "partial-persisted-schedule", degraded: true } });
  assert.equal((await h.GET()).status, 200);
  const failed = harness({ scheduleError: true, admissionScope });
  assert.equal(await failed.read(), null);
  assert.equal((await failed.GET()).status, 503);
});

test("catalogue isolates competition and season before snapshot deduplication; missing scope fails closed", async () => {
  const canonical = fixture("501");
  const otherSeason = { ...fixture("501"), seasonId: "25000", status: "Full Time", homeScore: 8, awayScore: 0 };
  const otherCompetition = { ...fixture("502"), competitionId: "9" };
  const missingSeason = { ...fixture("503"), seasonId: undefined };
  const h = harness({ snapshot: { ...fresh(), fixtures: [canonical, otherCompetition] },
    schedule: [otherSeason, missingSeason] });
  const result = await h.read({ now });
  assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), ["501"]);
  assert.equal(result?.fixtures[0].status, canonical.status, "Foreign season cannot overwrite the current fixture with the same provider ID");
  assert.ok(result?.fixtures.every(row => row.competitionId === "8" && row.seasonId === "26000"));
  const unavailable = harness({ snapshot: fresh(), schedule: [canonical], admissionScope: null });
  assert.equal(await unavailable.read({ now }), null, "A fixture or snapshot must never infer the canonical scope");
  assert.equal((await unavailable.GET()).status, 503);
  assert.deepEqual(unavailable.calls, ["season", "season"], "Unknown scope starts neither snapshot nor archive reads");
  assert.deepEqual(unavailable.snapshotClocks, []);
});

for (const side of ["homeTeam", "awayTeam"] as const) {
  test(`a fresh snapshot with the same fixture ID but different ${side} cannot certify the canonical row`, async () => {
    const canonical = fixture("901", 31, "LIVE");
    const published = { ...canonical, [side]: fixture("901", 41, "LIVE")[side] };
    const snapshot = { ...fresh(), fixtures: [published] };
    const before = structuredClone({ canonical, snapshot });
    const result = await harness({ schedule: [canonical], snapshot }).read({ now });
    assert.deepEqual(json(result?.fixtures), json(toTouchlineLiveFixtures([canonical])), "Canonical team identity wins over the same-ID snapshot");
    assert.deepEqual(json(result?.metadata), { state: "partial-persisted-schedule", degraded: true },
      "Matching status, score and minute cannot certify a different team identity");
    assert.deepEqual({ canonical, snapshot }, before);
  });
}

test("freshness covers the visible round while the full past/current/future catalogue survives", async () => {
  const round = (number: number, status: string, offset: number) => Array.from({ length: 10 }, (_, index) => ({
    ...fixture(String(number * 100 + index), index * 2 + 1, status),
    roundId: String(number), roundName: String(number), startsAt: new Date(now + offset).toISOString(),
  }));
  const previous = round(7, "Full Time", -7 * 86_400_000);
  const current = round(8, "Full Time", -3_600_000);
  current[9] = { ...current[9], status: "In Play", homeScore: 1, awayScore: 0 };
  const next = round(9, "Not Started", 7 * 86_400_000);
  const schedule = [...previous, ...current, ...next];
  const snapshot = { ...fresh(), fixtures: current };
  const before = structuredClone({ schedule, snapshot });
  const h = harness({ schedule, snapshot });
  const result = await h.read({ now });
  assert.equal(result?.fixtures.length, 30, "Future round remains available for a mounted client, without another provider read");
  assert.ok(schedule.every(row => result?.fixtures.some(candidate => candidate.providerId === row.providerId)));
  assert.deepEqual(json(result?.metadata), { state: "persisted-live-snapshot", fetchedAt: snapshot.fetchedAt, degraded: false },
    "Older archive rows and future schedule are not mistaken for missing live coverage of the visible round");
  assert.deepEqual(h.scheduleClocks, [now], "The actual carousel selector receives the fixed clock");
  assert.deepEqual({ schedule, snapshot }, before, "Selection and metadata projection cannot mutate persisted facts");
  const incompleteCoverage = await harness({ schedule, snapshot: { ...snapshot, fixtures: current.slice(0, 9) } }).read({ now });
  assert.equal(incompleteCoverage?.fixtures.length, 30);
  assert.deepEqual(json(incompleteCoverage?.metadata), { state: "partial-persisted-schedule", degraded: true },
    "One uncovered visible fixture prevents a fresh live label without removing catalogue facts");
});

test("the rail retains the full scoped archive and upcoming catalogue without a latest-ten cutoff", async () => {
  const archive = Array.from({ length: 75 }, (_, index) => ({ ...fixture(String(1000 + index), 1, "Full Time"),
    startsAt: new Date(now - (76 - index) * 86_400_000).toISOString(), homeScore: 2, awayScore: 1 }));
  const h = harness({ snapshot: fresh(), schedule: archive });
  const result = await h.read({ now });
  assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), ["901", ...archive.map(row => row.providerId)]);
  assert.equal(result?.metadata.degraded, true, "historical results omitted by the publication are not newly verified live facts");
  assert.deepEqual(h.calls, ["season", "snapshot", "schedule"]);
  const endpoint = await h.GET();
  assert.deepEqual(json(endpoint.body.data), json(result?.fixtures));
});

test("all scoped in-play and archived fixtures survive without duplicates or invented freshness", async () => {
  const inPlay = Array.from({ length: 12 }, (_, index) => ({ ...fixture(String(2000 + index), index * 2 + 1, "In Play"),
    startsAt: new Date(now - 60_000).toISOString(), homeScore: 1, awayScore: 0, roundId: String(8 + index % 2), roundName: String(8 + index % 2) }));
  const results = Array.from({ length: 15 }, (_, index) => ({ ...fixture(String(3000 + index), 1, "Full Time"), roundId: "7", roundName: "7",
    startsAt: new Date(now - (16 - index) * 86_400_000).toISOString(), homeScore: 2, awayScore: 1 }));
  const h = harness({ schedule: [...results, ...inPlay, inPlay[0]], snapshot: fresh() });
  const selected = await h.read({ now });
  assert.equal(selected?.fixtures.length, 28);
  assert.equal(new Set(selected?.fixtures.map(row => row.providerId)).size, 28);
  assert.ok(results.every(row => selected?.fixtures.some(candidate => candidate.providerId === row.providerId)));
  assert.ok(inPlay.every(row => selected?.fixtures.some(candidate => candidate.providerId === row.providerId)));
  assert.equal(selected?.metadata.degraded, true, "a fresh unrelated snapshot cannot certify uncovered in-play fixtures");
});

test("canonical historical completion wins over an old in-play snapshot", async () => {
  const completed = { ...fixture("901", 31, "Full Time"), startsAt: new Date(now - 86_400_000).toISOString(), homeScore: 3, awayScore: 2 };
  const snapshot = { ...fresh(600_000), fixtures: [{ ...completed, status: "In Play", homeScore: 1, awayScore: 0 }] };
  const result = await harness({ schedule: [completed], snapshot }).read({ now });
  assert.equal(result?.fixtures.length, 1);
  assert.equal(result?.fixtures[0].status, "Full Time");
  assert.equal(result?.fixtures[0].homeScore, 3);
  assert.equal(result?.metadata.degraded, true);
});

test("archive-only final results remain available without claiming fresh live data", async () => {
  const result = await harness({ schedule: [{ ...fixture("7", 1, "Full Time"), startsAt: new Date(now - 86_400_000).toISOString() }] }).read({ now });
  assert.equal(result?.fixtures[0]?.providerId, "7");
  assert.deepEqual(json(result?.metadata), { state: "partial-persisted-schedule", degraded: true });
});

for (const field of ["storedAt", "fetchedAt"] as const) for (const offset of [1, 86_400_000]) {
  test(`future ${field} +${offset}ms is discarded, with degraded calendar fallback only`, async () => {
    const snapshot = { ...fresh(), [field]: field === "storedAt" ? now + offset : new Date(now + offset).toISOString() };
    const before = structuredClone(snapshot);
    const h = harness({ snapshot, schedule: [fixture("1")] });
    const result = await h.read({ now });
    assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), ["1"]);
    assert.deepEqual(json(result?.metadata), { state: "partial-persisted-schedule", degraded: true });
    assert.deepEqual(h.calls, ["season", "snapshot", "schedule"]);
    assert.deepEqual(h.snapshotClocks, [now]);
    for (const scheduleError of [false, true]) {
      const unavailable = harness({ snapshot, scheduleError });
      const fallback = await unavailable.read({ now });
      const endpoint = await unavailable.GET();
      if (scheduleError) {
        assert.equal(fallback, null, "Future evidence is not a last-known-good fallback");
        assert.equal(endpoint.status, 503);
        assert.equal(endpoint.body.status, "persisted-live-data-unavailable");
      } else {
        assert.deepEqual(json(fallback), { fixtures: [], admissionScope, metadata: { state: "partial-persisted-schedule", degraded: true } },
          "A confirmed empty scoped archive survives discarded future evidence");
        assert.equal(endpoint.status, 200);
        assert.deepEqual(json(endpoint.body.data), []);
      }
    }
    assert.deepEqual(snapshot, before, "Read must preserve original timestamps and fixture facts");
  });
}

test("both source clocks share the inclusive five-minute SLA and the injected read clock", async () => {
  for (const field of ["storedAt", "fetchedAt"] as const) for (const age of [0, 299_999, 300_000, 300_001]) {
    const snapshot = { ...fresh(), [field]: field === "storedAt" ? now - age : new Date(now - age).toISOString() };
    const h = harness({ snapshot, schedule: [fixture("901", 31, "LIVE")], clockNow: now + 86_400_000 });
    const result = await h.read({ now });
    assert.deepEqual(h.snapshotClocks, [now], "Injected clock must reach persistence rather than using wall time");
    assert.equal(result?.metadata.degraded, age > 300_000, `${field}: ${age}`);
    assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), ["901"], "Freshness does not change catalogue membership");
  }
  const staleFetched = harness({ snapshot: { ...fresh(), fetchedAt: new Date(now - 300_001).toISOString() } });
  const retained = await staleFetched.read({ now });
  assert.equal(retained?.metadata.state, "persisted-live-snapshot");
  assert.equal(retained?.metadata.degraded, true, "Past stale evidence may remain LKG, unlike future evidence");
  assert.equal(retained?.metadata.fetchedAt, new Date(now - 300_001).toISOString());
});

test("production accepts a snapshot published while the asynchronous storage read is pending", async () => {
  const snapshot = { ...fresh(), storedAt: now + 1, fetchedAt: new Date(now + 1).toISOString() };
  const before = structuredClone(snapshot);
  const h = harness({ snapshot, clockNow: now, snapshotCompletesAt: now + 1 });
  const result = await h.read();
  assert.deepEqual(h.snapshotClocks, [undefined]);
  assert.deepEqual(h.calls, ["season", "snapshot", "schedule"]);
  assert.equal(result?.metadata.degraded, false);
  assert.equal(result?.metadata.fetchedAt, snapshot.fetchedAt);
  assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), ["901"]);
  assert.deepEqual(snapshot, before);
});

test("production evaluates the five-minute boundary at read completion, not request start", async () => {
  for (const delay of [0, 1]) for (const hasSchedule of [false, true]) {
    const h = harness({ snapshot: fresh(300_000), clockNow: now, snapshotCompletesAt: now + delay,
      schedule: hasSchedule ? [fixture("901", 31, "LIVE")] : [] });
    const result = await h.read();
    assert.deepEqual(h.snapshotClocks, [undefined]);
    assert.equal(result?.metadata.degraded, delay === 1);
    assert.deepEqual(h.calls, ["season", "snapshot", "schedule"]);
    assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), ["901"]);
  }
  const fixed = harness({ snapshot: fresh(300_000), clockNow: now, snapshotCompletesAt: now + 86_400_000 });
  assert.equal((await fixed.read({ now }))?.metadata.degraded, false, "Explicit numeric clock stays deterministic across I/O");
  assert.deepEqual(fixed.snapshotClocks, [now]);
});

test("calendar fallback samples its completion clock without changing an explicitly fixed clock", async () => {
  for (const fixed of [false, true]) {
    const h = harness({ schedule: [fixture("1")], clockNow: now, snapshotCompletesAt: now + 1, scheduleCompletesAt: now + 2 });
    const result = await h.read(fixed ? { now } : {});
    assert.deepEqual(h.scheduleClocks, [fixed ? now : now + 2]);
    assert.deepEqual(json(result?.fixtures.map(row => row.providerId)), ["1"]);
    assert.equal(result?.metadata.degraded, true);
  }
});

test("shared reader stays server-only and Fantasy forwards metadata without changing legacy defaults", () => {
  assert.match(readerSource, /import "server-only"/);
  assert.doesNotMatch(readerSource + routeSource, /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot|fetch\(|setInterval|\.rpc\(|\.upsert\(/);
  assert.match(ownerSource, /readPersistedLiveRailWithin\(\)/);
  assert.match(readerSource, /readPersistedLiveRailWithin\(deadlineMs = 8_000\)/);
  const fantasy = readSource("../app/fantasy/FantasyGameweekClient.tsx");
  assert.match(fantasy, /initialLiveMetadata = \{ state: "partial-persisted-schedule", degraded: true \}/);
  assert.match(fantasy, /initialMetadata=\{initialLiveMetadata\}/);
  assert.doesNotMatch(fantasy, /initialLiveFixtures\s*=\s*\[\]/);
});

const hubSource = readSource("../app/touchline-clubs/[club]/page.tsx");
const hubAst = ts.createSourceFile("page.tsx", hubSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hubRail = hubAst.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "ClubHubPersistedLiveRail");
assert.ok(hubRail);
const hubComponent = load(`export ${hubRail.getText(hubAst)}`, { "react/jsx-runtime": jsx }, {
  ClubHubFixtureStrip: "real-strip-boundary",
}).ClubHubPersistedLiveRail as (props: { snapshotPromise: ReturnType<typeof readPersistedLiveRail>; locale: string; initialNow: number }) => Promise<Element>;

test("ClubHub streamed seed equals the endpoint and advances fixture IDs on the next SSR render", async () => {
  const first = harness({ snapshot: fresh() });
  const second = harness({ schedule: [fixture("45", 5)] });
  for (const h of [first, second]) {
    const component = await hubComponent({ snapshotPromise: h.read(), locale: "pt-BR", initialNow: now });
    const endpoint = await h.GET();
    assert.equal(component.type, "real-strip-boundary");
    assert.deepEqual(json(component.props.initialFixtures), json(endpoint.body.data));
    assert.deepEqual(json(component.props.initialMetadata), json((await h.read())?.metadata));
    assert.equal(component.props.locale, "pt-BR");
    assert.equal(component.props.initialNow, now);
    assert.equal(component.props.key, undefined, "No artificial client remount");
  }
  const unavailable = await hubComponent({ snapshotPromise: Promise.resolve(null), locale: "pt-BR", initialNow: now });
  assert.equal(unavailable.props.initialFixtures, null);
  assert.equal(unavailable.props.initialMetadata, null);
});

test("ClubHub rail starts independently through the bounded reader and never reads direct data in mirror mode", async () => {
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(hubAst) === "liveRailPromise") declaration = node;
    node.forEachChild(visit);
  };
  visit(hubAst);
  assert.ok(declaration?.initializer);
  const expression = declaration.initializer.getText(hubAst);
  let reads = 0;
  const retained = new Promise<null>(() => {});
  const context = {
    readPersistedLiveRailWithin: () => { reads++; return retained; },
  };
  const pending = runInNewContext(expression, { ...context, dataSource: "direct" });
  assert.equal(pending, retained);
  const mirror = runInNewContext(expression, { ...context, dataSource: "qa-mirror" });
  assert.equal(await mirror, null);
  assert.equal(reads, 1);
  assert.ok(hubSource.indexOf("const liveRailPromise") < hubSource.indexOf("const matchSnapshotPromise = traceClubHubLoader", hubSource.indexOf("async function renderClubHubPage")));
  const boundaryStart = hubSource.indexOf('<Suspense fallback={<section className={fixtureStripStyles.strip}');
  const boundary = hubSource.slice(boundaryStart, hubSource.indexOf("</Suspense>", boundaryStart));
  assert.match(boundary, /<ClubHubPersistedLiveRail[^>]+snapshotPromise=\{liveRailPromise\}/);
  assert.doesNotMatch(boundary, /<ClubHubFixtureStrip|key=/);
});

test("an expired SSR read never starts a late schedule read, while GET keeps the existing policy", async () => {
  for (const lateValue of [null, fresh(600_000), fresh()]) {
    const timers = new Map<number, () => void>();
    let sequence = 0;
    const deadline = load(readSource("../lib/touchlineArena/server-read-deadline.ts"), {}, {
      setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 8000); timers.set(++sequence, callback); return sequence; },
      clearTimeout: (id: number) => timers.delete(id),
    });
    let settle!: (value: PersistedLiveScoreSnapshot | null) => void;
    const storage = new Promise<PersistedLiveScoreSnapshot | null>(resolve => { settle = resolve; });
    let snapshotReads = 0;
    let scheduleReads = 0;
    const reader = load(readerSource, {
      "server-only": {}, "./server-read-deadline": deadline,
      "@/lib/football-data/live-score-persistence": { readPersistedLiveScoreSnapshot: () => { snapshotReads++; return storage; } },
      "@/lib/football-data/fixture-schedule-store": { readCurrentPublicCompetitionSeasonTarget: async () => seasonTarget, readPublicCompetitionFixtures: async () => { scheduleReads++; return [fixture("55")]; } },
      "./carousel-fixture-round": { selectCarouselFixtureRound },
      "./stadium-catalog": { toTouchlineLiveFixtures },
      "./live-presentation-state": { touchlineLiveFreshness },
    }, { Date: class extends Date { static now() { return now; } } });
    const bounded = (reader.readPersistedLiveRailWithin as typeof readPersistedLiveRailWithin)();
    assert.equal(timers.size, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(snapshotReads, 1, "Season lookup completes before the snapshot remains pending");
    [...timers.values()][0]();
    assert.equal(await bounded, null);
    settle(lateValue);
    // Drain the actual async reader and deadline cleanup, without wall-clock wait.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scheduleReads, 0, "Late storage must not start the next database read");
    assert.equal(await bounded, null, "Late fresh data cannot overwrite the fallback");
    assert.equal(timers.size, 0);
    const ordinary = await (reader.readPersistedLiveRail as typeof readPersistedLiveRail)();
    assert.ok(ordinary);
    assert.equal(scheduleReads, 1, "Unbounded GET reads the archive even with a fresh narrow snapshot");
  }
});


test("an expired season lookup starts neither snapshot nor archive reads, while GET remains unbounded", async () => {
  const timers = new Map<number, () => void>();
  let sequence = 0;
  const deadline = load(readSource("../lib/touchlineArena/server-read-deadline.ts"), {}, {
    setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 8000); timers.set(++sequence, callback); return sequence; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  let settle!: (value: typeof seasonTarget) => void;
  const lookup = new Promise<typeof seasonTarget>(resolve => { settle = resolve; });
  const calls: string[] = [];
  let lookupIsActive!: () => boolean;
  const reader = load(readerSource, {
    "server-only": {}, "./server-read-deadline": deadline,
    "@/lib/football-data/fixture-schedule-store": {
      readCurrentPublicCompetitionSeasonTarget: (request: { isActive: () => boolean }) => {
        calls.push("season"); lookupIsActive = request.isActive; return lookup;
      },
      readPublicCompetitionFixtures: async (request: { seasonId: string }) => {
        calls.push("schedule"); assert.equal(request.seasonId, storageSeasonId); return [fixture("55")];
      },
    },
    "@/lib/football-data/live-score-persistence": { readPersistedLiveScoreSnapshot: async () => { calls.push("snapshot"); return fresh(); } },
    "./carousel-fixture-round": { selectCarouselFixtureRound },
    "./stadium-catalog": { toTouchlineLiveFixtures },
    "./live-presentation-state": { touchlineLiveFreshness },
  }, { Date: class extends Date { static now() { return now; } } });
  const bounded = (reader.readPersistedLiveRailWithin as typeof readPersistedLiveRailWithin)();
  assert.equal(timers.size, 1);
  assert.deepEqual(calls, ["season"]);
  assert.equal(lookupIsActive(), true);
  [...timers.values()][0]();
  assert.equal(await bounded, null);
  assert.equal(lookupIsActive(), false, "The season reader shares the expired SSR activity guard");
  settle(seasonTarget);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["season"], "A late season lookup cannot start either subsequent database read");
  assert.equal(await bounded, null);
  assert.equal(timers.size, 0);
  assert.ok(await (reader.readPersistedLiveRail as typeof readPersistedLiveRail)());
  assert.deepEqual(calls, ["season", "season", "snapshot", "schedule"]);
});

test("checkout return does not change the streamed persisted rail identity or metadata", async () => {
  const h = harness({ snapshot: fresh(), schedule: [fixture("901", 31, "LIVE")] });
  const expected = await h.read();
  for (const checkout of ["processing", "cancelled"]) {
    const owner = await ownerProps(h.read, { checkout, session_id: "cs_test_return" });
    assert.deepEqual(json(owner.initialLiveFixtures), json(expected?.fixtures));
    assert.deepEqual(json(owner.initialLiveMetadata), json(expected?.metadata));
    assert.deepEqual(json(owner.initialLiveAdmissionScope), json(expected?.admissionScope));
  }
});

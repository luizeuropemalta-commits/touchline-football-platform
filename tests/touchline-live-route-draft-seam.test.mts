import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import { AuthSessionMissingError } from "@supabase/supabase-js";
import * as resolver from "../lib/touchlineArena/catalogue-locale.ts";
import * as auth from "../lib/touchlineArena/auth-access.ts";
import * as matchCopy from "../lib/touchlineArena/match-centre-i18n.ts";

const source = readFileSync(new URL("../app/live/page.tsx", import.meta.url), "utf8");
type Params = { lang?: string | string[]; fixture?: string | string[] };
type Props = { searchParams: Promise<Params> };
type Page = (props: Props, draft?: boolean) => Promise<ReactElement<Record<string, unknown>>>;
type Metadata = (props: Props, draft?: boolean) => Promise<{ title: string; description: string }>;
const user = { id: "11111111-1111-4111-8111-111111111111", app_metadata: { touchline_arena_access_v1: true } };
const selected = { id: "fixture-one", providerId: 123, homeName: "Official $& Home", awayName: "Official Away", homeScore: 0 };
function fixture(viewer: unknown = { data: { user }, error: null }) {
  let reads = 0, detailReads = 0;
  const persisted = [{ providerFixtureId: 123 }];
  const detail = { fixtureId: 123, events: [], score: 0 };
  const selectionCalls: unknown[][] = [];
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    "react/jsx-runtime": jsx, "@supabase/supabase-js": { AuthSessionMissingError },
    "next/headers": { headers: async () => ({ get: () => "Europe/Malta" }) },
    "next/navigation": { redirect: (href: string) => { throw Object.assign(Error("redirect"), { href }); } },
    "@/components/touchline/match-centre/TouchlineMatchCentre": { default: () => null },
    "@/lib/touchlineArena/catalogue-locale": resolver,
    "@/lib/touchlineArena/auth-access": auth,
    "@/lib/touchlineArena/match-centre-i18n": matchCopy,
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { reads++; return viewer; } } }) },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: async (options: unknown) => { assert.deepEqual(JSON.parse(JSON.stringify(options)), { includeHistorical: true, limit: 240 }); return persisted; } },
    "@/lib/football-data/official-league-table-server": { readTouchlineCurrentSeasonName: async () => "2026/27" },
    "@/lib/football-data/public-fixture-match-detail-server": { readPublicFantasyFixtureMatchDetail: async (id: number) => { assert.equal(id, selected.providerId); detailReads++; return detail; } },
    "@/lib/touchlineArena/stadium-catalog": { toTouchlineLiveFixtures: (input: unknown) => { assert.equal(input, persisted); return [selected]; } },
    "@/lib/touchlineArena/match-centre": {
      normalizeTouchlineMatchCentreTimeZone: (value: string) => value,
      selectTouchlineMatchCentreSchedule: (fixtures: unknown, now: number) => { assert.equal(now, 123456); assert.deepEqual(fixtures, [selected]); return { currentFixtures: [selected], recentResults: [] }; },
      selectTouchlineMatchCentreFixture: (...args: unknown[]) => { selectionCalls.push(args); return selected; },
      hasTouchlineMatchCentreFixture: (_fixtures: unknown, id: string) => id === selected.id,
    },
  };
  const exports = {} as { default: Page; renderLivePage: Page; generateMetadata: Metadata; generateLiveMetadata: Metadata };
  runInNewContext(ts.transpileModule(source + "\nexport {renderLivePage, generateLiveMetadata};", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, URLSearchParams, Date: { now: () => 123456 }, require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
  });
  return { exports, detail, selectionCalls, reads: () => reads, detailReads: () => detailReads };
}

test("real Live route and metadata use eight explicit draft locales with closed public wrappers", async () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) for (const draft of [false, true]) {
    const f = fixture();
    const props = { searchParams: Promise.resolve({ lang: [locale, "pt-BR"], fixture: [selected.id, "wrong"] }) };
    const tree = draft ? await f.exports.renderLivePage(props, true) : await f.exports.default(props, true);
    const metadata = draft ? await f.exports.generateLiveMetadata(props, true) : await f.exports.generateMetadata(props, true);
    const effective = resolver.resolveTouchlineCatalogueLocale(locale, draft);
    assert.equal(tree.props.initialLocale, effective);
    assert.equal(tree.props.draftLocalesEnabled, draft);
    assert.equal(metadata.title, matchCopy.getTouchlineMatchCentreCopy(locale, draft).metadataTitle);
    assert.equal(metadata.description, matchCopy.getTouchlineMatchCentreCopy(locale, draft).metadataDescription);
    assert.equal(f.reads(), 1); assert.equal(f.detailReads(), 1);
    assert.equal(tree.props.initialMatchDetail, f.detail);
    assert.deepEqual(tree.props.initialFixtures, [selected]);
    assert.equal(tree.props.initialFixtureId, selected.id);
    assert.equal(tree.props.initialNow, 123456);
    assert.equal(tree.props.initialSeasonName, "2026/27");
    assert.deepEqual(JSON.parse(JSON.stringify(f.selectionCalls[0])), [[selected], selected.id, 123456]);
    assert.equal(tree.props.canReadMatchDetail, true);
  }
});

test("absent language stays null; invalid fixture redirects before authentication in both seams", async () => {
  for (const draft of [false, true]) {
    const f = fixture();
    assert.equal((await f.exports.renderLivePage({ searchParams: Promise.resolve({}) }, draft)).props.initialLocale, null);
    const invalid = fixture();
    await assert.rejects(invalid.exports.renderLivePage({ searchParams: Promise.resolve({ lang: "ar-SA", fixture: "wrong" }) }, draft), (error: unknown) => {
      assert.ok(error && typeof error === "object" && "href" in error);
      assert.equal(error.href, `/live?lang=${draft ? "ar-SA" : "en-GB"}&fixture=fixture-one`);
      return true;
    });
    assert.equal(invalid.reads(), 0); assert.equal(invalid.detailReads(), 0);
  }
});

test("draft presentation cannot bypass verified viewer permission", async () => {
  for (const [viewer, mode] of [
    [{ data: { user }, error: Error("unverified") }, "unavailable"],
    [{ data: { user: { ...user, id: "invalid" } }, error: null }, "unavailable"],
    [{ data: { user: { ...user, app_metadata: {} } }, error: null }, "unavailable"],
    [{ data: { user: null }, error: new AuthSessionMissingError() }, "guest"],
  ] as const) {
    const f = fixture(viewer);
    const tree = await f.exports.renderLivePage({ searchParams: Promise.resolve({ lang: "ar-SA" }) }, true);
    assert.equal(tree.props.canReadMatchDetail, false);
    assert.equal(tree.props.initialMatchDetail, null);
    assert.equal(f.reads(), 1); assert.equal(f.detailReads(), 0);
    assert.deepEqual(JSON.parse(JSON.stringify(tree.props.accountLocaleContext)), { mode });
  }
});

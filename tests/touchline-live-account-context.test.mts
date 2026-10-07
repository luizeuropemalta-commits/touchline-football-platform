import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import * as auth from "../lib/touchlineArena/auth-access.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";

const source = readFileSync(new URL("../app/live/page.tsx", import.meta.url), "utf8");
const user = { id: "11111111-1111-4111-8111-111111111111", app_metadata: { touchline_arena_access_v1: true } };
async function render(result: unknown, params: Record<string, string> = {}, client = true) {
  let calls = 0;
  let details = 0;
  const selected = { id: "fixture-one", providerId: 123 };
  const siteLocalePolicy = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: siteLocalePolicy, process: { env: {} } });
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    "@supabase/supabase-js": { AuthSessionMissingError },
    "react/jsx-runtime": jsxRuntime,
    "next/headers": { headers: async () => ({ get: () => "Europe/Malta" }) },
    "next/navigation": { redirect: (url: string) => { throw new Error(`redirect:${url}`); } },
    "@/components/touchline/match-centre/TouchlineMatchCentre": { default: () => null },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: async () => [] },
    "@/lib/football-data/official-league-table-server": { readTouchlineCurrentSeasonName: async () => "2026/27" },
    "@/lib/football-data/public-fixture-match-detail-server": { readPublicFantasyFixtureMatchDetail: async () => { details++; return null; } },
    "@/lib/supabase/server": { createClient: async () => client ? { auth: { getUser: async () => { calls++; return result; } } } : null },
    "@/lib/touchlineArena/auth-access": auth,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    // Schedule seams are deterministic here: this suite exercises the real server auth/control flow.
    "@/lib/touchlineArena/match-centre": {
      normalizeTouchlineMatchCentreTimeZone: (zone: string) => zone,
      selectTouchlineMatchCentreSchedule: () => ({ currentFixtures: [selected], recentResults: [] }),
      selectTouchlineMatchCentreFixture: () => selected,
      hasTouchlineMatchCentreFixture: (_: unknown, id: string) => id === selected.id,
    },
    "@/lib/touchlineArena/stadium-catalog": { toTouchlineLiveFixtures: (fixtures: unknown) => fixtures },
    "@/lib/touchlineArena/match-centre-i18n": { getTouchlineMatchCentreCopy: () => ({}) },
  };
  const exports: { default?: (props: unknown) => Promise<{ props: Record<string, unknown> }> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, URLSearchParams, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  try {
    const element = await exports.default!({ searchParams: Promise.resolve(params) });
    return { props: element.props, calls, details, error: null };
  } catch (error) { return { props: null, calls, details, error: String(error) }; }
}

test("Live derives account locale context from its single existing verified viewer read", async () => {
  for (const params of [{ lang: "pt-BR" }, { lang: "pt-BR", fixture: "fixture-one" }]) {
    const actual = await render({ data: { user }, error: null }, params);
    assert.equal(actual.error, null);
    assert.equal(actual.calls, 1);
    assert.equal(actual.details, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.props?.accountLocaleContext)), { mode: "account", accountId: user.id });
    assert.equal(actual.props?.canReadMatchDetail, true);
    assert.equal(actual.props?.initialLocale, "pt-BR");
    assert.equal(actual.props?.draftLocalesEnabled, false, "route keeps default draft gate closed");
  }
});

test("Live locale context and detail access fail closed without a verified eligible UUID; successful guest remains guest", async () => {
  for (const [result, mode, client] of [
    [{ data: { user }, error: { message: "unverified" } }, "unavailable", true],
    [{ data: { user } }, "unavailable", true],
    [{ data: { user: { ...user, id: "not-a-uuid" } }, error: null }, "unavailable", true],
    [{ data: { user: { ...user, app_metadata: {} } }, error: null }, "unavailable", true],
    [{ data: { user: null }, error: null }, "guest", true],
    [{ data: { user: null }, error: new AuthSessionMissingError() }, "guest", true],
    [{ data: { user }, error: new AuthSessionMissingError() }, "unavailable", true],
    [{ data: { user: null }, error: { name: "AuthSessionMissingError" } }, "unavailable", true],
    [{ data: { user: null }, error: { message: "offline" } }, "unavailable", true],
    [{ data: { user: null } }, "unavailable", true],
    [{ data: { user: null }, error: "AuthSessionMissingError" }, "unavailable", true],
    [{ data: { user: null }, error: false }, "unavailable", true],
    [null, "unavailable", false],
  ] as const) {
    const actual = await render(result, { lang: "ar-SA" }, client);
    assert.equal(actual.error, null);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.props?.accountLocaleContext)), { mode });
    assert.equal(actual.calls, client ? 1 : 0);
    assert.equal(actual.details, 0, "unverified or ineligible viewers must not read match detail");
    assert.equal(actual.props?.canReadMatchDetail, false);
    assert.equal(actual.props?.initialMatchDetail, null);
    assert.equal(actual.props?.initialLocale, "en-GB");
  }
});

test("invalid Live fixture redirects before auth and detail access", async () => {
  const actual = await render({ data: { user }, error: null }, { lang: "pt-BR", fixture: "not-present" });
  assert.match(actual.error!, /redirect:\/live\?lang=pt-BR&fixture=fixture-one/);
  assert.equal(actual.calls, 0);
  assert.equal(actual.details, 0);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url), "utf8");

test("fixture totals identify the actual two datasets, not a broadcast signal", () => {
  const heading = source.slice(source.indexOf("<div className={styles.railHeading}>"), source.indexOf("className={styles.fixtureScroller}"));
  assert.match(heading, /<dt>\{dictionary.currentFixtures\}<\/dt><dd>\{schedule.currentFixtures.length\}<\/dd>/);
  assert.match(heading, /<dt>\{dictionary.recentResults\}<\/dt><dd>\{schedule.recentResults.length\}<\/dd>/);
  assert.doesNotMatch(heading, /Radio|dictionary.competition/);
  assert.match(heading, /styles.englandFlag/);
  assert.match(heading, /dictionary.league/);
});

test("match info has a content-width floor and wrapping instead of three squeezed columns", () => {
  assert.match(css, /\.infoGrid \{ grid-template-columns: repeat\(auto-fit,minmax\(min\(100%,240px\),1fr\)\)/);
  assert.match(css, /\.infoGrid > article \{ min-width: 0; overflow-wrap: anywhere/);
  assert.match(css, /\.venueCopy \{[^}]*min-width: 0; overflow-wrap: anywhere/);
  assert.match(css, /\.contentGrid \{ grid-template-columns: 1fr 1fr/);
});

test("season label localizes canonical season names without taking years from the clock", () => {
  const helper = source.slice(source.indexOf("function matchCentreSeasonLabel("), source.indexOf("function fixtureLabel("));
  const label = runInNewContext(`${stripTypeScriptTypes(helper)}; matchCentreSeasonLabel;`, { getTouchlineMatchCentreCopy });
  assert.equal(label("2026/2027", "pt-BR"), "Temporada 2026/2027");
  assert.equal(label("2026/2027", "en-GB"), "Season 2026/2027");
  assert.equal(label("2026/27", "en-GB"), "Season 2026/2027");
  assert.equal(label("2099/00", "en-GB"), "Season 2099/2100");
  assert.equal(label(null, "pt-BR"), null);
  assert.equal(label(" ", "en-GB"), null);
  assert.match(source, /<strong>\{dictionary.league\}<\/strong>\{seasonLabel \? <small>\{seasonLabel\}<\/small>/);
});

test("the Live page reads only the unique persisted current season and tolerates missing context", async () => {
  const server = readFileSync(new URL("../lib/football-data/official-league-table-server.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/live/page.tsx", import.meta.url), "utf8");
  const scope = server.slice(server.indexOf("function asRecord("), server.indexOf("function toTableTeam("));
  const readSeason = runInNewContext(`${stripTypeScriptTypes(scope.replace("export async function", "async function"))}; readTouchlineCurrentSeasonName;`, {
    PROVIDER: "sportmonks", TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID: "8",
    createAdminClient: () => { throw new Error("No real database in this test"); },
  });
  const season = { id: "season-uuid", provider_season_id: "provider-season", name: "2026/2027" };
  for (const scenario of ["ready", "empty", "ambiguous", "error", "throw"] as const) {
    const tables: string[] = [];
    const filters: unknown[] = [];
    const admin = { from: (table: string) => {
      tables.push(table);
      if (scenario === "throw") throw new Error("connection unavailable");
      const result = table === "football_competitions"
        ? { data: { id: "competition-uuid" }, error: null }
        : { data: scenario === "empty" ? [] : scenario === "ambiguous" ? [season, season] : [season], error: scenario === "error" ? {} : null };
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
        maybeSingle: async () => result,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    } };
    assert.equal(await readSeason({ providedAdmin: admin }), scenario === "ready" ? "2026/2027" : null);
    assert.deepEqual(tables, scenario === "throw" ? ["football_competitions"] : ["football_competitions", "football_seasons"]);
    if (scenario !== "throw") assert.ok(filters.some((entry) => JSON.stringify(entry) === '["is_current",true]'));
  }
  assert.equal(await readSeason({ providedAdmin: null }), null);
  assert.match(page, /readTouchlineCurrentSeasonName\(\)/);
  assert.match(page, /initialSeasonName=\{initialSeasonName\}/);
});

import assert from "node:assert/strict";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as localeModule from "../lib/touchlineArena/i18n.ts";
import * as tablesCopy from "../lib/touchlineArena/tables-presentation-i18n.ts";
import * as matchCopy from "../lib/touchlineArena/match-centre-i18n.ts";
import * as coachCopy from "../lib/touchlineArena/coach-card-i18n.ts";
import { resolveTouchlineOfficialLeagueTable, type TouchlineOfficialLeagueTable, type TouchlineOfficialLeagueTableRow } from "../lib/football-data/official-league-table.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("components/touchline/TouchlineOfficialLeagueTable.tsx");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const ownKeys = ["title", "description", "caption", "position", "club", "played", "goalsFor", "goalsAgainst", "difference", "points", "form", "stale", "scoreUnavailable", "finalResults", "seasonStatus", "seasonLive", "seasonVerified", "seasonInitial", "seasonChecking", "pendingTitle", "pendingDescription", "partialTitle", "partialDescription", "unavailableTitle", "unavailableDescription", "integrityTitle", "integrityDescription", "scrollLabel"] as const;
type Copy = Record<typeof ownKeys[number] | "eyebrow" | "won" | "drawn" | "lost" | "live" | "currentClub", string>;
type CopyModule = typeof import("../lib/touchlineArena/official-league-table-i18n.ts");
const load = () => import("../lib/touchlineArena/official-league-table-i18n.ts");
const baseline = {
  "en-GB": ["Official League Table", "The one official table combines TouchLine Verified final results with the latest persisted live scores. Live rows and positions are provisional until full time.", "TouchLine England official league table", "Pos", "Club", "P", "GF", "GA", "GD", "Pts", "Form", "STALE", "score unavailable", "verified final results", "Season status", "Live · provisional", "Verified through latest final", "Initial standings", "Integrity check", "Initial table — all 20 clubs are level.", "Every club is level on sporting criteria. Continuous positions use alphabetical display order only until a verified result separates them.", "Verified results remain visible; league positions are temporarily withheld.", "TouchLine detected a duplicated fixture observation. No position is published until table integrity is restored.", "Official standings are temporarily unavailable.", "No league position is shown until TouchLine can verify the canonical result set again.", "Official standings are being checked.", "TouchLine found an identity or season consistency issue, so no league position is published.", "Scrollable league table, 20 clubs"],
  "pt-BR": ["Tabela Oficial da Liga", "A única tabela oficial combina resultados finais verificados com os últimos placares ao vivo persistidos. Linhas e posições ao vivo são provisórias até o fim.", "Tabela oficial da liga TouchLine England", "Pos", "Clube", "J", "GF", "GA", "SG", "Pts", "Forma", "DESATUALIZADO", "placar indisponível", "resultados finais verificados", "Status da temporada", "Ao vivo · provisória", "Verificada até o último resultado final", "Tabela inicial", "Verificação de integridade", "Tabela inicial — os 20 clubes estão empatados.", "Todos os clubes estão empatados nos critérios esportivos. As posições contínuas usam ordem alfabética apenas para apresentação até que um resultado verificado os separe.", "Os resultados verificados continuam visíveis; as posições estão temporariamente suspensas.", "A TouchLine detectou uma observação duplicada de fixture. Nenhuma posição é publicada até a integridade da tabela ser restaurada.", "A tabela oficial está temporariamente indisponível.", "Nenhuma posição é exibida até a TouchLine verificar novamente o conjunto canônico de resultados.", "A tabela oficial está sendo verificada.", "A TouchLine encontrou uma inconsistência de identidade ou temporada; nenhuma posição é publicada.", "Tabela rolável da liga, 20 clubes"],
} as const;
const draftVisibleCopy = {
  "es-ES": { title: "Clasificación oficial de la liga", pendingTitle: "Clasificación inicial: los 20 clubes están empatados.", unavailableTitle: "La clasificación oficial no está disponible temporalmente.", scrollLabel: "Clasificación de liga desplazable, 20 clubes" },
  "it-IT": { title: "Classifica ufficiale della lega", pendingTitle: "Classifica iniziale: tutti i 20 club sono a pari merito.", unavailableTitle: "La classifica ufficiale è temporaneamente indisponibile.", scrollLabel: "Classifica della lega scorrevole, 20 club" },
  "fr-FR": { title: "Classement officiel de la ligue", pendingTitle: "Classement initial : les 20 clubs sont à égalité.", unavailableTitle: "Le classement officiel est temporairement indisponible.", scrollLabel: "Classement de ligue défilant, 20 clubs" },
  "ar-SA": { title: "جدول ترتيب الدوري الرسمي", pendingTitle: "الجدول الأولي — الأندية العشرون متساوية.", unavailableTitle: "الترتيب الرسمي غير متاح مؤقتًا.", scrollLabel: "جدول ترتيب دوري قابل للتمرير، 20 ناديًا" },
  "tr-TR": { title: "Resmî lig tablosu", pendingTitle: "Başlangıç tablosu — 20 kulübün tamamı eşit.", unavailableTitle: "Resmî sıralama geçici olarak kullanılamıyor.", scrollLabel: "Kaydırılabilir lig tablosu, 20 kulüp" },
  "de-DE": { title: "Offizielle Ligatabelle", pendingTitle: "Anfangstabelle — alle 20 Vereine sind gleichauf.", unavailableTitle: "Die offizielle Tabelle ist vorübergehend nicht verfügbar.", scrollLabel: "Scrollbare Ligatabelle, 20 Vereine" },
} as const;
function evaluate<T>(text: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, ...globals, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  return exports as T;
}
function draftCatalogue(seen?: unknown[]) {
  const actual = evaluate<CopyModule>(read("lib/touchlineArena/official-league-table-i18n.ts"), {
    "./catalogue-locale.ts": { resolveTouchlineCatalogueLocale: (locale: string, enabled = false) => { seen?.push(locale); return resolveTouchlineCatalogueLocale(locale, enabled); } },
    "./tables-presentation-i18n.ts": tablesCopy,
    "./match-centre-i18n.ts": matchCopy,
    "./coach-card-i18n.ts": coachCopy,
  });
  return { ...actual, getTouchlineOfficialLeagueTableCopy: (locale?: string | null) => actual.getTouchlineOfficialLeagueTableCopy(locale, true) };
}
function view(getCopy: (locale?: string | null) => Copy) {
  const links: Record<string, unknown>[] = [], effects: (() => void | (() => void))[] = [], intervals: { callback: () => void; ms: number }[] = [], cleared: number[] = [];
  let refreshes = 0, traces = 0;
  const Table = evaluate<{ default: (props: Record<string, unknown>) => React.ReactElement }>(source, {
    "react": { ...React, useEffect: (fn: () => void | (() => void)) => effects.push(fn) },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "next/link": { default: (props: Record<string, unknown>) => { links.push(props); const htmlProps = { ...props }; delete htmlProps.prefetch; return React.createElement("a", htmlProps, props.children as React.ReactNode); } },
    "@/components/touchline/TouchlineClubPerimeterTrace": { default: () => { traces++; return null; } },
    "@/lib/touchlineArena/official-league-table-i18n": { getTouchlineOfficialLeagueTableCopy: getCopy },
    "./TouchlineOfficialLeagueTable.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  }, { window: { setInterval: (callback: () => void, ms: number) => { intervals.push({ callback, ms }); return 11; }, clearInterval: (id: number) => cleared.push(id) } }).default;
  return { links, effects, intervals, cleared, refreshes: () => refreshes, traces: () => traces, render(table: TouchlineOfficialLeagueTable, extra: Record<string, unknown> = {}) {
    links.length = 0; effects.length = 0; traces = 0;
    const props = { table, locale: "en-GB", variant: "profile", currentTeamId: "team-0", id: "official-table", className: "owner-class", ...extra };
    const before = JSON.stringify(props), html = renderToStaticMarkup(Table(props)); assert.equal(JSON.stringify(props), before); return html;
  } };
}
function row(index: number, live: boolean): TouchlineOfficialLeagueTableRow {
  return { sportsRank: index + 1, isTied: false, displayPosition: index === 2 ? null : index + 1,
    team: { providerTeamId: `team-${index}`, name: `Official $& <Club ${index}>`, shortCode: `C${index}`, slug: `club-${index}`, logoUrl: index ? null : "/club.svg" },
    played: index, won: index, drawn: 0, lost: 0, goalsFor: index, goalsAgainst: 0, goalDifference: index - 1, points: index * 3, form: index ? ["W", "D", "L"] : [],
    liveFixture: live ? { providerFixtureId: `fixture-${index}`, scoreFor: index === 2 ? null : 0, scoreAgainst: 0, stale: index === 1 } : null,
  };
}
function table(state: TouchlineOfficialLeagueTable["state"], count = 3, live = false): TouchlineOfficialLeagueTable {
  return { state, competitionProviderId: "8", season: { id: "season", providerSeasonId: "28083", name: "Official season $&", sourceUpdatedAt: null }, asOf: null,
    coverage: { expectedClubs: 20, mappedClubs: 20, fixturesInSeason: 0, completedFixtures: 0, liveFixtures: live ? 1 : 0, duplicateFixtures: 0 },
    rows: Array.from({ length: count }, (_, index) => row(index, live)), reason: null };
}
const escape = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
const states = ["ready", "pending_no_final", "partial", "unavailable", "integrity_error"] as const;

test("official table real consumer forwards full locale to actual visible bindings", () => {
  const seen: unknown[] = [];
  const sentinel = Object.fromEntries([...ownKeys, "eyebrow", "won", "drawn", "lost", "live", "currentClub"].map(key => [key, `SENTINEL_${key} <&>`])) as Copy;
  const f = view(locale => { seen.push(locale); return sentinel; });
  const html = f.render(table("pending_no_final", 3, true), { locale: "ar-SA", variant: "profile" });
  assert.deepEqual(seen, ["ar-SA"]);
  for (const key of ["title", "caption", "pendingTitle", "pendingDescription", "scrollLabel", "won", "drawn", "lost", "live", "currentClub"]) assert.ok(html.includes(escape(sentinel[key as keyof Copy])), key);
  assert.ok(!html.includes("<Club"));
  const allStates = html + states.map(state => f.render(table(state), { locale: "ar-SA", variant: "directory" })).join("");
  for (const [key, value] of Object.entries(sentinel)) assert.ok(allStates.includes(escape(value)), `visible binding: ${key}`);
});

test("official table preserves all 34 EN/PT fields, exact reuses and 28 eight-locale catalogue keys", async () => {
  const c = await load();
  assert.deepEqual(Object.keys(c.TOUCHLINE_OFFICIAL_LEAGUE_TABLE_CATALOGUES), locales);
  assert.deepEqual(c.TOUCHLINE_OFFICIAL_LEAGUE_TABLE_DRAFT_LOCALES, locales.slice(2)); assert.equal(c.TOUCHLINE_OFFICIAL_LEAGUE_TABLE_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const raw = c.TOUCHLINE_OFFICIAL_LEAGUE_TABLE_CATALOGUES[locale]; assert.deepEqual(Object.keys(raw), ownKeys);
    for (const key of ownKeys) assert.ok(raw[key].trim(), `${locale}:${key}`);
    const copy = c.getTouchlineOfficialLeagueTableCopy(locale), resolved = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.deepEqual(Object.keys(copy).sort(), [...ownKeys, "eyebrow", "won", "drawn", "lost", "live", "currentClub"].sort());
    assert.deepEqual(ownKeys.map(key => copy[key]), baseline[resolved]); assert.equal(copy.eyebrow, "TouchLine England League");
    assert.equal(copy.won, tablesCopy.getTouchlineTablesPresentationCopy(locale).winsShort);
    assert.equal(copy.drawn, tablesCopy.getTouchlineTablesPresentationCopy(locale).drawsShort);
    assert.equal(copy.lost, tablesCopy.getTouchlineTablesPresentationCopy(locale).lossesShort);
    assert.equal(copy.live, matchCopy.getTouchlineMatchCentreCopy(locale).liveNow);
    assert.equal(copy.currentClub, coachCopy.getTouchlineCoachCardCopy(locale).currentClub);
  }
  for (const locale of [null, undefined, "pt", "constructor", "unknown"]) assert.equal(c.getTouchlineOfficialLeagueTableCopy(locale).title, baseline["en-GB"][0]);
  for (const locale of locales.slice(2)) assert.equal(localeModule.isTouchLineLocaleComplete(locale), false);
});

test("official table full draft locales reach each exact reused getter without changing public gates", () => {
  const seen: unknown[] = [];
  const c = evaluate<CopyModule>(read("lib/touchlineArena/official-league-table-i18n.ts"), {
    "./catalogue-locale.ts": { resolveTouchlineCatalogueLocale: (locale: string, enabled = false) => { seen.push(["normalize", locale]); return resolveTouchlineCatalogueLocale(locale, enabled); } },
    "./tables-presentation-i18n.ts": { getTouchlineTablesPresentationCopy: (locale: string) => { seen.push(["tables", locale]); return { winsShort: "WIN_REUSE", drawsShort: "DRAW_REUSE", lossesShort: "LOSS_REUSE" }; } },
    "./match-centre-i18n.ts": { getTouchlineMatchCentreCopy: (locale: string) => { seen.push(["live", locale]); return { liveNow: "LIVE_REUSE" }; } },
    "./coach-card-i18n.ts": { getTouchlineCoachCardCopy: (locale: string) => { seen.push(["club", locale]); return { currentClub: "CLUB_REUSE" }; } },
  });
  for (const locale of locales) {
    seen.length = 0; const copy = c.getTouchlineOfficialLeagueTableCopy(locale, true);
    assert.deepEqual(seen, [["normalize", locale], ["tables", locale], ["live", locale], ["club", locale]]);
    assert.deepEqual([copy.won, copy.drawn, copy.lost, copy.live, copy.currentClub], ["WIN_REUSE", "DRAW_REUSE", "LOSS_REUSE", "LIVE_REUSE", "CLUB_REUSE"]);
  }
});

test("official table six draft descriptions preserve the exact TouchLine Verified brand", async () => {
  const c = await load();
  const assertBrand = (description: string) => assert.equal(
    description.match(/(?<![\p{L}\p{N}_])TouchLine Verified(?![\p{L}\p{N}_])/gu)?.length ?? 0,
    1,
    "description must retain exactly one literal TouchLine Verified",
  );
  for (const invalid of ["resultados verificados", "Touchline Verified", "TouchLine verificado", "TouchLine Verified TouchLine Verified", "NotTouchLine Verified", "TouchLine VerifiedExtra"]) {
    assert.throws(() => assertBrand(invalid), /exactly one literal TouchLine Verified/);
  }
  assertBrand("Resultados de TouchLine Verified.");
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const) {
    assertBrand(c.TOUCHLINE_OFFICIAL_LEAGUE_TABLE_CATALOGUES[locale].description);
    assert.equal(localeModule.isTouchLineLocaleComplete(locale), false);
  }
});

test("official table draft headings and unavailable states preserve literal copy for every review locale", async () => {
  const c = await load();
  for (const locale of locales.slice(2)) {
    const raw = c.TOUCHLINE_OFFICIAL_LEAGUE_TABLE_CATALOGUES[locale];
    assert.deepEqual(
      { title: raw.title, pendingTitle: raw.pendingTitle, unavailableTitle: raw.unavailableTitle, scrollLabel: raw.scrollLabel },
      draftVisibleCopy[locale],
    );
    assert.equal(localeModule.isTouchLineLocaleComplete(locale), false);
  }
});

test("official table real SSR covers all states and variants while preserving zero/null, rows, IDs, links and attributes", () => {
  const c = draftCatalogue();
  for (const locale of locales) {
    const copy = c.getTouchlineOfficialLeagueTableCopy(locale), f = view(value => { assert.equal(value, locale); return c.getTouchlineOfficialLeagueTableCopy(value); });
    for (const state of states) for (const variant of ["directory", "profile", "clubHubRail"]) for (const count of [0, 3]) for (const live of [false, true]) {
      const dto = table(state, count, live), html = f.render(dto, { locale, variant, action: { href: "/untouched?x=$&y=2", label: "Official action $& <keep>" } });
      assert.ok(html.includes(`data-state="${state}"`)); assert.ok(html.includes('id="official-table"')); assert.ok(html.includes('aria-labelledby="official-table-title"'));
      assert.ok(html.includes(escape(copy.title))); assert.ok(html.includes('href="/untouched?x=$&amp;y=2"')); assert.ok(html.includes(escape("Official action $& <keep>")));
      assert.equal(html.includes(escape(copy.description)), variant === "directory");
      const label = state === "pending_no_final" ? copy.pendingTitle : state === "partial" ? copy.partialTitle : state === "unavailable" ? copy.unavailableTitle : state === "integrity_error" ? copy.integrityTitle : null;
      if (label) { assert.ok(html.includes(escape(label))); assert.ok(html.includes(`role="${state === "integrity_error" ? "alert" : "status"}"`)); }
      else assert.ok(!html.includes('role="status"') && !html.includes('role="alert"'));
      if (variant === "clubHubRail") { assert.ok(!html.includes('class="seasonStatus"')); assert.equal(f.traces(), count ? 1 : 0); }
      else {
        const expectedStatus = live && count ? copy.seasonLive : state === "ready" ? copy.seasonVerified : state === "pending_no_final" ? copy.seasonInitial : copy.seasonChecking;
        assert.ok(html.includes(`aria-label="${escape(copy.seasonStatus + ": " + expectedStatus)}"`));
        assert.ok(html.includes("Official season $&amp;")); assert.ok(html.includes(`0 ${escape(copy.finalResults)}`));
      }
      const clubLinks = f.links.filter(link => link.prefetch === false); assert.equal(clubLinks.length, count);
      if (!count) { assert.ok(!html.includes("<table>")); continue; }
      assert.ok(html.includes(`<caption>${escape(copy.caption)}</caption>`));
      assert.equal(html.includes(`aria-label="${escape(copy.scrollLabel)}"`), variant !== "directory");
      assert.equal(html.includes('data-club-table-scroll-region="true"'), variant === "clubHubRail");
      for (let index = 0; index < count; index++) {
        assert.equal(clubLinks[index].href, `/touchline-clubs/club-${index}?lang=${encodeURIComponent(locale)}`);
        assert.equal(clubLinks[index]["aria-current"], index === 0 ? "page" : undefined);
        assert.ok(html.includes(escape(dto.rows[index].team.name)));
      }
      assert.match(html, /src="\/club.svg" alt="" loading="lazy" decoding="async"/);
      assert.match(html, /class="rankCell">—<\/td>/); assert.ok(html.includes("<td>-1</td>")); assert.ok(html.includes("<td>0</td>")); assert.ok(html.includes("<td>+1</td>"));
      assert.ok(html.includes('class="form">—</td>')); assert.ok(html.includes('class="form">W · D · L</td>'));
      if (live) { assert.ok(html.includes("0–0")); assert.ok(html.includes(escape(copy.scoreUnavailable))); assert.ok(html.includes(escape(`${copy.live} · ${copy.stale}`))); assert.match(html, /data-live-stale="true"/); }
      else assert.ok(!html.includes('data-live="true"'));
    }
  }
});

test("official table keeps ten-second refresh and cleanup; catalogue rendering never itself starts work", async () => {
  const c = await load(), f = view(c.getTouchlineOfficialLeagueTableCopy);
  f.render(table("ready", 3, true)); assert.equal(f.intervals.length, 0); assert.equal(f.refreshes(), 0);
  const cleanup = f.effects[0](); assert.equal(f.intervals[0].ms, 10_000); f.intervals[0].callback(); assert.equal(f.refreshes(), 1);
  cleanup?.(); assert.deepEqual(f.cleared, [11]);
  const idle = view(c.getTouchlineOfficialLeagueTableCopy); idle.render(table("ready", 3, false)); assert.equal(idle.effects[0](), undefined); assert.equal(idle.intervals.length, 0);
  const input = { season: { id: "season", providerSeasonId: "28083", name: "2026/27", sourceUpdatedAt: null },
    teams: Array.from({ length: 20 }, (_, i) => ({ clubId: `club-${i}`, providerTeamId: String(i), name: `Official ${i}`, shortCode: null, slug: `club-${i}`, logoUrl: null, sourceUpdatedAt: null })), fixtures: [] };
  const actual = resolveTouchlineOfficialLeagueTable(input); assert.equal(actual.state, "pending_no_final");
  const html = idle.render(actual, { locale: "pt-BR" }); assert.ok(html.includes(baseline["pt-BR"][19])); assert.equal(idle.links.length, 20);
  assert.deepEqual(actual.rows.map(row => row.displayPosition), Array.from({ length: 20 }, (_, i) => i + 1));
});

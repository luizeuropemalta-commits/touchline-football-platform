import assert from "node:assert/strict";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import * as profileCopy from "../lib/touchlineArena/coach-profile-i18n.ts";
import * as tablesCopy from "../lib/touchlineArena/tables-presentation-i18n.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as coachCardCopy from "../lib/touchlineArena/coach-card-i18n.ts";
import * as matchCopy from "../lib/touchlineArena/match-centre-i18n.ts";
import * as countries from "../lib/touchlineArena/country-labels.ts";
import * as tiers from "../lib/touchlineArena/card-rules.ts";
import * as slots from "../lib/touchlineArena/coach-card.ts";
import * as projection from "../lib/touchlineArena/coach-competition-projection.ts";
import * as live from "../lib/touchlineArena/live-coaches.ts";
import * as clubs from "../lib/touchlineArena/demo-data.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const source = readFileSync(new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url), "utf8");
const loadCopy = () => import("../lib/touchlineArena/coach-profile-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const en = {
  metadataFallback: "Coach profile | TouchLine England", heroEyebrow: "REAL FOOTBALL · COACH",
  verification: "Verification", verifiedBy: "Verified by TouchLine", performance: "Season performance", tier: "Tier",
  currentRank: "Current rank", matches: "Matches", homeCampaign: "Home campaign", awayCampaign: "Away campaign",
  competitionExplanation: "Wins, draws, losses and points come from the canonical competition standings and remain identical on every card for this coach.",
  classificationDescription: "Classification: {reason}. The tier stays fixed through the season.",
  officialProfile: "OFFICIAL PROFILE", coachContext: "Coach context", currentClubHeading: "CURRENT CLUB",
  seasonCampaign: "Season campaign", seasonForm: "SEASON FORM", homeAndAway: "Home and away",
  previousClub: "Previous club", previousLeague: "Previous league", finalPosition: "Final position",
  historyPending: "Club and league history has not yet been confirmed by the official source. TouchLine keeps the classification pending instead of inventing data.",
  reasonEliteFinal: "Elite-league final position", reasonPromoted: "Promoted club", reasonNewcomer: "No confirmed complete senior season",
  reasonNonElite: "History outside the initial elite leagues", reasonHistoryPending: "History under verification", reasonFallback: "Classification under verification",
};
const pt = {
  metadataFallback: "Perfil do treinador | TouchLine England", heroEyebrow: "FUTEBOL REAL · TREINADOR",
  verification: "Verificação", verifiedBy: "TouchLine Verified", performance: "Desempenho da temporada", tier: "Tier",
  currentRank: "Ranking atual", matches: "Partidas", homeCampaign: "Campanha em casa", awayCampaign: "Campanha fora",
  competitionExplanation: "Vitórias, empates, derrotas e pontos vêm da classificação canônica da competição e são os mesmos para todos os cards deste treinador.",
  classificationDescription: "Classificação: {reason}. O tier fica fixo durante a temporada.",
  officialProfile: "PERFIL OFICIAL", coachContext: "Contexto do treinador", currentClubHeading: "CLUBE ATUAL",
  seasonCampaign: "Campanha da temporada", seasonForm: "FORMA DA TEMPORADA", homeAndAway: "Casa e fora",
  previousClub: "Clube anterior", previousLeague: "Liga anterior", finalPosition: "Posição final",
  historyPending: "O histórico de clubes e ligas ainda não foi confirmado pela fonte oficial. A TouchLine mantém a classificação pendente em vez de inventar dados.",
  reasonEliteFinal: "Posição final em liga de elite", reasonPromoted: "Clube promovido", reasonNewcomer: "Sem temporada sénior completa confirmada",
  reasonNonElite: "Histórico fora das ligas de elite iniciais", reasonHistoryPending: "Histórico em validação", reasonFallback: "Classificação em validação",
};
const draftTitles = ["Perfil del entrenador", "Profilo dell’allenatore", "Profil de l’entraîneur", "الملف الشخصي للمدرب", "Teknik direktör profili", "Trainerprofil"];
const reasons = ["elite-final-position", "elite-relegation-free", "promoted", "newcomer", "non-elite-fallback", "classification-pending", "unknown"];
const reasonKeys = ["reasonEliteFinal", "reasonEliteFinal", "reasonPromoted", "reasonNewcomer", "reasonNonElite", "reasonHistoryPending", "reasonFallback"] as const;
const escape = (text: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, text));
function compile(text: string, modules: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name: string) => {
      if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy; assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
    fetch: () => assert.fail("No real requests"),
  });
  return exports;
}
type Element = React.ReactElement<Record<string, unknown>>;
function walk(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child) ? [child, ...walk(child.props.children as React.ReactNode)] : []);
}
async function fixture({ future = false, sentinel = false, missing = "", competition = true, rank = 1, history = true, reason = "elite-final-position", name = "Mikel Arteta" } = {}) {
  const normalize = (value?: string | null) => resolveTouchlineCatalogueLocale(value, future);
  const calls: string[] = [];
  const own = sentinel ? Object.fromEntries(Object.keys(en).map(key => [key, key === "classificationDescription" ? "classificationDescription:{reason}" : `${key}:$&<>`])) : null;
  const copyModule = sentinel ? {
    getTouchlineCoachProfileCopy: (locale: string) => { calls.push(`copy:${locale}`); return own; },
    getTouchlineCoachProfileReason: () => "reason:$&<>",
  } : profileCopy;
  const entry = { ...live.TOUCHLINE_LIVE_COACHES[0], coach: { ...live.TOUCHLINE_LIVE_COACHES[0].coach, displayName: name } };
  const classification = { ...live.touchlineCoachClassificationForProviderId(entry.coach.providerId)!, classificationReason: reason,
    sourceClub: history ? "Official $&<Club>" : null, sourceLeagueName: history ? "Official $&<League>" : null,
    sourceSeasonId: history ? "777" : null, finalPosition: history ? 0 : null };
  const ranking = { phase: competition ? "ranked" : "unavailable", snapshotId: "snapshot-exact", seasonId: "season-exact", scoringVersion: "v-exact", fixtureIds: ["123"],
    rows: [{ coachProviderId: entry.coach.providerId, rank, touchlinePoints: 0, home: { wins: 0, draws: 1, losses: 2, touchlinePoints: 0 }, away: { wins: 3, draws: 4, losses: 5, touchlinePoints: 0 } }] };
  const Card = () => React.createElement("i", { "data-leaf": "card" });
  const Performance = () => React.createElement("i", { "data-leaf": "performance" });
  const shared = sentinel ? { currentClub: "currentClub:$&<>", nationality: "nationality:$&<>" } : null;
  assert.ok(source.includes("return renderCoachProfilePage(props, isTouchLineSiteLocalesEnabled(\"/touchline-coaches/[coach]\"))"));
  assert.ok(source.includes("return generateCoachProfileMetadata(props, isTouchLineSiteLocalesEnabled(\"/touchline-coaches/[coach]\"))"));
  // Call the actual private seams without rewriting the public source gate.
  const compiled = compile(`${source}\nexport { renderCoachProfilePage, generateCoachProfileMetadata };`, {
    "react/jsx-runtime": jsx, "lucide-react": icons,
    "next/link": { default: (props: Record<string, unknown>) => React.createElement("a", { href: props.href as string, className: props.className as string }, props.children as React.ReactNode) },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/components/touchline/cards/TouchlineCoachCard": { default: Card },
    "@/components/touchline/cards/TouchlineCoachPerformance": { default: Performance },
    "@/components/touchline/TouchlineLivePresentationRefresh": { default: () => null },
    "@/components/touchline/TouchlineGlobalNavigation": { default: () => null },
    "@/components/touchline/TouchlineBrandHeader": { default: () => null },
    "@/lib/touchlineArena/account-locale-context-server": { loadAccountLocaleContext: async () => ({ mode: "unavailable" }) },
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale },
    "@/lib/touchlineArena/tables-presentation-i18n": tablesCopy,
    "@/components/touchline/TouchlineGlobalNavigation.module.css": { default: { link: "canonical-link" } },
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS: missing === "club" ? [] : clubs.TOUCHLINE_ENGLAND_CLUBS },
    "@/lib/touchlineArena/coach-card": slots,
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => { calls.push("ranking"); return ranking; } },
    "@/lib/touchlineArena/coach-competition-projection": projection,
    "@/lib/touchlineArena/country-labels": countries,
    "@/lib/touchlineArena/card-rules": tiers,
    "@/lib/touchlineArena/live-coaches": { TOUCHLINE_LIVE_COACHES: missing === "entry" ? [] : [entry], touchlineCoachClassificationForProviderId: () => { calls.push("classification"); return missing === "classification" ? null : classification; } },
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale: normalize },
    "@/lib/touchlineArena/coach-profile-i18n": copyModule,
    "@/lib/touchlineArena/coach-card-i18n": { getTouchlineCoachCardCopy: (value: string) => shared ?? (future ? coachCardCopy.TOUCHLINE_COACH_CARD_CATALOGUES[normalize(value)] : coachCardCopy.getTouchlineCoachCardCopy(value)) },
    "@/lib/touchlineArena/match-centre-i18n": { getTouchlineMatchCentreCopy: (value: string) => sentinel ? { season: "season:$&<>" } : future ? matchCopy.TOUCHLINE_MATCH_CENTRE_CATALOGUES[normalize(value)] : matchCopy.getTouchlineMatchCentreCopy(value) },
  });
  type PageProps = { params: Promise<{ coach: string }>; searchParams: Promise<{ lang?: string | string[] }> };
  type MetadataProps = { params: Promise<{ coach: string }>; searchParams?: Promise<{ lang?: string | string[] }> };
  const Page = future
    ? (props: PageProps) => (compiled.renderCoachProfilePage as (props: PageProps, enabled: boolean) => Promise<Element>)(props, true)
    : compiled.default as (props: PageProps) => Promise<Element>;
  const metadata = future
    ? (props: MetadataProps) => (compiled.generateCoachProfileMetadata as (props: MetadataProps, enabled: boolean) => Promise<{ title: string }>)(props, true)
    : compiled.generateMetadata as (props: MetadataProps) => Promise<{ title: string }>;
  return { Page, metadata, entry, classification, ranking, calls, Card, Performance, own };
}

test("coach profile metadata translates the deliberate PT fallback without loading football data", async () => {
  const f = await fixture({ sentinel: true });
  assert.equal((await f.metadata({ params: Promise.resolve({ coach: "absent" }), searchParams: Promise.resolve({ lang: "pt-BR" }) })).title, "metadataFallback:$&<>");
  assert.deepEqual(f.calls, ["copy:pt-BR"]);
});

test("coach reason rejects inherited property names instead of returning functions", async () => {
  // Characterize the original page helper before extraction as well as the new public helper.
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const old = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "coachReason");
  if (old) {
    const run = compile(`${old.getText(ast)}\nexports.run = coachReason;`, {}).run as (reason: string, pt: boolean) => unknown;
    assert.equal(run("constructor", false), "Classification under verification");
  } else {
    const mod = await loadCopy();
    for (const locale of locales) for (const reason of ["constructor", "prototype", "__proto__", "toString"]) {
      assert.equal(mod.getTouchlineCoachProfileReason(reason, locale), locale === "pt-BR" ? pt.reasonFallback : en.reasonFallback);
    }
  }
});

test("coach profile catalogue preserves EN/PT, six reason codes, drafts and closed gates", async () => {
  const mod = await loadCopy();
  assert.deepEqual(mod.TOUCHLINE_COACH_PROFILE_CATALOGUES["en-GB"], en);
  assert.deepEqual(mod.TOUCHLINE_COACH_PROFILE_CATALOGUES["pt-BR"], pt);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_COACH_PROFILE_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_COACH_PROFILE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_COACH_PROFILE_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_COACH_PROFILE_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(en).sort());
    for (const value of Object.values(copy)) assert.ok(typeof value === "string" && value.trim());
    assert.equal(copy.classificationDescription.match(/\{reason\}/g)?.length, 1);
    assert.deepEqual(mod.getTouchlineCoachProfileCopy(locale), locale === "pt-BR" ? pt : en);
    reasons.forEach((reason, index) => assert.equal(mod.getTouchlineCoachProfileReason(reason, locale), (locale === "pt-BR" ? pt : en)[reasonKeys[index]]));
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
      assert.equal(copy.metadataFallback, `${draftTitles[locales.indexOf(locale) - 2]} | TouchLine England`);
      assert.notEqual(copy.historyPending, en.historyPending);
    }
  }
  for (const locale of [null, undefined, "", "pt", "unknown", "constructor"]) assert.deepEqual(mod.getTouchlineCoachProfileCopy(locale), en);
});

test("coach real page binds own and reused copy, safely interpolates reasons and preserves names", async () => {
  for (const lang of locales) {
    const f = await fixture({ future: true, sentinel: true, name: "Official $&<Coach>" });
    const tree = await f.Page({ params: Promise.resolve({ coach: f.entry.coach.providerId }), searchParams: Promise.resolve({ lang }) });
    const html = renderToStaticMarkup(tree);
    for (const key of Object.keys(en).filter(key => !key.startsWith("reason") && !["metadataFallback", "historyPending", "classificationDescription"].includes(key))) assert.ok(html.includes(escape(`${key}:$&<>`)), key);
    for (const key of ["currentClub", "nationality", "season"]) assert.ok(html.includes(escape(`${key}:$&<>`)));
    assert.ok(html.includes("classificationDescription:reason:$&amp;&lt;&gt;"));
    assert.ok(html.includes("Official $&amp;&lt;Coach&gt;")); assert.ok(!html.includes("<Coach>"));
    assert.ok(html.includes("Official $&amp;&lt;Club&gt;")); assert.ok(html.includes("Official $&amp;&lt;League&gt;"));
    const abbreviations = {
      "en-GB": ["W", "D", "L"], "pt-BR": ["V", "E", "D"], "es-ES": ["V", "E", "D"], "it-IT": ["V", "N", "P"],
      "fr-FR": ["V", "N", "D"], "ar-SA": ["ف", "ت", "خ"], "tr-TR": ["G", "B", "M"], "de-DE": ["S", "U", "N"],
    } as const;
    const [win, draw, loss] = abbreviations[lang];
    assert.ok(html.includes(`0${win} · 1${draw} · 2${loss}`)); assert.ok(html.includes(`3${win} · 4${draw} · 5${loss}`));
    assert.ok(html.includes("TOUCHLINE GAME"));
    assert.ok(html.includes(`?lang=${lang}`));
    const nodes = walk(tree), card = nodes.find(node => node.type === f.Card)!, performance = nodes.find(node => node.type === f.Performance)!;
    assert.equal(card.props.locale, lang); assert.equal(card.props.showLeadershipCrown, true);
    assert.equal((card.props.slot as { touchlinePoints: number }).touchlinePoints, 0);
    assert.equal(performance.props.contract, null); assert.equal(performance.props.locale, lang);
    assert.equal(f.calls.filter(call => call === "ranking").length, 1);
  }
});

test("coach six classification codes and fallback reach actual page through each isolated draft", async () => {
  const mod = await loadCopy();
  for (const lang of locales) for (const [index, reason] of reasons.entries()) {
    const f = await fixture({ future: true, reason });
    const tree = await f.Page({ params: Promise.resolve({ coach: f.entry.coach.providerId }), searchParams: Promise.resolve({ lang }) });
    const text = mod.TOUCHLINE_COACH_PROFILE_CATALOGUES[lang];
    const expectedReason = lang === "en-GB" ? en[reasonKeys[index]] : lang === "pt-BR" ? pt[reasonKeys[index]] : text[reasonKeys[index]];
    const paragraph = text.classificationDescription.replace("{reason}", () => expectedReason);
    assert.ok(renderToStaticMarkup(tree).includes(`<p>${escape(paragraph)}</p>`), `${lang}:${reason}`);
  }
});

test("coach real page renders EN/PT and isolated drafts with zero, absent competition and pending history", async () => {
  const mod = await loadCopy();
  for (const future of [false, true]) for (const lang of locales) {
    const f = await fixture({ future, history: false, competition: false });
    const tree = await f.Page({ params: Promise.resolve({ coach: f.entry.coach.providerId }), searchParams: Promise.resolve({ lang }) });
    const html = renderToStaticMarkup(tree), effective = future ? lang : lang === "pt-BR" ? lang : "en-GB";
    const expected = mod.TOUCHLINE_COACH_PROFILE_CATALOGUES[effective];
    for (const key of ["heroEyebrow", "performance", "coachContext", "historyPending", "matches"] as const) assert.ok(html.includes(escape(expected[key])), `${lang}:${key}`);
    assert.ok(!html.includes('class="coach-profile-campaign"')); assert.ok(!html.includes('class="coach-profile-history-grid"'));
    assert.ok(html.includes("<strong>—</strong>"));
    const card = walk(tree).find(node => node.type === f.Card)!;
    assert.equal(card.props.showLeadershipCrown, false); assert.equal(card.props.locale, effective);
    assert.equal(walk(tree).find(node => node.type === f.Performance)!.props.competition, null);
  }
  for (const rank of [1, 2]) {
    const f = await fixture({ rank });
    const tree = await f.Page({ params: Promise.resolve({ coach: f.entry.coach.providerId }), searchParams: Promise.resolve({ lang: "pt-BR" }) });
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes("<strong>15</strong>")); assert.ok(html.includes("<dd>#0</dd>"));
    assert.equal(walk(tree).find(node => node.type === f.Card)!.props.showLeadershipCrown, rank === 1);
  }
});

test("coach metadata preserves ID and slug lookups, first-array locale and legacy optional query", async () => {
  for (const future of [false, true]) for (const lang of locales) {
    const f = await fixture({ future, name: "Álvaro $&<Coach>" });
    for (const coach of [f.entry.coach.providerId, "alvaro-coach"]) {
      const actual = await f.metadata({ params: Promise.resolve({ coach }), searchParams: Promise.resolve({ lang }) });
      assert.deepEqual(Object.keys(actual), ["title"]); assert.equal(actual.title, "Álvaro $&<Coach> | TouchLine England");
    }
    assert.equal((await f.metadata({ params: Promise.resolve({ coach: "absent" }), searchParams: Promise.resolve({ lang }) })).title,
      lang === "pt-BR" ? pt.metadataFallback : future && lang !== "en-GB" ? `${draftTitles[locales.indexOf(lang) - 2]} | TouchLine England` : en.metadataFallback);
    assert.deepEqual(f.calls, []);
  }
  const f = await fixture();
  for (const [lang, expected] of [[undefined, en.metadataFallback], ["", en.metadataFallback], ["unknown", en.metadataFallback], [[], en.metadataFallback], [["pt-BR", "en-GB"], pt.metadataFallback], [["", "pt-BR"], en.metadataFallback]] as const) {
    assert.equal((await f.metadata({ params: Promise.resolve({ coach: "absent" }), searchParams: Promise.resolve({ lang: lang as string | string[] | undefined }) })).title, expected);
  }
  assert.equal((await f.metadata({ params: Promise.resolve({ coach: "absent" }) })).title, en.metadataFallback);
});

test("coach async metadata waits for query and propagates rejection without data side effects", async () => {
  const f = await fixture(); let resolve!: (query: { lang: string }) => void;
  const held = new Promise<{ lang: string }>(done => { resolve = done; });
  let settled = false;
  const result = f.metadata({ params: Promise.resolve({ coach: "absent" }), searchParams: held }).then(value => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(settled, false); assert.deepEqual(f.calls, []);
  resolve({ lang: "pt-BR" }); assert.equal((await result).title, pt.metadataFallback);
  let releaseParams!: (value: { coach: string }) => void;
  const heldParams = new Promise<{ coach: string }>(done => { releaseParams = done; });
  settled = false;
  const waitingParams = f.metadata({ params: heldParams, searchParams: Promise.resolve({ lang: "pt-BR" }) }).then(value => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(settled, false);
  releaseParams({ coach: "absent" }); assert.equal((await waitingParams).title, pt.metadataFallback);
  const failure = new Error("query unavailable");
  await assert.rejects(f.metadata({ params: Promise.resolve({ coach: "absent" }), searchParams: Promise.reject(failure) }), error => error === failure);
  await assert.rejects(f.metadata({ params: Promise.reject(failure) }), error => error === failure);
  assert.deepEqual(f.calls, []);
});

test("coach page retains all three notFound guards before ranking reads", async () => {
  for (const missing of ["entry", "classification", "club"]) {
    const f = await fixture({ missing });
    await assert.rejects(f.Page({ params: Promise.resolve({ coach: f.entry.coach.providerId }), searchParams: Promise.resolve({ lang: "pt-BR" }) }), /NOT_FOUND/);
    assert.ok(!f.calls.includes("ranking"));
  }
});

test("coach page football calculations, identity lookup and CSS keep their preimage bytes", () => {
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wanted = new Set(["coachSlug", "TOUCHLINE_ENGLAND_SEASON", "entry", "nationalityLabel", "classification", "club", "coachRanking", "competition", "slot", "scoredSlot", "matchesPlayed", "profileLocale", "historyAvailable"]);
  const parts: string[] = [];
  let nationalityInversions = 0;
  let rankingInversions = 0;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) parts.push(node.getText(ast));
    if (ts.isVariableDeclaration(node) && wanted.has(node.name.getText(ast))) {
      let declaration = node.getText(ast);
      if (node.name.getText(ast) === "nationalityLabel") {
        const current = "localizedCountryLabel(entry.coach.nationality, locale, draftLocalesEnabled)";
        assert.equal(declaration.split(current).length - 1, 1);
        declaration = declaration.replace(current, "localizedCountryLabel(entry.coach.nationality, locale)");
        nationalityInversions += 1;
      }
      parts.push(declaration);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "[coachRanking, accountLocaleContext]") {
      assert.equal(node.initializer?.getText(ast), "await Promise.all([\n    loadTouchLineCoachRanking(), loadAccountLocaleContext(),\n  ])");
      parts.push("coachRanking = await loadTouchLineCoachRanking()");
      rankingInversions += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(nationalityInversions, 1);
  assert.equal(rankingInversions, 1);
  const css = source.slice(source.indexOf("      <style>"));
  assert.equal((css.match(/\.coach-profile-content/g) ?? []).length, 1);
  const shellPrefix = "        .coach-profile-page { min-height: 100dvh; color:";
  const contentRule = "        .coach-profile-content { padding: clamp(16px,2.5vw,32px); }\n";
  assert.equal(css.split(shellPrefix).length - 1, 1);
  assert.equal(css.split(contentRule).length - 1, 1);
  assert.ok(css.indexOf(contentRule) === css.indexOf("\n", css.indexOf(shellPrefix)) + 1, "padding wrapper immediately follows the shell rule");
  parts.push(css.replace(shellPrefix, "        .coach-profile-page { min-height: 100dvh; padding: clamp(16px,2.5vw,32px); color:")
    .replace(contentRule, ""));
  assert.equal(createHash("sha256").update(parts.join("\n")).digest("hex"), "80d954cbf7c591d85f74356901b87f9bf341db513042f0365a6e430d89c30e54");
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-coaches/[coach]")');
  const exported: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(wrapper.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: exported, ...releasePolicy, [call.expression.getText(tree)]: (props: unknown, enabled: boolean) => ({ props, enabled }),
  });
  const invoke = exported.default as (props: unknown) => Promise<{ props: unknown; enabled: boolean }>;
  try {
    for (const flag of [undefined, "false", "TRUE", "true"]) {
      if (flag === undefined) delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
      else releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      for (const lang of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
        const props = { searchParams: Promise.resolve({ lang, siteLocalesEnabled: true, draftLocalesEnabled: true, TOUCHLINE_SITE_LOCALES_ENABLED: "true" }) };
        const result = await invoke(props);
        assert.equal(result.props, props, "original route props are forwarded unchanged");
        assert.equal(result.enabled, flag === "true", lang);
      }
    }
  } finally { delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});

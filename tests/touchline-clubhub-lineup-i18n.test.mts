import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isClubHubSquadPreviewWindow } from "../lib/touchlineArena/club-lineup.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES } from "../lib/touchlineFantasy/market-workflow-i18n.ts";

const load = () => import("../lib/touchlineArena/club-hub-lineup-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    confirmedTitle: "Line-up confirmed", previewTitle: "Squad Preview", unconfirmedTitle: "Line-up not yet confirmed",
    matchdayEyebrow: "Matchday line-up", previewNotice: "This preview can change until the official TouchLine line-up is confirmed.",
    illustrativeNotice: "Illustrative squad arrangement, not a prediction of the starting XI. Await the official team sheet for the match shown.",
    matchupAria: "Match-up", matchupEyebrow: "MATCH-UP", awaitingConfirmation: "Awaiting confirmation",
    pitchAriaSuffix: "line-up pitch", emptyLineup: "No published TouchLine cards in this line-up.", positionLeadersAria: "Club leaders by position",
  },
  "pt-BR": {
    confirmedTitle: "Escalação confirmada", previewTitle: "Prévia do elenco", unconfirmedTitle: "Escalação ainda não confirmada",
    matchdayEyebrow: "Escalação da partida", previewNotice: "A prévia pode mudar até a escalação oficial TouchLine ser confirmada.",
    illustrativeNotice: "Distribuição ilustrativa do elenco, não uma previsão de titulares. Aguarde a escalação oficial da partida indicada.",
    matchupAria: "Confronto da partida", matchupEyebrow: "CONFRONTO", awaitingConfirmation: "Aguardando confirmação",
    pitchAriaSuffix: "campo de escalação", emptyLineup: "Nenhum card TouchLine publicado nesta escalação.", positionLeadersAria: "Líderes do clube por posição",
  },
};

test("exact twelve keys across eight catalogues preserve EN/PT and protected TouchLine/XI", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES), locales);
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(baseline["en-GB"]));
    for (const value of Object.values(copy)) { assert.equal(typeof value, "string"); assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|\{[^}]+\}/); }
    assert.match(copy.previewNotice, /TouchLine/); assert.match(copy.emptyLineup, /TouchLine/);
    if (locale !== "en-GB" && locale !== "pt-BR") assert.notEqual(copy.illustrativeNotice, baseline["en-GB"].illustrativeNotice);
  }
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(mod.getTouchlineClubHubLineupCopy(locale), baseline[locale]);
  assert.match(mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES["ar-SA"].confirmedTitle, /[\u0600-\u06ff]/);
});

test("six catalogues remain gated drafts; unknown/prototype inputs never publish a draft", async () => {
  const mod = await load();
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_STATUS, "draft");
  for (const locale of [...locales.slice(2), "constructor", "__proto__", "unknown", "", null, undefined]) {
    assert.equal(mod.getTouchlineClubHubLineupCopy(locale), mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES["en-GB"]);
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

type Copy = Record<keyof typeof baseline["en-GB"], string>;
async function consumer(getCopy: (locale: string) => Copy, formationCopy?: (locale: string) => { formation: string }) {
  const root = resolve(import.meta.dirname, ".."), source = readFileSync(resolve(root, "components/touchline/ClubHubOfficialLineup.tsx"), "utf8");
  const modules: Record<string, unknown> = {};
  for (const match of source.matchAll(/from "(@\/lib\/[^\"]+)"/g)) {
    const name = match[1]; modules[name] = await import(pathToFileURL(resolve(root, `${name.slice(2)}.ts`)).href);
  }
  modules["@/lib/touchlineArena/club-hub-lineup-i18n"] = { getTouchlineClubHubLineupCopy: getCopy };
  if (formationCopy) modules["@/lib/touchlineFantasy/market-workflow-i18n"] = { getTouchlineFantasyMarketWorkflowCopy: formationCopy };
  modules["@/lib/touchlineArena/club-lineup"] = { isClubHubSquadPreviewWindow: (input: Parameters<typeof isClubHubSquadPreviewWindow>[0]) =>
    isClubHubSquadPreviewWindow({ ...input, now: Date.parse("2026-11-01T12:00:00Z") }) };
  const captures: { kind: string; props: Record<string, unknown> }[] = [];
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, require: (name: string) => {
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.startsWith("@/components/")) return { default: (props: Record<string, unknown>) => {
        const kind = name.split("/").at(-1)!; captures.push({ kind, props });
        if (kind === "TouchlineEliteExactCard") return React.createElement("a", { href: props.playerProfileHref as string, "data-card": "true" });
        if (kind === "ClubHubLiveFixtureScore") return React.createElement("span", { "data-score": "true" }, "2–1");
        return React.createElement("div", { "aria-label": (props.ariaLabel as string) || undefined }, props.children as React.ReactNode);
      } };
      assert.ok(name in modules, `Unexpected import ${name}`); return modules[name];
    } });
  assert.ok(exports.default);
  const players = Array.from({ length: 11 }, (_, index) => ({ x: index === 0 ? 5 : 15 + index * 7, y: 10 + index * 7,
    card: { id: String(index + 1), name: `Official Name ${index} <&>`, shortName: `P${index}`, position: index ? "defender" : "goalkeeper", role: index ? "defender" : "goalkeeper",
      clubName: "Arsenal FC", shirtNumber: index + 1, countryCode3: "ENG", marketValue: "Pending", marketValueSource: "unavailable", touchlinePoints: 0 } }));
  return { captures, players, source, render(locale: string, options: { confirmed?: boolean; kickoff?: string | null; fixtureStatus?: string; empty?: boolean; noMatchup?: boolean; noLeaders?: boolean } = {}) {
    captures.length = 0;
    const input = { clubName: "Club <&>", locale, staticVisualQa: true, labels: { nationality: "N", points: "P", totalPoints: "TP", cardPrice: "CP" },
      lineup: { status: options.confirmed ? "confirmed" : "preview", formation: "4-3-3", players: options.empty ? [] : players },
      leaderCards: options.noLeaders ? null : React.createElement("strong", { "data-leader": "true" }, "Verified Leader"),
      matchup: options.noMatchup ? null : { fixtureId: "fixture-unchanged", initialFixture: { status: options.fixtureStatus ?? "NS" },
        home: { shortCode: "ARS" }, away: { shortCode: "CHE" }, status: "canonical-status", startsAt: "canonical-kickoff", startsAtIso: options.kickoff ?? "2026-11-02T12:00:00Z" } };
    const before = JSON.stringify(input);
    const html = renderToStaticMarkup(React.createElement(exports.default!, input));
    assert.equal(JSON.stringify(input), before);
    return html;
  } };
}

test("real SSR preserves EN/PT confirmed, T−24 preview, waiting, terminal and empty/ARIA text", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const copy = baseline[locale];
    const scenarios = [
      { options: { confirmed: true }, title: copy.confirmedTitle, notice: null },
      { options: {}, title: copy.previewTitle, notice: copy.previewNotice },
      { options: { kickoff: "2026-11-02T12:00:00.001Z" }, title: copy.unconfirmedTitle, notice: copy.illustrativeNotice },
      { options: { fixtureStatus: "FT" }, title: copy.unconfirmedTitle, notice: copy.illustrativeNotice },
      { options: { kickoff: "invalid" }, title: copy.unconfirmedTitle, notice: copy.illustrativeNotice },
    ];
    for (const { options, title, notice } of scenarios) {
      const html = view.render(locale, options); assert.ok(html.includes(`<h2>${title}</h2>`));
      assert.ok(html.includes(`aria-label="Club &lt;&amp;&gt; ${title}"`));
      if (notice) assert.ok(html.includes(notice)); else assert.doesNotMatch(html, /<p>/);
      assert.ok(html.includes(`aria-label="${copy.matchupAria}"`)); assert.ok(html.includes(copy.matchupEyebrow));
      assert.ok(html.includes(`aria-label="Club &lt;&amp;&gt; ${copy.pitchAriaSuffix}"`));
      assert.ok(html.includes(`aria-label="${copy.positionLeadersAria}"`));
      assert.ok(html.includes(TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES[locale].formation));
    }
    const empty = view.render(locale, { empty: true, noMatchup: true, noLeaders: true });
    assert.ok(empty.includes(copy.emptyLineup)); assert.doesNotMatch(empty, /data-card|data-score|data-leader/);
  }
});

test("all twelve real consumer bindings and shared formation use full locale, including gated review probes", async () => {
  const mod = await load(); const calls: string[] = [], formationCalls: string[] = [];
  const sentinel = Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, `copy:${key}`])) as Copy;
  const view = await consumer(locale => { calls.push(locale); return sentinel; }, locale => { formationCalls.push(locale); return { formation: "shared:formation" }; });
  for (const locale of locales) {
    const html = [view.render(locale, { confirmed: true }), view.render(locale), view.render(locale, { kickoff: "invalid", empty: true })].join("");
    for (const text of Object.values(sentinel)) assert.ok(html.includes(text), text);
    assert.ok(html.includes("shared:formation"));
  }
  assert.deepEqual(calls, locales.flatMap(locale => [locale, locale, locale])); assert.deepEqual(formationCalls, calls);
  for (const locale of locales) {
    const draftView = await consumer(() => mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale], () => TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES[locale]);
    const html = draftView.render(locale, { confirmed: true });
    assert.ok(html.includes(mod.TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[locale].confirmedTitle));
  }
});

test("real SSR keeps eleven coordinates, identities, links, leaders, card modes and score boundary intact", async () => {
  const mod = await load(), view = await consumer(mod.getTouchlineClubHubLineupCopy);
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const html = view.render(locale, { confirmed: true });
    assert.equal((html.match(/<article /g) ?? []).length, 11);
    for (const player of view.players) assert.ok(html.includes(`--lineup-x:${player.x}%;--lineup-y:${player.y}%`));
    assert.ok(html.includes("4-3-3")); assert.ok(html.includes("ARS")); assert.ok(html.includes("CHE")); assert.ok(html.includes("canonical-status · canonical-kickoff"));
    assert.ok(html.includes("Verified Leader"));
    const cards = view.captures.filter(item => item.kind === "TouchlineEliteExactCard"); assert.equal(cards.length, 11);
    for (const { props } of cards) { assert.equal(props.subscribeToRanking, false); assert.equal(props.enableInteractiveNeon, false); assert.equal(props.rankingMode, "preview"); assert.ok(String(props.playerProfileHref).includes(`lang=${locale}`)); }
    const zooms = view.captures.filter(item => item.kind === "TouchlineCardZoom"); assert.equal(zooms.length, 11);
    for (let index = 0; index < 11; index++) { assert.ok(String(zooms[index].props.ariaLabel).includes(view.players[index].card.name)); assert.equal(zooms[index].props.contractHref, undefined); }
    const score = view.captures.find(item => item.kind === "ClubHubLiveFixtureScore")!;
    assert.equal(score.props.fixtureId, "fixture-unchanged"); assert.equal(score.props.locale, locale);
  }
});

import assert from "node:assert/strict";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { findTouchLineClub, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { buildTouchLineClubMatchdayPresentation } from "../lib/touchlineArena/club-lineup.ts";
import type { TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";
import * as publicErrorCopy from "../lib/touchlineArena/public-error-i18n.ts";

const load = () => import("../lib/touchlineArena/club-hub-roster-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": { bench: "Bench", confirmed: "Team sheet confirmed", preview: "Bench preview · updates with the official TouchLine line-up", technicalAria: "{clubName} matchday technical area", staff: "TECHNICAL STAFF", coachUnavailable: "Coach card unavailable", awaiting: "Awaiting substitutes from the official team sheet.", shown: "Players shown: {shown} of {total}", loadMore: "View {count} more" },
  "pt-BR": { bench: "Banco", confirmed: "Súmula confirmada", preview: "Prévia do banco · atualiza com a escalação oficial TouchLine", technicalAria: "{clubName} área técnica da partida", staff: "EQUIPE TÉCNICA", coachUnavailable: "Card do treinador indisponível", awaiting: "Aguardando os reservas da súmula oficial.", shown: "Jogadores exibidos: {shown} de {total}", loadMore: "Ver mais {count}" },
};
type Copy = Record<keyof typeof baseline["en-GB"], string>;
const city = findTouchLineClub("manchester-city")!;
const roles = ["goalkeeper", "defender", "defender", "defender", "defender", "midfielder", "midfielder", "midfielder", "forward", "forward", "forward"];
const cards = (count: number): ClubOwnerSquadCard[] => Array.from({ length: count }, (_, index) => ({
  id: String(index + 1), name: `Official $& Player <${index}>`, shortName: `Player${index}`, role: roles[index % 11], position: roles[index % 11], clubName: city.name,
  shirtNumber: index + 1, countryCode3: "ENG", marketValue: "Pending", marketValueSource: "unavailable", touchlinePoints: 0, seasonTotalRating: index % 2 ? null : 0, matchRating: index % 2 ? null : 0,
}));
const labels = { nationality: "N", points: "P", totalPoints: "TP", cardPrice: "CP", currentClub: "C" };

test("only the public ClubHub route opts technical and outside-roster cards into value hiding", () => {
  const technical = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.tsx", import.meta.url), "utf8");
  const technicalCards = technical.match(/<TouchlineEliteExactCard\b[\s\S]*?\/>/g) ?? [];
  const outside = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
  const gridCards = grid.match(/<TouchlineEliteExactCard\b[\s\S]*?\/>/g) ?? [];
  const publicPage = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const visualQa = readFileSync(new URL("../app/visual-qa/clubhub-profile-contract/page.tsx", import.meta.url), "utf8");

  assert.equal(technicalCards.length, 2);
  assert.match(technical, /hideMarketValuePanel = false/);
  technicalCards.forEach(card => assert.match(card, /hideMarketValuePanel=\{hideMarketValuePanel\}/));
  assert.match(technicalCards[0], /forceNeonActive/);
  assert.match(technicalCards[1], /showMatchRating/);
  assert.match(outside, /hideMarketValuePanel = false/);
  assert.match(outside, /<ClubHubSquadGrid[\s\S]*?hideMarketValuePanel=\{hideMarketValuePanel\}/);
  assert.equal(gridCards.length, 2);
  assert.match(grid, /hideMarketValuePanel = false/);
  gridCards.forEach(card => assert.match(card, /hideMarketValuePanel=\{hideMarketValuePanel\}/));
  assert.equal((publicPage.match(/hideMarketValuePanel/g) ?? []).length, 3);
  assert.doesNotMatch(visualQa, /hideMarketValuePanel/);
});

test("nine entries preserve EN/PT baselines and placeholders with eight draft catalogues and closed public gates", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_ROSTER_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_HUB_ROSTER_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), [...Object.keys(baseline["en-GB"]), ...outsideKeys]);
    for (const key of Object.keys(baseline["en-GB"]) as (keyof Copy)[]) {
      assert.ok(copy[key].trim());
      assert.deepEqual(copy[key].match(/\{\w+\}/g), baseline["en-GB"][key].match(/\{\w+\}/g));
    }
    assert.match(copy.preview, /TouchLine/);
    if (locale === "en-GB" || locale === "pt-BR") assert.deepEqual(Object.fromEntries(Object.keys(baseline[locale]).map(key => [key, copy[key as keyof Copy]])), baseline[locale]);
    else { assert.equal(isTouchLineLocaleComplete(locale), false); assert.equal(mod.getTouchlineClubHubRosterCopy(locale), mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES["en-GB"]); }
  }
  for (const value of [undefined, null, "pt", "PT-BR", "future"]) assert.equal(mod.getTouchlineClubHubRosterCopy(value), mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES["en-GB"]);
  const requested: string[] = [], exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/club-hub-roster-i18n.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: (name: string) => { assert.equal(name, "./catalogue-locale.ts"); return { resolveTouchlineCatalogueLocale: (locale: string, enabled = false) => { requested.push(locale); return resolveTouchlineCatalogueLocale(locale, enabled); } }; } });
  for (const locale of locales) (exports.getTouchlineClubHubRosterCopy as (locale: string) => Copy)(locale);
  assert.deepEqual(requested, locales);
});

async function consumer(name: "ClubHubMatchdayTechnicalArea" | "ClubHubSquadGrid" | "ClubHubOutsideMatchRoster", getCopy: (locale: string) => Copy, reuseSentinel = false, errorCopy = publicErrorCopy.getTouchlinePublicErrorCopy) {
  const root = resolve(import.meta.dirname, ".."), source = readFileSync(resolve(root, `components/touchline/${name}.tsx`), "utf8");
  const modules: Record<string, unknown> = {};
  for (const match of source.matchAll(/from "(@\/lib\/[^\"]+)"/g)) modules[match[1]] = await import(pathToFileURL(resolve(root, `${match[1].slice(2)}.ts`)).href);
  modules["@/lib/touchlineArena/club-hub-roster-i18n"] = { ...await load(), getTouchlineClubHubRosterCopy: getCopy };
  modules["@/lib/touchlineArena/public-error-i18n"] = { getTouchlinePublicErrorCopy: errorCopy };
  if (reuseSentinel) {
    modules["@/lib/touchlineArena/coach-zoom-i18n"] = { resolveTouchlineCoachZoomPresentation: () => ({ copy: { firstTeamCoach: "REUSED_COACH" } }) };
    modules["@/lib/touchlineFantasy/market-workflow-i18n"] = { getTouchlineFantasyMarketWorkflowCopy: () => ({ technicalArea: "REUSED_TECHNICAL" }) };
  }
  let state: number | undefined;
  const captures: { kind: string; props: Record<string, unknown> }[] = [];
  const exports: { default?: (props: Record<string, unknown>) => React.ReactElement } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, require: (name: string) => {
      if (name === "react") return { ...React, useMemo: (calculate: () => unknown) => calculate(), useState: (initial: number) => {
        state ??= initial; return [state, (update: (previous: number) => number) => { state = update(state!); }];
      } };
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === "next/link") return { default: (props: Record<string, unknown>) => React.createElement("a", props, props.children as React.ReactNode) };
      if (name.startsWith("@/components/")) return { default: (props: Record<string, unknown>) => {
        const kind = name.split("/").at(-1)!; captures.push({ kind, props });
        return kind === "TouchlineEliteExactCard" ? React.createElement("a", { href: props.playerProfileHref as string, "data-card": "true" }) : React.createElement("div", null, props.children as React.ReactNode);
      } };
      assert.ok(name in modules, name); return modules[name];
    } });
  assert.ok(exports.default);
  return { captures, reset() { state = undefined; }, render(input: Record<string, unknown>) {
    captures.length = 0;
    const before = JSON.stringify(input), tree = exports.default!(input);
    const html = renderToStaticMarkup(tree), buttons: React.ReactElement<{ onClick: () => void; children: string }>[] = [];
    const visit = (node: unknown) => { if (!React.isValidElement(node)) return; if (node.type === "button") buttons.push(node as typeof buttons[number]); React.Children.forEach((node.props as { children?: React.ReactNode }).children, visit); };
    visit(tree); assert.equal(JSON.stringify(input), before); return { html, buttons };
  } };
}

test("real technical SSR translates seven labels and reuses coach/heading without changing confirmed, preview or empty semantics", async () => {
  const mod = await load();
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES[locale], view = await consumer("ClubHubMatchdayTechnicalArea", () => copy, true);
    for (const confirmed of [false, true]) for (const count of [0, 1, 9, 11]) {
      const selected = cards(count), excluded = [{ ...cards(1)[0], id: "never-selected", name: "Never selected" }];
      const props = { clubName: "Official $& Club", technical: { state: confirmed ? "confirmed" : "awaiting_official_team_sheet", bench: confirmed ? selected : excluded, previewBench: confirmed ? excluded : selected }, locale, labels, coachCard: null };
      const { html } = view.render(props);
      assert.ok(html.includes(copy.staff)); assert.ok(html.includes(copy.bench)); assert.ok(html.includes(confirmed ? copy.confirmed : copy.preview));
      assert.ok(html.includes("REUSED_COACH")); assert.ok(html.includes("REUSED_TECHNICAL"));
      assert.ok(html.includes(copy.coachUnavailable)); assert.ok(html.includes(`${Math.min(count, 9)}/9`));
      assert.ok(html.includes(`data-matchday-sheet="${confirmed ? "confirmed" : "preview"}"`));
      const expectedAria = copy.technicalAria.replace("{clubName}", () => props.clubName).replaceAll("&", "&amp;");
      assert.ok(html.includes(`aria-label="${expectedAria}"`));
      if (!count) assert.ok(html.includes(copy.awaiting));
      const rendered = view.captures.filter(item => item.kind === "TouchlineEliteExactCard");
      assert.equal(rendered.length, Math.min(count, 9));
      rendered.forEach(({ props }, index) => {
        assert.equal((props.player as { name: string }).name, selected[index].name);
        assert.equal(props.showUnpublishedIdentity, true); assert.equal(props.staticRenderScale, 104 / 430);
        assert.equal(props.rankingMode, "preview"); assert.equal(props.subscribeToRanking, false); assert.equal(props.hideMarketValuePanel, false);
        assert.ok(String(props.playerProfileHref).includes(`lang=${locale}`));
      });
      const withCoach = view.render({ ...props, coachCard: React.createElement("strong", { "data-coach": "true" }, "Official $& Coach") }).html;
      assert.ok(withCoach.includes("Official $&amp; Coach")); assert.ok(!withCoach.includes(copy.coachUnavailable));
    }
  }
});

const outsideKeys = ["outsideNotListedTitle", "outsideOtherTitle", "outsideNotListedDescription", "outsidePreviewDescription", "squadUnavailableTitle", "outsideEmptyTitle", "squadUnavailableDescription", "outsideEmptyDescription", "squadEyebrow", "squadCount", "openPlayerCard"] as const;
const outsideExpected = {
  "en-GB": ["Not listed in the available team sheet", "Other squad players", "Players not listed in the starting XI or bench for the match shown above. No reason for absence is inferred.", "The official starting XI and bench for the match shown above are not yet complete. Being outside the preview does not mean missing the match.", "The squad could not be loaded right now.", "No other squad players to display", "Try again to load the official squad data.", "All available squad members are shown above.", "CLUB SQUAD", "{count} players", "Open player card"],
  "pt-BR": ["Não relacionados na escalação disponível", "Demais jogadores do elenco", "Jogadores que não constam no time titular nem no banco da partida indicada acima. Não indica o motivo da ausência.", "A escalação e o banco oficiais da partida indicada acima ainda não estão completos. Estar fora da prévia não significa estar fora do jogo.", "Não foi possível carregar o elenco agora.", "Nenhum outro jogador a exibir", "Tente novamente para carregar os dados oficiais do elenco.", "Todos os jogadores disponíveis estão exibidos acima.", "ELENCO DO CLUBE", "{count} jogadores", "Abrir card do jogador"],
  "es-ES": ["No incluidos en la convocatoria disponible", "Otros jugadores de la plantilla", "Jugadores que no figuran en el once titular ni en el banquillo del partido mostrado arriba. No se deduce el motivo de su ausencia.", "El once titular y el banquillo oficiales del partido mostrado arriba aún no están completos. Quedar fuera de la vista previa no significa perderse el partido.", "No se ha podido cargar la plantilla ahora.", "No hay otros jugadores de la plantilla que mostrar", "Vuelve a intentarlo para cargar los datos oficiales de la plantilla.", "Todos los integrantes disponibles de la plantilla se muestran arriba.", "PLANTILLA DEL CLUB", "Jugadores: {count}", "Abrir tarjeta del jugador"],
  "it-IT": ["Non presenti nella distinta disponibile", "Altri giocatori della rosa", "Giocatori non presenti nell’undici titolare né in panchina per la partita mostrata sopra. Non viene dedotto il motivo dell’assenza.", "L’undici titolare e la panchina ufficiali della partita mostrata sopra non sono ancora completi. Essere esclusi dall’anteprima non significa saltare la partita.", "Al momento non è stato possibile caricare la rosa.", "Nessun altro giocatore della rosa da mostrare", "Riprova per caricare i dati ufficiali della rosa.", "Tutti i componenti disponibili della rosa sono mostrati sopra.", "ROSA DEL CLUB", "Giocatori: {count}", "Apri la carta del giocatore"],
  "fr-FR": ["Absents de la feuille de match disponible", "Autres joueurs de l’effectif", "Joueurs ne figurant ni dans le onze titulaire ni sur le banc pour le match indiqué ci-dessus. Aucun motif d’absence n’est déduit.", "Le onze titulaire et le banc officiels du match indiqué ci-dessus ne sont pas encore complets. Ne pas apparaître dans l’aperçu ne signifie pas manquer le match.", "L’effectif n’a pas pu être chargé pour le moment.", "Aucun autre joueur de l’effectif à afficher", "Réessayez pour charger les données officielles de l’effectif.", "Tous les membres disponibles de l’effectif sont affichés ci-dessus.", "EFFECTIF DU CLUB", "Joueurs : {count}", "Ouvrir la carte du joueur"],
  "ar-SA": ["غير مدرجين في قائمة المباراة المتاحة", "لاعبون آخرون في قائمة الفريق", "لاعبون غير مدرجين في التشكيلة الأساسية أو مقاعد البدلاء للمباراة الموضحة أعلاه. لا يُستنتج سبب الغياب.", "التشكيلة الأساسية ومقاعد البدلاء الرسميتان للمباراة الموضحة أعلاه لم تكتملَا بعد. عدم الظهور في المعاينة لا يعني الغياب عن المباراة.", "تعذّر تحميل قائمة الفريق الآن.", "لا يوجد لاعبون آخرون في القائمة لعرضهم", "حاول مجددًا لتحميل البيانات الرسمية لقائمة الفريق.", "جميع أفراد قائمة الفريق المتاحين معروضون أعلاه.", "قائمة لاعبي النادي", "عدد اللاعبين: {count}", "فتح بطاقة اللاعب"],
  "tr-TR": ["Mevcut maç kadrosunda yer almayanlar", "Kadrodaki diğer oyuncular", "Yukarıda gösterilen maçın ilk 11’inde veya yedek kulübesinde yer almayan oyuncular. Yokluklarının nedeni hakkında çıkarım yapılmaz.", "Yukarıda gösterilen maçın resmî ilk 11’i ve yedek kulübesi henüz tamamlanmadı. Ön izlemede yer almamak maçta yer almamak anlamına gelmez.", "Kadro şu anda yüklenemedi.", "Gösterilecek başka kadro oyuncusu yok", "Resmî kadro verilerini yüklemek için yeniden deneyin.", "Kadronun mevcut tüm üyeleri yukarıda gösteriliyor.", "KULÜP KADROSU", "{count} oyuncu", "Oyuncu kartını aç"],
  "de-DE": ["Nicht auf dem verfügbaren Spielbericht aufgeführt", "Weitere Kaderspieler", "Spieler, die für das oben angezeigte Spiel weder in der Startelf noch auf der Ersatzbank aufgeführt sind. Es wird kein Grund für die Abwesenheit abgeleitet.", "Die offizielle Startelf und Ersatzbank für das oben angezeigte Spiel sind noch nicht vollständig. In der Vorschau zu fehlen bedeutet nicht, das Spiel zu verpassen.", "Der Kader konnte gerade nicht geladen werden.", "Keine weiteren Kaderspieler anzuzeigen", "Versuche erneut, die offiziellen Kaderdaten zu laden.", "Alle verfügbaren Kadermitglieder werden oben angezeigt.", "VEREINSKADER", "{count} Spieler", "Spielerkarte öffnen"],
} as const;

test("outside roster real consumer forwards the entire locale and every new binding plus retry reuse", async () => {
  const mod = await load(), requested: string[] = [], retryRequested: unknown[] = [];
  const sentinel = Object.fromEntries(outsideKeys.map(key => [key, `SENTINEL_${key}_{count} <&>`]));
  const view = await consumer("ClubHubOutsideMatchRoster", locale => { requested.push(locale); return { ...mod.getTouchlineClubHubRosterCopy("en-GB"), ...sentinel }; }, false,
    locale => { retryRequested.push(locale); return { ...publicErrorCopy.getTouchlinePublicErrorCopy("en-GB"), error: { ...publicErrorCopy.getTouchlinePublicErrorCopy("en-GB").error, retry: "REUSED_RETRY <&>" } }; });
  const observed = new Set<string>();
  for (const selectionState of ["not_listed", "unconfirmed"]) for (const squadUnavailable of [false, true]) for (const count of [0, 1, 13]) {
    requested.length = 0; retryRequested.length = 0;
    const { html } = view.render({ clubName: "Official $& <Club>", cards: cards(count), locale: "ar-SA", labels, selectionState, squadUnavailable, retryHref: "/retry?x=1&keep=2" });
    assert.deepEqual(requested, ["ar-SA"]); assert.deepEqual(retryRequested, ["ar-SA"]);
    for (const key of outsideKeys) if (html.includes(`SENTINEL_${key}_`)) observed.add(key);
    const grid = view.captures.find(item => item.kind === "ClubHubSquadGrid");
    if (grid) { assert.equal(grid.props.openProfileLabel, sentinel.openPlayerCard); assert.equal(grid.props.hideMarketValuePanel, false); observed.add("openPlayerCard"); }
    if (!count && squadUnavailable) assert.match(html, /REUSED_RETRY &lt;&amp;&gt;/);
    assert.ok(!html.includes("<Club>"));
  }
  view.render({ clubName: "Public Club", cards: cards(1), locale: "en-GB", labels, hideMarketValuePanel: true });
  const publicGrid = view.captures.find(item => item.kind === "ClubHubSquadGrid");
  assert.equal(publicGrid?.props.hideMarketValuePanel, true);
  assert.deepEqual([...observed].sort(), [...outsideKeys].sort());
});

test("outside roster eleven literal messages in eight catalogues preserve prior nine keys and public gates", async () => {
  const mod = await load();
  for (const locale of locales) {
    const raw = mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES[locale];
    assert.deepEqual(outsideKeys.map(key => raw[key]), outsideExpected[locale]);
    for (const key of outsideKeys) assert.deepEqual(raw[key].match(/\{\w+\}/g), key === "squadCount" ? ["{count}"] : null);
    assert.deepEqual(outsideKeys.map(key => mod.getTouchlineClubHubRosterCopy(locale)[key]), outsideExpected[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
  }
});

test("outside roster SSR preserves official versus preview, unavailable versus empty, retry guards and exact Grid props", async () => {
  const mod = await load();
  const escape = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES[locale];
    const view = await consumer("ClubHubOutsideMatchRoster", requested => { assert.equal(requested, locale); return copy; }, false,
      requested => { assert.equal(requested, locale); return publicErrorCopy.TOUCHLINE_PUBLIC_ERROR_CATALOGUES[locale]; });
    for (const selectionState of ["not_listed", "unconfirmed"]) for (const unavailable of [false, true]) for (const count of [0, 1, 13]) for (const retryHref of [undefined, "/same-path?lang=pt-BR&keep=$%26"]) {
      const selected = cards(count), clubName = "Official $& <Club>";
      const { html } = view.render({ clubName, cards: selected, locale, labels, selectionState, squadUnavailable: unavailable, retryHref });
      const title = selectionState === "not_listed" ? copy.outsideNotListedTitle : copy.outsideOtherTitle;
      const description = selectionState === "not_listed" ? copy.outsideNotListedDescription : copy.outsidePreviewDescription;
      assert.ok(html.includes(`aria-label="${escape(`${clubName} ${title}`)}"`));
      assert.ok(html.includes(escape(description))); assert.ok(html.includes(escape(copy.squadEyebrow)));
      assert.ok(html.includes(`data-selection-state="${selectionState}"`)); assert.ok(html.includes('id="club-squad"'));
      assert.ok(html.includes(`aria-label="${escape(copy.squadCount.replace("{count}", () => String(count)))}"`));
      const grid = view.captures.find(item => item.kind === "ClubHubSquadGrid");
      if (count) {
        assert.ok(grid); assert.equal(grid.props.locale, locale); assert.equal(grid.props.labels, labels);
        assert.equal(grid.props.initialCardCount, 12); assert.equal(grid.props.cardRenderScale, 124 / 430); assert.equal(grid.props.className, "cardGrid");
        assert.equal(grid.props.openProfileLabel, copy.openPlayerCard); assert.notEqual(grid.props.cards, selected);
        const forwarded = grid.props.cards as ClubOwnerSquadCard[]; assert.equal(forwarded.length, count);
        forwarded.forEach((card, index) => assert.equal(card, selected[index]));
        assert.ok(!html.includes('role="status"')); assert.ok(!html.includes('href="/same-path'));
      } else {
        assert.equal(grid, undefined); assert.ok(html.includes('role="status"'));
        assert.ok(html.includes(escape(unavailable ? copy.squadUnavailableTitle : copy.outsideEmptyTitle)));
        assert.ok(html.includes(escape(unavailable ? copy.squadUnavailableDescription : copy.outsideEmptyDescription)));
        if (unavailable && retryHref) { assert.ok(html.includes(`href="${escape(retryHref)}"`)); assert.ok(html.includes(escape(publicErrorCopy.TOUCHLINE_PUBLIC_ERROR_CATALOGUES[locale].error.retry))); }
        else assert.ok(!html.includes('href="/same-path'));
      }
    }
    const defaults = view.render({ clubName: "Club", cards: [], locale, labels }).html;
    assert.ok(defaults.includes('data-selection-state="unconfirmed"')); assert.ok(defaults.includes(escape(copy.outsideEmptyTitle)));
  }
});

test("outside roster public consumer keeps six locales gated and both retry translations unchanged", async () => {
  const mod = await load(), view = await consumer("ClubHubOutsideMatchRoster", mod.getTouchlineClubHubRosterCopy);
  for (const locale of [...locales, "constructor", "pt", "unknown"]) {
    const resolved = locale === "pt-BR" ? "pt-BR" : "en-GB";
    const html = view.render({ clubName: "Official Club", cards: [], locale, labels, squadUnavailable: true, retryHref: "/retry" }).html;
    assert.ok(html.includes(outsideExpected[resolved][4]));
    assert.ok(html.includes(resolved === "pt-BR" ? "Tentar novamente" : "Try again"));
  }
});

for (const [locale, label] of [["es-ES", "Jugadores:"], ["it-IT", "Giocatori:"], ["fr-FR", "Joueurs :"]] as const) {
  test(`outside roster neutral ${locale} count label reaches real ARIA for zero, singular and plural counts`, async () => {
    const mod = await load();
    const view = await consumer("ClubHubOutsideMatchRoster", requested => {
      assert.equal(requested, locale);
      return mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES[locale];
    });
    for (const count of [0, 1, 2, 3, 11, 100]) {
      const selected = cards(count);
      const { html } = view.render({ clubName: "Official Club", cards: selected, locale, labels });
      assert.ok(html.includes(`aria-label="${label} ${count}"`), `${locale}, count=${count}: expected a neutral count label`);
      const grid = view.captures.find(item => item.kind === "ClubHubSquadGrid");
      if (count === 0) {
        assert.equal(grid, undefined, "zero retains the normal empty branch");
        assert.ok(html.includes('role="status"'));
      } else {
        assert.ok(grid, "a positive count retains the player grid branch");
        assert.equal((grid.props.cards as ClubOwnerSquadCard[]).length, count);
        assert.ok(!html.includes('role="status"'));
      }
    }
  });
}

test("real squad SSR and actual click handler retain initial eight, batches, all unpublished identities and bounded final counts", async () => {
  const mod = await load();
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES[locale], view = await consumer("ClubHubSquadGrid", () => copy);
    for (const count of [0, 1, 2, 3, 8, 9, 11, 100]) {
      view.reset(); const input = { cards: cards(count), locale, labels, openProfileLabel: "Official profile", cardRenderScale: 0.42 };
      let shown = Math.min(8, count);
      for (;;) {
        const { html, buttons } = view.render(input);
        const expected = copy.shown.replace("{shown}", () => String(shown)).replace("{total}", () => String(count));
        assert.ok(html.includes(expected));
        const rendered = view.captures.filter(item => item.kind === "TouchlineEliteExactCard");
        assert.equal(rendered.length, shown);
        rendered.forEach(({ props }, index) => { assert.equal((props.player as { name: string }).name, input.cards[index].name); assert.equal(props.showUnpublishedIdentity, true); assert.equal(props.initialRenderScale, 0.42); assert.equal(props.hideMarketValuePanel, false); });
        const zooms = view.captures.filter(item => item.kind === "TouchlineCardZoom");
        zooms.forEach(({ props }, index) => {
          assert.equal(props.contractHref, undefined);
          const details = props.details as { title: string; profileHref: string; fields: Array<{ kind: string; value: string }> };
          assert.equal(details.title, input.cards[index].name); assert.ok(details.profileHref.includes(`lang=${locale}`));
          assert.equal(details.fields.find(field => field.kind === "rating-total")?.value, index % 2 ? "—" : "0");
        });
        if (shown === count) { assert.equal(buttons.length, 0); break; }
        assert.equal(buttons.length, 1);
        assert.equal(buttons[0].props.children, copy.loadMore.replace("{count}", () => String(Math.min(8, count - shown))));
        buttons[0].props.onClick(); shown = Math.min(count, shown + 8);
      }
    }
    view.reset(); const custom = view.render({ cards: cards(3), initialCardCount: 1, locale, labels, openProfileLabel: "Profile" });
    assert.equal(view.captures.filter(item => item.kind === "TouchlineEliteExactCard").length, 1);
    assert.equal(custom.buttons.length, 1);
  }
});

test("real read model still rejects mismatched sheet identity and keeps preview separate from official bench", async () => {
  const mod = await load(), view = await consumer("ClubHubMatchdayTechnicalArea", mod.getTouchlineClubHubRosterCopy);
  const squad = cards(20);
  const officialLineup: TouchlineFantasyLineupMember[] = squad.map((card, index) => ({ id: `lineup-${index}`, providerId: `lineup-${index}`, provider: "sportmonks", fixtureId: "fixture-1", teamId: city.teamId, teamName: city.name, playerId: card.id, playerName: card.name, jerseyNumber: index + 1, formationPosition: String(index + 1), position: card.position, isStarter: index < 11, isSubstitute: index >= 11, statistics: [] }));
  for (const valid of [false, true]) {
    const result = buildTouchLineClubMatchdayPresentation({ club: city, squadCards: squad, fixtureId: "fixture-1", officialLineup: valid ? officialLineup : officialLineup.map(item => ({ ...item, fixtureId: "wrong" })) });
    assert.equal(result.technical.state, valid ? "confirmed" : "awaiting_official_team_sheet");
    assert.equal(result.technical.bench.length, valid ? 9 : 0);
    assert.ok(result.technical.previewBench.every(card => !result.lineup.players.some(starter => starter.card.id === card.id)));
    const { html } = view.render({ clubName: city.name, technical: result.technical, locale: "en-GB", labels, coachCard: null });
    assert.ok(html.includes(valid ? baseline["en-GB"].confirmed : baseline["en-GB"].preview));
  }
});

test("both consumers forward the full locale while public draft requests retain EN and real reused EN/PT labels", async () => {
  const mod = await load(), requested: string[] = [];
  const getter = (locale: string) => { requested.push(locale); return mod.getTouchlineClubHubRosterCopy(locale); };
  const technical = await consumer("ClubHubMatchdayTechnicalArea", getter), squad = await consumer("ClubHubSquadGrid", getter);
  for (const locale of locales) {
    requested.length = 0;
    const html = technical.render({ clubName: "Official $& Club", technical: { state: "confirmed", bench: [], previewBench: [] }, locale, labels, coachCard: null }).html;
    assert.ok(html.includes(locale === "pt-BR" ? "Treinador principal" : "First-team coach"));
    assert.ok(html.includes(locale === "pt-BR" ? "Área técnica" : "Technical area"));
    assert.ok(html.includes(baseline[locale === "pt-BR" ? "pt-BR" : "en-GB"].confirmed));
    squad.reset(); const grid = squad.render({ cards: [], locale, labels, openProfileLabel: "Profile" }).html;
    assert.ok(grid.includes(locale === "pt-BR" ? "Jogadores exibidos: 0 de 0" : "Players shown: 0 of 0"));
    assert.deepEqual(requested, [locale, locale]);
  }
});

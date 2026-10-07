import assert from "node:assert/strict";
import test from "node:test";
import { getTouchLineRankingsCopy } from "../lib/touchlineArena/rankings-i18n.ts";
import { getTouchlineTablesPresentationCopy } from "../lib/touchlineArena/tables-presentation-i18n.ts";
import { isTouchLineLocaleComplete, normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";

const examples = [
  ["en-GB", "TouchLine Rankings", "Team of the Season", "Loading rankings…"],
  ["pt-BR", "Rankings TouchLine", "Seleção da Temporada", "Carregando classificações…"],
  ["es-ES", "Clasificaciones de TouchLine", "Equipo de la temporada", "Cargando clasificaciones…"],
  ["it-IT", "Classifiche TouchLine", "Squadra della stagione", "Caricamento delle classifiche…"],
  ["fr-FR", "Classements TouchLine", "Équipe de la saison", "Chargement des classements…"],
  ["ar-SA", "الترتيبات في TouchLine", "تشكيلة الموسم", "جارٍ تحميل الترتيبات…"],
  ["tr-TR", "TouchLine Sıralamaları", "Sezonun takımı", "Sıralamalar yükleniyor…"],
  ["de-DE", "TouchLine-Ranglisten", "Mannschaft der Saison", "Ranglisten werden geladen…"],
] as const;

test("rankings real getters select all eight catalogues only with explicit opt-in", () => {
  const keys = Object.keys(getTouchLineRankingsCopy()).sort();
  for (const [locale, title, selection, loading] of examples) {
    const copy = getTouchLineRankingsCopy(locale, true);
    assert.equal(copy.tablesTitle, title);
    assert.equal(copy.seasonSelection, selection);
    assert.equal(getTouchlineTablesPresentationCopy(locale, true).loadingRankings, loading);
    assert.deepEqual(Object.keys(copy).sort(), keys);
    for (const [key, value] of Object.entries(copy)) assert.ok(value.trim(), `${locale}/${key}`);
    assert.equal(copy.ownerLeagueTable, "ClubOwner Table");
    assert.equal(copy.clubHub, "ClubHub");
    assert.ok(copy.connectedDescription.includes("ClubOwner"));
    assert.ok(copy.connectedDescription.includes("ClubHub"));
    assert.doesNotMatch(copy.connectedDescription, /Market Transfer|Club Hub/);
    assert.match(copy.seasonSelectionRule, /11/);
    assert.match(copy.seasonSelectionPendingDescription, locale === "ar-SA" ? /أحد عشر/ : /11/);
  }
});

test("Spanish card terminology agrees across ranking and podium copy", () => {
  const copy = getTouchLineRankingsCopy("es-ES", true);
  assert.equal(copy.cards, "cartas");
  assert.equal(copy.publishedCards, "Cartas publicadas");
  assert.ok(Object.values(copy).every(value => !/\btarjetas?\b/i.test(value)));
  const presentation = getTouchlineTablesPresentationCopy("es-ES", true);
  assert.equal(presentation.podiumTitle, "Las 3 mejores cartas de la temporada");
  assert.equal(presentation.incompleteSelection, "La selección publicada aún no incluye las 11 cartas canónicas; no se muestra un XI parcial.");
});

test("omitted and false opt-in preserve EN/PT defaults after draft reads without completing languages", () => {
  for (const [locale] of examples) {
    getTouchLineRankingsCopy(locale, true);
    getTouchlineTablesPresentationCopy(locale, true);
    const publicLocale = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.deepEqual(getTouchLineRankingsCopy(locale), getTouchLineRankingsCopy(publicLocale));
    assert.deepEqual(getTouchLineRankingsCopy(locale, false), getTouchLineRankingsCopy(publicLocale));
    assert.deepEqual(getTouchlineTablesPresentationCopy(locale), getTouchlineTablesPresentationCopy(publicLocale));
    assert.deepEqual(getTouchlineTablesPresentationCopy(locale, false), getTouchlineTablesPresentationCopy(publicLocale));
    assert.equal(normalizeTouchLineLocale(locale), publicLocale);
    assert.equal(isTouchLineLocaleComplete(locale), locale === "en-GB" || locale === "pt-BR");
  }
});

test("unknown, aliases and prototype names fall back to English even when opted in", () => {
  for (const locale of [undefined, null, "", "pt", "ar", "unknown", "constructor", "__proto__", "toString", " ar-SA "]) {
    for (const enabled of [false, true]) {
      assert.deepEqual(getTouchLineRankingsCopy(locale, enabled), getTouchLineRankingsCopy("en-GB"));
      assert.deepEqual(getTouchlineTablesPresentationCopy(locale, enabled), getTouchlineTablesPresentationCopy("en-GB"));
    }
  }
});

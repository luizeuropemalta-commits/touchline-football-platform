import assert from "node:assert/strict";
import test from "node:test";
import { getTouchlineMatchEventCopy, touchlineMatchEventKind, touchlineMatchEventLabel, touchlineMatchEventRelatedPlayerLabel, TOUCHLINE_MATCH_EVENT_CATALOGUES } from "../lib/touchlineArena/match-event-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const types = ["GOAL", "YELLOWCARD", "SUBSTITUTION", "PENALTY", "OWNGOAL", "REDCARD", "YELLOWREDCARD", "MISSED_PENALTY", "VAR", "Penalty save"];
const labels = {
  "en-GB": ["Goal", "Yellow card", "Substitution", "Penalty goal", "Own goal", "Red card", "Second yellow card", "Missed penalty", "VAR", "Penalty save"],
  "pt-BR": ["Gol", "Cartão amarelo", "Substituição", "Gol de pênalti", "Gol contra", "Cartão vermelho", "Segundo cartão amarelo", "Pênalti perdido", "VAR", "Pênalti defendido"],
  "es-ES": ["Gol", "Tarjeta amarilla", "Sustitución", "Gol de penalti", "Gol en propia puerta", "Tarjeta roja", "Segunda tarjeta amarilla", "Penalti fallado", "VAR", "Penalti detenido"],
  "it-IT": ["Gol", "Cartellino giallo", "Sostituzione", "Gol su rigore", "Autogol", "Cartellino rosso", "Secondo cartellino giallo", "Rigore sbagliato", "VAR", "Rigore parato"],
  "fr-FR": ["But", "Carton jaune", "Remplacement", "But sur penalty", "But contre son camp", "Carton rouge", "Deuxième carton jaune", "Penalty manqué", "VAR", "Penalty arrêté"],
  "ar-SA": ["هدف", "بطاقة صفراء", "تبديل", "هدف من ركلة جزاء", "هدف عكسي", "بطاقة حمراء", "بطاقة صفراء ثانية", "ركلة جزاء ضائعة", "VAR", "ركلة جزاء متصدى لها"],
  "tr-TR": ["Gol", "Sarı kart", "Oyuncu değişikliği", "Penaltı golü", "Kendi kalesine gol", "Kırmızı kart", "İkinci sarı kart", "Kaçırılan penaltı", "VAR", "Kurtarılan penaltı"],
  "de-DE": ["Tor", "Gelbe Karte", "Auswechslung", "Elfmetertor", "Eigentor", "Rote Karte", "Zweite Gelbe Karte", "Verschossener Elfmeter", "VAR", "Gehaltener Elfmeter"],
};

test("all eight event catalogues provide the evidenced labels without opening global gates", () => {
  assert.deepEqual(Object.keys(TOUCHLINE_MATCH_EVENT_CATALOGUES), locales);
  for (const locale of locales) {
    assert.deepEqual(types.map(type => touchlineMatchEventLabel(type, locale, true)), labels[locale]);
    const copy = getTouchlineMatchEventCopy(locale, true);
    assert.deepEqual(Object.keys(copy), Object.keys(TOUCHLINE_MATCH_EVENT_CATALOGUES["en-GB"]));
    for (const text of Object.values(copy)) assert.ok(text.trim());
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(getTouchlineMatchEventCopy(locale), TOUCHLINE_MATCH_EVENT_CATALOGUES["en-GB"]);
      assert.equal(touchlineMatchEventLabel("Goal", locale), "Goal");
      assert.equal(touchlineMatchEventLabel("Penalty save", locale), "Penalty save");
    }
  }
  assert.equal(touchlineMatchEventLabel("Goal", "pt-BR"), "Gol");
  assert.equal(touchlineMatchEventLabel("Penalty save", "pt-BR"), "Pênalti defendido");
});

test("aliases match whole known types, never free narrative or prototype properties", () => {
  for (const alias of ["Own Goal", "OWNGOAL", " owngoal "]) assert.equal(touchlineMatchEventKind(alias), "ownGoal");
  for (const alias of ["Yellowred Card", "YELLOWREDCARD"]) assert.equal(touchlineMatchEventKind(alias), "secondYellow");
  for (const alias of ["Penalty Missed", "Missed Penalty", "MISSED_PENALTY"]) assert.equal(touchlineMatchEventKind(alias), "missedPenalty");
  for (const alias of ["Penalty save", "PENALTY SAVE", " penalty save "]) assert.equal(touchlineMatchEventKind(alias), "penaltySave");
  for (const value of [undefined, null, "", "constructor", "__proto__", "toString", "Goal Disallowed", "VAR Goal", "Penalty Shootout", "Saved Penalty", "Penalty save by Keeper", "Penalty save overturned", "penalty_save", "Goal by Kai Havertz", "new-provider-type", "<script>"]) {
    assert.equal(touchlineMatchEventKind(value), null);
    assert.equal(touchlineMatchEventLabel(value, "pt-BR"), "Evento");
  }
  assert.equal(touchlineMatchEventLabel("VAR", "pt-BR"), "VAR", "no outcome is inferred from a review event");
  for (const locale of [undefined, null, "invalid", "constructor", "__proto__"]) assert.equal(getTouchlineMatchEventCopy(locale, true), TOUCHLINE_MATCH_EVENT_CATALOGUES["en-GB"]);
});

test("unknown events and related players have localized neutral labels in each catalogue", () => {
  const fallback = ["Event", "Evento", "Evento", "Evento", "Événement", "حدث", "Olay", "Ereignis"];
  const relation = ["Related player", "Jogador relacionado", "Jugador relacionado", "Giocatore coinvolto", "Joueur associé", "لاعب مرتبط بالحدث", "İlgili oyuncu", "Beteiligter Spieler"];
  locales.forEach((locale, index) => {
    assert.equal(touchlineMatchEventLabel("unrecognized", locale, true), fallback[index]);
    for (const type of ["PENALTY", "Penalty save", "OWNGOAL", "YELLOWCARD", "REDCARD", "VAR", "GOAL_DISALLOWED", null]) {
      assert.equal(touchlineMatchEventRelatedPlayerLabel(type, locale, true), relation[index]);
    }
  });
});

test("only Goal gets an assist label; substitution keeps the incoming-for-outgoing wording", () => {
  const assists = ["Assist", "Assistência", "Asistencia", "Assist", "Passe décisive", "تمريرة حاسمة", "Asist", "Vorlage"];
  const substitution = ["for", "entrou por", "por", "al posto di", "à la place de", "بدلًا من", "yerine", "für"];
  locales.forEach((locale, index) => {
    assert.equal(touchlineMatchEventRelatedPlayerLabel(" GOAL ", locale, true), assists[index]);
    assert.equal(touchlineMatchEventRelatedPlayerLabel("SUBSTITUTION", locale, true), substitution[index]);
  });
  assert.equal(touchlineMatchEventRelatedPlayerLabel("GOAL", "ar-SA"), "Assist");
});

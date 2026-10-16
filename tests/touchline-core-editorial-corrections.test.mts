import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete, normalizeTouchLineLocale, touchLineT } from "../lib/touchlineArena/i18n.ts";
import { TOUCHLINE_CORE_DRAFT_STATE, touchlineCoreDrafts } from "../lib/touchlineArena/locale-catalogues/core-drafts.ts";

const italianSignals = "Quando i dati forniti nell’ambito del servizio contrattato includeranno notizie, formazioni, assenze, squalifiche, eventi in diretta o indicazioni attendibili sulla disponibilità, appariranno qui senza essere presentati come fatti prima della conferma dei dati.";

test("Spanish club squad is distinct from the match bench and preserves approved profile copy", () => {
  assert.equal(touchlineCoreDrafts["es-ES"].bench, "Plantilla del club");
  assert.equal(touchLineT("es-ES", "bench", true), "Plantilla del club");
  assert.equal(touchlineCoreDrafts["es-ES"].gameBench, "Banquillo del partido");
  assert.equal(touchLineT("es-ES", "gameBench", true), "Banquillo del partido");
  assert.equal(touchlineCoreDrafts["es-ES"].playerProfile, "Perfil del jugador");
  assert.equal(touchLineT("es-ES", "playerProfile", true), "Perfil del jugador");
});

test("Italian signals refer to the contracted service without asserting a data licence or unverified facts", () => {
  assert.equal(touchlineCoreDrafts["it-IT"].signalsDescription, italianSignals);
  assert.equal(touchLineT("it-IT", "signalsDescription", true), italianSignals);
  assert.doesNotMatch(touchlineCoreDrafts["it-IT"].signalsDescription, /licenz/i);
});

test("all six draft profile labels use their authored language without opening locale gates", () => {
  const expected = { "es-ES": "Perfil del jugador", "it-IT": "Profilo del giocatore", "fr-FR": "Profil du joueur", "ar-SA": "ملف اللاعب", "tr-TR": "Oyuncu profili", "de-DE": "Spielerprofil" } as const;
  for (const [locale, label] of Object.entries(expected)) {
    assert.equal(touchLineT(locale, "playerProfile", true), label);
    assert.equal(touchLineT(locale, "playerProfile", false), "PlayerProfile");
    assert.equal(isTouchLineLocaleComplete(locale), false);
  }
});

test("editorial corrections preserve literal EN/PT references and keep draft selection opt-in", () => {
  const references = [
    ["en-GB", "Club Squad", "Game bench", "When contracted data provides news, lineups, absences, suspensions, live events or reliable availability signals, they will appear here without being presented as facts before the data supports them."],
    ["pt-BR", "Elenco", "Banco do jogo", "Quando os dados contratados trouxerem notícias, escalações, ausências, suspensões, eventos ao vivo ou sinais confiáveis de disponibilidade, eles aparecerão aqui sem serem tratados como fatos antes da confirmação dos dados."],
  ] as const;
  for (const [locale, bench, gameBench, signals] of references) {
    for (const enabled of [undefined, false, true]) {
      assert.equal(touchLineT(locale, "bench", enabled), bench);
      assert.equal(touchLineT(locale, "gameBench", enabled), gameBench);
      assert.equal(touchLineT(locale, "playerProfile", enabled), locale === "pt-BR" ? "Perfil do jogador" : "PlayerProfile");
      assert.equal(touchLineT(locale, "clubProfile", enabled), locale === "pt-BR" ? "Perfil do clube" : "Club Profile");
      assert.equal(touchLineT(locale, "signalsDescription", enabled), signals);
    }
  }
  for (const locale of ["es-ES", "it-IT"]) {
    assert.equal(normalizeTouchLineLocale(locale), "en-GB");
    assert.equal(isTouchLineLocaleComplete(locale), false);
    for (const enabled of [undefined, false]) {
      assert.equal(touchLineT(locale, "bench", enabled), "Club Squad");
      assert.equal(touchLineT(locale, "signalsDescription", enabled), references[0][3]);
    }
  }
  assert.equal(TOUCHLINE_CORE_DRAFT_STATE, "draft");
  assert.deepEqual([...TOUCHLINE_COMPLETE_LOCALES], ["en-GB", "pt-BR"]);
});

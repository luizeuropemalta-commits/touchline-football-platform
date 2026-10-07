import assert from "node:assert/strict";
import test from "node:test";
import { getTouchLineMarketCopy, type TouchLineMarketCopy } from "../lib/touchlineArena/market-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { TOUCHLINE_DRAFT_LOCALES } from "../lib/touchlineArena/locale-catalogues/core-drafts.ts";
import { TOUCHLINE_MARKET_DRAFT_STATE, touchlineMarketDrafts } from "../lib/touchlineArena/locale-catalogues/market-drafts.ts";

const english = getTouchLineMarketCopy("en-GB");
const counts = [0, 1, 2, 3, 11, 100] as const;
const cases = {
  "es-ES": {
    cards: ["0 cartas encontradas", "1 carta encontrada", "2 cartas encontradas", "3 cartas encontradas", "11 cartas encontradas", "100 cartas encontradas"],
    copies: ["0 copias disponibles", "1 copia disponible", "2 copias disponibles", "3 copias disponibles", "11 copias disponibles", "100 copias disponibles"],
    remaining: ["Faltan 0 jugadores para completar la plantilla", "Falta 1 jugador para completar la plantilla", "Faltan 2 jugadores para completar la plantilla", "Faltan 3 jugadores para completar la plantilla", "Faltan 11 jugadores para completar la plantilla", "Faltan 100 jugadores para completar la plantilla"],
  },
  "it-IT": {
    cards: ["0 carte trovate", "1 carta trovata", "2 carte trovate", "3 carte trovate", "11 carte trovate", "100 carte trovate"],
    copies: ["0 copie disponibili", "1 copia disponibile", "2 copie disponibili", "3 copie disponibili", "11 copie disponibili", "100 copie disponibili"],
    remaining: ["Mancano 0 giocatori per completare la rosa", "Manca 1 giocatore per completare la rosa", "Mancano 2 giocatori per completare la rosa", "Mancano 3 giocatori per completare la rosa", "Mancano 11 giocatori per completare la rosa", "Mancano 100 giocatori per completare la rosa"],
  },
  "fr-FR": {
    cards: ["0 carte trouvée", "1 carte trouvée", "2 cartes trouvées", "3 cartes trouvées", "11 cartes trouvées", "100 cartes trouvées"],
    copies: ["0 copie disponible", "1 copie disponible", "2 copies disponibles", "3 copies disponibles", "11 copies disponibles", "100 copies disponibles"],
    remaining: ["Il reste 0 joueur pour compléter l’effectif", "Il reste 1 joueur pour compléter l’effectif", "Il reste 2 joueurs pour compléter l’effectif", "Il reste 3 joueurs pour compléter l’effectif", "Il reste 11 joueurs pour compléter l’effectif", "Il reste 100 joueurs pour compléter l’effectif"],
  },
  "ar-SA": {
    cards: ["لم يتم العثور على بطاقات (٠)", "تم العثور على بطاقة واحدة (١)", "تم العثور على بطاقتين (٢)", "تم العثور على ٣ بطاقات", "تم العثور على ١١ بطاقة", "تم العثور على ١٠٠ بطاقة"],
    copies: ["لا توجد نسخ متاحة (٠)", "نسخة واحدة متاحة (١)", "نسختان متاحتان (٢)", "٣ نسخ متاحة", "١١ نسخة متاحة", "١٠٠ نسخة متاحة"],
    remaining: ["لا يلزم لاعب إضافي لإكمال القائمة (٠)", "يتبقى لاعب واحد لإكمال القائمة (١)", "يتبقى لاعبان لإكمال القائمة (٢)", "يتبقى ٣ لاعبين لإكمال القائمة", "يتبقى ١١ لاعبًا لإكمال القائمة", "يتبقى ١٠٠ لاعب لإكمال القائمة"],
  },
  "tr-TR": {
    cards: ["0 kart bulundu", "1 kart bulundu", "2 kart bulundu", "3 kart bulundu", "11 kart bulundu", "100 kart bulundu"],
    copies: ["0 kopya mevcut", "1 kopya mevcut", "2 kopya mevcut", "3 kopya mevcut", "11 kopya mevcut", "100 kopya mevcut"],
    remaining: ["Kadroyu tamamlamak için 0 oyuncu kaldı", "Kadroyu tamamlamak için 1 oyuncu kaldı", "Kadroyu tamamlamak için 2 oyuncu kaldı", "Kadroyu tamamlamak için 3 oyuncu kaldı", "Kadroyu tamamlamak için 11 oyuncu kaldı", "Kadroyu tamamlamak için 100 oyuncu kaldı"],
  },
  "de-DE": {
    cards: ["0 Karten gefunden", "1 Karte gefunden", "2 Karten gefunden", "3 Karten gefunden", "11 Karten gefunden", "100 Karten gefunden"],
    copies: ["0 Exemplare verfügbar", "1 Exemplar verfügbar", "2 Exemplare verfügbar", "3 Exemplare verfügbar", "11 Exemplare verfügbar", "100 Exemplare verfügbar"],
    remaining: ["Es fehlen 0 Spieler bis zum vollständigen Kader", "Es fehlt 1 Spieler bis zum vollständigen Kader", "Es fehlen 2 Spieler bis zum vollständigen Kader", "Es fehlen 3 Spieler bis zum vollständigen Kader", "Es fehlen 11 Spieler bis zum vollständigen Kader", "Es fehlen 100 Spieler bis zum vollständigen Kader"],
  },
} as const;

test("all six Market draft locales exist without runtime activation", () => {
  assert.equal(TOUCHLINE_MARKET_DRAFT_STATE, "draft");
  assert.deepEqual(Object.keys(touchlineMarketDrafts).sort(), [...TOUCHLINE_DRAFT_LOCALES].sort());
  for (const locale of TOUCHLINE_DRAFT_LOCALES) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(getTouchLineMarketCopy(locale).cancel, "Cancel");
  }
  assert.equal(getTouchLineMarketCopy("pt-BR").cancel, "Cancelar");
});

for (const locale of TOUCHLINE_DRAFT_LOCALES) {
  const copy = touchlineMarketDrafts[locale];
  test(`${locale}: source keys and string/function boundaries match the actual Market contract`, () => {
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(english).sort());
    for (const key of Object.keys(english) as (keyof TouchLineMarketCopy)[]) {
      const value = copy[key];
      assert.equal(typeof value, typeof english[key], key);
      if (typeof value !== "string") continue;
      assert.ok(value.trim(), `${key}: empty copy`);
      assert.doesNotMatch(value, /\bTODO\b|\bFIXME\b|\[(?:translate|missing)\]/);
      if (String(english[key]).length > 40) assert.notEqual(value, english[key], `${key}: English fallback`);
    }
  });
  test(`${locale}: zero, singular, dual, small, large and hundred counts have expected wording`, () => {
    const expected = cases[locale];
    counts.forEach((count, index) => {
      assert.equal(copy.cardsFound(count), expected.cards[index], `cards ${count}`);
      assert.equal(copy.copiesAvailable(count), expected.copies[index], `copies ${count}`);
      assert.equal(copy.playersRemaining(count), expected.remaining[index], `remaining ${count}`);
    });
  });
  test(`${locale}: supplied player, club and position names survive unchanged with correct replacement roles`, () => {
    const incoming = "İlkay Gündoğan";
    const outgoing = "محمد صلاح";
    const club = "Bodø/Glimt";
    const position = "GK/CB α";
    assert.ok(copy.clubSquadAria(club).includes(club));
    assert.ok(copy.playerAlreadyOnPitch(incoming).includes(incoming));
    assert.ok(copy.playerAlreadyInSquad(outgoing).includes(outgoing));
    assert.ok(copy.positionLimitReached(position, 11).includes(position));
    const release = copy.contractReleased(outgoing);
    assert.equal(release.split(outgoing).length - 1, 1);
    assert.ok(release.includes("TouchLine Market Transfer"));
    const replacement = copy.replacementReleased(incoming, outgoing);
    assert.equal(replacement.split(incoming).length - 1, 1);
    assert.equal(replacement.split(outgoing).length - 1, 2);
    assert.ok(replacement.indexOf(incoming) < replacement.indexOf(outgoing));
    assert.ok(replacement.includes("TouchLine Market Transfer"));
  });
  test(`${locale}: progress preserves supplied counts and limits, and copy preserves existing economic rules`, () => {
    const ratio = locale === "ar-SA" ? "٧/٢٥" : "7/25";
    assert.ok(copy.squadProgress(7, 25).includes(ratio));
    assert.ok(copy.positionRosterCount(7, 25).includes(ratio));
    assert.ok(copy.positionLimitReached("GK", 11).includes(locale === "ar-SA" ? "١١" : "11"));
    assert.equal(copy.productName, "Market Transfer");
    assert.equal(copy.fullProductName, "TouchLine Market Transfer");
    assert.equal(copy.touchlineCredits, "TouchLine Credits");
    assert.match(copy.totalContractValue, /Touch Credits/);
    assert.match(copy.launchTestNotice, /0 TC/);
    assert.match(copy.launchTestCheckout, /0 TC/);
    assert.match(copy.oneSeasonContract, /\b1\b/);
    assert.match(copy.ariaEnglandClubs, /2026–2027/);
  });
}

test("number presentation uses locale digits and grouping without changing the underlying count", () => {
  assert.equal(touchlineMarketDrafts["de-DE"].cardsFound(1234), "1.234 Karten gefunden");
  assert.equal(touchlineMarketDrafts["fr-FR"].cardsFound(1234), "1\u202f234 cartes trouvées");
  assert.equal(touchlineMarketDrafts["tr-TR"].cardsFound(1234), "1.234 kart bulundu");
  assert.equal(touchlineMarketDrafts["ar-SA"].cardsFound(1234), "تم العثور على ١٬٢٣٤ بطاقة");
});

test("Arabic preserves isolated Latin names and ratios while keeping genuine Arabic copy", () => {
  const copy = touchlineMarketDrafts["ar-SA"];
  assert.equal(copy.clubSquadAria("Bodø/Glimt"), "قائمة \u2068Bodø/Glimt\u2069");
  assert.equal(copy.squadProgress(7, 25), "عدد اللاعبين: \u2068٧/٢٥\u2069");
  assert.equal(copy.positionRosterCount(7, 25), "في القائمة: \u2068٧/٢٥\u2069");
  const message = copy.replacementReleased("İlkay Gündoğan", "محمد صلاح");
  assert.equal([...message.matchAll(/\u2068/g)].length, 4);
  assert.equal([...message.matchAll(/\u2069/g)].length, 4);
  assert.match(message, /حل .* محل /);
  // Text isolation is not evidence of actual browser layout or font coverage.
});

test("Arabic plural categories follow larger counts as well as the base exemplars", () => {
  const copy = touchlineMarketDrafts["ar-SA"];
  assert.equal(copy.cardsFound(103), "تم العثور على ١٠٣ بطاقات");
  assert.equal(copy.copiesAvailable(111), "١١١ نسخة متاحة");
  assert.equal(copy.playersRemaining(102), "يتبقى ١٠٢ لاعب لإكمال القائمة");
});

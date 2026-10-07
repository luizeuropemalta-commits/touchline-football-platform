import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { getTouchlineMatchCentreCopy } from "./match-centre-i18n.ts";

const enGB = {
  nextMatch: "NEXT MATCH", matchUpdate: "MATCH UPDATE", localTime: "Your local time", verifiedScore: "Verified score",
  stadium: "STADIUM", venuePending: "Venue under verification", previewLink: "View next-match post preview", crestAlt: "{name} crest",
} as const;
type FixtureOwnCopy = Readonly<Record<keyof typeof enGB, string>>;
export type TouchlineClubHubFixtureCopy = FixtureOwnCopy & Readonly<{ live: string; finished: string }>;
export const TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_STATUS = "draft" as const;

/** Presentation only: state, verified scores, refresh scheduling and dates stay
 * in their existing authorities. Six draft catalogues do not enable locales or
 * replace linguistic, rendered or RTL review.
 */
export const TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    nextMatch: "PRÓXIMO JOGO", matchUpdate: "ATUALIZAÇÃO DA PARTIDA", localTime: "Seu horário local", verifiedScore: "Placar verificado",
    stadium: "ESTÁDIO", venuePending: "Estádio em verificação", previewLink: "Ver prévia da arte da partida", crestAlt: "Escudo de {name}",
  },
  "es-ES": {
    nextMatch: "PRÓXIMO PARTIDO", matchUpdate: "ACTUALIZACIÓN DEL PARTIDO", localTime: "Tu hora local", verifiedScore: "Marcador verificado",
    stadium: "ESTADIO", venuePending: "Estadio en verificación", previewLink: "Ver vista previa de la publicación del próximo partido", crestAlt: "Escudo de {name}",
  },
  "it-IT": {
    nextMatch: "PROSSIMA PARTITA", matchUpdate: "AGGIORNAMENTO DELLA PARTITA", localTime: "Il tuo orario locale", verifiedScore: "Risultato verificato",
    stadium: "STADIO", venuePending: "Stadio in fase di verifica", previewLink: "Visualizza l’anteprima del post della prossima partita", crestAlt: "Stemma di {name}",
  },
  "fr-FR": {
    nextMatch: "PROCHAIN MATCH", matchUpdate: "MISE À JOUR DU MATCH", localTime: "Votre heure locale", verifiedScore: "Score vérifié",
    stadium: "STADE", venuePending: "Stade en cours de vérification", previewLink: "Voir l’aperçu de la publication du prochain match", crestAlt: "Écusson de {name}",
  },
  "ar-SA": {
    nextMatch: "المباراة القادمة", matchUpdate: "تحديث المباراة", localTime: "توقيتك المحلي", verifiedScore: "نتيجة متحقق منها",
    stadium: "الملعب", venuePending: "الملعب قيد التحقق", previewLink: "عرض معاينة منشور المباراة القادمة", crestAlt: "شعار {name}",
  },
  "tr-TR": {
    nextMatch: "SONRAKİ MAÇ", matchUpdate: "MAÇ GÜNCELLEMESİ", localTime: "Yerel saatiniz", verifiedScore: "Doğrulanmış skor",
    stadium: "STADYUM", venuePending: "Stadyum doğrulanıyor", previewLink: "Sonraki maç gönderisinin ön izlemesini gör", crestAlt: "{name} arması",
  },
  "de-DE": {
    nextMatch: "NÄCHSTES SPIEL", matchUpdate: "SPIELAKTUALISIERUNG", localTime: "Deine Ortszeit", verifiedScore: "Bestätigter Spielstand",
    stadium: "STADION", venuePending: "Stadion wird überprüft", previewLink: "Beitragsvorschau für das nächste Spiel ansehen", crestAlt: "Wappen von {name}",
  },
} as const satisfies Readonly<Record<TouchLineLocale, FixtureOwnCopy>>;

export function getTouchlineClubHubFixtureCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubHubFixtureCopy {
  const resolved = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const shared = getTouchlineMatchCentreCopy(resolved, draftLocalesEnabled);
  return { ...TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES[resolved], live: shared.liveNow, finished: shared.completed };
}

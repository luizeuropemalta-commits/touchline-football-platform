import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

// Presentation only. The six additional catalogues are drafts: the shared
// public normalizer continues to admit EN/PT only. Football facts stay outside.
const enGB = {
  confirmedTitle: "Line-up confirmed", previewTitle: "Squad Preview", unconfirmedTitle: "Line-up not yet confirmed",
  matchdayEyebrow: "Matchday line-up", previewNotice: "This preview can change until the official TouchLine line-up is confirmed.",
  lastXiTitle: "Last line-up", lastXiNotice: "Latest completed match recorded in TouchLine; newer games may be missing. Not the confirmed next line-up.", lastXiDateLabel: "Recorded match date:",
  illustrativeNotice: "Illustrative squad arrangement, not a prediction of the starting XI. Await the official team sheet for the match shown.",
  matchupAria: "Match-up", matchupEyebrow: "MATCH-UP", awaitingConfirmation: "Awaiting confirmation",
  pitchAriaSuffix: "line-up pitch", emptyLineup: "No published TouchLine cards in this line-up.", positionLeadersAria: "Club leaders by position",
} as const;
export type TouchlineClubHubLineupCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_STATUS = "draft" as const;

export const TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    confirmedTitle: "Escalação confirmada", previewTitle: "Prévia do elenco", unconfirmedTitle: "Escalação ainda não confirmada",
    matchdayEyebrow: "Escalação da partida", previewNotice: "A prévia pode mudar até a escalação oficial TouchLine ser confirmada.",
    lastXiTitle: "Última escalação", lastXiNotice: "Última partida concluída registrada no TouchLine; jogos mais recentes podem faltar. Não confirma a próxima escalação.", lastXiDateLabel: "Data da partida registrada:",
    illustrativeNotice: "Distribuição ilustrativa do elenco, não uma previsão de titulares. Aguarde a escalação oficial da partida indicada.",
    matchupAria: "Confronto da partida", matchupEyebrow: "CONFRONTO", awaitingConfirmation: "Aguardando confirmação",
    pitchAriaSuffix: "campo de escalação", emptyLineup: "Nenhum card TouchLine publicado nesta escalação.", positionLeadersAria: "Líderes do clube por posição",
  },
  "es-ES": {
    confirmedTitle: "Alineación confirmada", previewTitle: "Vista previa de la plantilla", unconfirmedTitle: "Alineación aún no confirmada",
    matchdayEyebrow: "Alineación del partido", previewNotice: "Esta vista previa puede cambiar hasta que se confirme la alineación oficial de TouchLine.",
    lastXiTitle: "Última alineación", lastXiNotice: "Último partido terminado registrado en TouchLine; pueden faltar encuentros más recientes. No confirma la próxima alineación.", lastXiDateLabel: "Fecha del partido registrado:",
    illustrativeNotice: "Distribución ilustrativa de la plantilla, no una predicción del XI titular. Espera la alineación oficial del partido indicado.",
    matchupAria: "Enfrentamiento del partido", matchupEyebrow: "ENFRENTAMIENTO", awaitingConfirmation: "Pendiente de confirmación",
    pitchAriaSuffix: "campo de la alineación", emptyLineup: "No hay tarjetas TouchLine publicadas en esta alineación.", positionLeadersAria: "Líderes del club por posición",
  },
  "it-IT": {
    confirmedTitle: "Formazione confermata", previewTitle: "Anteprima della rosa", unconfirmedTitle: "Formazione non ancora confermata",
    matchdayEyebrow: "Formazione della partita", previewNotice: "Questa anteprima può cambiare fino alla conferma della formazione ufficiale TouchLine.",
    lastXiTitle: "Ultima formazione", lastXiNotice: "Ultima partita conclusa registrata su TouchLine; potrebbero mancare gare più recenti. Non conferma la prossima formazione.", lastXiDateLabel: "Data della partita registrata:",
    illustrativeNotice: "Disposizione illustrativa della rosa, non una previsione degli undici titolari. Attendi la formazione ufficiale della partita indicata.",
    matchupAria: "Confronto della partita", matchupEyebrow: "CONFRONTO", awaitingConfirmation: "In attesa di conferma",
    pitchAriaSuffix: "campo della formazione", emptyLineup: "Nessuna carta TouchLine pubblicata in questa formazione.", positionLeadersAria: "Leader del club per ruolo",
  },
  "fr-FR": {
    confirmedTitle: "Composition confirmée", previewTitle: "Aperçu de l’effectif", unconfirmedTitle: "Composition pas encore confirmée",
    matchdayEyebrow: "Composition du match", previewNotice: "Cet aperçu peut changer jusqu’à la confirmation de la composition officielle TouchLine.",
    lastXiTitle: "Dernière composition", lastXiNotice: "Dernier match terminé enregistré dans TouchLine ; des rencontres plus récentes peuvent manquer. Ne confirme pas la prochaine composition.", lastXiDateLabel: "Date du match enregistré :",
    illustrativeNotice: "Disposition illustrative de l’effectif, et non une prédiction du onze titulaire. Attendez la composition officielle du match indiqué.",
    matchupAria: "Affiche du match", matchupEyebrow: "AFFICHE", awaitingConfirmation: "En attente de confirmation",
    pitchAriaSuffix: "terrain de la composition", emptyLineup: "Aucune carte TouchLine publiée dans cette composition.", positionLeadersAria: "Leaders du club par poste",
  },
  "ar-SA": {
    confirmedTitle: "التشكيلة مؤكدة", previewTitle: "معاينة قائمة الفريق", unconfirmedTitle: "التشكيلة لم تُؤكَّد بعد",
    matchdayEyebrow: "تشكيلة المباراة", previewNotice: "قد تتغير هذه المعاينة حتى تأكيد تشكيلة TouchLine الرسمية.",
    lastXiTitle: "آخر تشكيلة", lastXiNotice: "آخر مباراة مكتملة مسجلة في TouchLine؛ قد تنقص مباريات أحدث. ليست تأكيدًا لتشكيلة المباراة القادمة.", lastXiDateLabel: "تاريخ المباراة المسجلة:",
    illustrativeNotice: "توزيع توضيحي للاعبي الفريق، وليس توقعًا للتشكيلة الأساسية. انتظر التشكيلة الرسمية للمباراة المعروضة.",
    matchupAria: "مواجهة المباراة", matchupEyebrow: "المواجهة", awaitingConfirmation: "بانتظار التأكيد",
    pitchAriaSuffix: "ملعب التشكيلة", emptyLineup: "لا توجد بطاقات TouchLine منشورة في هذه التشكيلة.", positionLeadersAria: "متصدرو النادي حسب المركز",
  },
  "tr-TR": {
    confirmedTitle: "İlk 11 onaylandı", previewTitle: "Kadro ön izlemesi", unconfirmedTitle: "İlk 11 henüz onaylanmadı",
    matchdayEyebrow: "Maç kadrosu", previewNotice: "Bu ön izleme, resmî TouchLine ilk 11’i onaylanana kadar değişebilir.",
    lastXiTitle: "Son ilk 11", lastXiNotice: "TouchLine'da kayıtlı son tamamlanan maç; daha yeni maçlar eksik olabilir. Sonraki maçın ilk 11'ini doğrulamaz.", lastXiDateLabel: "Kaydedilen maçın tarihi:",
    illustrativeNotice: "Kadro oyuncularının temsili yerleşimidir, ilk 11 tahmini değildir. Gösterilen maçın resmî kadrosunu bekleyin.",
    matchupAria: "Maç eşleşmesi", matchupEyebrow: "EŞLEŞME", awaitingConfirmation: "Onay bekleniyor",
    pitchAriaSuffix: "kadro sahası", emptyLineup: "Bu kadroda yayımlanmış TouchLine kartı yok.", positionLeadersAria: "Pozisyona göre kulüp liderleri",
  },
  "de-DE": {
    confirmedTitle: "Aufstellung bestätigt", previewTitle: "Kadervorschau", unconfirmedTitle: "Aufstellung noch nicht bestätigt",
    matchdayEyebrow: "Spielaufstellung", previewNotice: "Diese Vorschau kann sich ändern, bis die offizielle TouchLine-Aufstellung bestätigt ist.",
    lastXiTitle: "Letzte Aufstellung", lastXiNotice: "Letztes in TouchLine erfasstes beendetes Spiel; neuere Spiele können fehlen. Bestätigt nicht die nächste Aufstellung.", lastXiDateLabel: "Datum des erfassten Spiels:",
    illustrativeNotice: "Beispielhafte Anordnung des Kaders, keine Vorhersage der Startelf. Warte auf die offizielle Aufstellung für das angezeigte Spiel.",
    matchupAria: "Spielpaarung", matchupEyebrow: "SPIELPAARUNG", awaitingConfirmation: "Bestätigung ausstehend",
    pitchAriaSuffix: "Aufstellungsfeld", emptyLineup: "Keine veröffentlichten TouchLine-Karten in dieser Aufstellung.", positionLeadersAria: "Vereinsführende nach Position",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubLineupCopy>>;

export function getTouchlineClubHubLineupCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubHubLineupCopy {
  return TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

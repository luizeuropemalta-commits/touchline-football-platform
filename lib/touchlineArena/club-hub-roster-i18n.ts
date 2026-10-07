import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export function getTouchlineClubHubContractLabel(locale: string, draftLocalesEnabled = false) {
  const labels = { "en-GB": "Contract player", "pt-BR": "Contratar", "es-ES": "Contratar jugador", "it-IT": "Ingaggia giocatore", "fr-FR": "Recruter le joueur", "ar-SA": "التعاقد مع اللاعب", "tr-TR": "Oyuncuyla sözleşme yap", "de-DE": "Spieler verpflichten" } as const;
  return labels[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

const enGB = {
  bench: "Bench", confirmed: "Team sheet confirmed", preview: "Bench preview · updates with the official TouchLine line-up",
  technicalAria: "{clubName} matchday technical area", staff: "TECHNICAL STAFF", coachUnavailable: "Coach card unavailable",
  awaiting: "Awaiting substitutes from the official team sheet.", shown: "Players shown: {shown} of {total}", loadMore: "View {count} more",
  outsideNotListedTitle: "Not listed in the available team sheet", outsideOtherTitle: "Other squad players",
  outsideNotListedDescription: "Players not listed in the starting XI or bench for the match shown above. No reason for absence is inferred.",
  outsidePreviewDescription: "The official starting XI and bench for the match shown above are not yet complete. Being outside the preview does not mean missing the match.",
  squadUnavailableTitle: "The squad could not be loaded right now.", outsideEmptyTitle: "No other squad players to display",
  squadUnavailableDescription: "Try again to load the official squad data.", outsideEmptyDescription: "All available squad members are shown above.",
  squadEyebrow: "CLUB SQUAD", squadCount: "{count} players", openPlayerCard: "Open player card",
} as const;
export type TouchlineClubHubRosterCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CLUB_HUB_ROSTER_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_ROSTER_DRAFT_STATUS = "draft" as const;

/** Presentation only. Neutral count templates avoid count-dependent noun
 * agreement; no roster, sheet, publication or paging rule lives here. Six
 * catalogues remain drafts, not linguistic/RTL approval or activated locales.
 */
export const TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    bench: "Banco", confirmed: "Súmula confirmada", preview: "Prévia do banco · atualiza com a escalação oficial TouchLine",
    technicalAria: "{clubName} área técnica da partida", staff: "EQUIPE TÉCNICA", coachUnavailable: "Card do treinador indisponível",
    awaiting: "Aguardando os reservas da súmula oficial.", shown: "Jogadores exibidos: {shown} de {total}", loadMore: "Ver mais {count}",
    outsideNotListedTitle: "Não relacionados na escalação disponível", outsideOtherTitle: "Demais jogadores do elenco",
    outsideNotListedDescription: "Jogadores que não constam no time titular nem no banco da partida indicada acima. Não indica o motivo da ausência.",
    outsidePreviewDescription: "A escalação e o banco oficiais da partida indicada acima ainda não estão completos. Estar fora da prévia não significa estar fora do jogo.",
    squadUnavailableTitle: "Não foi possível carregar o elenco agora.", outsideEmptyTitle: "Nenhum outro jogador a exibir",
    squadUnavailableDescription: "Tente novamente para carregar os dados oficiais do elenco.", outsideEmptyDescription: "Todos os jogadores disponíveis estão exibidos acima.",
    squadEyebrow: "ELENCO DO CLUBE", squadCount: "{count} jogadores", openPlayerCard: "Abrir card do jogador",
  },
  "es-ES": {
    bench: "Banquillo", confirmed: "Acta confirmada", preview: "Vista previa del banquillo · se actualiza con la alineación oficial de TouchLine",
    technicalAria: "Área técnica de {clubName} para el partido", staff: "CUERPO TÉCNICO", coachUnavailable: "Tarjeta del entrenador no disponible",
    awaiting: "Esperando los suplentes del acta oficial.", shown: "Jugadores mostrados: {shown} de {total}", loadMore: "Ver {count} más",
    outsideNotListedTitle: "No incluidos en la convocatoria disponible", outsideOtherTitle: "Otros jugadores de la plantilla",
    outsideNotListedDescription: "Jugadores que no figuran en el once titular ni en el banquillo del partido mostrado arriba. No se deduce el motivo de su ausencia.",
    outsidePreviewDescription: "El once titular y el banquillo oficiales del partido mostrado arriba aún no están completos. Quedar fuera de la vista previa no significa perderse el partido.",
    squadUnavailableTitle: "No se ha podido cargar la plantilla ahora.", outsideEmptyTitle: "No hay otros jugadores de la plantilla que mostrar",
    squadUnavailableDescription: "Vuelve a intentarlo para cargar los datos oficiales de la plantilla.", outsideEmptyDescription: "Todos los integrantes disponibles de la plantilla se muestran arriba.",
    squadEyebrow: "PLANTILLA DEL CLUB", squadCount: "Jugadores: {count}", openPlayerCard: "Abrir tarjeta del jugador",
  },
  "it-IT": {
    bench: "Panchina", confirmed: "Distinta confermata", preview: "Anteprima della panchina · si aggiorna con la formazione ufficiale TouchLine",
    technicalAria: "Area tecnica di {clubName} per la partita", staff: "STAFF TECNICO", coachUnavailable: "Carta dell’allenatore non disponibile",
    awaiting: "In attesa delle riserve dalla distinta ufficiale.", shown: "Giocatori visualizzati: {shown} su {total}", loadMore: "Mostra altri {count}",
    outsideNotListedTitle: "Non presenti nella distinta disponibile", outsideOtherTitle: "Altri giocatori della rosa",
    outsideNotListedDescription: "Giocatori non presenti nell’undici titolare né in panchina per la partita mostrata sopra. Non viene dedotto il motivo dell’assenza.",
    outsidePreviewDescription: "L’undici titolare e la panchina ufficiali della partita mostrata sopra non sono ancora completi. Essere esclusi dall’anteprima non significa saltare la partita.",
    squadUnavailableTitle: "Al momento non è stato possibile caricare la rosa.", outsideEmptyTitle: "Nessun altro giocatore della rosa da mostrare",
    squadUnavailableDescription: "Riprova per caricare i dati ufficiali della rosa.", outsideEmptyDescription: "Tutti i componenti disponibili della rosa sono mostrati sopra.",
    squadEyebrow: "ROSA DEL CLUB", squadCount: "Giocatori: {count}", openPlayerCard: "Apri la carta del giocatore",
  },
  "fr-FR": {
    bench: "Banc", confirmed: "Feuille de match confirmée", preview: "Aperçu du banc · mis à jour avec la composition officielle TouchLine",
    technicalAria: "Zone technique de {clubName} pour le match", staff: "STAFF TECHNIQUE", coachUnavailable: "Carte de l’entraîneur indisponible",
    awaiting: "En attente des remplaçants de la feuille de match officielle.", shown: "Joueurs affichés : {shown} sur {total}", loadMore: "Afficher {count} de plus",
    outsideNotListedTitle: "Absents de la feuille de match disponible", outsideOtherTitle: "Autres joueurs de l’effectif",
    outsideNotListedDescription: "Joueurs ne figurant ni dans le onze titulaire ni sur le banc pour le match indiqué ci-dessus. Aucun motif d’absence n’est déduit.",
    outsidePreviewDescription: "Le onze titulaire et le banc officiels du match indiqué ci-dessus ne sont pas encore complets. Ne pas apparaître dans l’aperçu ne signifie pas manquer le match.",
    squadUnavailableTitle: "L’effectif n’a pas pu être chargé pour le moment.", outsideEmptyTitle: "Aucun autre joueur de l’effectif à afficher",
    squadUnavailableDescription: "Réessayez pour charger les données officielles de l’effectif.", outsideEmptyDescription: "Tous les membres disponibles de l’effectif sont affichés ci-dessus.",
    squadEyebrow: "EFFECTIF DU CLUB", squadCount: "Joueurs : {count}", openPlayerCard: "Ouvrir la carte du joueur",
  },
  "ar-SA": {
    bench: "مقاعد البدلاء", confirmed: "قائمة المباراة مؤكدة", preview: "معاينة البدلاء · تُحدَّث مع تشكيلة TouchLine الرسمية",
    technicalAria: "المنطقة الفنية لنادي {clubName} في المباراة", staff: "الجهاز الفني", coachUnavailable: "بطاقة المدرب غير متاحة",
    awaiting: "بانتظار البدلاء من قائمة المباراة الرسمية.", shown: "اللاعبون المعروضون: {shown} من {total}", loadMore: "عرض المزيد: {count}",
    outsideNotListedTitle: "غير مدرجين في قائمة المباراة المتاحة", outsideOtherTitle: "لاعبون آخرون في قائمة الفريق",
    outsideNotListedDescription: "لاعبون غير مدرجين في التشكيلة الأساسية أو مقاعد البدلاء للمباراة الموضحة أعلاه. لا يُستنتج سبب الغياب.",
    outsidePreviewDescription: "التشكيلة الأساسية ومقاعد البدلاء الرسميتان للمباراة الموضحة أعلاه لم تكتملَا بعد. عدم الظهور في المعاينة لا يعني الغياب عن المباراة.",
    squadUnavailableTitle: "تعذّر تحميل قائمة الفريق الآن.", outsideEmptyTitle: "لا يوجد لاعبون آخرون في القائمة لعرضهم",
    squadUnavailableDescription: "حاول مجددًا لتحميل البيانات الرسمية لقائمة الفريق.", outsideEmptyDescription: "جميع أفراد قائمة الفريق المتاحين معروضون أعلاه.",
    squadEyebrow: "قائمة لاعبي النادي", squadCount: "عدد اللاعبين: {count}", openPlayerCard: "فتح بطاقة اللاعب",
  },
  "tr-TR": {
    bench: "Yedek kulübesi", confirmed: "Maç kadrosu onaylandı", preview: "Yedek kulübesi ön izlemesi · resmî TouchLine kadrosuyla güncellenir",
    technicalAria: "{clubName} maç teknik alanı", staff: "TEKNİK EKİP", coachUnavailable: "Teknik direktör kartı mevcut değil",
    awaiting: "Resmî maç kadrosundaki yedekler bekleniyor.", shown: "Gösterilen oyuncular: {shown} / {total}", loadMore: "{count} tane daha göster",
    outsideNotListedTitle: "Mevcut maç kadrosunda yer almayanlar", outsideOtherTitle: "Kadrodaki diğer oyuncular",
    outsideNotListedDescription: "Yukarıda gösterilen maçın ilk 11’inde veya yedek kulübesinde yer almayan oyuncular. Yokluklarının nedeni hakkında çıkarım yapılmaz.",
    outsidePreviewDescription: "Yukarıda gösterilen maçın resmî ilk 11’i ve yedek kulübesi henüz tamamlanmadı. Ön izlemede yer almamak maçta yer almamak anlamına gelmez.",
    squadUnavailableTitle: "Kadro şu anda yüklenemedi.", outsideEmptyTitle: "Gösterilecek başka kadro oyuncusu yok",
    squadUnavailableDescription: "Resmî kadro verilerini yüklemek için yeniden deneyin.", outsideEmptyDescription: "Kadronun mevcut tüm üyeleri yukarıda gösteriliyor.",
    squadEyebrow: "KULÜP KADROSU", squadCount: "{count} oyuncu", openPlayerCard: "Oyuncu kartını aç",
  },
  "de-DE": {
    bench: "Ersatzbank", confirmed: "Spielbericht bestätigt", preview: "Vorschau der Ersatzbank · wird mit der offiziellen TouchLine-Aufstellung aktualisiert",
    technicalAria: "Technische Zone von {clubName} am Spieltag", staff: "TRAINERSTAB", coachUnavailable: "Trainerkarte nicht verfügbar",
    awaiting: "Ersatzspieler aus dem offiziellen Spielbericht werden erwartet.", shown: "Angezeigte Spieler: {shown} von {total}", loadMore: "{count} weitere anzeigen",
    outsideNotListedTitle: "Nicht auf dem verfügbaren Spielbericht aufgeführt", outsideOtherTitle: "Weitere Kaderspieler",
    outsideNotListedDescription: "Spieler, die für das oben angezeigte Spiel weder in der Startelf noch auf der Ersatzbank aufgeführt sind. Es wird kein Grund für die Abwesenheit abgeleitet.",
    outsidePreviewDescription: "Die offizielle Startelf und Ersatzbank für das oben angezeigte Spiel sind noch nicht vollständig. In der Vorschau zu fehlen bedeutet nicht, das Spiel zu verpassen.",
    squadUnavailableTitle: "Der Kader konnte gerade nicht geladen werden.", outsideEmptyTitle: "Keine weiteren Kaderspieler anzuzeigen",
    squadUnavailableDescription: "Versuche erneut, die offiziellen Kaderdaten zu laden.", outsideEmptyDescription: "Alle verfügbaren Kadermitglieder werden oben angezeigt.",
    squadEyebrow: "VEREINSKADER", squadCount: "{count} Spieler", openPlayerCard: "Spielerkarte öffnen",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubRosterCopy>>;

export function getTouchlineClubHubRosterCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubHubRosterCopy {
  return TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  "playerEyebrow": "TouchLine players",
  "playerTitle": "Current player ranking",
  "playerDescription": "The seven highest-ranked players currently in the league, with their official positions and original card borders.",
  "coachEyebrow": "TouchLine coaches",
  "coachTitle": "Current coach ranking",
  "coachDescription": "The seven highest-ranked coaches currently in the league. Points update; the season’s card borders stay unchanged.",
  "playerMetric": "Total rating",
  "coachMetric": "PTS",
  "openPlayer": "Open player profile",
  "openCoach": "Open coach profile",
  "viewPlayers": "View player ranking",
  "viewCoaches": "View coach ranking",
  "empty": "No eligible entries in the current published ranking yet.",
  "unavailable": "The current ranking is unavailable. Please try again later.",
  "sourceNote": "Only confirmed current league members appear here. Positions come from the published ranking; repeated borders retain each card’s official classification."
} as const;
export type TouchlineClubHubShowcaseCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_STATUS = "draft" as const;

/** Presentation only. The existing site-locale release policy remains authoritative. */
export const TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
  "playerEyebrow": "Jogadores TouchLine",
  "playerTitle": "Ranking atual de jogadores",
  "playerDescription": "Os sete jogadores mais bem colocados que estão atualmente na liga, com suas posições oficiais e bordas originais.",
  "coachEyebrow": "Treinadores TouchLine",
  "coachTitle": "Ranking atual de treinadores",
  "coachDescription": "Os sete treinadores mais bem colocados que estão atualmente na liga. Os pontos são atualizados; as bordas da temporada permanecem.",
  "playerMetric": "Rating total",
  "coachMetric": "PTS",
  "openPlayer": "Abrir perfil do jogador",
  "openCoach": "Abrir perfil do treinador",
  "viewPlayers": "Ver ranking de jogadores",
  "viewCoaches": "Ver ranking de treinadores",
  "empty": "Ainda não há participantes elegíveis no ranking atual publicado.",
  "unavailable": "O ranking atual está indisponível. Tente novamente mais tarde.",
  "sourceNote": "Somente participantes com vínculo atual confirmado na liga aparecem aqui. As posições vêm do ranking publicado; bordas repetidas preservam a classificação oficial de cada card."
},
  "es-ES": {
  "playerEyebrow": "Jugadores TouchLine",
  "playerTitle": "Clasificación actual de jugadores",
  "playerDescription": "Los siete jugadores mejor clasificados que siguen en la liga, con sus posiciones oficiales y marcos originales.",
  "coachEyebrow": "Entrenadores TouchLine",
  "coachTitle": "Clasificación actual de entrenadores",
  "coachDescription": "Los siete entrenadores mejor clasificados que siguen en la liga. Los puntos se actualizan; los marcos de la temporada se mantienen.",
  "playerMetric": "Rating total",
  "coachMetric": "PTS",
  "openPlayer": "Abrir perfil del jugador",
  "openCoach": "Abrir perfil del entrenador",
  "viewPlayers": "Ver clasificación de jugadores",
  "viewCoaches": "Ver clasificación de entrenadores",
  "empty": "Todavía no hay participantes elegibles en la clasificación actual publicada.",
  "unavailable": "La clasificación actual no está disponible. Inténtalo más tarde.",
  "sourceNote": "Solo aparecen participantes con vínculo actual confirmado en la liga. Las posiciones proceden de la clasificación publicada; los marcos repetidos conservan la clasificación oficial de cada tarjeta."
},
  "it-IT": {
  "playerEyebrow": "Giocatori TouchLine",
  "playerTitle": "Classifica attuale dei giocatori",
  "playerDescription": "I sette giocatori meglio classificati attualmente nella lega, con le posizioni ufficiali e le cornici originali.",
  "coachEyebrow": "Allenatori TouchLine",
  "coachTitle": "Classifica attuale degli allenatori",
  "coachDescription": "I sette allenatori meglio classificati attualmente nella lega. I punti si aggiornano; le cornici della stagione restano invariate.",
  "playerMetric": "Rating totale",
  "coachMetric": "PTS",
  "openPlayer": "Apri il profilo del giocatore",
  "openCoach": "Apri il profilo dell’allenatore",
  "viewPlayers": "Vedi la classifica dei giocatori",
  "viewCoaches": "Vedi la classifica degli allenatori",
  "empty": "Non ci sono ancora partecipanti idonei nella classifica attuale pubblicata.",
  "unavailable": "La classifica attuale non è disponibile. Riprova più tardi.",
  "sourceNote": "Compaiono solo partecipanti con un legame attuale confermato nella lega. Le posizioni provengono dalla classifica pubblicata; le cornici ripetute conservano la classificazione ufficiale di ogni carta."
},
  "fr-FR": {
  "playerEyebrow": "Joueurs TouchLine",
  "playerTitle": "Classement actuel des joueurs",
  "playerDescription": "Les sept joueurs les mieux classés actuellement dans la ligue, avec leurs positions officielles et leurs cadres d’origine.",
  "coachEyebrow": "Entraîneurs TouchLine",
  "coachTitle": "Classement actuel des entraîneurs",
  "coachDescription": "Les sept entraîneurs les mieux classés actuellement dans la ligue. Les points évoluent ; les cadres de la saison restent inchangés.",
  "playerMetric": "Rating total",
  "coachMetric": "PTS",
  "openPlayer": "Ouvrir le profil du joueur",
  "openCoach": "Ouvrir le profil de l’entraîneur",
  "viewPlayers": "Voir le classement des joueurs",
  "viewCoaches": "Voir le classement des entraîneurs",
  "empty": "Aucun participant admissible dans le classement actuel publié pour le moment.",
  "unavailable": "Le classement actuel est indisponible. Réessayez plus tard.",
  "sourceNote": "Seuls les participants dont le lien actuel avec la ligue est confirmé apparaissent ici. Les positions proviennent du classement publié ; les cadres répétés conservent la classification officielle de chaque carte."
},
  "ar-SA": {
  "playerEyebrow": "لاعبو TouchLine",
  "playerTitle": "الترتيب الحالي للاعبين",
  "playerDescription": "أفضل سبعة لاعبين موجودين حاليًا في الدوري، بمراكزهم الرسمية وإطارات بطاقاتهم الأصلية.",
  "coachEyebrow": "مدربو TouchLine",
  "coachTitle": "الترتيب الحالي للمدربين",
  "coachDescription": "أفضل سبعة مدربين موجودين حاليًا في الدوري. تتحدث النقاط وتبقى إطارات الموسم دون تغيير.",
  "playerMetric": "إجمالي التقييم",
  "coachMetric": "نقاط",
  "openPlayer": "فتح ملف اللاعب",
  "openCoach": "فتح ملف المدرب",
  "viewPlayers": "عرض ترتيب اللاعبين",
  "viewCoaches": "عرض ترتيب المدربين",
  "empty": "لا يوجد حتى الآن مشاركون مؤهلون في الترتيب الحالي المنشور.",
  "unavailable": "الترتيب الحالي غير متاح. يرجى المحاولة لاحقًا.",
  "sourceNote": "يظهر فقط المشاركون الذين تأكد ارتباطهم الحالي بالدوري. المراكز مأخوذة من الترتيب المنشور؛ وتحافظ الإطارات المتكررة على التصنيف الرسمي لكل بطاقة."
},
  "tr-TR": {
  "playerEyebrow": "TouchLine oyuncuları",
  "playerTitle": "Güncel oyuncu sıralaması",
  "playerDescription": "Şu anda ligde bulunan en üst sıradaki yedi oyuncu, resmî sıraları ve özgün kart çerçeveleriyle.",
  "coachEyebrow": "TouchLine teknik direktörleri",
  "coachTitle": "Güncel teknik direktör sıralaması",
  "coachDescription": "Şu anda ligde bulunan en üst sıradaki yedi teknik direktör. Puanlar güncellenir; sezonun kart çerçeveleri değişmez.",
  "playerMetric": "Toplam rating",
  "coachMetric": "PUAN",
  "openPlayer": "Oyuncu profilini aç",
  "openCoach": "Teknik direktör profilini aç",
  "viewPlayers": "Oyuncu sıralamasını gör",
  "viewCoaches": "Teknik direktör sıralamasını gör",
  "empty": "Yayımlanan güncel sıralamada henüz uygun katılımcı yok.",
  "unavailable": "Güncel sıralama kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
  "sourceNote": "Yalnızca ligle güncel bağı doğrulanmış katılımcılar gösterilir. Sıralar yayımlanan sıralamadan gelir; tekrarlanan çerçeveler her kartın resmî sınıflandırmasını korur."
},
  "de-DE": {
  "playerEyebrow": "TouchLine-Spieler",
  "playerTitle": "Aktuelle Spielerrangliste",
  "playerDescription": "Die sieben bestplatzierten Spieler, die aktuell in der Liga sind, mit ihren offiziellen Platzierungen und ursprünglichen Kartenrahmen.",
  "coachEyebrow": "TouchLine-Trainer",
  "coachTitle": "Aktuelle Trainerrangliste",
  "coachDescription": "Die sieben bestplatzierten Trainer, die aktuell in der Liga sind. Punkte werden aktualisiert; die Kartenrahmen der Saison bleiben unverändert.",
  "playerMetric": "Gesamtrating",
  "coachMetric": "PKT",
  "openPlayer": "Spielerprofil öffnen",
  "openCoach": "Trainerprofil öffnen",
  "viewPlayers": "Spielerrangliste ansehen",
  "viewCoaches": "Trainerrangliste ansehen",
  "empty": "In der aktuellen veröffentlichten Rangliste gibt es noch keine berechtigten Teilnehmer.",
  "unavailable": "Die aktuelle Rangliste ist nicht verfügbar. Bitte versuche es später erneut.",
  "sourceNote": "Hier erscheinen nur Teilnehmer mit bestätigter aktueller Ligazugehörigkeit. Die Plätze stammen aus der veröffentlichten Rangliste; wiederholte Rahmen bewahren die offizielle Klassifizierung jeder Karte."
},
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubShowcaseCopy>>;

export function getTouchlineClubHubShowcaseCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubHubShowcaseCopy {
  return TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

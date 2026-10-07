import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  nationality: "Nat", totalRating: "Total rating", marketValue: "Market value", currentClub: "Current Club",
  yellowRedCards: "Yellow and red cards", yellowCard: "Yellow card", redCard: "Red card", yellowCards: "Yellow cards", redCards: "Red cards", profileAction: "Profile",
  provisionalValue: "Provisional value", position: "POSITION", pending: "PENDING", publicationPending: "Card publication pending", reviewRequired: "Card review required",
  goldenBootLabel: "Golden Boot — league top scorer", leagueStats: "TouchLine England League Stats",
  cardAria: "{playerName} TouchLine card", ratingAria: ", total rating {rating}", clubAria: "Open {clubName} ClubHub",
} as const;

export type TouchlineExactCardCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_EXACT_CARD_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_EXACT_CARD_DRAFT_STATUS = "draft" as const;

/** Public presentation only. Six drafts require linguistic/RTL release review.
 * Names, tactical/stat codes, editorial authority and factual values are not copy.
 * PT ARIA is intentionally localized; ClubHub is the canonical protected brand.
 */
export const TOUCHLINE_EXACT_CARD_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    nationality: "País", totalRating: "Nota total", marketValue: "Valor de mercado", currentClub: "Clube atual",
    yellowRedCards: "Cartões amarelo e vermelho", yellowCard: "Cartão amarelo", redCard: "Cartão vermelho", yellowCards: "Cartões amarelos", redCards: "Cartões vermelhos", profileAction: "Perfil",
    provisionalValue: "Valor provisório", position: "POSIÇÃO", pending: "PENDENTE", publicationPending: "Publicação do card pendente", reviewRequired: "Card requer revisão",
    goldenBootLabel: "Bota de Ouro — artilheiro da liga", leagueStats: "Estatísticas da TouchLine England League",
    cardAria: "Card TouchLine de {playerName}", ratingAria: ", nota total {rating}", clubAria: "Abrir ClubHub de {clubName}",
  },
  "es-ES": {
    nationality: "País", totalRating: "Valoración total", marketValue: "Valor de mercado", currentClub: "Club actual",
    yellowRedCards: "Tarjetas amarillas y rojas", yellowCard: "Tarjeta amarilla", redCard: "Tarjeta roja", yellowCards: "Tarjetas amarillas", redCards: "Tarjetas rojas", profileAction: "Perfil",
    provisionalValue: "Valor provisional", position: "POSICIÓN", pending: "PENDIENTE", publicationPending: "Publicación de la tarjeta pendiente", reviewRequired: "La tarjeta requiere revisión",
    goldenBootLabel: "Bota de Oro — máximo goleador de la liga", leagueStats: "Estadísticas de TouchLine England League",
    cardAria: "Tarjeta TouchLine de {playerName}", ratingAria: ", valoración total {rating}", clubAria: "Abrir ClubHub de {clubName}",
  },
  "it-IT": {
    nationality: "Paese", totalRating: "Valutazione totale", marketValue: "Valore di mercato", currentClub: "Club attuale",
    yellowRedCards: "Cartellini gialli e rossi", yellowCard: "Cartellino giallo", redCard: "Cartellino rosso", yellowCards: "Cartellini gialli", redCards: "Cartellini rossi", profileAction: "Profilo",
    provisionalValue: "Valore provvisorio", position: "POSIZIONE", pending: "IN ATTESA", publicationPending: "Pubblicazione della carta in attesa", reviewRequired: "La carta richiede una revisione",
    goldenBootLabel: "Scarpa d’Oro — capocannoniere del campionato", leagueStats: "Statistiche di TouchLine England League",
    cardAria: "Carta TouchLine di {playerName}", ratingAria: ", valutazione totale {rating}", clubAria: "Apri ClubHub di {clubName}",
  },
  "fr-FR": {
    nationality: "Pays", totalRating: "Note totale", marketValue: "Valeur marchande", currentClub: "Club actuel",
    yellowRedCards: "Cartons jaunes et rouges", yellowCard: "Carton jaune", redCard: "Carton rouge", yellowCards: "Cartons jaunes", redCards: "Cartons rouges", profileAction: "Profil",
    provisionalValue: "Valeur provisoire", position: "POSTE", pending: "EN ATTENTE", publicationPending: "Publication de la carte en attente", reviewRequired: "La carte nécessite une révision",
    goldenBootLabel: "Soulier d’Or — meilleur buteur du championnat", leagueStats: "Statistiques de TouchLine England League",
    cardAria: "Carte TouchLine de {playerName}", ratingAria: ", note totale {rating}", clubAria: "Ouvrir le ClubHub de {clubName}",
  },
  "ar-SA": {
    nationality: "البلد", totalRating: "التقييم الإجمالي", marketValue: "القيمة السوقية", currentClub: "النادي الحالي",
    yellowRedCards: "البطاقات الصفراء والحمراء", yellowCard: "بطاقة صفراء", redCard: "بطاقة حمراء", yellowCards: "البطاقات الصفراء", redCards: "البطاقات الحمراء", profileAction: "الملف الشخصي",
    provisionalValue: "قيمة مؤقتة", position: "المركز", pending: "قيد الانتظار", publicationPending: "نشر البطاقة قيد الانتظار", reviewRequired: "البطاقة تحتاج إلى مراجعة",
    goldenBootLabel: "الحذاء الذهبي — هداف الدوري", leagueStats: "إحصائيات TouchLine England League",
    cardAria: "بطاقة TouchLine للاعب {playerName}", ratingAria: "، التقييم الإجمالي {rating}", clubAria: "فتح ClubHub لنادي {clubName}",
  },
  "tr-TR": {
    nationality: "Ülke", totalRating: "Toplam değerlendirme", marketValue: "Piyasa değeri", currentClub: "Mevcut kulüp",
    yellowRedCards: "Sarı ve kırmızı kartlar", yellowCard: "Sarı kart", redCard: "Kırmızı kart", yellowCards: "Sarı kartlar", redCards: "Kırmızı kartlar", profileAction: "Profil",
    provisionalValue: "Geçici değer", position: "POZİSYON", pending: "BEKLEMEDE", publicationPending: "Kartın yayımlanması bekleniyor", reviewRequired: "Kartın incelenmesi gerekiyor",
    goldenBootLabel: "Altın Ayakkabı — ligin gol kralı", leagueStats: "TouchLine England League istatistikleri",
    cardAria: "{playerName} TouchLine kartı", ratingAria: ", toplam değerlendirme {rating}", clubAria: "{clubName} ClubHub sayfasını aç",
  },
  "de-DE": {
    nationality: "Land", totalRating: "Gesamtbewertung", marketValue: "Marktwert", currentClub: "Aktueller Verein",
    yellowRedCards: "Gelbe und rote Karten", yellowCard: "Gelbe Karte", redCard: "Rote Karte", yellowCards: "Gelbe Karten", redCards: "Rote Karten", profileAction: "Profil",
    provisionalValue: "Vorläufiger Wert", position: "POSITION", pending: "AUSSTEHEND", publicationPending: "Kartenveröffentlichung ausstehend", reviewRequired: "Karte muss überprüft werden",
    goldenBootLabel: "Goldener Schuh — bester Torschütze der Liga", leagueStats: "Statistiken der TouchLine England League",
    cardAria: "TouchLine-Karte von {playerName}", ratingAria: ", Gesamtbewertung {rating}", clubAria: "ClubHub von {clubName} öffnen",
  },
} as const satisfies Record<TouchLineLocale, TouchlineExactCardCopy>;

export function getTouchlineExactCardCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineExactCardCopy {
  return TOUCHLINE_EXACT_CARD_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

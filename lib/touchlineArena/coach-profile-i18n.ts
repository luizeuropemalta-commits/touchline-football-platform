import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  metadataFallback: "Coach profile | TouchLine England", heroEyebrow: "REAL FOOTBALL · COACH",
  verification: "Verification", verifiedBy: "Verified by TouchLine", performance: "Season performance", tier: "Tier",
  currentRank: "Current rank", matches: "Matches", homeCampaign: "Home campaign", awayCampaign: "Away campaign",
  competitionExplanation: "Wins, draws, losses and points come from the canonical competition standings and remain identical on every card for this coach.",
  classificationDescription: "Classification: {reason}. The tier stays fixed through the season.",
  officialProfile: "OFFICIAL PROFILE", coachContext: "Coach context", currentClubHeading: "CURRENT CLUB",
  seasonCampaign: "Season campaign", seasonForm: "SEASON FORM", homeAndAway: "Home and away",
  previousClub: "Previous club", previousLeague: "Previous league", finalPosition: "Final position",
  historyPending: "Club and league history has not yet been confirmed by the official source. TouchLine keeps the classification pending instead of inventing data.",
  reasonEliteFinal: "Elite-league final position", reasonPromoted: "Promoted club", reasonNewcomer: "No confirmed complete senior season",
  reasonNonElite: "History outside the initial elite leagues", reasonHistoryPending: "History under verification", reasonFallback: "Classification under verification",
} as const;
export type TouchlineCoachProfileCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_COACH_PROFILE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_COACH_PROFILE_DRAFT_STATUS = "draft" as const;

/** Presentation only. EN/PT retain their approved wording, except the explicitly
 * authorized Portuguese missing-profile metadata. Six other locales are drafts.
 * Names, classification codes, Tier/WDL and sporting values are not rewritten.
 */
export const TOUCHLINE_COACH_PROFILE_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    metadataFallback: "Perfil do treinador | TouchLine England", heroEyebrow: "FUTEBOL REAL · TREINADOR",
    verification: "Verificação", verifiedBy: "TouchLine Verified", performance: "Desempenho da temporada", tier: "Tier",
    currentRank: "Ranking atual", matches: "Partidas", homeCampaign: "Campanha em casa", awayCampaign: "Campanha fora",
    competitionExplanation: "Vitórias, empates, derrotas e pontos vêm da classificação canônica da competição e são os mesmos para todos os cards deste treinador.",
    classificationDescription: "Classificação: {reason}. O tier fica fixo durante a temporada.",
    officialProfile: "PERFIL OFICIAL", coachContext: "Contexto do treinador", currentClubHeading: "CLUBE ATUAL",
    seasonCampaign: "Campanha da temporada", seasonForm: "FORMA DA TEMPORADA", homeAndAway: "Casa e fora",
    previousClub: "Clube anterior", previousLeague: "Liga anterior", finalPosition: "Posição final",
    historyPending: "O histórico de clubes e ligas ainda não foi confirmado pela fonte oficial. A TouchLine mantém a classificação pendente em vez de inventar dados.",
    reasonEliteFinal: "Posição final em liga de elite", reasonPromoted: "Clube promovido", reasonNewcomer: "Sem temporada sénior completa confirmada",
    reasonNonElite: "Histórico fora das ligas de elite iniciais", reasonHistoryPending: "Histórico em validação", reasonFallback: "Classificação em validação",
  },
  "es-ES": {
    metadataFallback: "Perfil del entrenador | TouchLine England", heroEyebrow: "FÚTBOL REAL · ENTRENADOR",
    verification: "Verificación", verifiedBy: "Verificado por TouchLine", performance: "Rendimiento de la temporada", tier: "Tier",
    currentRank: "Posición actual", matches: "Partidos", homeCampaign: "Campaña como local", awayCampaign: "Campaña como visitante",
    competitionExplanation: "Las victorias, los empates, las derrotas y los puntos proceden de la clasificación canónica de la competición y son idénticos en todas las tarjetas de este entrenador.",
    classificationDescription: "Clasificación: {reason}. El tier permanece fijo durante la temporada.",
    officialProfile: "PERFIL OFICIAL", coachContext: "Contexto del entrenador", currentClubHeading: "CLUB ACTUAL",
    seasonCampaign: "Campaña de la temporada", seasonForm: "FORMA DE LA TEMPORADA", homeAndAway: "Local y visitante",
    previousClub: "Club anterior", previousLeague: "Liga anterior", finalPosition: "Posición final",
    historyPending: "El historial de clubes y ligas aún no ha sido confirmado por la fuente oficial. TouchLine mantiene la clasificación pendiente en lugar de inventar datos.",
    reasonEliteFinal: "Posición final en una liga de élite", reasonPromoted: "Club ascendido", reasonNewcomer: "Sin una temporada sénior completa confirmada",
    reasonNonElite: "Historial fuera de las ligas de élite iniciales", reasonHistoryPending: "Historial en verificación", reasonFallback: "Clasificación en verificación",
  },
  "it-IT": {
    metadataFallback: "Profilo dell’allenatore | TouchLine England", heroEyebrow: "CALCIO REALE · ALLENATORE",
    verification: "Verifica", verifiedBy: "Verificato da TouchLine", performance: "Rendimento stagionale", tier: "Tier",
    currentRank: "Posizione attuale", matches: "Partite", homeCampaign: "Rendimento in casa", awayCampaign: "Rendimento in trasferta",
    competitionExplanation: "Vittorie, pareggi, sconfitte e punti provengono dalla classifica canonica della competizione e sono identici su tutte le carte di questo allenatore.",
    classificationDescription: "Classificazione: {reason}. Il tier rimane fisso per tutta la stagione.",
    officialProfile: "PROFILO UFFICIALE", coachContext: "Contesto dell’allenatore", currentClubHeading: "CLUB ATTUALE",
    seasonCampaign: "Andamento stagionale", seasonForm: "FORMA STAGIONALE", homeAndAway: "Casa e trasferta",
    previousClub: "Club precedente", previousLeague: "Campionato precedente", finalPosition: "Posizione finale",
    historyPending: "Lo storico di club e campionati non è ancora stato confermato dalla fonte ufficiale. TouchLine mantiene la classificazione in attesa anziché inventare dati.",
    reasonEliteFinal: "Posizione finale in un campionato d’élite", reasonPromoted: "Club promosso", reasonNewcomer: "Nessuna stagione completa in prima squadra confermata",
    reasonNonElite: "Storico al di fuori dei campionati d’élite iniziali", reasonHistoryPending: "Storico in fase di verifica", reasonFallback: "Classificazione in fase di verifica",
  },
  "fr-FR": {
    metadataFallback: "Profil de l’entraîneur | TouchLine England", heroEyebrow: "FOOTBALL RÉEL · ENTRAÎNEUR",
    verification: "Vérification", verifiedBy: "Vérifié par TouchLine", performance: "Performances de la saison", tier: "Tier",
    currentRank: "Classement actuel", matches: "Matchs", homeCampaign: "Bilan à domicile", awayCampaign: "Bilan à l’extérieur",
    competitionExplanation: "Les victoires, les matchs nuls, les défaites et les points proviennent du classement canonique de la compétition et sont identiques sur toutes les cartes de cet entraîneur.",
    classificationDescription: "Classification : {reason}. Le tier reste fixe pendant toute la saison.",
    officialProfile: "PROFIL OFFICIEL", coachContext: "Contexte de l’entraîneur", currentClubHeading: "CLUB ACTUEL",
    seasonCampaign: "Bilan de la saison", seasonForm: "FORME DE LA SAISON", homeAndAway: "Domicile et extérieur",
    previousClub: "Club précédent", previousLeague: "Championnat précédent", finalPosition: "Classement final",
    historyPending: "L’historique des clubs et des championnats n’a pas encore été confirmé par la source officielle. TouchLine laisse la classification en attente plutôt que d’inventer des données.",
    reasonEliteFinal: "Classement final dans un championnat d’élite", reasonPromoted: "Club promu", reasonNewcomer: "Aucune saison senior complète confirmée",
    reasonNonElite: "Historique en dehors des championnats d’élite initiaux", reasonHistoryPending: "Historique en cours de vérification", reasonFallback: "Classification en cours de vérification",
  },
  "ar-SA": {
    metadataFallback: "الملف الشخصي للمدرب | TouchLine England", heroEyebrow: "كرة قدم حقيقية · مدرب",
    verification: "التحقق", verifiedBy: "تم التحقق بواسطة TouchLine", performance: "أداء الموسم", tier: "Tier",
    currentRank: "الترتيب الحالي", matches: "المباريات", homeCampaign: "الأداء على أرضه", awayCampaign: "الأداء خارج أرضه",
    competitionExplanation: "تأتي الانتصارات والتعادلات والهزائم والنقاط من الترتيب المعتمد للمسابقة، وتظل متطابقة في جميع بطاقات هذا المدرب.",
    classificationDescription: "التصنيف: {reason}. يبقى tier ثابتًا طوال الموسم.",
    officialProfile: "الملف الرسمي", coachContext: "معلومات المدرب", currentClubHeading: "النادي الحالي",
    seasonCampaign: "حصيلة الموسم", seasonForm: "مستوى الأداء خلال الموسم", homeAndAway: "على أرضه وخارج أرضه",
    previousClub: "النادي السابق", previousLeague: "الدوري السابق", finalPosition: "المركز النهائي",
    historyPending: "لم يؤكد المصدر الرسمي بعد سجل الأندية والدوريات. تُبقي TouchLine التصنيف قيد الانتظار بدلًا من اختلاق البيانات.",
    reasonEliteFinal: "المركز النهائي في دوري نخبة", reasonPromoted: "نادٍ صاعد", reasonNewcomer: "لا يوجد موسم كامل مؤكد مع الفريق الأول",
    reasonNonElite: "سجل خارج دوريات النخبة الأولية", reasonHistoryPending: "السجل قيد التحقق", reasonFallback: "التصنيف قيد التحقق",
  },
  "tr-TR": {
    metadataFallback: "Teknik direktör profili | TouchLine England", heroEyebrow: "GERÇEK FUTBOL · TEKNİK DİREKTÖR",
    verification: "Doğrulama", verifiedBy: "TouchLine tarafından doğrulandı", performance: "Sezon performansı", tier: "Tier",
    currentRank: "Güncel sıralama", matches: "Maçlar", homeCampaign: "İç saha performansı", awayCampaign: "Deplasman performansı",
    competitionExplanation: "Galibiyetler, beraberlikler, mağlubiyetler ve puanlar müsabakanın kanonik sıralamasından gelir ve bu teknik direktörün tüm kartlarında aynıdır.",
    classificationDescription: "Sınıflandırma: {reason}. Tier sezon boyunca sabit kalır.",
    officialProfile: "RESMÎ PROFİL", coachContext: "Teknik direktör bilgileri", currentClubHeading: "MEVCUT KULÜP",
    seasonCampaign: "Sezon tablosu", seasonForm: "SEZON FORMU", homeAndAway: "İç saha ve deplasman",
    previousClub: "Önceki kulüp", previousLeague: "Önceki lig", finalPosition: "Sezon sonu sıralaması",
    historyPending: "Kulüp ve lig geçmişi resmî kaynak tarafından henüz doğrulanmadı. TouchLine veri uydurmak yerine sınıflandırmayı beklemede tutar.",
    reasonEliteFinal: "Elit ligde sezon sonu sıralaması", reasonPromoted: "Üst lige yükselen kulüp", reasonNewcomer: "Doğrulanmış tam bir A takım sezonu yok",
    reasonNonElite: "Başlangıçtaki elit liglerin dışındaki geçmiş", reasonHistoryPending: "Geçmiş doğrulanıyor", reasonFallback: "Sınıflandırma doğrulanıyor",
  },
  "de-DE": {
    metadataFallback: "Trainerprofil | TouchLine England", heroEyebrow: "ECHTER FUSSBALL · TRAINER",
    verification: "Verifizierung", verifiedBy: "Von TouchLine verifiziert", performance: "Saisonleistung", tier: "Tier",
    currentRank: "Aktueller Rang", matches: "Spiele", homeCampaign: "Heimbilanz", awayCampaign: "Auswärtsbilanz",
    competitionExplanation: "Siege, Unentschieden, Niederlagen und Punkte stammen aus der kanonischen Wettbewerbstabelle und sind auf allen Karten dieses Trainers identisch.",
    classificationDescription: "Einstufung: {reason}. Der tier bleibt während der gesamten Saison unverändert.",
    officialProfile: "OFFIZIELLES PROFIL", coachContext: "Trainerinformationen", currentClubHeading: "AKTUELLER VEREIN",
    seasonCampaign: "Saisonbilanz", seasonForm: "SAISONFORM", homeAndAway: "Heim und auswärts",
    previousClub: "Vorheriger Verein", previousLeague: "Vorherige Liga", finalPosition: "Abschlussplatzierung",
    historyPending: "Die Vereins- und Ligahistorie wurde noch nicht von der offiziellen Quelle bestätigt. TouchLine lässt die Einstufung offen, statt Daten zu erfinden.",
    reasonEliteFinal: "Abschlussplatzierung in einer Eliteliga", reasonPromoted: "Aufgestiegener Verein", reasonNewcomer: "Keine vollständige Saison im Seniorenbereich bestätigt",
    reasonNonElite: "Historie außerhalb der anfänglichen Eliteligen", reasonHistoryPending: "Historie wird überprüft", reasonFallback: "Einstufung wird überprüft",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineCoachProfileCopy>>;

export function getTouchlineCoachProfileCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineCoachProfileCopy {
  return TOUCHLINE_COACH_PROFILE_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

const reasonKeys = {
  "elite-final-position": "reasonEliteFinal", "elite-relegation-free": "reasonEliteFinal",
  promoted: "reasonPromoted", newcomer: "reasonNewcomer", "non-elite-fallback": "reasonNonElite",
  "classification-pending": "reasonHistoryPending",
} as const satisfies Readonly<Record<string, keyof TouchlineCoachProfileCopy>>;

export function getTouchlineCoachProfileReason(reason: string, locale?: string | null, draftLocalesEnabled = false): string {
  const copy = getTouchlineCoachProfileCopy(locale, draftLocalesEnabled);
  return Object.hasOwn(reasonKeys, reason) ? copy[reasonKeys[reason as keyof typeof reasonKeys]] : copy.reasonFallback;
}

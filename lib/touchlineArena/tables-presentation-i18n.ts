import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
type Translations = readonly [en: string, pt: string, es: string, it: string, fr: string, ar: string, tr: string, de: string];

/** Presentation only; column order is declared above. EN/PT are unchanged.
 * Six additional languages remain drafts. Sporting ranks, WDL values, eleven
 * slots, identities, protected brands and asynchronous data flow are separate.
 * Current season is reused from player-performance-i18n, not duplicated here.
 */
const rows = {
  incompleteSelection: ["The published selection does not yet resolve all 11 canonical cards; no partial XI is shown.", "A seleção publicada ainda não resolve os 11 cards canônicos; nenhuma seleção incompleta é exibida.", "La selección publicada aún no incluye las 11 cartas canónicas; no se muestra un XI parcial.", "La selezione pubblicata non comprende ancora tutte le 11 carte canoniche; non viene mostrato un XI parziale.", "La sélection publiée ne comprend pas encore les 11 cartes canoniques ; aucun XI partiel n’est affiché.", "لم تُحدَّد بعد البطاقات المعتمدة الإحدى عشرة في التشكيلة المنشورة؛ ولا تُعرض تشكيلة XI جزئية من أصل 11 لاعبًا.", "Yayımlanan seçim henüz 11 kanonik kartın tamamını içermiyor; eksik bir XI gösterilmiyor.", "Die veröffentlichte Auswahl enthält noch nicht alle 11 kanonischen Karten; es wird keine unvollständige XI angezeigt."],
  topCoachEyebrow: ["NO. 1 COACH", "TREINADOR Nº 1", "ENTRENADOR N.º 1", "ALLENATORE N. 1", "ENTRAÎNEUR N° 1", "المدرب رقم 1", "1 NUMARALI TEKNİK DİREKTÖR", "TRAINER NR. 1"],
  bestCoach: ["Best coach", "Melhor treinador", "Mejor entrenador", "Miglior allenatore", "Meilleur entraîneur", "أفضل مدرب", "En iyi teknik direktör", "Bester Trainer"],
  topCoachDescription: ["Current leader from official season results.", "Líder atual pelos resultados oficiais da temporada.", "Líder actual según los resultados oficiales de la temporada.", "Leader attuale in base ai risultati ufficiali della stagione.", "Leader actuel selon les résultats officiels de la saison.", "المتصدر الحالي وفق النتائج الرسمية للموسم.", "Sezonun resmî sonuçlarına göre güncel lider.", "Aktueller Spitzenreiter nach den offiziellen Saisonergebnissen."],
  seasonLeader: ["SEASON LEADER", "LÍDER DA TEMPORADA", "LÍDER DE LA TEMPORADA", "LEADER DELLA STAGIONE", "LEADER DE LA SAISON", "متصدر الموسم", "SEZON LİDERİ", "SAISON-SPITZENREITER"],
  coachRankingEyebrow: ["SEASON RANKING", "RANKING DA TEMPORADA", "CLASIFICACIÓN DE LA TEMPORADA", "CLASSIFICA STAGIONALE", "CLASSEMENT DE LA SAISON", "ترتيب الموسم", "SEZON SIRALAMASI", "SAISONRANGLISTE"],
  bestCoaches: ["Best coaches", "Melhores treinadores", "Mejores entrenadores", "Migliori allenatori", "Meilleurs entraîneurs", "أفضل المدربين", "En iyi teknik direktörler", "Beste Trainer"],
  coachRankingDescription: ["Top 7 by canonical points. Ties use wins, away wins and canonical identity.", "Top 7 pelos pontos canônicos. Empates seguem vitórias, vitórias fora e identidade canônica.", "Los 7 mejores por puntos canónicos. Los empates se resuelven por victorias, victorias como visitante e identidad canónica.", "I primi 7 per punti canonici. A parità di punti contano vittorie, vittorie in trasferta e identità canonica.", "Les 7 premiers selon les points canoniques. Les égalités sont départagées par les victoires, les victoires à l’extérieur et l’identité canonique.", "أفضل 7 بحسب النقاط المعتمدة. يُحسم التعادل بالانتصارات ثم الانتصارات خارج الأرض ثم المعرّف المعتمد.", "Kanonik puanlara göre ilk 7. Eşitlikler galibiyetler, deplasman galibiyetleri ve kanonik kimlikle çözülür.", "Top 7 nach kanonischen Punkten. Bei Gleichstand entscheiden Siege, Auswärtssiege und die kanonische Identität."],
  coachStandings: ["Coach standings", "Classificação dos treinadores", "Clasificación de entrenadores", "Classifica degli allenatori", "Classement des entraîneurs", "ترتيب المدربين", "Teknik direktör sıralaması", "Trainerrangliste"],
  wins: ["Wins", "Vitórias", "Victorias", "Vittorie", "Victoires", "انتصارات", "Galibiyetler", "Siege"],
  winsShort: ["W", "V", "V", "V", "V", "ف", "G", "S"],
  draws: ["Draws", "Empates", "Empates", "Pareggi", "Matchs nuls", "تعادلات", "Beraberlikler", "Unentschieden"],
  drawsShort: ["D", "E", "E", "N", "N", "ت", "B", "U"],
  losses: ["Losses", "Derrotas", "Derrotas", "Sconfitte", "Défaites", "هزائم", "Mağlubiyetler", "Niederlagen"],
  lossesShort: ["L", "D", "D", "P", "D", "خ", "M", "N"],
  podiumEyebrow: ["OVERALL PODIUM", "PÓDIO GERAL", "PODIO GENERAL", "PODIO GENERALE", "PODIUM GÉNÉRAL", "منصة التتويج العامة", "GENEL KÜRSÜ", "GESAMTPODIUM"],
  podiumTitle: ["Season Awards", "Prêmios da Temporada", "Premios de la temporada", "Premi della stagione", "Prix de la saison", "جوائز الموسم", "Sezon Ödülleri", "Saison-Auszeichnungen"],
  podiumDescription: ["Best Player, Golden Boot and Best Coach. Every award uses its own published authority.", "Melhor Jogador, Artilheiro e Melhor Treinador. Cada prêmio usa sua própria autoridade publicada.", "Mejor jugador, Bota de Oro y Mejor entrenador. Cada premio usa su propia autoridad publicada.", "Miglior giocatore, Scarpa d’Oro e Miglior allenatore. Ogni premio usa la propria autorità pubblicata.", "Meilleur joueur, Soulier d’Or et Meilleur entraîneur. Chaque prix utilise sa propre autorité publiée.", "أفضل لاعب والحذاء الذهبي وأفضل مدرب. تستخدم كل جائزة مصدرها المنشور الخاص.", "En İyi Oyuncu, Altın Ayakkabı ve En İyi Teknik Direktör. Her ödül kendi yayımlanmış kaynağını kullanır.", "Bester Spieler, Goldener Schuh und Bester Trainer. Jede Auszeichnung verwendet ihre eigene veröffentlichte Grundlage."],
  bestPlayerEyebrow: ["GOLDEN BALL", "BOLA DE OURO", "BALÓN DE ORO", "PALLONE D’ORO", "BALLON D’OR", "الكرة الذهبية", "ALTIN TOP", "GOLDENER BALL"],
  bestPlayer: ["Best player", "Melhor jogador", "Mejor jugador", "Miglior giocatore", "Meilleur joueur", "أفضل لاعب", "En iyi oyuncu", "Bester Spieler"],
  goldenBootEyebrow: ["GOLDEN BOOT", "CHUTEIRA DE OURO", "BOTA DE ORO", "SCARPA D’ORO", "SOULIER D’OR", "الحذاء الذهبي", "ALTIN AYAKKABI", "GOLDENER SCHUH"],
  goldenBoot: ["Top scorer", "Artilheiro", "Máximo goleador", "Capocannoniere", "Meilleur buteur", "هدّاف الدوري", "Gol kralı", "Torschützenkönig"],
  goldenBootPreview: ["GOLDEN BOOT PREVIEW", "PRÉVIA DA CHUTEIRA DE OURO", "VISTA PREVIA DE LA BOTA DE ORO", "ANTEPRIMA DELLA SCARPA D’ORO", "APERÇU DU SOULIER D’OR", "معاينة الحذاء الذهبي", "ALTIN AYAKKABI ÖNİZLEMESİ", "VORSCHAU GOLDENER SCHUH"],
  goldenBootPreviewDescription: ["QA placeholder until verified goals are published", "Referência de QA até a publicação dos gols verificados", "Referencia de QA hasta que se publiquen los goles verificados", "Riferimento QA fino alla pubblicazione dei gol verificati", "Référence QA jusqu’à la publication des buts vérifiés", "مرجع QA حتى نشر الأهداف التي تم التحقق منها", "Doğrulanmış goller yayımlanana kadar QA referansı", "QA-Referenz bis verifizierte Tore veröffentlicht sind"],
  goldenBootPending: ["The Golden Boot will appear after its goals authority is published.", "A Chuteira de Ouro aparecerá após a autoridade de gols ser publicada.", "La Bota de Oro aparecerá después de que se publique su autoridad de goles.", "La Scarpa d’Oro apparirà dopo la pubblicazione della sua autorità dei gol.", "Le Soulier d’Or apparaîtra après la publication de son autorité de buts.", "سيظهر الحذاء الذهبي بعد نشر مصدر الأهداف المعتمد.", "Altın Ayakkabı, gol kaynağı yayımlandıktan sonra görünecek.", "Der Goldene Schuh erscheint, nachdem seine Torautorität veröffentlicht wurde."],
  loadingRankings: ["Loading rankings…", "Carregando classificações…", "Cargando clasificaciones…", "Caricamento delle classifiche…", "Chargement des classements…", "جارٍ تحميل الترتيبات…", "Sıralamalar yükleniyor…", "Ranglisten werden geladen…"],
  positionHeading: ["POS", "POS", "POS", "POS", "POS", "المركز", "POZ", "POS"],
  clubHeading: ["CLUB", "CLUBE", "CLUB", "CLUB", "CLUB", "النادي", "KULÜP", "VEREIN"],
  pointsHeading: ["POINTS", "PONTOS", "PUNTOS", "PUNTI", "POINTS", "النقاط", "PUAN", "PUNKTE"],
  matchweek: ["Matchweek", "Rodada", "Jornada", "Giornata", "Journée", "الجولة", "Maç haftası", "Spieltag"],
  matchweekPending: ["Matchweek awaiting provider", "Rodada aguardando provider", "Jornada pendiente del proveedor", "Giornata in attesa del fornitore", "Journée en attente du fournisseur", "الجولة في انتظار مزوّد البيانات", "Maç haftası veri sağlayıcısını bekliyor", "Spieltag wartet auf den Datenanbieter"],
  seasonHighlights: ["Season highlights", "Destaques da temporada", "Destacados de la temporada", "Protagonisti della stagione", "Temps forts de la saison", "أبرز أحداث الموسم", "Sezonun öne çıkanları", "Saisonhöhepunkte"],
  loadingMatchweek: ["Loading matchweek…", "Carregando rodada…", "Cargando jornada…", "Caricamento della giornata…", "Chargement de la journée…", "جارٍ تحميل الجولة…", "Maç haftası yükleniyor…", "Spieltag wird geladen…"],
} as const satisfies Record<string, Translations>;

export type TouchlineTablesPresentationCopy = Readonly<Record<keyof typeof rows, string>>;
export const TOUCHLINE_TABLES_PRESENTATION_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_TABLES_PRESENTATION_DRAFT_STATUS = "draft" as const;
export const TOUCHLINE_TABLES_PRESENTATION_CATALOGUES = Object.fromEntries(locales.map((locale, index) => [
  locale, Object.fromEntries(Object.entries(rows).map(([key, translations]) => [key, translations[index]])),
])) as Readonly<Record<TouchLineLocale, TouchlineTablesPresentationCopy>>;

export function getTouchlineTablesPresentationCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineTablesPresentationCopy {
  return TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

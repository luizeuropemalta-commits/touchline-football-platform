import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { touchlineCardTierName } from "./card-tier-names.ts";

const enGB = {
  playerEyebrow: "TouchLine player borders",
  playerTitle: "Seven official player-card borders",
  playerDescription: "Ordered from the highest-value border to the entry border. Each card is a real published representative with the highest verified market value in its tier; Erling Haaland leads {tierName}.",
  coachEyebrow: "TouchLine coach borders",
  coachTitle: "Seven official coach-card borders",
  coachDescription: "Each representative keeps the same border as their official profile. Within each tier, approved previous-season results determine the representative. Borders without an eligible coach remain pending.",
  verifiedValue: "Verified market value", previousFinish: "Previous-season finish",
  promotedChampion: "Promoted champion", promotedPlayoff: "Promoted through play-offs", approvedFallback: "Approved promotion fallback",
  representativePending: "Representative pending",
  representativePendingDescription: "No current coach has approved evidence for this border. TouchLine will not borrow another coach’s position.",
  playerPending: "Published representative pending", playerPendingDescription: "No published card currently owns this border.",
  openPlayer: "Open player profile", openCoach: "Open coach profile",
  sourceNote: "Only published player cards and immutable coach classifications appear here. Missing evidence remains explicit.",
} as const;
export type TouchlineClubHubShowcaseCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_STATUS = "draft" as const;

/** Presentation only; the six additional catalogues are unapproved drafts.
 * Selection, publication, tier identity and football values remain external.
 * PT retains its approved literal tier wording; EN and drafts resolve the
 * placeholder through the existing canonical tier-name authority.
 */
export const TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    playerEyebrow: "Bordas de jogadores TouchLine",
    playerTitle: "As sete bordas oficiais dos cards de jogadores",
    playerDescription: "Ordem da borda de maior valor até a borda de entrada. Cada card é um representante real publicado com o maior valor de mercado verificado do seu tier; Erling Haaland lidera o Diamante Dourado.",
    coachEyebrow: "Bordas de treinadores TouchLine",
    coachTitle: "As sete bordas oficiais dos cards de treinadores",
    coachDescription: "Cada representante mantém a mesma borda do seu perfil oficial. Dentro de cada tier, os resultados aprovados da temporada anterior definem o representante. Bordas sem treinador elegível permanecem pendentes.",
    verifiedValue: "Valor de mercado verificado", previousFinish: "Posição na temporada anterior",
    promotedChampion: "Campeão promovido", promotedPlayoff: "Promovido pelos play-offs", approvedFallback: "Fallback de promoção aprovado",
    representativePending: "Representante pendente",
    representativePendingDescription: "Nenhum treinador atual possui evidência aprovada para esta borda. A TouchLine não empresta a posição de outro treinador.",
    playerPending: "Representante publicado pendente", playerPendingDescription: "Nenhum card publicado ocupa esta borda no momento.",
    openPlayer: "Abrir perfil do jogador", openCoach: "Abrir perfil do treinador",
    sourceNote: "Somente cards de jogadores publicados e classificações imutáveis de treinadores aparecem aqui. Evidência ausente permanece explícita.",
  },
  "es-ES": {
    playerEyebrow: "Marcos de jugadores de TouchLine", playerTitle: "Los siete marcos oficiales de las tarjetas de jugadores",
    playerDescription: "Ordenados del marco de mayor valor al de entrada. Cada tarjeta representa a un jugador real publicado con el mayor valor de mercado verificado de su nivel; Erling Haaland encabeza el nivel {tierName}.",
    coachEyebrow: "Marcos de entrenadores de TouchLine", coachTitle: "Los siete marcos oficiales de las tarjetas de entrenadores",
    coachDescription: "Cada representante conserva el mismo marco que su perfil oficial. En cada nivel, los resultados aprobados de la temporada anterior determinan al representante. Los marcos sin un entrenador elegible quedan pendientes.",
    verifiedValue: "Valor de mercado verificado", previousFinish: "Posición en la temporada anterior",
    promotedChampion: "Campeón ascendido", promotedPlayoff: "Ascendido mediante eliminatorias", approvedFallback: "Criterio alternativo de ascenso aprobado",
    representativePending: "Representante pendiente",
    representativePendingDescription: "Ningún entrenador actual tiene pruebas aprobadas para este marco. TouchLine no utilizará la posición de otro entrenador.",
    playerPending: "Representante publicado pendiente", playerPendingDescription: "Actualmente ninguna tarjeta publicada tiene este marco.",
    openPlayer: "Abrir perfil del jugador", openCoach: "Abrir perfil del entrenador",
    sourceNote: "Aquí solo aparecen tarjetas de jugadores publicadas y clasificaciones inmutables de entrenadores. La falta de pruebas se indica expresamente.",
  },
  "it-IT": {
    playerEyebrow: "Cornici dei giocatori TouchLine", playerTitle: "Le sette cornici ufficiali delle carte dei giocatori",
    playerDescription: "Ordinate dalla cornice di maggior valore a quella iniziale. Ogni carta è un rappresentante reale pubblicato con il maggior valore di mercato verificato del suo livello; Erling Haaland guida il livello {tierName}.",
    coachEyebrow: "Cornici degli allenatori TouchLine", coachTitle: "Le sette cornici ufficiali delle carte degli allenatori",
    coachDescription: "Ogni rappresentante mantiene la stessa cornice del proprio profilo ufficiale. In ogni livello, i risultati approvati della stagione precedente determinano il rappresentante. Le cornici senza un allenatore idoneo restano in attesa.",
    verifiedValue: "Valore di mercato verificato", previousFinish: "Posizione nella stagione precedente",
    promotedChampion: "Campione promosso", promotedPlayoff: "Promosso tramite play-off", approvedFallback: "Criterio alternativo di promozione approvato",
    representativePending: "Rappresentante in attesa",
    representativePendingDescription: "Nessun allenatore attuale dispone di prove approvate per questa cornice. TouchLine non userà la posizione di un altro allenatore.",
    playerPending: "Rappresentante pubblicato in attesa", playerPendingDescription: "Nessuna carta pubblicata possiede attualmente questa cornice.",
    openPlayer: "Apri il profilo del giocatore", openCoach: "Apri il profilo dell’allenatore",
    sourceNote: "Qui compaiono solo carte di giocatori pubblicate e classificazioni immutabili degli allenatori. Le prove mancanti sono indicate esplicitamente.",
  },
  "fr-FR": {
    playerEyebrow: "Cadres des joueurs TouchLine", playerTitle: "Les sept cadres officiels des cartes de joueurs",
    playerDescription: "Classés du cadre de plus grande valeur au cadre d’entrée. Chaque carte est un représentant réel publié ayant la plus grande valeur marchande vérifiée de son niveau ; Erling Haaland est en tête du niveau {tierName}.",
    coachEyebrow: "Cadres des entraîneurs TouchLine", coachTitle: "Les sept cadres officiels des cartes d’entraîneurs",
    coachDescription: "Chaque représentant conserve le même cadre que son profil officiel. Dans chaque niveau, les résultats approuvés de la saison précédente déterminent le représentant. Les cadres sans entraîneur admissible restent en attente.",
    verifiedValue: "Valeur marchande vérifiée", previousFinish: "Classement de la saison précédente",
    promotedChampion: "Champion promu", promotedPlayoff: "Promu par les barrages", approvedFallback: "Critère alternatif de promotion approuvé",
    representativePending: "Représentant en attente",
    representativePendingDescription: "Aucun entraîneur actuel ne dispose de preuves approuvées pour ce cadre. TouchLine n’utilisera pas le classement d’un autre entraîneur.",
    playerPending: "Représentant publié en attente", playerPendingDescription: "Aucune carte publiée ne possède actuellement ce cadre.",
    openPlayer: "Ouvrir le profil du joueur", openCoach: "Ouvrir le profil de l’entraîneur",
    sourceNote: "Seules les cartes de joueurs publiées et les classifications immuables des entraîneurs apparaissent ici. L’absence de preuves reste explicite.",
  },
  "ar-SA": {
    playerEyebrow: "إطارات لاعبي TouchLine", playerTitle: "الإطارات الرسمية السبعة لبطاقات اللاعبين",
    playerDescription: "مرتبة من الإطار الأعلى قيمة إلى إطار البداية. كل بطاقة تمثل لاعبًا حقيقيًا منشورًا له أعلى قيمة سوقية موثقة في فئته؛ ويتصدر Erling Haaland فئة {tierName}.",
    coachEyebrow: "إطارات مدربي TouchLine", coachTitle: "الإطارات الرسمية السبعة لبطاقات المدربين",
    coachDescription: "يحتفظ كل ممثل بالإطار نفسه الموجود في ملفه الرسمي. تحدد النتائج المعتمدة للموسم السابق الممثل داخل كل فئة. وتبقى الإطارات التي لا يتوفر لها مدرب مؤهل قيد الانتظار.",
    verifiedValue: "القيمة السوقية الموثقة", previousFinish: "المركز في الموسم السابق",
    promotedChampion: "بطل صاعد", promotedPlayoff: "صاعد عبر الملحق", approvedFallback: "معيار بديل معتمد للصعود",
    representativePending: "الممثل قيد الانتظار",
    representativePendingDescription: "لا يملك أي مدرب حالي أدلة معتمدة لهذا الإطار. لن تستخدم TouchLine مركز مدرب آخر.",
    playerPending: "الممثل المنشور قيد الانتظار", playerPendingDescription: "لا توجد حاليًا بطاقة منشورة تحمل هذا الإطار.",
    openPlayer: "فتح ملف اللاعب", openCoach: "فتح ملف المدرب",
    sourceNote: "تظهر هنا فقط بطاقات اللاعبين المنشورة وتصنيفات المدربين الثابتة. ويظل نقص الأدلة موضحًا صراحةً.",
  },
  "tr-TR": {
    playerEyebrow: "TouchLine oyuncu çerçeveleri", playerTitle: "Oyuncu kartlarının yedi resmî çerçevesi",
    playerDescription: "En değerli çerçeveden başlangıç çerçevesine doğru sıralanır. Her kart, kendi seviyesinde doğrulanmış en yüksek piyasa değerine sahip gerçek ve yayımlanmış bir temsilcidir; Erling Haaland, {tierName} seviyesinde liderdir.",
    coachEyebrow: "TouchLine teknik direktör çerçeveleri", coachTitle: "Teknik direktör kartlarının yedi resmî çerçevesi",
    coachDescription: "Her temsilci, resmî profilindeki çerçeveyi korur. Her seviyede temsilciyi önceki sezonun onaylanmış sonuçları belirler. Uygun teknik direktörü olmayan çerçeveler beklemede kalır.",
    verifiedValue: "Doğrulanmış piyasa değeri", previousFinish: "Önceki sezon sıralaması",
    promotedChampion: "Üst lige çıkan şampiyon", promotedPlayoff: "Play-off yoluyla üst lige çıkan", approvedFallback: "Üst lige çıkış için onaylanmış alternatif ölçüt",
    representativePending: "Temsilci bekleniyor",
    representativePendingDescription: "Mevcut teknik direktörlerin hiçbirinin bu çerçeve için onaylanmış kanıtı yok. TouchLine başka bir teknik direktörün sıralamasını kullanmaz.",
    playerPending: "Yayımlanmış temsilci bekleniyor", playerPendingDescription: "Şu anda yayımlanmış hiçbir kart bu çerçeveye sahip değil.",
    openPlayer: "Oyuncu profilini aç", openCoach: "Teknik direktör profilini aç",
    sourceNote: "Burada yalnızca yayımlanmış oyuncu kartları ve değişmez teknik direktör sınıflandırmaları gösterilir. Eksik kanıtlar açıkça belirtilir.",
  },
  "de-DE": {
    playerEyebrow: "TouchLine-Spielerrahmen", playerTitle: "Die sieben offiziellen Spielerkartenrahmen",
    playerDescription: "Vom wertvollsten Rahmen bis zum Einstiegsrahmen geordnet. Jede Karte ist ein realer, veröffentlichter Vertreter mit dem höchsten bestätigten Marktwert ihrer Stufe; Erling Haaland führt die Stufe {tierName} an.",
    coachEyebrow: "TouchLine-Trainerrahmen", coachTitle: "Die sieben offiziellen Trainerkartenrahmen",
    coachDescription: "Jeder Vertreter behält den Rahmen seines offiziellen Profils. Innerhalb jeder Stufe bestimmen die genehmigten Ergebnisse der Vorsaison den Vertreter. Rahmen ohne geeigneten Trainer bleiben ausstehend.",
    verifiedValue: "Bestätigter Marktwert", previousFinish: "Platzierung in der Vorsaison",
    promotedChampion: "Aufgestiegener Meister", promotedPlayoff: "Über die Play-offs aufgestiegen", approvedFallback: "Genehmigtes alternatives Aufstiegskriterium",
    representativePending: "Vertreter ausstehend",
    representativePendingDescription: "Für keinen aktuellen Trainer liegen genehmigte Nachweise für diesen Rahmen vor. TouchLine übernimmt nicht die Platzierung eines anderen Trainers.",
    playerPending: "Veröffentlichter Vertreter ausstehend", playerPendingDescription: "Derzeit besitzt keine veröffentlichte Karte diesen Rahmen.",
    openPlayer: "Spielerprofil öffnen", openCoach: "Trainerprofil öffnen",
    sourceNote: "Hier erscheinen nur veröffentlichte Spielerkarten und unveränderliche Trainerklassifikationen. Fehlende Nachweise bleiben ausdrücklich erkennbar.",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubShowcaseCopy>>;

export function getTouchlineClubHubShowcaseCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubHubShowcaseCopy {
  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const copy = TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES[language];
  return {
    ...copy,
    playerDescription: copy.playerDescription.replace("{tierName}", () => touchlineCardTierName("diamond-gold", language, draftLocalesEnabled)),
  };
}

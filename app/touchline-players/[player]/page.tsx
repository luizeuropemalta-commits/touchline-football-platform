/* eslint-disable @next/next/no-img-element */
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { localizedCountryLabel } from "@/lib/touchlineArena/country-labels";
import { localizedPositionLabel } from "@/lib/touchlineArena/position-labels";
import { formatTouchlineProfileTimestamp as formatOfficialSyncTime } from "@/lib/touchlineArena/profile-timestamp";
import { getTouchlinePlayerProfileFeedCopy, formatTouchlinePlayerProfileFeedText } from "@/lib/touchlineArena/player-profile-feed-i18n";
import { isSeasonPercentage, seasonPercentageFromCounts } from "@/lib/football-data/season-statistic-ratios";
import {
  ArrowRight,
  Activity,
  BarChart3,
  CalendarDays,
  Footprints,
  Ruler,
  Shield,
  Sparkles,
  Trophy,
} from "lucide-react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import { getTouchlineCardZoomCopy } from "@/lib/touchlineArena/card-zoom-i18n";
import { getTouchlineExactCardCopy } from "@/lib/touchlineArena/exact-card-i18n";
import { getTouchlineCardMatchFactLabels } from "@/lib/touchlineArena/card-match-fact-i18n";
import { getTouchlinePlayerPerformanceCopy } from "@/lib/touchlineArena/player-performance-i18n";
import { localizedStatLabel } from "@/lib/touchlineArena/player-statistic-labels";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import { TouchlineCardLeadershipProvider } from "@/components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "@/lib/touchlineArena/card-leadership-authority";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  CLUB_OWNER_SQUAD_CARDS,
} from "@/lib/touchlineArena/demo-data";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import {
  resolveTouchLinePlayerProfile,
  resolveTouchLineUnavailableOfficialProfile,
  isTouchLineSupportedPlayerProfile,
  type TouchLinePlayerProfileSearchParams,
} from "@/lib/touchlineArena/player-profile";
import {
  parseTouchlineCanonicalProfileLink,
  resolveTouchLineOfficialLookup,
  touchlinePlayerProfileHref,
} from "@/lib/touchlineArena/player-links";
import { loadTouchLineOfficialPlayerIdentity } from "@/lib/touchlineArena/player-profile-official";
import { loadTouchlinePublicPlayerProjections } from "@/lib/touchlineArena/market-value-read-model";
import { resolveTouchlineCanonicalPublicPlayerProfile } from "@/lib/touchlineArena/canonical-public-player-profile-server";
import { loadTouchLinePlayerStatisticsReadModel } from "@/lib/touchlineArena/player-season-statistics-server";
import { touchlinePlayerAppearanceLabel, touchlinePlayerDataSourceLabel } from "@/lib/touchlineArena/player-appearance-presentation";
import {
  touchLinePlayerSeasonCoverageMessage,
  type TouchLinePlayerSeasonStatistics,
  type TouchLinePlayerStatisticsReadModel,
} from "@/lib/touchlineArena/player-season-statistics";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { resolveTouchlineCardCompetition } from "@/lib/touchlineArena/card-ranking-live";
import { TOUCHLINE_POSITION_RANKING_LABELS } from "@/lib/touchlineArena/card-ranking";
import {
  touchlineArenaTierForKey,
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "@/lib/touchlineArena/card-rules";
import { touchlineDemoTierForPlayer } from "@/lib/touchlineArena/demo-card-tier";
import {
  TOUCHLINE_NEUTRAL_CARD_ACCENT,
  TOUCHLINE_NEUTRAL_CARD_SECONDARY,
} from "@/lib/touchlineArena/public-card-presentation";
import { loadTouchlinePublishedCardPresentations } from "@/lib/touchlineArena/card-publication-read-model";
import {
  formatTouchlineMarketValueEur,
  formatTouchlinePublicShirtNumber,
} from "@/lib/touchlineArena/editorial-card-profile";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import {
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
  touchlineCountryFlagUrl,
} from "@/lib/touchlineArena/country-flags";
import {
  TouchlineSocialFeed,
  type TouchlineSocialPost,
} from "@/components/touchline/social/TouchlineSocial";
import TouchlinePlayerSocialActions from "@/components/touchline/social/TouchlinePlayerSocialActions";
import { touchlineArenaContractHref } from "@/lib/touchlineArena/arena-navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import {
  projectTouchlineCardStatsByPosition,
  touchlinePlayerPositionKind,
  type TouchlineCardStats,
} from "@/lib/touchlineArena/position-aware-card-stats";
import styles from "./player-profile.module.css";

export const dynamic = "force-dynamic";

type PlayerProfilePageProps = {
  params: Promise<{
    player: string;
  }>;
  searchParams: Promise<TouchLinePlayerProfileSearchParams>;
};

const copy = {
  en: {
    preferredLeft: "Left",
    preferredRight: "Right",
    preferredBoth: "Both",
    transferType: "Transfer",
    freeTransferType: "Free transfer",
    loanType: "Loan",
    loanReturnType: "Loan return",
    loanEndType: "End of loan",
    rankingGoalkeeper: "Goalkeepers",
    rankingCentreBack: "Centre-backs",
    rankingFullBack: "Full-backs",
    rankingMidfielder: "Midfielders",
    rankingWinger: "Wingers",
    rankingStriker: "Strikers",
    contractAction: "Contract player",
    contractPlayer: "Contract player",
    contractTerm: "Contract · 1 season",
    provisionalShirt: "provisional #00",
    cardTier: "Card tier",
    eyebrow: "Player profile + card profile",
    realFootball: "Real football",
    touchlineCard: "TouchLine card",
    position: "Position",
    born: "Born",
    birthplace: "Birthplace",
    height: "Height",
    weight: "Weight",
    nationality: "Nationality",
    foot: "Preferred foot",
    joined: "Joined club",
    contract: "Contract",
    points: "Total rating",
    rank: "Position rank",
    rankGroup: "Ranking group",
    frame: "Current frame",
    shirt: "Shirt number",
    career: "Career path",
    season: "TouchLine season",
    seasonCopy:
      "TouchLine ratings, card rank and verified match history update here as league fixtures are played.",
    current: "Current status",
    currentCopy:
      "The card uses the same verified TouchLine presentation across the Market, squad and club profile.",
    sources: "Verified football sources",
    currentClub: "Current club",
    openClub: "Open club profile",
    awaiting: "Verified career history is awaiting TouchLine verification.",
    fromClub: "From",
    toClub: "To",
    rankPending: "Pending",
    officialData: "Official football data",
    performance: "Season performance",
    performanceCopy: "Statistics reflect available match data. Unconfirmed participation does not establish an absence or its reason. Missing ratings are not estimated.",
    syncPending: "TouchLine Verified statistics are awaiting a complete player, season and fixture sync.",
    identityPending: "Verified player identity is currently unavailable.",
    latestSeason: "Last completed season",
    updatedAt: "Updated",
    verifiedSeason: "Verified season",
    fullStats: "TouchLine Verified statistics",
    officialSummary: "Key numbers",
    officialAttack: "Attack",
    officialDistribution: "Passing",
    officialDefending: "Defending",
    officialDiscipline: "Discipline",
    officialGoalkeeping: "Goalkeeping",
    officialOther: "More official stats",
    rankings: "Open Card Player Rankings",
    bestEleven: "Best 11 after the first official ranking",
    touchlineData: "TouchLine game data",
    currentSeason: "Current season",
    lastFiveMatches: "Last five matches",
    currentFixture: "Current or selected fixture",
    currentMatchPoints: "Current match rating",
    unavailable: "Unavailable",
    appearances: "Appearances",
    starts: "Starts",
    substituteAppearances: "Substitute appearances",
    minutes: "Minutes",
    goals: "Goals",
    assists: "Assists",
    rating: "Rating",
    totalRating: "Total rating",
    ratedAppearances: "Rated appearances",
    matchHistory: "Match history",
    yellowCards: "Yellow cards",
    redCards: "Red cards",
  },
  pt: {
    preferredLeft: "Esquerdo",
    preferredRight: "Direito",
    preferredBoth: "Ambidestro",
    transferType: "Transferência",
    freeTransferType: "Transferência livre",
    loanType: "Empréstimo",
    loanReturnType: "Retorno de empréstimo",
    loanEndType: "Fim do empréstimo",
    rankingGoalkeeper: "Goleiros",
    rankingCentreBack: "Zagueiros",
    rankingFullBack: "Laterais",
    rankingMidfielder: "Meio-campistas",
    rankingWinger: "Pontas",
    rankingStriker: "Centroavantes",
    contractAction: "Contratar",
    contractPlayer: "Contratar jogador",
    contractTerm: "Contrato · 1 temporada",
    provisionalShirt: "#00 provisório",
    cardTier: "Tier do card",
    eyebrow: "Perfil do jogador + perfil do card",
    realFootball: "Futebol real",
    touchlineCard: "Card TouchLine",
    position: "Posição",
    born: "Nascimento",
    birthplace: "Local de nascimento",
    height: "Altura",
    weight: "Peso",
    nationality: "Nacionalidade",
    foot: "Pé preferido",
    joined: "Chegou ao clube",
    contract: "Contrato",
    points: "Nota total",
    rank: "Rank da posição",
    rankGroup: "Grupo do ranking",
    frame: "Moldura atual",
    shirt: "Número da camisa",
    career: "Trajetória",
    season: "Temporada TouchLine",
    seasonCopy:
      "Notas TouchLine, rank do card e histórico verificado serão atualizados aqui conforme a liga acontecer.",
    current: "Estado atual",
    currentCopy:
      "O card usa a mesma apresentação verificada da TouchLine no Mercado, no elenco e no perfil do clube.",
    sources: "Fontes oficiais verificadas",
    currentClub: "Clube atual",
    openClub: "Abrir perfil do clube",
    awaiting: "O histórico verificado aguarda validação TouchLine.",
    fromClub: "Origem",
    toClub: "Destino",
    rankPending: "Pendente",
    officialData: "Dados do futebol real",
    performance: "Desempenho na temporada",
    performanceCopy: "As estatísticas refletem os dados disponíveis por partida. Participação não confirmada não comprova ausência nem seu motivo. Notas indisponíveis não são estimadas.",
    syncPending: "As estatísticas TouchLine Verified aguardam sincronização completa de jogador, temporada e fixtures.",
    identityPending: "A identidade verificada do jogador está indisponível no momento.",
    latestSeason: "Última temporada concluída",
    updatedAt: "Atualizado",
    verifiedSeason: "Temporada verificada",
    fullStats: "Estatísticas TouchLine Verified",
    officialSummary: "Números principais",
    officialAttack: "Ataque",
    officialDistribution: "Passe",
    officialDefending: "Defesa",
    officialDiscipline: "Disciplina",
    officialGoalkeeping: "Goleiro",
    officialOther: "Mais estatísticas oficiais",
    rankings: "Abrir Card Player Rankings",
    bestEleven: "Best 11 após o primeiro ranking oficial",
    touchlineData: "Dados do jogo TouchLine",
    currentSeason: "Temporada atual",
    lastFiveMatches: "Últimas cinco partidas",
    currentFixture: "Partida atual ou selecionada",
    currentMatchPoints: "Nota da partida atual",
    unavailable: "Indisponível",
    appearances: "Jogos",
    starts: "Titularidades",
    substituteAppearances: "Entradas como substituto",
    minutes: "Minutos",
    goals: "Gols",
    assists: "Assistências",
    rating: "Nota",
    totalRating: "Nota total",
    ratedAppearances: "Partidas com nota",
    matchHistory: "Histórico de partidas",
    yellowCards: "Cartões amarelos",
    redCards: "Cartões vermelhos",
  },
} as const;

type ProfileCopy = (Omit<typeof copy.en, "totalRating" | "matchHistory" | "minutes" | "rating" | "unavailable"> | Omit<typeof copy.pt, "totalRating" | "matchHistory" | "minutes" | "rating" | "unavailable">) & {
  readonly totalRating: string;
  readonly matchHistory: string;
  readonly minutes: string;
  readonly rating: string;
  readonly unavailable: string;
};

// This is deliberately limited to the profile chrome still rendered by this
// route. Match facts, performance, card/zoom and country/position labels keep
// using their existing domain catalogues below; player, club and contract facts
// remain data and are never translated here. The six catalogues stay behind the
// application locale-completeness gate in i18n.ts.
const profileChromeDrafts: Readonly<Record<string, Partial<Record<keyof typeof copy.en, string>>>> = {
  "es-ES": {
    preferredLeft: "Izquierdo",
    preferredRight: "Derecho",
    preferredBoth: "Ambidiestro",
    transferType: "Traspaso",
    freeTransferType: "Traspaso libre",
    loanType: "Cesión",
    loanReturnType: "Regreso de cesión",
    loanEndType: "Fin de cesión",
    rankingGoalkeeper: "Porteros",
    rankingCentreBack: "Defensas centrales",
    rankingFullBack: "Laterales",
    rankingMidfielder: "Centrocampistas",
    rankingWinger: "Extremos",
    rankingStriker: "Delanteros centro",
    contractAction: "Fichar jugador",
    contractPlayer: "Fichar jugador",
    contractTerm: "Contrato · 1 temporada",
    provisionalShirt: "#00 provisional",
    cardTier: "Tier del card",
    eyebrow: "Perfil del jugador + perfil de la tarjeta", position: "Posición", born: "Nacimiento", height: "Altura", weight: "Peso", nationality: "Nacionalidad", foot: "Pie preferido", contract: "Contrato",
    points: "Valoración total", rank: "Rango de posición", rankGroup: "Grupo de clasificación", frame: "Marco actual", career: "Trayectoria", season: "Temporada TouchLine",
    seasonCopy: "Las valoraciones de TouchLine, el rango de la tarjeta y el historial verificado de partidos se actualizan aquí a medida que se juegan los encuentros de liga.",
    current: "Estado actual", currentCopy: "La tarjeta usa la misma presentación verificada de TouchLine en el Market, la plantilla y el perfil del club.", currentClub: "Club actual", openClub: "Abrir perfil del club",
    awaiting: "El historial de carrera verificado espera la verificación de TouchLine.", fromClub: "Desde", toClub: "Hasta", rankPending: "Pendiente", officialData: "Datos oficiales de fútbol", touchlineCard: "Tarjeta TouchLine", touchlineData: "Datos del juego TouchLine",
  },
  "it-IT": {
    preferredLeft: "Sinistro",
    preferredRight: "Destro",
    preferredBoth: "Ambidestro",
    transferType: "Trasferimento",
    freeTransferType: "Trasferimento a parametro zero",
    loanType: "Prestito",
    loanReturnType: "Rientro dal prestito",
    loanEndType: "Fine prestito",
    rankingGoalkeeper: "Portieri",
    rankingCentreBack: "Difensori centrali",
    rankingFullBack: "Terzini",
    rankingMidfielder: "Centrocampisti",
    rankingWinger: "Ali",
    rankingStriker: "Centravanti",
    contractAction: "Ingaggia giocatore",
    contractPlayer: "Ingaggia giocatore",
    contractTerm: "Contratto · 1 stagione",
    provisionalShirt: "n. 00 provvisorio",
    cardTier: "Tier del card",
    eyebrow: "Profilo del giocatore + profilo della carta", position: "Posizione", born: "Nascita", height: "Altezza", weight: "Peso", nationality: "Nazionalità", foot: "Piede preferito", contract: "Contratto",
    points: "Valutazione totale", rank: "Posizione in classifica", rankGroup: "Gruppo di classifica", frame: "Cornice attuale", career: "Percorso di carriera", season: "Stagione TouchLine",
    seasonCopy: "Le valutazioni TouchLine, la posizione della carta e la cronologia verificata delle partite si aggiornano qui mentre si giocano le gare di campionato.",
    current: "Stato attuale", currentCopy: "La carta usa la stessa presentazione TouchLine verificata nel Market, nella rosa e nel profilo del club.", currentClub: "Club attuale", openClub: "Apri il profilo del club",
    awaiting: "La cronologia verificata della carriera attende la verifica TouchLine.", fromClub: "Da", toClub: "A", rankPending: "In attesa", officialData: "Dati ufficiali sul calcio", touchlineCard: "Carta TouchLine", touchlineData: "Dati di gioco TouchLine",
  },
  "fr-FR": {
    preferredLeft: "Gauche",
    preferredRight: "Droit",
    preferredBoth: "Ambidextre",
    transferType: "Transfert",
    freeTransferType: "Transfert libre",
    loanType: "Prêt",
    loanReturnType: "Retour de prêt",
    loanEndType: "Fin de prêt",
    rankingGoalkeeper: "Gardiens",
    rankingCentreBack: "Défenseurs centraux",
    rankingFullBack: "Arrières latéraux",
    rankingMidfielder: "Milieux de terrain",
    rankingWinger: "Ailiers",
    rankingStriker: "Avant-centres",
    contractAction: "Recruter le joueur",
    contractPlayer: "Recruter le joueur",
    contractTerm: "Contrat · 1 saison",
    provisionalShirt: "n° 00 provisoire",
    cardTier: "Tier du card",
    eyebrow: "Profil du joueur + profil de la carte", position: "Poste", born: "Naissance", height: "Taille", weight: "Poids", nationality: "Nationalité", foot: "Pied préféré", contract: "Contrat",
    points: "Note totale", rank: "Rang du poste", rankGroup: "Groupe de classement", frame: "Cadre actuel", career: "Parcours", season: "Saison TouchLine",
    seasonCopy: "Les notes TouchLine, le rang de la carte et l’historique vérifié des matchs se mettent à jour ici au fil des rencontres de championnat.",
    current: "État actuel", currentCopy: "La carte utilise la même présentation TouchLine vérifiée dans le Market, l’effectif et le profil du club.", currentClub: "Club actuel", openClub: "Ouvrir le profil du club",
    awaiting: "L’historique de carrière vérifié attend la vérification TouchLine.", fromClub: "De", toClub: "À", rankPending: "En attente", officialData: "Données du football réel", touchlineCard: "Carte TouchLine", touchlineData: "Données du jeu TouchLine",
  },
  "ar-SA": {
    preferredLeft: "اليسرى",
    preferredRight: "اليمنى",
    preferredBoth: "كلتا القدمين",
    transferType: "انتقال",
    freeTransferType: "انتقال حر",
    loanType: "إعارة",
    loanReturnType: "عودة من الإعارة",
    loanEndType: "نهاية الإعارة",
    rankingGoalkeeper: "حراس المرمى",
    rankingCentreBack: "قلوب الدفاع",
    rankingFullBack: "الأظهرة",
    rankingMidfielder: "لاعبو الوسط",
    rankingWinger: "الأجنحة",
    rankingStriker: "المهاجمون",
    contractAction: "التعاقد مع اللاعب",
    contractPlayer: "التعاقد مع اللاعب",
    contractTerm: "عقد · موسم واحد",
    provisionalShirt: "رقم 00 مؤقت",
    cardTier: "Tier البطاقة",
    eyebrow: "ملف اللاعب + ملف البطاقة", position: "المركز", born: "الميلاد", height: "الطول", weight: "الوزن", nationality: "الجنسية", foot: "القدم المفضلة", contract: "العقد",
    points: "التقييم الإجمالي", rank: "ترتيب المركز", rankGroup: "مجموعة الترتيب", frame: "الإطار الحالي", career: "المسيرة", season: "موسم TouchLine",
    seasonCopy: "تتحدث تقييمات TouchLine وترتيب البطاقة وسجل المباريات الموثّق هنا مع إقامة مباريات الدوري.",
    current: "الحالة الحالية", currentCopy: "تستخدم البطاقة العرض الموثّق نفسه من TouchLine في Market والتشكيلة وملف النادي.", currentClub: "النادي الحالي", openClub: "فتح ملف النادي", officialData: "بيانات كرة القدم الرسمية", touchlineCard: "بطاقة TouchLine",
    awaiting: "ينتظر سجل المسيرة الموثّق تحقق TouchLine.", fromClub: "من", toClub: "إلى", rankPending: "قيد الانتظار", touchlineData: "بيانات لعبة TouchLine",
  },
  "tr-TR": {
    preferredLeft: "Sol",
    preferredRight: "Sağ",
    preferredBoth: "Her iki ayak",
    transferType: "Transfer",
    freeTransferType: "Bedelsiz transfer",
    loanType: "Kiralama",
    loanReturnType: "Kiradan dönüş",
    loanEndType: "Kiralama sonu",
    rankingGoalkeeper: "Kaleciler",
    rankingCentreBack: "Stoperler",
    rankingFullBack: "Bekler",
    rankingMidfielder: "Orta saha oyuncuları",
    rankingWinger: "Kanat oyuncuları",
    rankingStriker: "Santrforlar",
    contractAction: "Oyuncuyla sözleşme yap",
    contractPlayer: "Oyuncuyla sözleşme yap",
    contractTerm: "Sözleşme · 1 sezon",
    provisionalShirt: "geçici #00",
    cardTier: "Card Tier",
    eyebrow: "Oyuncu profili + kart profili", position: "Pozisyon", born: "Doğum", height: "Boy", weight: "Kilo", nationality: "Uyruk", foot: "Tercih edilen ayak", contract: "Sözleşme",
    points: "Toplam değerlendirme", rank: "Pozisyon sırası", rankGroup: "Sıralama grubu", frame: "Geçerli çerçeve", career: "Kariyer yolu", season: "TouchLine sezonu",
    seasonCopy: "TouchLine değerlendirmeleri, kart sırası ve doğrulanmış maç geçmişi lig maçları oynandıkça burada güncellenir.",
    current: "Güncel durum", currentCopy: "Kart, Market, kadro ve kulüp profilinde aynı doğrulanmış TouchLine sunumunu kullanır.", currentClub: "Mevcut kulüp", openClub: "Kulüp profilini aç",
    awaiting: "Doğrulanmış kariyer geçmişi TouchLine doğrulamasını bekliyor.", fromClub: "Kimden", toClub: "Kime", rankPending: "Beklemede", officialData: "Resmî futbol verileri", touchlineCard: "TouchLine kartı", touchlineData: "TouchLine oyun verileri",
  },
  "de-DE": {
    preferredLeft: "Links",
    preferredRight: "Rechts",
    preferredBoth: "Beidfüßig",
    transferType: "Transfer",
    freeTransferType: "Ablösefreier Transfer",
    loanType: "Leihe",
    loanReturnType: "Rückkehr aus Leihe",
    loanEndType: "Leihende",
    rankingGoalkeeper: "Torhüter",
    rankingCentreBack: "Innenverteidiger",
    rankingFullBack: "Außenverteidiger",
    rankingMidfielder: "Mittelfeldspieler",
    rankingWinger: "Flügelspieler",
    rankingStriker: "Mittelstürmer",
    contractAction: "Spieler verpflichten",
    contractPlayer: "Spieler verpflichten",
    contractTerm: "Vertrag · 1 Saison",
    provisionalShirt: "vorläufige Nr. 00",
    cardTier: "Card-Tier",
    eyebrow: "Spielerprofil + Kartenprofil", position: "Position", born: "Geboren", height: "Größe", weight: "Gewicht", nationality: "Nationalität", foot: "Bevorzugter Fuß", contract: "Vertrag",
    points: "Gesamtbewertung", rank: "Positionsrang", rankGroup: "Ranggruppe", frame: "Aktueller Rahmen", career: "Karriereweg", season: "TouchLine-Saison",
    seasonCopy: "TouchLine-Bewertungen, Kartenrang und verifizierte Spielhistorie werden hier aktualisiert, während Ligaspiele stattfinden.",
    current: "Aktueller Status", currentCopy: "Die Karte verwendet dieselbe verifizierte TouchLine-Darstellung im Market, im Kader und im Clubprofil.", currentClub: "Aktueller Verein", openClub: "Clubprofil öffnen",
    awaiting: "Die verifizierte Karrierehistorie wartet auf die TouchLine-Prüfung.", fromClub: "Von", toClub: "Zu", rankPending: "Ausstehend", officialData: "Offizielle Fußballdaten", touchlineCard: "TouchLine-Karte", touchlineData: "TouchLine-Spieldaten",
  },
};

const frenchPositionRankingLabels = {
  goalkeeper: "Gardiens",
  "centre-back": "Défenseurs centraux",
  "full-back": "Arrières latéraux",
  midfielder: "Milieux de terrain",
  winger: "Ailiers",
  striker: "Avant-centres",
} as const;

const arabicPositionRankingLabels = {
  goalkeeper: "حراس المرمى",
  "centre-back": "قلوب الدفاع",
  "full-back": "الأظهرة",
  midfielder: "لاعبو الوسط",
  winger: "الأجنحة",
  striker: "المهاجمون",
} as const;

function getTouchlinePlayerProfileCopy(locale?: string | null, draftLocalesEnabled = false): ProfileCopy {
  const normalizedLocale = draftLocalesEnabled
    ? resolveTouchlineCatalogueLocale(locale, true)
    : normalizeTouchLineLocale(locale);
  if (normalizedLocale === "pt-BR") return copy.pt;
  return { ...copy.en, ...profileChromeDrafts[normalizedLocale] } as ProfileCopy;
}

function localizedProfileRankingGroup(group: string, locale: string, draftLocalesEnabled = false) {
  const text = getTouchlinePlayerProfileCopy(locale, draftLocalesEnabled);
  return {
    goalkeeper: text.rankingGoalkeeper,
    "centre-back": text.rankingCentreBack,
    "full-back": text.rankingFullBack,
    midfielder: text.rankingMidfielder,
    winger: text.rankingWinger,
    striker: text.rankingStriker,
  }[group];
}

function localizedPreferredFoot(value: string | undefined, locale: string, draftLocalesEnabled = false) {
  if (!value) return value;
  const normalized = value.trim().toLowerCase();
  if (draftLocalesEnabled || locale === "pt-BR") {
    const text = getTouchlinePlayerProfileCopy(locale, draftLocalesEnabled);
    return { left: text.preferredLeft, right: text.preferredRight, both: text.preferredBoth }[normalized] ?? value;
  }
  if (locale === "ar-SA") return {
    left: "اليسرى",
    right: "اليمنى",
    both: "كلتا القدمين",
  }[normalized] ?? value;
  if (locale !== "fr-FR") return value;
  return {
    left: "Gauche",
    right: "Droit",
    both: "Ambidextre",
  }[normalized] ?? value;
}

function languageQuery(locale: string) {
  return `?lang=${encodeURIComponent(locale)}`;
}

function formatTransferDate(value: string | undefined, locale: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return value ?? "--";
  return new Intl.DateTimeFormat(locale, {
    calendar: "gregory",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function localizedTransferType(value: string, locale: string, draftLocalesEnabled = false) {
  if (draftLocalesEnabled) {
    const text = getTouchlinePlayerProfileCopy(locale, true);
    return {
      transfer: text.transferType,
      "free transfer": text.freeTransferType,
      loan: text.loanType,
      "loan return": text.loanReturnType,
      "end of loan": text.loanEndType,
    }[value.trim().toLowerCase()] ?? value;
  }
  if (locale !== "pt-BR") return value;
  const normalized = value.trim().toLowerCase();
  return {
    transfer: "Transferência",
    "free transfer": "Transferência livre",
    loan: "Empréstimo",
    "loan return": "Retorno de empréstimo",
    "end of loan": "Fim do empréstimo",
  }[normalized] ?? value;
}

function dataFact(
  icon: ReactNode,
  label: string,
  value?: string | number | null,
) {
  if (value === null || value === undefined || value === "" || value === "--") {
    return null;
  }

  return (
    <div className={styles.fact}>
      <span className={styles.factIcon}>{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function measurement(value: string | undefined, unit: "cm" | "kg") {
  if (!value) return undefined;
  return /[a-z]/i.test(value) ? value : `${value} ${unit}`;
}

function seasonSummaryEntries(statistics: TouchLinePlayerSeasonStatistics, text: ProfileCopy, publishedTotalRating?: number | null, locale = "en-GB", draftLocalesEnabled = false) {
  const performanceCopy = getTouchlinePlayerPerformanceCopy(locale, draftLocalesEnabled);
  const summaryLabels = getTouchlineCardMatchFactLabels(locale, draftLocalesEnabled);
  return [
    [performanceCopy.appearances, statistics.summary.appearances],
    [performanceCopy.starts, statistics.summary.starts],
    [performanceCopy.substituteAppearances, statistics.summary.substituteAppearances],
    [text.minutes, statistics.summary.minutes],
    [summaryLabels.goals, statistics.summary.goals],
    [summaryLabels.assists, statistics.summary.assists],
    [text.rating, statistics.summary.rating],
    [text.totalRating, publishedTotalRating === undefined ? statistics.summary.totalRating : publishedTotalRating],
    [performanceCopy.ratedAppearances, statistics.summary.ratedAppearances],
    [summaryLabels.yellowCards, statistics.summary.yellowCards],
    [summaryLabels.redCards, statistics.summary.redCards],
  ] as const;
}

function SeasonStatisticsPanel({
  title,
  statistics,
  text,
  locale,
  publishedTotalRating,
  draftLocalesEnabled = false,
}: {
  title: string;
  statistics: TouchLinePlayerSeasonStatistics;
  text: ProfileCopy;
  locale: string;
  publishedTotalRating?: number | null;
  draftLocalesEnabled?: boolean;
}) {
  const performanceCopy = getTouchlinePlayerPerformanceCopy(locale, draftLocalesEnabled);
  const coverageMessage = touchLinePlayerSeasonCoverageMessage(statistics, locale, draftLocalesEnabled);
  const entries = seasonSummaryEntries(statistics, text, publishedTotalRating, locale, draftLocalesEnabled);
  const hasStatistics = entries.some(([, value]) => value !== null)
    || Object.keys(statistics.positionStatistics).length > 0;

  return (
    <article className={styles.officialGroup} data-season-coverage={statistics.coverageStatus}>
      <h3>{title}</h3>
      <div className={styles.seasonMeta}>
        <strong>{statistics.seasonName ?? text.unavailable}</strong>
        {statistics.competitionName ? <span>{statistics.competitionName}</span> : null}
        {statistics.latestSyncAt ? <time dateTime={statistics.latestSyncAt}>{formatOfficialSyncTime(statistics.latestSyncAt, locale, draftLocalesEnabled) ?? text.unavailable}</time> : null}
      </div>
      {coverageMessage ? <p className={styles.partialData} data-partial-season-data>{coverageMessage}</p> : null}
      {hasStatistics ? (
        <div className={styles.officialStats} data-stat-count={entries.length}>
          {entries.map(([label, value]) => (
            <div key={label} className={value === null ? styles.unavailableStat : styles.primaryStat}>
              <small>{label}</small>
              <strong>{value === null ? text.unavailable : String(value)}</strong>
            </div>
          ))}
          {/* Rating average and total already have separate authoritative summary fields. */}
          {Object.entries(statistics.positionStatistics).filter(([label]) => label !== "rating").map(([label, value]) => {
            const percentage = isSeasonPercentage(label);
            const ratio = percentage ? seasonPercentageFromCounts(label, statistics.positionStatistics) : null;
            return (
              <div key={label}>
                <small>{localizedStatLabel(label, label, locale, draftLocalesEnabled)}</small>
                <strong>{percentage ? ratio === null ? text.unavailable : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(ratio)}%` : String(value)}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.pendingSync}>
          <Activity aria-hidden="true" size={22} />
          <div><strong>{text.unavailable}</strong><small>{performanceCopy.syncPending}</small></div>
        </div>
      )}
      {Object.keys(statistics.positionStatistics).some(isSeasonPercentage) ? (
        <p className={styles.providerNote}>
          {performanceCopy.percentageExplanation}
        </p>
      ) : null}
    </article>
  );
}

function FixtureStatisticsPanel({
  model,
  text,
  matchStats,
  position,
  locale,
  draftLocalesEnabled = false,
}: {
  model: TouchLinePlayerStatisticsReadModel;
  text: ProfileCopy;
  matchStats: TouchlineCardStats | null | undefined;
  position: string | null | undefined;
  locale: string;
  draftLocalesEnabled?: boolean;
}) {
  const current = model.currentOrSelectedFixture;
  const performanceCopy = getTouchlinePlayerPerformanceCopy(locale, draftLocalesEnabled);
  const matchFacts = buildTouchlineVerifiedMatchFactFields({ statistics: matchStats, position }, locale, draftLocalesEnabled);
  const appearanceLabel = (value: "started" | "substitute" | "unused" | "absent" | "unavailable") => {
    return touchlinePlayerAppearanceLabel(value, locale, draftLocalesEnabled);
  };
  return (
    <div className={styles.fixtureStatsGrid}>
      <article className={styles.officialGroup}>
        <h3>{text.matchHistory}</h3>
        {model.matchHistory.length ? (
          <div className={styles.fixtureStatsList}>
            {model.matchHistory.map((fixture) => (
              <div key={fixture.fixtureId}>
                <span>{formatOfficialSyncTime(fixture.fixtureStartsAt, locale, draftLocalesEnabled) ?? text.unavailable}</span>
                <strong>{appearanceLabel(fixture.appearanceStatus)}</strong>
                <small>{fixture.minutes === null ? text.unavailable : `${fixture.minutes} ${text.minutes.toLowerCase()}`}</small>
                <small className={styles.fixtureRating}>{text.rating}: {fixture.rating === null ? "—" : String(fixture.rating)}</small>
              </div>
            ))}
          </div>
        ) : <p className={styles.unavailableFixture}>{text.unavailable}</p>}
      </article>
      <article className={styles.officialGroup}>
        <h3>{performanceCopy.currentFixture}</h3>
        {current ? (
          <>
            <div className={styles.fixtureStatsList}><div><span>{formatOfficialSyncTime(current.fixtureStartsAt, locale, draftLocalesEnabled) ?? text.unavailable}</span><strong>{appearanceLabel(current.appearanceStatus)}</strong><small>{current.minutes === null ? text.unavailable : `${current.minutes} ${text.minutes.toLowerCase()}`}</small><small className={styles.fixtureRating}>{performanceCopy.currentMatchRating}: {current.rating === null ? "—" : String(current.rating)}</small></div></div>
            {matchFacts.length ? (
              <div className={styles.officialStats} data-stat-count={matchFacts.length} data-position-aware-player-facts>
                {matchFacts.map((fact) => (
                  <div key={fact.label} className={fact.value === "—" ? styles.unavailableStat : styles.primaryStat}>
                    <small>{fact.label}</small>
                    <strong>{fact.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : <p className={styles.unavailableFixture}>{text.unavailable}</p>}
      </article>
    </div>
  );
}

export function generateStaticParams() {
  return CLUB_OWNER_SQUAD_CARDS.map((card) => ({
    player: card.id,
  }));
}

export default async function TouchLinePlayerProfilePage(props: PlayerProfilePageProps) {
  return renderPlayerProfilePage(props, isTouchLineSiteLocalesEnabled("/touchline-players/[player]"));
}

async function renderPlayerProfilePage({
  params,
  searchParams,
}: PlayerProfilePageProps, draftLocalesEnabled = false) {
  const [{ player: playerKey }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = resolveTouchlineCatalogueLocale(
    Array.isArray(query.lang) ? query.lang[0] : query.lang,
    draftLocalesEnabled,
  );
  const zoomCopy = getTouchlineCardZoomCopy(locale, draftLocalesEnabled);
  const exactCopy = getTouchlineExactCardCopy(locale, draftLocalesEnabled);
  const matchFactLabels = getTouchlineCardMatchFactLabels(locale, draftLocalesEnabled);
  const text = {
    ...getTouchlinePlayerProfileCopy(locale, draftLocalesEnabled),
    totalRating: exactCopy.totalRating,
    matchHistory: zoomCopy.history,
    minutes: matchFactLabels.minutes,
    rating: matchFactLabels.rating,
    unavailable: touchlinePlayerAppearanceLabel(null, locale, draftLocalesEnabled),
  };
  const isPortuguese = locale === "pt-BR";
  const performanceCopy = getTouchlinePlayerPerformanceCopy(locale, draftLocalesEnabled);
  const canonicalLink = parseTouchlineCanonicalProfileLink(query);
  if (canonicalLink.status === "invalid") notFound();
  // Never turn an arbitrary URL into a synthetic footballer. A player page
  // begins only from a known TouchLine card or a numeric provider identity;
  // the latter still renders as unavailable if its canonical projection is
  // not ready.
  if (canonicalLink.status === "absent" && !isTouchLineSupportedPlayerProfile(playerKey, query)) notFound();
  const canonicalResolution = canonicalLink.status === "valid"
    ? await resolveTouchlineCanonicalPublicPlayerProfile({ canonicalPlayerId: canonicalLink.canonicalPlayerId })
    : null;
  if (canonicalLink.status === "valid" && !canonicalResolution) notFound();
  const currentUserPromise = (async () => {
    const supabase = await createClient();
    return supabase ? await supabase.auth.getUser() : null;
  })().then(
    (receipt) => ({ ok: true as const, receipt }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  // Observe auth rejection immediately, but do not hold up public statistics.
  // Its original error is rethrown before rendering, never an anonymous fallback.
  const fallbackProfile = resolveTouchLinePlayerProfile(playerKey, canonicalLink.status === "valid" ? {} : query);
  const officialLookup = canonicalResolution
    ? { providerPlayerId: canonicalResolution.providerPlayerId, name: canonicalResolution.projection.identity.value!.name }
    : resolveTouchLineOfficialLookup({
      providerPlayerId: Array.isArray(query.playerId) ? query.playerId[0] : query.playerId,
      requestedName: Array.isArray(query.name) ? query.name[0] : query.name,
      fallbackName: fallbackProfile.card.name,
    });
  const activeRankingPromise = loadTouchLineActiveRanking().then(
    (ranking) => ({ ok: true as const, ranking }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  // Ranking authority is mandatory before rendering, not before independent
  // identity-based statistics. Observe failures now while enrichment proceeds.
  const [publicProjectionBatch, official] = await Promise.all([
    canonicalResolution
      ? Promise.resolve(null)
      : loadTouchlinePublicPlayerProjections({
        providerPlayerIds: [officialLookup.providerPlayerId],
        includeMarketValues: false,
      }),
    loadTouchLineOfficialPlayerIdentity({
      name: officialLookup.name,
      providerPlayerId: officialLookup.providerPlayerId,
    }),
  ]);
  const publicProjection = canonicalResolution?.projection ?? (officialLookup.providerPlayerId
    ? publicProjectionBatch?.projections.find((projection) => projection.providerPlayerId === officialLookup.providerPlayerId)
    : undefined);
  const canonicalIdentity = publicProjection?.identity.status === "verified"
    && publicProjection.identity.value
    ? {
      providerPlayerId: publicProjection.providerPlayerId,
      name: publicProjection.identity.value.name,
      displayName: publicProjection.identity.value.displayName,
      clubName: publicProjection.currentClub.status === "verified"
        ? publicProjection.currentClub.value?.name ?? null
        : null,
      position: publicProjection.membership.status === "verified"
        ? publicProjection.membership.value?.position ?? null
        : null,
      nationality: publicProjection.identity.value.nationality,
      jerseyNumber: publicProjection.membership.status === "verified"
        ? publicProjection.membership.value?.jerseyNumber ?? null
        : null,
    }
    : null;
  // A numeric provider ID identifies an official public profile. If its
  // canonical row cannot be loaded, show a controlled unavailable state rather
  // than letting a URL slug or demo seed substitute another footballer.
  const profile = canonicalIdentity
    ? resolveTouchLinePlayerProfile(playerKey, canonicalLink.status === "valid" ? {} : query, canonicalIdentity)
    : officialLookup.providerPlayerId
    ? resolveTouchLineUnavailableOfficialProfile(officialLookup.providerPlayerId)
    : resolveTouchLinePlayerProfile(playerKey, query);
  const { card, exactPlayer, club, isLocalCard } = profile;
  const canonicalProviderPlayerId = canonicalIdentity?.providerPlayerId
    ?? officialLookup.providerPlayerId
    ?? official.providerPlayerId;
  if (canonicalProviderPlayerId) exactPlayer.sportmonksPlayerId = canonicalProviderPlayerId;
  const canonicalPlayerId = canonicalResolution?.canonicalPlayerId
    ?? (canonicalIdentity ? publicProjection?.identity.value?.playerId : null);
  exactPlayer.canonicalPlayerId = canonicalPlayerId;
  const [playerStatistics, publishedCards] = await Promise.all([
    loadTouchLinePlayerStatisticsReadModel({
      providerPlayerId: canonicalProviderPlayerId,
      selectedFixtureId: Array.isArray(query.fixture) ? query.fixture[0] : query.fixture,
      position: canonicalIdentity?.position ?? null,
    }),
    canonicalResolution ? null : canonicalPlayerId
      ? loadTouchlinePublishedCardPresentations({ playerIds: [canonicalPlayerId] })
      : new Map(),
  ]);
  const rankingResult = await activeRankingPromise;
  if (!rankingResult.ok) throw rankingResult.error;
  const activeRanking = rankingResult.ranking;
  const authResult = await currentUserPromise;
  if (!authResult.ok) throw authResult.error;
  const authReceipt = authResult.receipt;
  const currentUser = authReceipt?.error === null ? authReceipt.data.user ?? null : null;
  const accountLocaleContext: AccountLocaleContext = authReceipt?.error === null && currentUser && hasTouchLineArenaAccess(currentUser)
    && typeof currentUser.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id)
    ? { mode: "account", accountId: currentUser.id }
    : authReceipt && authReceipt.data.user === null && (authReceipt.error === null || authReceipt.error instanceof AuthSessionMissingError)
      ? { mode: "guest" } : { mode: "unavailable" };
  const navigationSurface = resolveTouchlineGlobalNavigationSurface({
    isAuthenticated: Boolean(currentUser),
    isAdmin: Boolean(currentUser && isOwnerEmail(currentUser.email)),
  });
  const editorialCard = canonicalResolution?.editorialCard
    ?? (canonicalPlayerId && publishedCards ? publishedCards.get(canonicalPlayerId) ?? null : null);
  exactPlayer.editorialCard = editorialCard;
  if (editorialCard?.shirtNumber !== undefined) exactPlayer.shirtNumber = editorialCard.shirtNumber;
  exactPlayer.marketValue = editorialCard?.marketValueEur === undefined
    ? null
    : formatTouchlineMarketValueEur(editorialCard.marketValueEur, locale);
  exactPlayer.marketValueSource = editorialCard?.marketValueEur === undefined
    ? "unavailable"
    : editorialCard.marketValueState === "provisional"
      ? "provisional-fallback"
      : "verified-cache";
  exactPlayer.marketValueState = editorialCard?.marketValueEur === undefined
    ? "unavailable"
    : editorialCard.marketValueState ?? "verified";
  exactPlayer.cardTier = editorialCard?.tierKey ?? null;
  exactPlayer.classificationState = !editorialCard
    ? "unavailable"
    : editorialCard.marketValueState === "provisional"
      ? "provisional"
      : "verified";
  const rankingCompetition = resolveTouchlineCardCompetition({
    state: activeRanking,
    playerId: canonicalPlayerId ?? card.id,
    providerPlayerId: canonicalProviderPlayerId,
  });
  const competition = rankingCompetition;
  const zoomMatchHistoryFields = playerStatistics.matchHistory.map((fixture) => {
    const appearance = touchlinePlayerAppearanceLabel(fixture.appearanceStatus, locale, draftLocalesEnabled);
    const minutes = fixture.minutes === null
      ? text.unavailable
      : `${fixture.minutes} ${text.minutes.toLowerCase()}`;
    const rating = fixture.rating === null ? "—" : String(fixture.rating);
    const historyDisplayLabel = formatOfficialSyncTime(fixture.fixtureStartsAt, locale, draftLocalesEnabled) ?? text.unavailable;
    return {
      label: `${zoomCopy.matchHistoryEntry} · ${historyDisplayLabel}`,
      historyDisplayLabel,
      value: `${appearance} · ${minutes} · ${matchFactLabels.rating} ${rating}`,
      kind: "history" as const,
    };
  });
  // One immutable published authority for the profile, card, zoom and ranking.
  // A null publication stays unavailable even if the mutable season is newer.
  const totalRatingText = competition.totalRating;
  const cumulativeRatingText = totalRatingText === null
    ? text.unavailable
    : String(totalRatingText);
  exactPlayer.totalRating = totalRatingText;
  exactPlayer.matchRating = playerStatistics.currentOrSelectedFixture?.rating ?? null;
  const statisticNumber = (statistics: Record<string, string | number>, ...keys: string[]) => {
    for (const key of keys) {
      const value = statistics[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return undefined;
  };
  const seasonPositionStatistics = playerStatistics.currentSeason.positionStatistics;
  const seasonCleanSheets = statisticNumber(seasonPositionStatistics, "clean-sheets", "cleansheets");
  const seasonSaves = statisticNumber(seasonPositionStatistics, "saves");
  const seasonGoalsConceded = statisticNumber(seasonPositionStatistics, "goalkeeper-goals-conceded", "goals-conceded");
  const seasonDefense = statisticNumber(seasonPositionStatistics, "def-score");
  const cardFactPosition = canonicalIdentity?.position ?? exactPlayer.position ?? card.position;
  exactPlayer.seasonStats = projectTouchlineCardStatsByPosition({
    position: cardFactPosition,
    statistics: {
      goals: playerStatistics.currentSeason.summary.goals,
      assists: playerStatistics.currentSeason.summary.assists,
      ...(seasonCleanSheets === undefined ? {} : { cleanSheets: seasonCleanSheets }),
      ...(seasonSaves === undefined ? {} : { saves: seasonSaves }),
      ...(seasonGoalsConceded === undefined ? {} : { goalsConceded: seasonGoalsConceded }),
      ...(seasonDefense === undefined ? {} : { defense: seasonDefense }),
      yellowCards: playerStatistics.currentSeason.summary.yellowCards,
      redCards: playerStatistics.currentSeason.summary.redCards,
      cards: playerStatistics.currentSeason.summary.yellowCards === null
        || playerStatistics.currentSeason.summary.redCards === null
        ? null
        : playerStatistics.currentSeason.summary.yellowCards + playerStatistics.currentSeason.summary.redCards,
      rating: playerStatistics.currentSeason.summary.rating,
    },
  });
  const selectedFixtureStatistics = playerStatistics.currentOrSelectedFixture?.statistics ?? {};
  const selectedStatistic = (...keys: string[]) => statisticNumber(selectedFixtureStatistics, ...keys);
  const selectedYellowCards = selectedStatistic("yellow-cards", "yellowcards");
  const selectedRedCards = selectedStatistic("red-cards", "redcards");
  exactPlayer.matchStats = projectTouchlineCardStatsByPosition({
    position: cardFactPosition,
    statistics: {
      ...(selectedStatistic("goals") === undefined ? {} : { goals: selectedStatistic("goals")! }),
      ...(selectedStatistic("assists") === undefined ? {} : { assists: selectedStatistic("assists")! }),
      ...(selectedStatistic("clean-sheets", "cleansheets") === undefined ? {} : { cleanSheets: selectedStatistic("clean-sheets", "cleansheets")! }),
      ...(selectedStatistic("saves") === undefined ? {} : { saves: selectedStatistic("saves")! }),
      ...(selectedStatistic("goalkeeper-goals-conceded", "goals-conceded") === undefined ? {} : { goalsConceded: selectedStatistic("goalkeeper-goals-conceded", "goals-conceded")! }),
      ...(selectedStatistic("def-score") === undefined ? {} : { defense: selectedStatistic("def-score")! }),
      ...(selectedStatistic("shots-on-target") === undefined ? {} : { shotsOnTarget: selectedStatistic("shots-on-target")! }),
      ...(selectedStatistic("shots-off-target") === undefined ? {} : { shotsOffTarget: selectedStatistic("shots-off-target")! }),
      ...(selectedStatistic("defensive-actions-total") === undefined ? {} : { defensiveActionsTotal: selectedStatistic("defensive-actions-total")! }),
      ...(selectedStatistic("penalty-saves") === undefined ? {} : { penaltySaves: selectedStatistic("penalty-saves")! }),
      ...(selectedStatistic("penalties-missed") === undefined ? {} : { penaltiesMissed: selectedStatistic("penalties-missed")! }),
      ...(selectedStatistic("own-goals") === undefined ? {} : { ownGoals: selectedStatistic("own-goals")! }),
      ...(selectedYellowCards === undefined ? {} : { yellowCards: selectedYellowCards }),
      ...(selectedRedCards === undefined ? {} : { redCards: selectedRedCards }),
      ...(selectedYellowCards === undefined || selectedRedCards === undefined ? {} : { cards: selectedYellowCards + selectedRedCards }),
      ...(playerStatistics.currentOrSelectedFixture
        ? { rating: playerStatistics.currentOrSelectedFixture.rating }
        : {}),
    },
  });
  const requestedPreviewTier = Array.isArray(query.previewTier) ? query.previewTier[0] : query.previewTier;
  // Preview tiers are available only for an explicit local-development demo.
  // A public numeric provider ID never accepts a visual tier from a
  // query parameter, even if its slug collides with a demo card.
  const previewTier = !officialLookup.providerPlayerId && isLocalCard && process.env.NODE_ENV !== "production"
    ? touchlineArenaTierForKey(requestedPreviewTier)
      ?? touchlineArenaTierForKey(touchlineDemoTierForPlayer(card.id, exactPlayer.sportmonksPlayerId, card.name))
    : null;
  if (previewTier) {
    exactPlayer.cardTier = previewTier.key;
    exactPlayer.classificationState = "verified";
  }
  const isExplicitLocalDevelopmentDemo = !officialLookup.providerPlayerId
    && isLocalCard
    && process.env.NODE_ENV !== "production";
  const developmentTier = isExplicitLocalDevelopmentDemo
    ? previewTier ?? touchlineArenaTierForKey(card.cardTier)
    : null;
  const tier = editorialCard
    ? touchlineArenaTierForKey(editorialCard.tierKey)
    : developmentTier;
  const hasActiveContractOffer = false;
  const hasPublishedEditorialCard = Boolean(editorialCard);
  const officialSyncTime = formatOfficialSyncTime(official.fetchedAt, locale, draftLocalesEnabled);
  const rankingGroupLabel = competition.positionGroup
    ? locale === "fr-FR"
      ? frenchPositionRankingLabels[competition.positionGroup]
      : locale === "ar-SA"
        ? arabicPositionRankingLabels[competition.positionGroup]
        : localizedProfileRankingGroup(competition.positionGroup, locale, draftLocalesEnabled)
          ?? TOUCHLINE_POSITION_RANKING_LABELS[competition.positionGroup][locale === "pt-BR" ? "pt" : "en"]
    : text.rankPending;
  const displayPosition = localizedPositionLabel(canonicalIdentity?.position ?? (!officialLookup.providerPlayerId ? official.player?.position : null) ?? card.position, locale, draftLocalesEnabled);
  const displayShirtNumber = formatTouchlinePublicShirtNumber(card.shirtNumber);
  const displayNationality = localizedCountryLabel(canonicalIdentity?.nationality ?? (!officialLookup.providerPlayerId ? official.player?.nationality : null) ?? card.countryCode3, locale, draftLocalesEnabled);
  const officialNationality = canonicalIdentity?.nationality?.trim() ?? (!officialLookup.providerPlayerId ? official.player?.nationality?.trim() : null);
  const officialCountryCode3 = touchlineCountryCode3FromName(officialNationality)
    ?? (officialNationality && officialNationality.length <= 3
      ? normalizeTouchlineCountryCode3(officialNationality)
      : null);
  const profileCountryCode3 = officialCountryCode3
    ?? normalizeTouchlineCountryCode3(exactPlayer.countryCode3 || card.countryCode3);
  const profileFlagUrl = touchlineCountryFlagUrl(profileCountryCode3);
  const clubHref = club
    ? `/touchline-clubs/${club.slug}${languageQuery(locale)}`
    : null;
  const profileHref = touchlinePlayerProfileHref(
    exactPlayer,
    locale,
    previewTier ? { previewTier: previewTier.key } : undefined,
  );
  const tierPalette = tier
    ? touchlineCardTierPalette(tier.key)
    : { accent: TOUCHLINE_NEUTRAL_CARD_ACCENT, secondary: TOUCHLINE_NEUTRAL_CARD_SECONDARY };
  const tierDisplayName = tier
    ? touchlineCardTierName(tier.key, locale, draftLocalesEnabled)
    : null;
  const accent = tierPalette.accent;
  const secondaryAccent = tierPalette.secondary;
  const pageStyle = {
    "--player-accent": accent,
    "--player-accent-secondary": secondaryAccent,
  } as CSSProperties;
  const marketHref = touchlineArenaContractHref({
    locale,
    playerId: exactPlayer.sportmonksPlayerId || card.id,
    playerName: card.name,
    clubId: club?.teamId,
  }, draftLocalesEnabled);
  const socialCardVisual = (ariaLabel: string) => editorialCard ? (
    <TouchlineCardZoom draftLocalesEnabled={draftLocalesEnabled}
      locale={locale}
      ariaLabel={ariaLabel}
      contractHref={hasActiveContractOffer ? marketHref : undefined}
      contractLabel={text.contractAction}
      contractTermLabel={hasActiveContractOffer ? text.contractTerm : undefined}
      tierAccent={tierPalette.accent}
      tierLabel={tierDisplayName ?? undefined}
      details={buildTouchlinePlayerCardZoomDetails({
        locale,
        draftLocalesEnabled,
        name: card.name,
        clubName: card.clubName,
        position: displayPosition,
        positionKind: touchlinePlayerPositionKind(cardFactPosition),
        nationality: displayNationality,
        editorialCard,
        cardReview: exactPlayer.cardReview,
        profileHref,
        cardEngineHref: currentUser && isOwnerEmail(currentUser.email)
          ? touchlineCardEnginePlayerHref(canonicalPlayerId, locale)
          : null,
        eyebrow: zoomCopy.officialPlayerProfile,
        extraFields: [
          {
            label: zoomCopy.lastMatchRating,
            value: exactPlayer.matchRating === null ? "—" : String(exactPlayer.matchRating),
            accent: true,
            kind: "rating-last",
            icon: "rating",
          },
          {
            label: text.totalRating,
            value: cumulativeRatingText,
            accent: true,
            kind: "rating-total",
            icon: "rating",
            primary: true,
          },
          ...buildTouchlineVerifiedMatchFactFields({
            statistics: exactPlayer.matchStats,
            position: exactPlayer.position || card.position,
          }, locale, draftLocalesEnabled),
          ...zoomMatchHistoryFields,
        ],
      })}
      expandedContent={(
        <TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled}
          player={exactPlayer}
          hideMarketValuePanel
          layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
          playerProfileHref={profileHref}
          runtimeLocaleOverride={locale}
          rankingMode={previewTier ? "preview" : "live"}
          staticRenderScale={390 / 430}
          showCardActions
          showProfileAction
          forceNeonActive
        />
      )}
    >
      <TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled}
        player={exactPlayer}
        hideMarketValuePanel
        layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
        runtimeLocaleOverride={locale}
        rankingMode={previewTier ? "preview" : "live"}
        staticRenderScale={178 / 430}
        showProfileAction={false}
        showSocialMetrics={false}
        showMatchRating
      />
    </TouchlineCardZoom>
  ) : undefined;
  const feedCopy = getTouchlinePlayerProfileFeedCopy(locale, draftLocalesEnabled);
  const playerSocialPosts: TouchlineSocialPost[] = [
    {
      id: `card-status-${card.id}-${tier?.key ?? "unpublished"}`,
      kind: "official",
      title: hasPublishedEditorialCard
        ? feedCopy.publishedTitle
        : feedCopy.cardTitle,
      body: feedCopy.editorialBody,
      meta: "TouchLine",
      accent,
      badge: tierDisplayName ?? `${cumulativeRatingText} ${feedCopy.totalRatingSuffix}`,
      visual: socialCardVisual(zoomCopy.openCurrentCard.replace("{playerName}", () => card.name)),
      visualTheme: "market",
      metrics: [
        { label: text.totalRating, value: cumulativeRatingText },
        ...(tierDisplayName ? [{ label: feedCopy.cardTier, value: tierDisplayName }] : []),
      ],
    },
    {
      id: `official-profile-${card.id}-${official.status}`,
      kind: "official",
      title: official.player
        ? feedCopy.officialUpdated
        : feedCopy.officialUnavailable,
      body: official.player
        ? formatTouchlinePlayerProfileFeedText(feedCopy.verifiedBody, { playerName: official.player?.displayName ?? card.name })
        : feedCopy.waitingBody,
      meta: officialSyncTime || "TouchLine Data",
      accent,
      badge: `${displayNationality} · ${displayPosition}`,
      visualImageUrl: profileFlagUrl || undefined,
      visualAlt: displayNationality || card.countryCode3,
      visualKicker: feedCopy.officialProfile,
      visualValue: profileCountryCode3,
      visualTheme: "profile",
      metrics: [
        { label: feedCopy.position, value: displayPosition || "—" },
        { label: feedCopy.country, value: profileCountryCode3 },
        { label: feedCopy.verification, value: feedCopy.verified },
      ],
    },
  ];
  if (process.env.NODE_ENV !== "production" && previewTier) {
    playerSocialPosts.unshift(
      {
        id: `simulation-final-whistle-${card.id}`,
        kind: "simulation",
        title: formatTouchlinePlayerProfileFeedText(feedCopy.fullTimeTitle, { playerName: card.name }),
        body: feedCopy.fullTimeBody,
        meta: feedCopy.afterMatch,
        accent,
        badge: feedCopy.fullTimeBadge,
        visual: socialCardVisual(zoomCopy.openMatchCard.replace("{playerName}", () => card.name)),
        visualTheme: "match",
        metrics: [
          { label: feedCopy.rating, value: isPortuguese ? "8,7" : "8.7" },
          { label: feedCopy.minutes, value: "90" },
          { label: feedCopy.totalRating, value: "38.0" },
        ],
        baseLikeCount: 11_420,
      },
      {
        id: `simulation-goal-${card.id}`,
        kind: "simulation",
        title: formatTouchlinePlayerProfileFeedText(feedCopy.goalTitle, { playerName: card.name, clubName: card.clubName }),
        body: feedCopy.goalBody,
        meta: feedCopy.goalMeta,
        accent,
        badge: feedCopy.goalBadge,
        visual: socialCardVisual(zoomCopy.openGoalCard.replace("{playerName}", () => card.name)),
        visualTheme: "goal",
        metrics: [
          { label: feedCopy.goals, value: "1" },
          { label: feedCopy.minute, value: "67'" },
          { label: feedCopy.rating, value: "8.7" },
        ],
        baseLikeCount: 3_018,
      },
      {
        id: `simulation-tier-${card.id}`,
        kind: "simulation",
        title: feedCopy.tierTitle,
        body: feedCopy.tierBody,
        meta: feedCopy.tierMeta,
        accent,
        badge: `${feedCopy.tierUpdated}${tierDisplayName ? ` · ${tierDisplayName}` : ""}`,
        visual: socialCardVisual(zoomCopy.openUpgradedCard.replace("{playerName}", () => card.name)),
        visualTheme: "evolution",
        metrics: [
          { label: feedCopy.progress, value: feedCopy.confirmed },
          { label: feedCopy.upgradeStatus, value: feedCopy.upgraded },
        ],
        baseLikeCount: 2_764,
      },
      {
        id: `simulation-availability-${card.id}`,
        kind: "simulation",
        title: feedCopy.availabilityTitle,
        body: feedCopy.availabilityBody,
        meta: feedCopy.availabilityMeta,
        accent: "#f59e0b",
        badge: feedCopy.availabilityBadge,
        visualImageUrl: profileFlagUrl || undefined,
        visualAlt: displayNationality || card.countryCode3,
        visualKicker: feedCopy.availability,
        visualValue: feedCopy.attention,
        visualTheme: "availability",
        metrics: [
          { label: feedCopy.status, value: feedCopy.doubt },
          { label: feedCopy.source, value: feedCopy.official },
          { label: feedCopy.nextStep, value: feedCopy.review },
        ],
        baseLikeCount: 864,
      },
    );
  }
  return (
    <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(activeRanking, null)}>
    <main className={styles.page} style={pageStyle} dir="ltr">
      <TouchlineBrandHeader href={profileHref} locale={locale} accountLocaleContext={accountLocaleContext} draftLocalesEnabled={draftLocalesEnabled} />
      <TouchlineLivePresentationRefresh
        initialPlayerRankingSnapshotId={activeRanking.snapshotId}
      />
      <div className={styles.backgroundGlow} aria-hidden="true" />
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <TouchlineGlobalNavigation
            locale={locale}
            draftLocalesEnabled={draftLocalesEnabled}
            currentRoute="playerProfile"
            showAudioControl={false}
            surface={navigationSurface}
            className={styles.profileQuickNav}
          />
        </div>

        <section className={styles.identityBand}>
          <div className={styles.cardColumn}>
            <div className={styles.cardFrame}>
            <TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled}
              player={exactPlayer}
              hideMarketValuePanel
              layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
              playerProfileHref={profileHref}
              runtimeLocaleOverride={locale}
              rankingMode={previewTier ? "preview" : "live"}
              staticRenderScale={372 / 430}
              showCardActions={false}
              showProfileAction={false}
              showSocialMetrics={false}
            />
            </div>
          </div>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>{text.eyebrow}</p>
            <div className={styles.identityHeading}>
              <div>
                <h1>{card.name}</h1>
              </div>
              {club?.logoUrl ? (
                <div className={styles.currentClub}>
                  <span>{text.currentClub}</span>
                  <Link
                    className={styles.identityCrest}
                    href={clubHref ?? "#"}
                    aria-label={`${text.openClub}: ${club.name}`}
                  >
                    <span className={styles.identityCrestLogo}>
                      <img src={club.logoUrl} alt={club.name} />
                    </span>
                    <small>{text.openClub}</small>
                  </Link>
                </div>
              ) : null}
            </div>
            <p className={styles.roleLine}>
              {displayPosition} · {card.clubName} · {card.shirtNumber === 0
                ? text.provisionalShirt
                : displayShirtNumber
                  ? `#${displayShirtNumber}`
                  : "--"}
            </p>

            <div className={styles.socialActions}>
              <TouchlinePlayerSocialActions draftLocalesEnabled={draftLocalesEnabled}
                providerId={card.id}
                playerName={card.name}
                accent={accent}
                locale={locale}
                purchaseHref={hasActiveContractOffer ? marketHref : undefined}
                purchaseLabel={text.contractPlayer}
              />
            </div>

            <p className={styles.biography}>
              {canonicalIdentity
                ? [
                    canonicalIdentity.displayName || canonicalIdentity.name,
                    localizedCountryLabel(canonicalIdentity.nationality, locale, draftLocalesEnabled),
                    localizedPositionLabel(canonicalIdentity.position, locale, draftLocalesEnabled),
                  ].filter(Boolean).join(" · ")
                : !officialLookup.providerPlayerId && official.player
                ? `${official.player?.displayName ?? card.name} · ${displayNationality} · ${displayPosition}`
                : performanceCopy.identityPending}
            </p>

            <div className={styles.sourceLegend}>
              <span>
                <i className={styles.realDot} />
                {text.officialData}
              </span>
              <span>
                <i className={styles.touchlineDot} />
                {text.touchlineData}
              </span>
            </div>

            <div className={styles.factGrid}>
              {dataFact(
                <Footprints aria-hidden="true" size={19} />,
                text.position,
                displayPosition,
              )}
              {dataFact(
                <CalendarDays aria-hidden="true" size={19} />,
                text.born,
                official.player?.dateOfBirth,
              )}
              {dataFact(
                <Ruler aria-hidden="true" size={19} />,
                text.height,
                measurement(official.player?.height, "cm"),
              )}
              {dataFact(
                <Ruler aria-hidden="true" size={19} />,
                text.weight,
                measurement(official.player?.weight, "kg"),
              )}
              {dataFact(
                <Footprints aria-hidden="true" size={19} />,
                text.foot,
                localizedPreferredFoot(official.player?.preferredFoot, locale, draftLocalesEnabled),
              )}
              {dataFact(
                profileFlagUrl ? (
                  <img
                    className={styles.factFlag}
                    src={profileFlagUrl}
                    alt=""
                    width={28}
                    height={21}
                  />
                ) : (
                  <Shield aria-hidden="true" size={19} />
                ),
                text.nationality,
                displayNationality,
              )}
              {dataFact(
                <Shield aria-hidden="true" size={19} />,
                text.contract,
                official.player?.contractUntil,
              )}
            </div>
          </div>
        </section>

        <TouchlineSocialFeed
          draftLocalesEnabled={draftLocalesEnabled}
          entityId={`athlete:${card.id}`}
          entityName={card.name}
          entityImageUrl={club?.logoUrl}
          entityImageAlt={card.clubName}
          entityRole={`${displayPosition} · ${card.clubName}`}
          posts={playerSocialPosts}
          accent={accent}
          locale={locale}
          highlights={[
            ...(tierDisplayName ? [{ label: text.cardTier, value: tierDisplayName }] : []),
            { label: text.totalRating, value: cumulativeRatingText },
            { label: text.position, value: displayPosition || "—" },
          ]}
          defaultActionHref={hasActiveContractOffer ? marketHref : undefined}
          defaultActionLabel={hasActiveContractOffer ? text.contractPlayer : undefined}
        />

        <section className={styles.officialBand} id="official-performance">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{performanceCopy.officialData}</p>
              <h2>{performanceCopy.performance}</h2>
              <p className={styles.sectionIntro}>{performanceCopy.performanceCopy}</p>
            </div>
            <BarChart3 aria-hidden="true" size={30} />
          </div>

          <div className={styles.syncLine}>
            <div className={styles.syncSource}>
              <span><i />{touchlinePlayerDataSourceLabel(locale, draftLocalesEnabled)}</span>
              {playerStatistics.previousCompletedSeason.latestSyncAt
                ? <time dateTime={playerStatistics.previousCompletedSeason.latestSyncAt}>{performanceCopy.updatedAt} {formatOfficialSyncTime(playerStatistics.previousCompletedSeason.latestSyncAt, locale, draftLocalesEnabled)}</time>
                : null}
            </div>
            <div className={styles.syncSeason}>
              <em>{performanceCopy.latestSeason}</em>
              <strong>{playerStatistics.previousCompletedSeason.seasonName ?? performanceCopy.verifiedSeason}</strong>
            </div>
          </div>
          <div className={styles.officialGroups}>
            <SeasonStatisticsPanel title={performanceCopy.latestSeason} statistics={playerStatistics.previousCompletedSeason} text={text} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
            <SeasonStatisticsPanel title={performanceCopy.currentSeason} statistics={playerStatistics.currentSeason} text={text} locale={locale} publishedTotalRating={totalRatingText} draftLocalesEnabled={draftLocalesEnabled} />
          </div>
          <FixtureStatisticsPanel
            model={playerStatistics}
            text={text}
            matchStats={exactPlayer.matchStats}
            position={cardFactPosition}
            locale={locale}
            draftLocalesEnabled={draftLocalesEnabled}
          />
          <p className={styles.providerNote}>{performanceCopy.fullStats}</p>
        </section>

        <section className={styles.dataBand}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{text.touchlineData}</p>
              <h2>{text.touchlineCard}</h2>
            </div>
            <Sparkles aria-hidden="true" size={28} />
          </div>

          <div className={styles.metrics}>
            <div>
              <small>{text.points}</small>
              <strong className={styles.numericMetric}>{cumulativeRatingText}</strong>
            </div>
            <div>
              <small>{text.rank}</small>
              <strong>
                {competition.positionRank ? `#${competition.positionRank}` : text.rankPending}
              </strong>
            </div>
            <div>
              <small>{text.rankGroup}</small>
              <strong>{rankingGroupLabel}</strong>
            </div>
            {tierDisplayName ? (
              <div>
                <small>{text.frame}</small>
                <strong>{tierDisplayName}</strong>
              </div>
            ) : null}
          </div>

          <div className={styles.statusGrid}>
            <article>
              <Trophy aria-hidden="true" size={24} />
              <div>
                <h3>{text.season}</h3>
                <p>{text.seasonCopy}</p>
              </div>
            </article>
            <article>
              <Shield aria-hidden="true" size={24} />
              <div>
                <h3>{text.current}</h3>
                <p>{text.currentCopy}</p>
              </div>
            </article>
          </div>

        </section>

        <section className={styles.careerBand}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{text.officialData}</p>
              <h2>{text.career}</h2>
            </div>
          </div>

          {official.transfers.length ? (
            <ol className={styles.timeline}>
              {official.transfers.map((transfer) => (
                <li key={transfer.id}>
                  <span className={styles.timelineMarker} aria-hidden="true" />
                  <small>{formatTransferDate(transfer.date, locale)}</small>
                  <div className={styles.transferJourney}>
                    <span>
                      <em>{text.fromClub}</em>
                      <strong>{transfer.fromTeamName ?? "--"}</strong>
                    </span>
                    <ArrowRight aria-hidden="true" size={14} />
                    <span>
                      <em>{text.toClub}</em>
                      <strong>{transfer.toTeamName ?? "--"}</strong>
                    </span>
                  </div>
                  {transfer.type ? (
                    <span className={styles.transferType}>
                      {localizedTransferType(transfer.type, locale, draftLocalesEnabled)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyState}>{text.awaiting}</p>
          )}
        </section>
      </div>
    </main>
    </TouchlineCardLeadershipProvider>
  );
}

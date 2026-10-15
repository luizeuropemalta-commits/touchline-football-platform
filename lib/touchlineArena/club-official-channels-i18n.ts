import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  storeTitle: "Club shop",
  exploreCollection: "Explore collection",
  playerCollection: "View club collection",
  playerShirt: "View player shirt",
  ticketsTitle: "Experience the match at the stadium",
  viewTickets: "View tickets",
  membershipTitle: "Be part of the club",
  membershipDescription: "Official club membership",
  learnMembership: "Discover Membership",
  externalSite: "Opens the official club website",
} as const;

export type TouchlineClubOfficialChannelsCopy = Readonly<Record<keyof typeof enGB, string>>;

export const TOUCHLINE_CLUB_OFFICIAL_CHANNELS_COPY = {
  "en-GB": enGB,
  "pt-BR": {
    storeTitle: "Loja do clube", exploreCollection: "Explorar coleção", playerCollection: "Ver coleção do clube", playerShirt: "Ver camisa do jogador",
    ticketsTitle: "Viva o jogo no estádio", viewTickets: "Ver ingressos", membershipTitle: "Faça parte do clube", membershipDescription: "Associação oficial do clube", learnMembership: "Conhecer Membership", externalSite: "Abre o site oficial do clube",
  },
  "es-ES": {
    storeTitle: "Tienda del club", exploreCollection: "Explorar colección", playerCollection: "Ver colección del club", playerShirt: "Ver camiseta del jugador",
    ticketsTitle: "Vive el partido en el estadio", viewTickets: "Ver entradas", membershipTitle: "Forma parte del club", membershipDescription: "Membresía oficial del club", learnMembership: "Conocer Membership", externalSite: "Abre el sitio oficial del club",
  },
  "it-IT": {
    storeTitle: "Negozio del club", exploreCollection: "Esplora la collezione", playerCollection: "Vedi la collezione del club", playerShirt: "Vedi la maglia del giocatore",
    ticketsTitle: "Vivi la partita allo stadio", viewTickets: "Vedi i biglietti", membershipTitle: "Entra a far parte del club", membershipDescription: "Membership ufficiale del club", learnMembership: "Scopri Membership", externalSite: "Apre il sito ufficiale del club",
  },
  "fr-FR": {
    storeTitle: "Boutique du club", exploreCollection: "Explorer la collection", playerCollection: "Voir la collection du club", playerShirt: "Voir le maillot du joueur",
    ticketsTitle: "Vivez le match au stade", viewTickets: "Voir les billets", membershipTitle: "Faites partie du club", membershipDescription: "Adhésion officielle du club", learnMembership: "Découvrir Membership", externalSite: "Ouvre le site officiel du club",
  },
  "ar-SA": {
    storeTitle: "متجر النادي", exploreCollection: "استكشف المجموعة", playerCollection: "عرض مجموعة النادي", playerShirt: "عرض قميص اللاعب",
    ticketsTitle: "عِش المباراة في الملعب", viewTickets: "عرض التذاكر", membershipTitle: "كن جزءًا من النادي", membershipDescription: "عضوية النادي الرسمية", learnMembership: "اكتشف العضوية", externalSite: "يفتح الموقع الرسمي للنادي",
  },
  "tr-TR": {
    storeTitle: "Kulüp mağazası", exploreCollection: "Koleksiyonu keşfet", playerCollection: "Kulüp koleksiyonunu gör", playerShirt: "Oyuncu formasını gör",
    ticketsTitle: "Maçı stadyumda yaşa", viewTickets: "Biletleri gör", membershipTitle: "Kulübün bir parçası ol", membershipDescription: "Resmî kulüp üyeliği", learnMembership: "Membership'i keşfet", externalSite: "Kulübün resmî sitesini açar",
  },
  "de-DE": {
    storeTitle: "Clubshop", exploreCollection: "Kollektion entdecken", playerCollection: "Clubkollektion ansehen", playerShirt: "Spielertrikot ansehen",
    ticketsTitle: "Erlebe das Spiel im Stadion", viewTickets: "Tickets ansehen", membershipTitle: "Werde Teil des Clubs", membershipDescription: "Offizielle Clubmitgliedschaft", learnMembership: "Membership entdecken", externalSite: "Öffnet die offizielle Clubwebsite",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubOfficialChannelsCopy>>;

export function getTouchlineClubOfficialChannelsCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubOfficialChannelsCopy {
  return TOUCHLINE_CLUB_OFFICIAL_CHANNELS_COPY[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

/* eslint-disable @next/next/no-img-element */

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import ClubOwnerAvatarUpload from "@/components/touchline/ClubOwnerAvatarUpload";
import { Activity, ArrowRight, BarChart3, CalendarClock, Coins, Handshake, Landmark, LockKeyhole, Repeat2, ShieldCheck, Users, WalletCards } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  TOUCHLINE_ENGLAND_CLUBS,
  rankClubOwnerCards,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import {
  arenaPersistenceKeys,
} from "@/lib/touchlineArena/arena-persistence-namespace";
import { readAuthoritativeTouchlineRoster } from "@/lib/touchlineArena/authoritative-roster-server";
import { resolveTouchlineServerPageRoster } from "@/lib/touchlineArena/server-page-roster";
import {
  touchlineCardTierName,
  touchlineCardTierPalette,
  touchlineArenaTierForKey,
} from "@/lib/touchlineArena/card-rules";
import {
  formatTouchlineCommercialCardTotal,
  formatTouchlineContractedCommercialCardPrice,
  resolveTouchlineContractedCommercialCardPrice,
} from "@/lib/touchlineArena/commercial-card-pricing";
import { formatTouchlineEditorialCardPrice } from "@/lib/touchlineArena/editorial-card-profile";
import { normalizeTouchLineLocale, touchLineT } from "@/lib/touchlineArena/i18n";
import { touchlineArenaContractHref, touchlineArenaPanelHref } from "@/lib/touchlineArena/arena-navigation";
import {
  resolveTouchlineCardCompetition,
  TOUCHLINE_PRESEASON_RANKING_STATE,
} from "@/lib/touchlineArena/card-ranking-live";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import { TOUCHLINE_CLUB_OWNER_XI_SLOTS } from "@/lib/touchlineArena/pitch-layout";
import {
  orderClubOwnerBenchCards,
  partitionClubOwnerRoster,
  selectSavedArenaStartingXi,
} from "@/lib/touchlineArena/club-owner-roster";
import {
  resolveTouchlineClubOwnerPageIdentity,
} from "@/lib/touchlineArena/club-owner-page-identity";
import {
  buildTouchlineMatchScoringBreakdownFields,
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/admin/owner";
import {
  TouchlineSocialFeed,
  TouchlineSocialProfileActions,
  TouchlineSocialProfileHeader,
  type TouchlineSocialPost,
} from "@/components/touchline/social/TouchlineSocial";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";

const TOUCHLINE_ENGLAND_TROPHY =
  "/touchlineArena/trophies/touchline-england-league-trophy-lion-cup-candidate-v4-text.png";
const CLUB_OWNER_TOUCHLINE_NEON = "#a3ff12";
const CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS = 8_000;
type ClubOwnerWalletEntry = { amount_cents: number | null };
type ClubOwnerAvatarProfile = { avatar_url?: unknown };
type ClubOwnerArenaState = { lineup?: unknown };

const trophyGallery = [
  {
    id: "touchline-england-2026",
    league: "TouchLine England League",
    season: "2026/27",
    status: "In progress",
    points: "0 pts",
    image: TOUCHLINE_ENGLAND_TROPHY,
  },
];

function activeContractCardNumericPrice(card: {
  cardTier?: ClubOwnerSquadCard["cardTier"];
  cardPriceVersion?: string;
  cardPriceAuthority?: ClubOwnerSquadCard["cardPriceAuthority"];
}) {
  if (card.cardPriceAuthority === "active-contract") {
    return resolveTouchlineContractedCommercialCardPrice({
      tierKey: card.cardTier,
      priceTableVersion: card.cardPriceVersion,
      competition: "england",
    })?.numericPrice ?? null;
  }
  return null;
}

function activeContractCardPriceLabel(
  card: {
    cardTier?: ClubOwnerSquadCard["cardTier"];
    cardPriceVersion?: string;
    cardPriceAuthority?: ClubOwnerSquadCard["cardPriceAuthority"];
  },
  locale: string,
) {
  if (card.cardPriceAuthority === "active-contract") {
    return formatTouchlineContractedCommercialCardPrice({
      tierKey: card.cardTier,
      priceTableVersion: card.cardPriceVersion,
      competition: "england",
      locale,
    });
  }
  return null;
}

function publicCardProfilePriceLabel(card: ClubOwnerSquadCard, locale: string) {
  if (card.editorialCard) {
    return formatTouchlineEditorialCardPrice(card.editorialCard.cardPrice, locale);
  }
  return null;
}

function publicCardProfileTier(card: ClubOwnerSquadCard) {
  return touchlineArenaTierForKey(card.editorialCard?.tierKey)?.key ?? null;
}

function clubOwnerCardZoomDetails(
  card: ClubOwnerSquadCard,
  locale: string,
  canEditCardEngine: boolean,
) {
  const player = squadCardToExactPlayer(card, { useSuppliedTier: true });
  const profileHref = touchlinePlayerProfileHref(player, locale, { previewTier: card.cardTier });
  return buildTouchlinePlayerCardZoomDetails({
    locale,
    name: card.name,
    clubName: card.clubName,
    position: card.position,
    nationality: card.countryCode3,
    editorialCard: card.editorialCard,
    cardReview: card.cardReview,
    activeContractCard: null,
    touchlinePoints: card.seasonTouchlinePoints ?? card.touchlinePoints,
    extraFields: [
      {
        label: locale === "pt-BR" ? "Pontos da partida" : "Match points",
        value: card.matchTouchlinePoints == null ? "—" : String(card.matchTouchlinePoints),
        accent: true,
      },
      ...buildTouchlineVerifiedMatchFactFields({
        statistics: card.matchStats,
        position: card.position || card.role,
      }, locale),
      ...buildTouchlineMatchScoringBreakdownFields(card.matchPointContributions, locale),
    ],
    profileHref,
    cardEngineHref: canEditCardEngine
      ? touchlineCardEnginePlayerHref(card.canonicalPlayerId, locale)
      : null,
  });
}

export type ClubOwnerProfileSearchParams = Promise<{ lang?: string }>;

export default async function ClubOwnerProfileRenderer({
  searchParams,
  ownerSlug,
}: {
  searchParams: ClubOwnerProfileSearchParams;
  ownerSlug?: string | null;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const canEditCardEngine = Boolean(user && isOwnerEmail(user.email));
  const clubOwnerUser = user && !isOwnerEmail(user.email) ? user : null;
  let storedAvatarUrl: string | null = null;
  if (clubOwnerUser && supabase) {
    const { data: storedProfile } = await resolveServerReadWithin<{ data: ClubOwnerAvatarProfile | null }>(
      supabase
        .from("users")
        .select("avatar_url")
        .eq("id", clubOwnerUser.id)
        .maybeSingle()
        .then(({ data }) => ({ data: data as ClubOwnerAvatarProfile | null })),
      { data: null },
      CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS,
    );
    storedAvatarUrl = typeof storedProfile?.avatar_url === "string"
      ? storedProfile.avatar_url
      : null;
  }
  const ownerIdentity = resolveTouchlineClubOwnerPageIdentity(clubOwnerUser, ownerSlug, storedAvatarUrl);
  if (!ownerIdentity) notFound();
  const activeClubOwnerUser = ownerIdentity.isAuthenticatedClubOwner && clubOwnerUser ? clubOwnerUser : null;
  const showPrivateClubControl = ownerIdentity.isAuthenticatedClubOwner;
  const activeRankingRead = resolveServerReadWithin(
    loadTouchLineActiveRanking(),
    TOUCHLINE_PRESEASON_RANKING_STATE,
    CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS,
  );
  let authoritativeRosterRead: Promise<Awaited<ReturnType<typeof readAuthoritativeTouchlineRoster>> | null> = Promise.resolve(null);
  if (activeClubOwnerUser && admin) {
    authoritativeRosterRead = resolveServerReadWithin(
      readAuthoritativeTouchlineRoster(admin, activeClubOwnerUser.id),
      null,
      CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS,
    );
  }
  const walletEntriesRead = activeClubOwnerUser && admin
    ? resolveServerReadWithin<{ data: ClubOwnerWalletEntry[] | null }>(
      admin
        .from("clubowner_credit_ledger")
        .select("amount_cents")
        .eq("user_id", activeClubOwnerUser.id)
        .eq("currency", "TC")
        .then(({ data }) => ({ data: data as ClubOwnerWalletEntry[] | null })),
      { data: null },
      CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS,
    )
    : Promise.resolve({ data: null });
  const arenaStateRead = activeClubOwnerUser && admin
    ? resolveServerReadWithin<{ data: ClubOwnerArenaState | null }>(
      admin
        .from("touchline_user_arena_state")
        .select("lineup")
        .eq("user_id", activeClubOwnerUser.id)
        .maybeSingle()
        .then(({ data }) => ({ data: data as ClubOwnerArenaState | null })),
      { data: null },
      CLUB_OWNER_PRIVATE_READ_TIMEOUT_MS,
    )
    : Promise.resolve({ data: null });
  const [activeRanking, authoritativeRoster, walletEntriesResponse, arenaStateResponse] = await Promise.all([
    activeRankingRead,
    authoritativeRosterRead,
    walletEntriesRead,
    arenaStateRead,
  ]);
  const publicRosterCookieValue = activeClubOwnerUser
    ? null
    : (await cookies()).get(arenaPersistenceKeys(
        { kind: "demo", demoId: "public-club-owner" },
        "club-owner-roster",
      ).cookieName)?.value;
  const rosterResolution = resolveTouchlineServerPageRoster({
    authenticatedUserId: activeClubOwnerUser?.id,
    authoritativeRoster,
    publicCookieValue: publicRosterCookieValue,
  });
  if (rosterResolution.state === "unavailable") {
    console.error("[TouchLine] ClubOwner roster unavailable", rosterResolution.error);
  }
  const storedRosterCards = rosterResolution.cards;
  const rosterCards = storedRosterCards.map((card) => {
    const competition = resolveTouchlineCardCompetition({ state: activeRanking, playerId: card.id });
    return {
      ...card,
      touchlinePoints: competition.touchlinePoints,
      roundPoints: competition.roundPoints,
      // Ranking changes sporting points only. A card tier must originate in
      // a published editorial profile or a frozen active contract; never
      // derive one from a demo player identity or a market valuation.
      cardTier: publicCardProfileTier(card) ?? undefined,
    };
  });
  const sortedClubOwnerSquadCards = [...rosterCards].sort(rankClubOwnerCards);
  const publishedClubOwnerSquadCards = sortedClubOwnerSquadCards.filter((card) => Boolean(card.editorialCard));
  const bestPlayerCard = [...publishedClubOwnerSquadCards].sort((first, second) => (
    second.roundPoints - first.roundPoints || rankClubOwnerCards(first, second)
  ))[0] ?? null;
  const bestPlayerPalette = touchlineCardTierPalette(bestPlayerCard?.cardTier);
  const startingShowcaseCards = publishedClubOwnerSquadCards.slice(0, 6);
  const rosterSections = partitionClubOwnerRoster(sortedClubOwnerSquadCards);
  const ownedContractCount = activeClubOwnerUser
    ? authoritativeRoster?.ok
      ? authoritativeRoster.snapshot.ownedContractCount
      : null
    : sortedClubOwnerSquadCards.length;
  const openContractSlotCount = ownedContractCount === null
    ? null
    : Math.max(0, 35 - ownedContractCount);
  const savedStartingXiCards = activeClubOwnerUser
    ? selectSavedArenaStartingXi(rosterCards, arenaStateResponse.data?.lineup)
    : null;
  const startingXiCards = savedStartingXiCards ?? rosterSections.startingXiCards;
  const savedStartingXiIds = new Set(savedStartingXiCards?.map((selected) => selected.id));
  const allBenchCards = savedStartingXiCards
    ? orderClubOwnerBenchCards(
      rosterSections.allCards.filter((card) => !savedStartingXiIds.has(card.id)),
    )
    : rosterSections.allBenchCards;
  const squadCardValue = sortedClubOwnerSquadCards.reduce(
    (sum, card) => sum + (activeContractCardNumericPrice(card) ?? 0),
    0,
  );
  const squadPointsTotal = sortedClubOwnerSquadCards.reduce((sum, card) => sum + card.touchlinePoints, 0);
  const walletEntries = walletEntriesResponse.data;
  const walletBalanceTc = activeClubOwnerUser
    ? Math.max(0, Math.floor((walletEntries ?? []).reduce(
        (total, entry) => total + Number(entry.amount_cents ?? 0),
        0,
      ) / 100))
    : 60;
  const occupiedContractPercent = ownedContractCount === null
    ? null
    : Math.round((ownedContractCount / 35) * 100);
  const locale = normalizeTouchLineLocale(params.lang);
  const benchPositionGroups = ([
    { role: "goalkeeper", label: locale === "pt-BR" ? "Guarda-redes" : "Goalkeepers" },
    { role: "defender", label: locale === "pt-BR" ? "Defesas" : "Defenders" },
    { role: "midfielder", label: locale === "pt-BR" ? "Médios" : "Midfielders" },
    { role: "forward", label: locale === "pt-BR" ? "Avançados" : "Forwards" },
  ] as const).map((group) => ({
    ...group,
    cards: allBenchCards.filter((card) => card.role === group.role),
  }));
  const isPortuguese = locale === "pt-BR";
  const clubCopy = isPortuguese ? {
    rankingUpdated: "Classificação oficial atualizada após cada rodada auditada.",
    awaitingRound: "Aguardando 1ª rodada", officialPoints: "Pontuação oficial", openRanking: "Ver ranking completo",
    privateArea: "Área privada do ClubOwner", verifiedPrivateArea: "Área privada verificada", clubDirection: "Direção do clube",
    privateDescription: "Finanças, contratos, treinamento e estratégia são visíveis somente para o ClubOwner autenticado.",
    protectedStrategy: "Estratégia protegida", hiddenFromFeed: "Não aparece no feed público",
    finance: "Financeiro", balanceAndBudget: "Saldo e orçamento", substitution: "Substituição", quickSquadChange: "Troca rápida do elenco",
    live: "Ao vivo", gamesAndStats: "Jogos e estatísticas", market: "Mercado", contractPlayers: "Contratar atletas", officialTables: "Tabelas oficiais",
    clubFinance: "Financeiro do clube", seasonalBudget: "Orçamento da temporada", addCredits: "Adicionar TC", addClubBalance: "Adicionar saldo ao clube",
    paymentHold: "O crédito real será liberado somente pelo pagamento seguro e confirmado no servidor.", paymentPending: "Pagamento seguro em integração",
    totalResources: "Capacidade do clube", availableAndSquad: "Cards contratados e vagas disponíveis", invested: "vagas usadas",
    spendableBalance: "Saldo para gastar", marketAvailable: "Disponível no mercado", cardAssets: "Patrimônio em cards", updatedValue: "Valor atualizado",
    contractSlots: "Vagas de contrato", limit35: "Limite de 35", pendingCommitments: "Compromissos pendentes", noOpenPurchase: "Nenhuma compra aberta",
    budgetInvested: "das vagas de card usadas", accounting: "Contabilidade TouchLine", ledgerFootnote: "Todos os movimentos TC serão registrados com data, origem e saldo após a operação.",
    trainingCentre: "Centro de Treinamento", privateSportsOperation: "Operação esportiva privada", private: "Privado",
    privateStrategy: "Escalação, posição no campo e estratégia nunca são publicadas automaticamente.", openSubstitution: "Abrir Substituição",
    contracts: "Contratos", squadControl: "Controle do elenco", active: "Ativos", slots: "Vagas", pending: "Pendentes", manageMarket: "Gerir no Mercado de Cards",
  } : {
    rankingUpdated: "Official standings update after every audited round.",
    awaitingRound: "Awaiting round 1", officialPoints: "Official points", openRanking: "View full ranking",
    privateArea: "Private ClubOwner area", verifiedPrivateArea: "Verified private area", clubDirection: "Club direction",
    privateDescription: "Finances, contracts, training and strategy are visible only to the authenticated ClubOwner.",
    protectedStrategy: "Protected strategy", hiddenFromFeed: "Not shown in the public feed",
    finance: "Finance", balanceAndBudget: "Balance and budget", substitution: "Substitution", quickSquadChange: "Quick squad change",
    live: "Live", gamesAndStats: "Matches and statistics", market: "Market", contractPlayers: "Contract players", officialTables: "Official tables",
    clubFinance: "Club finance", seasonalBudget: "Season budget", addCredits: "Add TC", addClubBalance: "Add club balance",
    paymentHold: "Real credit is released only after secure, server-confirmed payment.", paymentPending: "Secure payment pending integration",
    totalResources: "Club capacity", availableAndSquad: "Contracted cards and available slots", invested: "slots used",
    spendableBalance: "Balance to spend", marketAvailable: "Available in the market", cardAssets: "Card assets", updatedValue: "Updated value",
    contractSlots: "Contract slots", limit35: "35 limit", pendingCommitments: "Pending commitments", noOpenPurchase: "No open purchase",
    budgetInvested: "of card slots used", accounting: "TouchLine accounting", ledgerFootnote: "Every TC movement is recorded with date, source and balance after the operation.",
    trainingCentre: "Training Centre", privateSportsOperation: "Private sporting operation", private: "Private",
    privateStrategy: "Line-up, field position and strategy are never published automatically.", openSubstitution: "Open substitution",
    contracts: "Contracts", squadControl: "Squad control", active: "Active", slots: "Slots", pending: "Pending", manageMarket: "Manage in Card Market",
  };
  const t = (key: Parameters<typeof touchLineT>[1]) => touchLineT(locale, key);
  const localeSuffix = `?lang=${encodeURIComponent(locale)}`;
  const cardLabels = {
    nationality: t("nationalityShort"),
    points: t("points"),
    totalPoints: t("touchlinePoints"),
    cardPrice: locale === "pt-BR" ? "Preço do card" : "Card price",
  };
  const ownerPositionLabel = locale === "pt-BR" ? "Posição do ClubOwner" : "Club Owner position";
  const socialPosts: TouchlineSocialPost[] = publishedClubOwnerSquadCards.slice(0, 4).map((card) => {
    const club = TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.name === card.clubName);
    const player = squadCardToExactPlayer(card, { useSuppliedTier: true });
    const priceLabel = publicCardProfilePriceLabel(card, locale);
    const tierKey = publicCardProfileTier(card);
    return {
      id: `owned-card-${card.id}`,
      kind: "official",
      title: isPortuguese
        ? `${card.name} integra o elenco de ${ownerIdentity.name}`
        : `${card.name} is part of ${ownerIdentity.name}'s squad`,
      body: isPortuguese
        ? "Atualização automática baseada no contrato deste card. Nenhuma escalação, posição no campo ou estratégia foi publicada."
        : "Automatic update based on this card contract. No line-up, field position or strategy has been published.",
      meta: isPortuguese ? "Elenco oficial" : "Official squad",
      accent: touchlineCardTierPalette(tierKey).accent,
      badge: priceLabel
        ? `${card.touchlinePoints} ${isPortuguese ? "pontos acumulados" : "cumulative points"} · ${priceLabel}`
        : `${card.touchlinePoints} ${isPortuguese ? "pontos acumulados" : "cumulative points"}`,
      visual: (
        <TouchlineCardZoom
          ariaLabel={`${locale === "pt-BR" ? "Ampliar card de" : "Open card for"} ${card.name}`}
          contractHref={card.cardPriceAuthority === "active-contract"
            ? touchlineArenaContractHref({
              locale,
              playerId: card.id,
              playerName: card.name,
              clubId: club?.teamId,
            })
            : undefined}
          contractLabel={locale === "pt-BR" ? "Contratar" : "Contract player"}
          contractValue={card.cardPriceAuthority === "active-contract" ? activeContractCardPriceLabel(card, locale) ?? undefined : undefined}
          contractTermLabel={card.cardPriceAuthority === "active-contract" ? (locale === "pt-BR" ? "Contrato · 1 temporada" : "Contract · 1 season") : undefined}
          tierAccent={touchlineCardTierPalette(tierKey).accent}
          tierLabel={tierKey ? touchlineCardTierName(tierKey, locale) : undefined}
          details={clubOwnerCardZoomDetails(card, locale, canEditCardEngine)}
          expandedContent={(
            <TouchlineEliteExactCard
              player={player}
              labels={cardLabels}
              layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
              rankingMode="preview"
              imageLoading="lazy"
              showCardActions
              showProfileAction
              forceNeonActive
            />
          )}
        >
          <TouchlineEliteExactCard
            player={player}
            labels={cardLabels}
            layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
            rankingMode="preview"
            imageLoading="lazy"
            showProfileAction={false}
            showSocialMetrics={false}
          />
        </TouchlineCardZoom>
      ),
      visualTheme: "squad",
      metrics: [
        { label: isPortuguese ? "Clube" : "Club", value: club?.shortCode ?? card.clubName },
        { label: isPortuguese ? "Pontos" : "Points", value: String(card.touchlinePoints) },
        ...(priceLabel ? [{ label: isPortuguese ? "Preço" : "Price", value: priceLabel }] : []),
      ],
      actionHref: touchlinePlayerProfileHref(player, locale, { previewTier: card.cardTier }),
      actionLabel: isPortuguese ? "Abrir card" : "Open card",
    };
  });

  return (
    <main
      className="club-owner-profile"
      style={{
        "--club-best-of-week-accent": bestPlayerPalette.accent,
        "--club-best-of-week-secondary": bestPlayerPalette.secondary,
      } as CSSProperties}
    >
      <section className="club-owner-profile-shell">
        <TouchlineGlobalNavigation
          locale={locale}
          currentRoute={ownerIdentity.isAuthenticatedClubOwner ? "myClub" : "clubProfile"}
          surface={ownerIdentity.isAuthenticatedClubOwner ? "authenticated" : "public"}
        />

        <section className="club-owner-profile-info" aria-label={t("clubOwnerInformation")}>
          <TouchlineSocialProfileHeader
            kind={t("clubOwner")}
            name={ownerIdentity.name}
            subtitle={`ClubOwner · TouchLine England`}
            avatarUrl={ownerIdentity.avatarUrl}
            avatarAlt={ownerIdentity.name}
            accent={CLUB_OWNER_TOUCHLINE_NEON}
            clubOwnerPortraitTrace
            showCover={false}
            featuredLabel={isPortuguese ? "Melhor da semana" : "Best of the Week"}
            backgroundAccent={bestPlayerPalette.accent}
            backgroundSecondary={bestPlayerPalette.secondary}
            profileDetails={[
              { label: locale === "pt-BR" ? "Nacionalidade" : "Nationality", value: ownerIdentity.nationality },
              { label: locale === "pt-BR" ? "Cidade" : "City", value: ownerIdentity.city },
              { label: locale === "pt-BR" ? "Desde" : "Since", value: ownerIdentity.since },
            ]}
            featuredVisual={bestPlayerCard ? (
              <div className="club-owner-best-player">
                <span className="club-owner-best-player-card">
                  <TouchlineCardZoom
                    ariaLabel={`${locale === "pt-BR" ? "Ampliar card de" : "Open card for"} ${bestPlayerCard.name}`}
                    contractHref={bestPlayerCard.cardPriceAuthority === "active-contract"
                      ? touchlineArenaContractHref({
                        locale,
                        playerId: bestPlayerCard.id,
                        playerName: bestPlayerCard.name,
                        clubId: TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.name === bestPlayerCard.clubName)?.teamId,
                      })
                      : undefined}
                    contractLabel={locale === "pt-BR" ? "Contratar" : "Contract player"}
                    contractValue={activeContractCardPriceLabel(bestPlayerCard, locale) ?? undefined}
                    contractTermLabel={bestPlayerCard.cardPriceAuthority === "active-contract" ? (locale === "pt-BR" ? "Contrato · 1 temporada" : "Contract · 1 season") : undefined}
                    tierAccent={touchlineCardTierPalette(bestPlayerCard.cardTier).accent}
                    tierLabel={touchlineCardTierName(bestPlayerCard.cardTier, locale)}
                    details={clubOwnerCardZoomDetails(bestPlayerCard, locale, canEditCardEngine)}
                    expandedContent={(
                      <TouchlineEliteExactCard
                        className="club-owner-best-player-rendered"
                        player={squadCardToExactPlayer(bestPlayerCard, { useSuppliedTier: true })}
                        labels={cardLabels}
                        layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                        rankingMode="preview"
                        imageLoading="eager"
                        showCardActions
                        showProfileAction
                        forceNeonActive
                      />
                    )}
                  >
                    <TouchlineEliteExactCard
                      className="club-owner-best-player-rendered"
                      player={squadCardToExactPlayer(bestPlayerCard, { useSuppliedTier: true })}
                      labels={cardLabels}
                      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                      rankingMode="preview"
                      imageLoading="eager"
                      showProfileAction={false}
                      showSocialMetrics={false}
                    />
                  </TouchlineCardZoom>
                </span>
                <span className="club-owner-best-player-copy">
                  <strong>{bestPlayerCard.shortName}</strong>
                  <small>
                    {bestPlayerCard.roundPoints} pts {locale === "pt-BR" ? "na semana" : "this week"}
                    {" · "}{bestPlayerCard.touchlinePoints} pts {locale === "pt-BR" ? "no total" : "total"}
                  </small>
                  <em>
                    {locale === "pt-BR"
                      ? "Maior pontuação da última rodada concluída"
                      : "Highest score from the latest completed round"}
                  </em>
                </span>
                <a href={touchlinePlayerProfileHref(squadCardToExactPlayer(bestPlayerCard, { useSuppliedTier: true }), locale, { previewTier: bestPlayerCard.cardTier })}>
                  {locale === "pt-BR" ? "Abrir perfil do card" : "Open card profile"}
                </a>
              </div>
            ) : undefined}
          >
            <div className="club-owner-profile-actions-stack">
              <TouchlineSocialProfileActions
                entityId={ownerIdentity.entityId}
                entityName={ownerIdentity.name}
                followerCount={ownerIdentity.followerCount}
                accent={CLUB_OWNER_TOUCHLINE_NEON}
                locale={locale}
              />
              {showPrivateClubControl ? <ClubOwnerAvatarUpload locale={locale} /> : null}
            </div>
          </TouchlineSocialProfileHeader>

          <section className="club-owner-rank-deck" aria-label={t("rankings")}>
            <div className="club-owner-rank-title">
              <span><BarChart3 aria-hidden="true" /> {t("rankings")}</span>
              <strong>TouchLine England · 2026/27</strong>
              <small>{clubCopy.rankingUpdated}</small>
            </div>
            <div className="club-owner-rank-metrics">
              <article>
                <span>{ownerPositionLabel}</span>
                <strong>—</strong>
                <small>{clubCopy.awaitingRound}</small>
              </article>
              <article>
                <span>{t("touchlinePoints")}</span>
                <strong>{squadPointsTotal}</strong>
                <small>{clubCopy.officialPoints}</small>
              </article>
              <a href={`/touchline-player-card-rankings${localeSuffix}`}>
                {clubCopy.openRanking}
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>

          {showPrivateClubControl ? (
            <section className="club-owner-private" aria-label={clubCopy.privateArea}>
              <header className="club-owner-private-heading">
                <div>
                  <span><LockKeyhole aria-hidden="true" /> {clubCopy.verifiedPrivateArea}</span>
                  <strong>{clubCopy.clubDirection}</strong>
                  <small>{clubCopy.privateDescription}</small>
                </div>
                <div className="club-owner-private-security">
                  <ShieldCheck aria-hidden="true" />
                  <span><strong>{clubCopy.protectedStrategy}</strong><small>{clubCopy.hiddenFromFeed}</small></span>
                </div>
              </header>

              {rosterResolution.state === "unavailable" ? (
                <p
                  role="status"
                  className="club-owner-roster-availability"
                  style={{ margin: "16px 0 0", padding: "12px 14px", border: "1px solid rgba(181,255,75,.32)", borderRadius: 12, color: "#dfffc2", background: "rgba(21,47,20,.62)", lineHeight: 1.5 }}
                >
                  {isPortuguese
                    ? "O elenco autoritativo está demorando mais que o esperado. Nenhuma escalação, contrato ou card foi alterado."
                    : "The authoritative squad is taking longer than expected. No line-up, contract or card has been changed."}
                </p>
              ) : null}

              <nav className="club-owner-control-nav" aria-label={clubCopy.clubDirection}>
                <a href="#club-owner-finance"><Landmark aria-hidden="true" /><span>{clubCopy.finance}<small>{clubCopy.balanceAndBudget}</small></span></a>
                <a href={touchlineArenaPanelHref("bench", locale)}><Repeat2 aria-hidden="true" /><span>{clubCopy.substitution}<small>{clubCopy.quickSquadChange}</small></span></a>
                <a href={touchlineArenaPanelHref("live", locale)}><Activity aria-hidden="true" /><span>{clubCopy.live}<small>{clubCopy.gamesAndStats}</small></span></a>
                <a href={touchlineArenaPanelHref("market", locale)}><Handshake aria-hidden="true" /><span>{clubCopy.market}<small>{clubCopy.contractPlayers}</small></span></a>
                <a href={`/touchline-tables${localeSuffix}`}><BarChart3 aria-hidden="true" /><span>{t("rankings")}<small>{clubCopy.officialTables}</small></span></a>
              </nav>

              <div className="club-owner-board-grid">
                <article className="club-owner-finance" id="club-owner-finance">
                  <div className="club-owner-board-card-head">
                    <div>
                      <span><WalletCards aria-hidden="true" /> {clubCopy.clubFinance}</span>
                      <strong>{clubCopy.seasonalBudget}</strong>
                    </div>
                    <details className="club-owner-add-funds">
                      <summary><Coins aria-hidden="true" /> {clubCopy.addCredits}</summary>
                      <div>
                        <strong>{clubCopy.addClubBalance}</strong>
                        <p>{clubCopy.paymentHold}</p>
                        <button type="button" disabled>{clubCopy.paymentPending}</button>
                      </div>
                    </details>
                  </div>

                  <div className="club-owner-finance-hero">
                    <div>
                      <span>{clubCopy.totalResources}</span>
                      <strong>{ownedContractCount ?? "—"}/35</strong>
                      <small>{clubCopy.availableAndSquad}</small>
                    </div>
                    <div className="club-owner-budget-ring" style={{ "--budget-used": `${(occupiedContractPercent ?? 0) * 3.6}deg` } as CSSProperties}>
                      <span><strong>{occupiedContractPercent === null ? "—" : `${occupiedContractPercent}%`}</strong><small>{clubCopy.invested}</small></span>
                    </div>
                  </div>

                  <div className="club-owner-ledger">
                    <div><span>{clubCopy.spendableBalance}</span><strong>{walletBalanceTc} TC</strong><small>{clubCopy.marketAvailable}</small></div>
                    <div><span>{clubCopy.cardAssets}</span><strong>{formatTouchlineCommercialCardTotal({ numericPrice: squadCardValue, competition: "england" })}</strong><small>{clubCopy.updatedValue}</small></div>
                    <div><span>{clubCopy.contractSlots}</span><strong>{openContractSlotCount ?? "—"}</strong><small>{clubCopy.limit35}</small></div>
                    <div><span>{clubCopy.pendingCommitments}</span><strong>0</strong><small>{clubCopy.noOpenPurchase}</small></div>
                  </div>

                  <div className="club-owner-budget-bar" aria-label={`${occupiedContractPercent ?? "—"}% ${clubCopy.budgetInvested}`}>
                    <span style={{ width: `${occupiedContractPercent ?? 0}%` }} />
                  </div>
                  <footer><span>{clubCopy.accounting}</span><small>{clubCopy.ledgerFootnote}</small></footer>
                </article>

                <article className="club-owner-training" id="club-owner-training">
                  <div className="club-owner-board-card-head">
                    <div>
                      <span><Users aria-hidden="true" /> {clubCopy.trainingCentre}</span>
                      <strong>{clubCopy.privateSportsOperation}</strong>
                    </div>
                    <b><LockKeyhole aria-hidden="true" /> {clubCopy.private}</b>
                  </div>
                  <div className="club-owner-training-metrics">
                    <div><strong>{startingXiCards.length}/11</strong><span>{t("startingXi")}</span></div>
                    <div><strong>{allBenchCards.length}</strong><span>{locale === "pt-BR" ? "Banco unificado" : "Unified bench"}</span></div>
                    <div><strong>GK · DF · MF · FW</strong><span>{locale === "pt-BR" ? "Ordem por posição" : "Position order"}</span></div>
                  </div>
                  <p>{clubCopy.privateStrategy}</p>
                  <a href={touchlineArenaPanelHref("bench", locale)}>{clubCopy.openSubstitution} <ArrowRight aria-hidden="true" /></a>
                </article>

                <article className="club-owner-contracts" id="club-owner-contracts">
                  <div className="club-owner-board-card-head">
                    <div>
                      <span><CalendarClock aria-hidden="true" /> {clubCopy.contracts}</span>
                      <strong>{clubCopy.squadControl}</strong>
                    </div>
                  </div>
                  <div className="club-owner-contract-progress"><span style={{ width: `${Math.min(100, occupiedContractPercent ?? 0)}%` }} /></div>
                  <div className="club-owner-contract-numbers">
                    <div><strong>{ownedContractCount ?? "—"}</strong><span>{clubCopy.active}</span></div>
                    <div><strong>{openContractSlotCount ?? "—"}</strong><span>{clubCopy.slots}</span></div>
                    <div><strong>0</strong><span>{clubCopy.pending}</span></div>
                  </div>
                  <a href={touchlineArenaPanelHref("market", locale)}>{clubCopy.manageMarket} <ArrowRight aria-hidden="true" /></a>
                </article>
              </div>

              <section className="club-owner-squad-command" id="club-owner-squad" aria-label={locale === "pt-BR" ? "Gestão do elenco" : "Squad management"}>
                <header>
                  <div>
                    <span><Users aria-hidden="true" /> {locale === "pt-BR" ? "Gestão do elenco" : "Squad management"}</span>
                    <strong>{locale === "pt-BR" ? "Seu time, em uma única tela" : "Your team, on one screen"}</strong>
                    <small>{locale === "pt-BR" ? "Titulares e um único banco, ordenado por impacto e posição. A estratégia continua privada." : "Starting XI and one unified bench, ordered by impact and position. Your strategy stays private."}</small>
                  </div>
                  <a href={touchlineArenaPanelHref("bench", locale)}><Repeat2 aria-hidden="true" /> {locale === "pt-BR" ? "Fazer substituição" : "Make substitution"}</a>
                </header>

                <TouchlinePitchSurface className="club-owner-squad-pitch" ariaLabel={t("startingXi")}>
                  {startingXiCards.map((card, index) => {
                    const slot = TOUCHLINE_CLUB_OWNER_XI_SLOTS[index] ?? { x: 50, y: 50 };
                    const player = squadCardToExactPlayer(card, { useSuppliedTier: true });
                    return (
                      <a
                        key={card.id}
                        className="club-owner-squad-pitch-card"
                        href={touchlinePlayerProfileHref(player, locale, { previewTier: card.cardTier })}
                        style={{ "--squad-x": `${slot.x}%`, "--squad-y": `${slot.y}%` } as CSSProperties}
                      >
                        <span aria-hidden="true"><TouchlineEliteExactCard player={player} labels={cardLabels} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} rankingMode="preview" showProfileAction={false} showSocialMetrics={false} /></span>
                        <strong>{card.shortName}</strong>
                      </a>
                    );
                  })}
                  {startingXiCards.length === 0 ? <p>{locale === "pt-BR" ? "Contrate seus primeiros atletas para montar o XI." : "Contract your first players to build the XI."}</p> : null}
                </TouchlinePitchSurface>

                <div className="club-owner-squad-row-heading">
                  <span>{locale === "pt-BR" ? "Banco" : "Bench"}</span>
                  <strong>{allBenchCards.length}</strong>
                </div>
                <div className="club-owner-unified-bench">
                  {benchPositionGroups.map((group) => group.cards.length ? (
                    <section key={group.role} className="club-owner-bench-position" aria-label={group.label}>
                      <header><span>{group.label}</span><strong>{group.cards.length}</strong></header>
                      <div className="club-owner-squad-card-row">
                        {group.cards.map((card) => {
                          const player = squadCardToExactPlayer(card, { useSuppliedTier: true });
                          return (
                            <a key={card.id} href={touchlinePlayerProfileHref(player, locale, { previewTier: card.cardTier })}>
                              <span aria-hidden="true"><TouchlineEliteExactCard player={player} labels={cardLabels} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} rankingMode="preview" showProfileAction={false} showSocialMetrics={false} /></span>
                              <strong>{card.shortName}</strong>
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  ) : null)}
                </div>
              </section>
            </section>
          ) : null}

          <TouchlineSocialFeed
            entityId={ownerIdentity.entityId}
            entityName={ownerIdentity.name}
            entityImageUrl={ownerIdentity.avatarUrl}
            entityImageAlt={ownerIdentity.name}
            entityRole="ClubOwner · TouchLine England"
            posts={socialPosts}
            accent={CLUB_OWNER_TOUCHLINE_NEON}
            locale={locale}
          />
          <section className="club-owner-profile-trophy-gallery" id="club-owner-trophies" aria-label={isPortuguese ? "Galeria de troféus do ClubOwner" : "ClubOwner trophy gallery"}>
            <div className="club-owner-profile-gallery-heading">
              <span>{t("trophyGallery")}</span>
              <strong>{t("leagueHistory")}</strong>
            </div>
            <div className="club-owner-profile-trophy-grid">
              {trophyGallery.map((trophy) => (
                <article key={trophy.id} className="club-owner-profile-trophy">
                  <img src={trophy.image} alt={`${trophy.league} trophy`} draggable={false} />
                  <div>
                    <span>{trophy.league}</span>
                    <strong>{trophy.season}</strong>
                    <small>{t("inProgress")} / {trophy.points}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className="club-owner-profile-squad" aria-label={isPortuguese ? "Cards de jogador do ClubOwner" : "ClubOwner owned player cards"}>
            <div className="club-owner-profile-squad-heading">
              <div>
                <span>{t("ownedPlayerCards")}</span>
                <strong>{t("fullSquad")}</strong>
              </div>
              <div className="club-owner-profile-squad-actions">
                <a href={`/touchline-player-card-rankings${localeSuffix}`}>{t("playerCardsRanking")}</a>
                <small>{t("playerOrderDescription")}</small>
              </div>
            </div>
            <div className="club-owner-profile-featured-cards">
              {startingShowcaseCards.map((card, index) => {
                const player = squadCardToExactPlayer(card, { useSuppliedTier: true });
                const profileHref = touchlinePlayerProfileHref(player, locale, { previewTier: card.cardTier });
                const priceLabel = publicCardProfilePriceLabel(card, locale);
                return (
                  <article key={card.id} className="club-owner-profile-featured-card">
                    <span className="club-owner-profile-card-rank">#{index + 1}</span>
                    <div className="club-owner-profile-card-preview">
                      <TouchlineCardZoom
                        ariaLabel={`${locale === "pt-BR" ? "Ampliar card de" : "Open card for"} ${card.name}`}
                        contractHref={card.cardPriceAuthority === "active-contract"
                          ? touchlineArenaContractHref({
                            locale,
                            playerId: card.id,
                            playerName: card.name,
                            clubId: TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.name === card.clubName)?.teamId,
                          })
                          : undefined}
                        contractLabel={locale === "pt-BR" ? "Contratar" : "Contract player"}
                        contractValue={activeContractCardPriceLabel(card, locale) ?? undefined}
                        contractTermLabel={card.cardPriceAuthority === "active-contract" ? (locale === "pt-BR" ? "Contrato · 1 temporada" : "Contract · 1 season") : undefined}
                        tierAccent={touchlineCardTierPalette(card.cardTier).accent}
                        tierLabel={touchlineCardTierName(card.cardTier, locale)}
                        details={clubOwnerCardZoomDetails(card, locale, canEditCardEngine)}
                        expandedContent={(
                          <TouchlineEliteExactCard
                            className="club-owner-profile-rendered-card"
                            player={player}
                            labels={cardLabels}
                            imageLoading="lazy"
                            layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                            rankingMode="preview"
                            showCardActions
                            showProfileAction
                            forceNeonActive
                          />
                        )}
                      >
                        <TouchlineEliteExactCard
                          className="club-owner-profile-rendered-card"
                          player={player}
                          labels={cardLabels}
                          imageLoading="lazy"
                          layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                          rankingMode="preview"
                          showProfileAction={false}
                          showSocialMetrics={false}
                        />
                      </TouchlineCardZoom>
                    </div>
                    <div className="club-owner-profile-card-meta">
                      <a href={profileHref}>{card.shortName}</a>
                      <span>{card.clubName}</span>
                      <small>{priceLabel ? `${priceLabel} / ` : ""}{card.touchlinePoints} {isPortuguese ? "pontos" : "pts"}</small>
                    </div>
                  </article>
                );
              })}
            </div>
            <details className="club-owner-profile-collection-details">
              <summary>
                <span>{isPortuguese ? "Ver coleção completa" : "View full collection"}</span>
                <strong>{publishedClubOwnerSquadCards.length} {isPortuguese ? "cards" : "cards"}</strong>
              </summary>
              <div className="club-owner-profile-squad-table" aria-label={isPortuguese ? "Ranking completo do elenco" : "Full owned squad ranking"}>
                {publishedClubOwnerSquadCards.map((card, index) => {
                  const player = squadCardToExactPlayer(card, { useSuppliedTier: true });
                  const profileHref = touchlinePlayerProfileHref(player, locale, { previewTier: card.cardTier });
                  const priceLabel = publicCardProfilePriceLabel(card, locale);
                  return (
                    <a key={card.id} href={profileHref} className="club-owner-profile-player-row">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{card.shortName}</strong>
                      <em>{card.position}</em>
                      <small>{card.clubName}</small>
                      {priceLabel ? <b>{priceLabel}</b> : <span aria-hidden="true" />}
                    </a>
                  );
                })}
              </div>
            </details>
          </section>
        </section>
      </section>

      <style>{`
        .club-owner-profile {
          min-height: 100dvh;
          overflow-x: clip;
          background:
            radial-gradient(circle at 78% 12%, color-mix(in srgb, var(--club-best-of-week-accent) 18%, transparent), transparent 28%),
            radial-gradient(circle at 66% 26%, color-mix(in srgb, var(--club-best-of-week-secondary) 13%, transparent), transparent 25%),
            radial-gradient(circle at 18% 8%, rgba(122,231,255,.12), transparent 22%),
            linear-gradient(135deg, #020405, #07110d 48%, #010202);
          color: white;
        }

        .club-owner-profile-shell {
          position: relative;
          display: grid;
          min-height: 100dvh;
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
          align-items: start;
          width: min(1640px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 22px 0 72px;
        }

        .club-owner-profile-card {
          position: relative;
          position: sticky !important;
          top: 72px;
          width: min(100%, 318px);
          aspect-ratio: 3 / 4;
          filter: drop-shadow(0 30px 64px rgba(0,0,0,.56));
        }

        .club-owner-profile-card-inner {
          position: absolute;
          inset: 11.2% 13.2% 10.6%;
          overflow: hidden;
          border-radius: 22px;
          background: #030403;
          clip-path: inset(0 round 22px);
        }

        .club-owner-profile-avatar {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 42%;
          transform: scale(1.04);
        }

        .club-owner-profile-vignette {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0,0,0,.05) 0 42%, rgba(0,0,0,.28) 62%, rgba(0,0,0,.84) 100%),
            linear-gradient(90deg, rgba(0,0,0,.58), transparent 34%, transparent 66%, rgba(0,0,0,.6));
        }

        .club-owner-profile-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          pointer-events: none;
        }

        .club-owner-profile-points,
        .club-owner-profile-name,
        .club-owner-profile-card-stats {
          position: absolute;
          z-index: 2;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(0,0,0,.48);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
          backdrop-filter: blur(10px);
                  }

        .club-owner-profile-points {
          top: 10.5%;
          right: 12%;
          min-width: 72px;
          border-radius: 10px;
          padding: 7px 8px;
          text-align: center;
        }

        .club-owner-profile-points small,
        .club-owner-profile-nat small,
        .club-owner-profile-name small,
        .club-owner-profile-card-stats span {
          display: block;
          color: #b5ff4b;
          font-size: 8px;
          font-weight: 1000;        }

        .club-owner-profile-points strong {
          display: block;
          font-size: 28px;
          font-weight: 1000;
          line-height: .92;
        }

        .club-owner-profile-nat {
          position: absolute;
          z-index: 2;
          top: 12.2%;
          left: 12%;
          display: grid;
          justify-items: center;
          gap: 4px;
                  }

        .club-owner-profile-nat img {
          width: 52px;
          height: 34px;
          object-fit: cover;
          border-radius: 5px;
        }

        .club-owner-profile-nat strong {
          font-size: 10px;
          font-weight: 1000;        }

        .club-owner-profile-name {
          left: 50%;
          top: 45.8%;
          width: 76%;
          border-radius: 12px;
          padding: 11px 11px 12px;
          text-align: center;
          transform: translateX(-50%);
        }

        .club-owner-profile-name small {
          color: rgba(255,255,255,.72);
        }

        .club-owner-profile-name strong {
          display: block;
          font-size: 24px;
          font-weight: 1000;
          line-height: .98;
        }

        .club-owner-profile-card-stats {
          left: 50%;
          top: 58.7%;
          display: grid;
          width: 76%;
          grid-template-columns: .82fr .98fr 1.55fr;
          gap: 4px;
          border-radius: 12px;
          padding: 7px 5px;
          text-align: center;
          transform: translateX(-50%);
        }

        .club-owner-profile-card-stats div {
          min-width: 0;
          border-radius: 9px;
          background: rgba(255,255,255,.055);
          padding: 5px 3px;
        }

        .club-owner-profile-card-stats strong {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: clamp(17px, 2.4vw, 20px);
          font-weight: 1000;
          line-height: 1;
        }

        .club-owner-profile-card-trophies {
          position: absolute;
          z-index: 2;
          left: 50%;
          top: 73.8%;
          display: grid;
          width: 78%;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
          align-items: end;
          justify-items: center;
          transform: translateX(-50%);
        }

        .club-owner-profile-card-trophy {
          display: grid;
          min-height: 50px;
          justify-items: center;
          align-content: center;
          gap: 2px;
        }

        .club-owner-profile-card-trophy img {
          width: 42px;
          height: 42px;
          object-fit: contain;
          filter: drop-shadow(0 8px 12px rgba(0,0,0,.56));
        }

        .club-owner-profile-card-trophy strong {
          font-size: 13px;
          font-weight: 1000;
          line-height: 1;
        }

        .club-owner-profile-card-trophy.is-empty {
          width: 26px;
          height: 26px;
          align-self: center;
          border: 0;
          background: transparent;
          opacity: 0;
        }

        .club-owner-profile-info {
          width: 100%;
          min-width: 0;
        }

        .club-owner-best-player {
          display: grid;
          justify-items: center;
          gap: 7px;
          color: white;
          text-decoration: none;
        }

        .club-owner-best-player-card {
          display: block;
          width: min(264px, 100%);
        }

        .club-owner-best-player-rendered {
          width: 100% !important;
          --touchline-card-static-scale: .85;
        }

        .club-owner-best-player-copy {
          display: grid;
          justify-items: center;
          gap: 2px;
        }

        .club-owner-best-player-copy strong {
          font-size: 13px;
          font-weight: 1000;
        }

        .club-owner-best-player-copy small {
          color: rgba(255,255,255,.52);
          font-size: 9px;
          font-weight: 850;
        }

        .club-owner-best-player-copy em {
          max-width: 260px;
          color: rgba(255,255,255,.36);
          font-size: 7.5px;
          font-style: normal;
          font-weight: 800;
          line-height: 1.25;
          text-align: center;
        }

        .club-owner-best-player > a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(163,255,18,.28);
          border-radius: 999px;
          padding: 0 12px;
          color: #eaffb8;
          background: rgba(163,255,18,.06);
          box-shadow: 0 0 14px rgba(163,255,18,.1);
          font-size: 8px;
          font-weight: 950;
          text-decoration: none;
        }

        .club-owner-best-player > a:hover {
          border-color: #a3ff12;
          box-shadow: 0 0 8px rgba(163,255,18,.62), 0 0 24px rgba(163,255,18,.24);
        }

        .club-owner-rank-deck,
        .club-owner-private {
          margin-top: 24px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 28px;
          background:
            linear-gradient(130deg, rgba(163,255,18,.065), transparent 34%),
            rgba(3,10,11,.91);
          box-shadow: 0 30px 86px rgba(0,0,0,.38), inset 0 0 0 1px rgba(255,255,255,.03), 0 0 36px rgba(163,255,18,.05);
          backdrop-filter: blur(22px);
        }

        .club-owner-rank-deck {
          display: grid;
          grid-template-columns: minmax(260px,.74fr) minmax(0,1.26fr);
          align-items: stretch;
        }

        .club-owner-rank-title {
          display: flex;
          min-width: 0;
          flex-direction: column;
          justify-content: center;
          padding: 28px 30px;
          border-right: 1px solid rgba(255,255,255,.08);
          background: radial-gradient(circle at 0 50%, rgba(163,255,18,.13), transparent 58%);
        }

        .club-owner-rank-title > span,
        .club-owner-private-heading > div:first-child > span,
        .club-owner-board-card-head > div > span {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #a3ff12;
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .club-owner-rank-title > span svg,
        .club-owner-private-heading svg,
        .club-owner-board-card-head svg {
          width: 16px;
          height: 16px;
          filter: drop-shadow(0 0 8px rgba(163,255,18,.72));
        }

        .club-owner-rank-title > strong {
          margin-top: 10px;
          font-size: clamp(21px,2.2vw,32px);
          line-height: 1;
        }

        .club-owner-rank-title > small {
          margin-top: 9px;
          color: rgba(255,255,255,.48);
          font-size: 10px;
          line-height: 1.5;
        }

        .club-owner-rank-metrics {
          display: grid;
          grid-template-columns: repeat(2,minmax(0,1fr)) auto;
          align-items: stretch;
        }

        .club-owner-rank-metrics article,
        .club-owner-rank-metrics > a {
          display: flex;
          min-width: 0;
          flex-direction: column;
          justify-content: center;
          padding: 22px 20px;
          border-right: 1px solid rgba(255,255,255,.07);
        }

        .club-owner-rank-metrics article span,
        .club-owner-rank-metrics article small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .club-owner-rank-metrics article span {
          color: rgba(122,231,255,.7);
          font-size: 8px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .club-owner-rank-metrics article strong {
          margin-top: 7px;
          color: white;
          font-size: 23px;
          line-height: 1;
        }

        .club-owner-rank-metrics article small {
          margin-top: 7px;
          color: rgba(255,255,255,.4);
          font-size: 8px;
        }

        .club-owner-rank-metrics > a {
          align-items: center;
          gap: 7px;
          border-right: 0;
          color: #efffb0;
          background: rgba(163,255,18,.055);
          font-size: 9px;
          font-weight: 950;
          text-align: center;
          text-decoration: none;
        }

        .club-owner-rank-metrics > a svg {
          width: 16px;
          height: 16px;
        }

        .club-owner-private {
          border-color: rgba(163,255,18,.2);
        }

        .club-owner-private-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 30px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          background:
            linear-gradient(115deg, rgba(163,255,18,.1), transparent 42%),
            repeating-linear-gradient(125deg, transparent 0 42px, rgba(255,255,255,.018) 43px 44px);
        }

        .club-owner-private-heading > div:first-child > strong {
          display: block;
          margin-top: 8px;
          font-size: clamp(30px,4vw,48px);
          line-height: .94;
          letter-spacing: -.035em;
        }

        .club-owner-private-heading > div:first-child > small {
          display: block;
          max-width: 720px;
          margin-top: 10px;
          color: rgba(255,255,255,.52);
          font-size: 11px;
          line-height: 1.55;
        }

        .club-owner-private-security {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(163,255,18,.28);
          border-radius: 16px;
          background: rgba(2,10,8,.7);
          padding: 12px 14px;
          box-shadow: 0 0 22px rgba(163,255,18,.07);
        }

        .club-owner-private-security > svg {
          width: 24px;
          height: 24px;
          color: #a3ff12;
        }

        .club-owner-private-security span,
        .club-owner-private-security strong,
        .club-owner-private-security small {
          display: block;
        }

        .club-owner-private-security strong { font-size: 10px; }
        .club-owner-private-security small { margin-top: 3px; color: rgba(255,255,255,.4); font-size: 8px; }

        .club-owner-control-nav {
          display: grid;
          grid-template-columns: repeat(5,minmax(0,1fr));
          gap: 1px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.07);
        }

        .club-owner-control-nav > a {
          display: grid;
          grid-template-columns: 34px minmax(0,1fr);
          gap: 10px;
          align-items: center;
          min-height: 78px;
          padding: 14px 16px;
          color: white;
          background: rgba(3,10,11,.96);
          text-decoration: none;
          transition: background .16s ease, color .16s ease;
        }

        .club-owner-control-nav > a:hover {
          color: #efffb0;
          background: rgba(163,255,18,.075);
        }

        .club-owner-control-nav > a > svg {
          width: 26px;
          height: 26px;
          padding: 5px;
          border: 1px solid rgba(163,255,18,.25);
          border-radius: 9px;
          color: #a3ff12;
          background: rgba(163,255,18,.06);
          filter: drop-shadow(0 0 7px rgba(163,255,18,.38));
        }

        .club-owner-control-nav span,
        .club-owner-control-nav strong,
        .club-owner-control-nav small { display: block; min-width: 0; }
        .club-owner-control-nav span { font-size: 10px; font-weight: 1000; }
        .club-owner-control-nav small { margin-top: 4px; overflow: hidden; color: rgba(255,255,255,.4); font-size: 7px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }

        .club-owner-board-grid {
          display: grid;
          grid-template-columns: minmax(0,1.35fr) minmax(310px,.65fr);
          gap: 14px;
          padding: 18px;
        }

        .club-owner-board-grid > article {
          min-width: 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 20px;
          background:
            linear-gradient(145deg, rgba(122,231,255,.035), transparent 44%),
            rgba(2,8,9,.78);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 18px 42px rgba(0,0,0,.2);
        }

        .club-owner-finance {
          grid-row: span 2;
          padding: 22px;
        }

        .club-owner-training,
        .club-owner-contracts {
          padding: 18px;
        }

        .club-owner-board-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .club-owner-board-card-head > div > strong {
          display: block;
          margin-top: 7px;
          color: white;
          font-size: 20px;
          line-height: 1;
        }

        .club-owner-board-card-head > b {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(163,255,18,.24);
          border-radius: 999px;
          background: rgba(163,255,18,.07);
          padding: 7px 9px;
          color: #a3ff12;
          font-size: 7px;
          text-transform: uppercase;
        }

        .club-owner-board-card-head > b svg { width: 11px; height: 11px; }

        .club-owner-add-funds { position: relative; flex: 0 0 auto; }
        .club-owner-add-funds summary {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(163,255,18,.48);
          border-radius: 11px;
          background: linear-gradient(135deg, rgba(163,255,18,.22), rgba(4,16,11,.88));
          padding: 0 13px;
          color: #efffb0;
          font-size: 9px;
          font-weight: 1000;
          list-style: none;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(163,255,18,.1);
        }
        .club-owner-add-funds summary::-webkit-details-marker { display: none; }
        .club-owner-add-funds summary svg { width: 15px; height: 15px; }
        .club-owner-add-funds > div {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 6;
          width: min(300px,75vw);
          border: 1px solid rgba(163,255,18,.32);
          border-radius: 16px;
          background: rgba(2,9,9,.98);
          padding: 16px;
          box-shadow: 0 24px 60px rgba(0,0,0,.55),0 0 30px rgba(163,255,18,.1);
        }
        .club-owner-add-funds > div strong { display: block; font-size: 13px; }
        .club-owner-add-funds > div p { margin: 8px 0 12px; color: rgba(255,255,255,.5); font-size: 9px; line-height: 1.5; }
        .club-owner-add-funds > div button { width: 100%; min-height: 36px; border: 1px solid rgba(255,255,255,.1); border-radius: 9px; color: rgba(255,255,255,.4); background: rgba(255,255,255,.04); font-size: 8px; font-weight: 900; }

        .club-owner-finance-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-top: 22px;
          border: 1px solid rgba(163,255,18,.18);
          border-radius: 18px;
          background:
            radial-gradient(circle at 85% 50%, rgba(163,255,18,.12), transparent 28%),
            rgba(0,0,0,.2);
          padding: 20px;
        }
        .club-owner-finance-hero span,.club-owner-finance-hero strong,.club-owner-finance-hero small { display:block; }
        .club-owner-finance-hero > div:first-child > span { color: rgba(122,231,255,.68); font-size: 8px; font-weight: 950; text-transform:uppercase; }
        .club-owner-finance-hero > div:first-child > strong { margin-top:7px; font-size:clamp(34px,4vw,54px); line-height:.9; }
        .club-owner-finance-hero > div:first-child > small { margin-top:9px; color:rgba(255,255,255,.42); font-size:9px; }

        .club-owner-budget-ring {
          display:grid;
          width:100px;
          height:100px;
          place-items:center;
          flex:0 0 auto;
          border-radius:50%;
          background: conic-gradient(#a3ff12 var(--budget-used),rgba(255,255,255,.08) 0);
          box-shadow:0 0 28px rgba(163,255,18,.13);
        }
        .club-owner-budget-ring::before { content:""; grid-area:1/1; width:78px; height:78px; border-radius:50%; background:#06100d; box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
        .club-owner-budget-ring > span { position:relative; grid-area:1/1; text-align:center; }
        .club-owner-budget-ring strong { font-size:20px; }
        .club-owner-budget-ring small { margin-top:2px; color:rgba(255,255,255,.4); font-size:7px; text-transform:uppercase; }

        .club-owner-ledger {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:8px;
          margin-top:12px;
        }
        .club-owner-ledger > div { min-width:0; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(255,255,255,.025); padding:12px; }
        .club-owner-ledger span,.club-owner-ledger strong,.club-owner-ledger small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-owner-ledger span { color:rgba(255,255,255,.45); font-size:7px; font-weight:900; text-transform:uppercase; }
        .club-owner-ledger strong { margin-top:7px; color:white; font-size:17px; }
        .club-owner-ledger small { margin-top:5px; color:rgba(122,231,255,.5); font-size:7px; }
        .club-owner-budget-bar,.club-owner-contract-progress { height:6px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.07); }
        .club-owner-budget-bar { margin-top:15px; }
        .club-owner-budget-bar span,.club-owner-contract-progress span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#a3ff12,#63e8ff); box-shadow:0 0 13px rgba(163,255,18,.42); }
        .club-owner-finance footer { display:flex; justify-content:space-between; gap:16px; margin-top:11px; color:rgba(255,255,255,.38); font-size:8px; }
        .club-owner-finance footer span { color:rgba(163,255,18,.72); font-weight:950; text-transform:uppercase; }

        .club-owner-training-metrics,.club-owner-contract-numbers { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin-top:17px; }
        .club-owner-training-metrics > div,.club-owner-contract-numbers > div { min-width:0; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.025); padding:11px 8px; text-align:center; }
        .club-owner-training-metrics strong,.club-owner-training-metrics span,.club-owner-contract-numbers strong,.club-owner-contract-numbers span { display:block; }
        .club-owner-training-metrics strong,.club-owner-contract-numbers strong { color:white; font-size:18px; }
        .club-owner-training-metrics span,.club-owner-contract-numbers span { margin-top:4px; overflow:hidden; color:rgba(255,255,255,.4); font-size:7px; font-weight:850; text-overflow:ellipsis; white-space:nowrap; }
        .club-owner-training p { margin:14px 0 0; color:rgba(255,255,255,.46); font-size:9px; line-height:1.5; }
        .club-owner-training > a,.club-owner-contracts > a { display:flex; min-height:36px; align-items:center; justify-content:space-between; gap:8px; margin-top:14px; border:1px solid rgba(163,255,18,.2); border-radius:10px; padding:0 11px; color:#efffb0; background:rgba(163,255,18,.055); font-size:8px; font-weight:950; text-decoration:none; }
        .club-owner-training > a svg,.club-owner-contracts > a svg { width:14px; height:14px; }
        .club-owner-contract-progress { margin-top:20px; }

        .club-owner-squad-command {
          margin: 0 18px 18px;
          overflow: hidden;
          border: 1px solid rgba(163,255,18,.18);
          border-radius: 22px;
          background: rgba(2,8,9,.76);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 22px 50px rgba(0,0,0,.24);
        }

        .club-owner-squad-command > header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 20px 22px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          background: linear-gradient(110deg, rgba(163,255,18,.075), transparent 48%);
        }

        .club-owner-squad-command > header span,
        .club-owner-squad-command > header strong,
        .club-owner-squad-command > header small { display: block; }
        .club-owner-squad-command > header span { display: flex; align-items: center; gap: 7px; color: #a3ff12; font-size: 8px; font-weight: 950; text-transform: uppercase; }
        .club-owner-squad-command > header span svg { width: 14px; height: 14px; }
        .club-owner-squad-command > header strong { margin-top: 7px; font-size: 24px; line-height: 1; }
        .club-owner-squad-command > header small { max-width: 650px; margin-top: 8px; color: rgba(255,255,255,.45); font-size: 9px; line-height: 1.45; }
        .club-owner-squad-command > header > a { display: inline-flex; min-height: 42px; flex: 0 0 auto; align-items: center; gap: 8px; border: 1px solid rgba(163,255,18,.42); border-radius: 12px; padding: 0 15px; color: #f0ffbd; background: linear-gradient(135deg, rgba(163,255,18,.16), rgba(3,14,10,.9)); font-size: 9px; font-weight: 950; text-decoration: none; box-shadow: 0 0 22px rgba(163,255,18,.09); }
        .club-owner-squad-command > header > a svg { width: 15px; height: 15px; }

        .club-owner-squad-pitch {
          position: relative;
          width: calc(100% - 36px);
          min-height: 540px;
          margin: 18px;
          overflow: hidden;
          border-radius: 20px;
        }
        .club-owner-squad-pitch > p { display: grid; position: absolute; inset: 0; place-items: center; margin: 0; color: rgba(255,255,255,.62); font-size: 12px; font-weight: 850; }

        .club-owner-squad-pitch-card {
          position: absolute;
          left: var(--squad-x);
          top: var(--squad-y);
          width: clamp(62px, 6.4vw, 78px);
          color: white;
          text-align: center;
          text-decoration: none;
          transform: translate(-50%,-50%);
        }
        .club-owner-squad-pitch-card > span,
        .club-owner-squad-card-row a > span { display: block; position: relative; aspect-ratio: 3 / 4; }
        .club-owner-squad-pitch-card > span > div,
        .club-owner-squad-card-row a > span > div { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
        .club-owner-squad-pitch-card strong,
        .club-owner-squad-card-row a > strong { display: block; margin-top: 3px; overflow: hidden; color: rgba(255,255,255,.86); font-size: 7px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }

        .club-owner-squad-row-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 22px 10px; }
        .club-owner-squad-row-heading span { color: #a3ff12; font-size: 9px; font-weight: 950; text-transform: uppercase; }
        .club-owner-squad-row-heading strong { color: rgba(255,255,255,.52); font-size: 9px; }
        .club-owner-unified-bench { display: grid; gap: 12px; padding-bottom: 24px; }
        .club-owner-bench-position { display: grid; gap: 6px; }
        .club-owner-bench-position > header { display: flex; align-items: center; justify-content: space-between; padding: 0 22px; color: rgba(255,255,255,.56); font-size: 8px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .club-owner-bench-position > header span { color: #a3ff12; }
        .club-owner-squad-card-row { display: grid; grid-template-columns: repeat(9,minmax(72px,1fr)); gap: 8px; overflow-x: auto; padding: 0 18px; scrollbar-width: thin; }
        .club-owner-squad-card-row a { min-width: 72px; color: white; text-align: center; text-decoration: none; }

        .club-owner-profile-commands {
          margin-top: 14px;
          border: 1px solid rgba(181,255,75,.2);
          border-radius: 16px;
          background: rgba(0,0,0,.24);
          padding: 14px;
        }

        .club-owner-profile-command-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 9px;
          padding-top: 12px;
        }

        .club-owner-profile-command-grid > a {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          min-height: 66px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 10px;
          background: rgba(7,14,13,.72);
          padding: 10px 12px;
          color: white;
          text-decoration: none;
          transition: border-color .18s ease, background .18s ease, transform .18s ease;
        }

        .club-owner-profile-command-grid > a:hover,
        .club-owner-profile-command-grid > a:focus-visible {
          border-color: rgba(214,172,94,.5);
          background: linear-gradient(135deg, rgba(190,140,59,.075), rgba(244,207,120,.02));
          box-shadow: 0 8px 22px rgba(0,0,0,.22), inset 0 0 14px rgba(255,212,121,.025);
          outline: none;
          transform: translateY(-2px);
        }

        .club-owner-profile-command-grid > a > svg:first-child {
          color: #d6ac62;
          filter: drop-shadow(0 0 4px rgba(244,207,120,.22));
        }

        .club-owner-profile-command-grid > a > span {
          display: grid;
          gap: 5px;
          min-width: 0;
        }

        .club-owner-profile-command-grid strong {
          font-size: 13px;
          font-weight: 1000;
          line-height: 1;
        }

        .club-owner-profile-command-grid small {
          display: -webkit-box;
          overflow: hidden;
          color: rgba(255,255,255,.55);
          font-size: 9px;
          font-weight: 800;
          line-height: 1.3;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .club-owner-profile-command-arrow {
          color: rgba(255,255,255,.48);
        }

        .club-owner-profile-info > p,
        .club-owner-profile-info > span {
          color: #b5ff4b;
          font-size: 11px;
          font-weight: 1000;                  }

        .club-owner-profile-info > h1 {
          margin: 8px 0 22px;
          font-size: clamp(42px, 6vw, 84px);
          font-weight: 1000;
          line-height: .9;        }

        .club-owner-profile-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .club-owner-profile-stats div,
        .club-owner-profile-trophy,
        .club-owner-profile-squad {
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 14px;
          background: rgba(0,0,0,.28);
          padding: 14px;
        }

        .club-owner-profile-stats strong {
          display: block;
          margin-top: 7px;
          font-size: clamp(20px, 3vw, 36px);
          font-weight: 1000;
          line-height: 1;
        }

        .club-owner-profile-trophy-gallery {
          margin-top: 14px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 16px;
          background: rgba(0,0,0,.24);
          padding: 14px;
        }

        .club-owner-profile-club-control {
          margin-top: 14px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 18px;
          background:
            radial-gradient(circle at 84% 20%, rgba(122,231,255,.1), transparent 30%),
            radial-gradient(circle at 18% 80%, rgba(181,255,75,.1), transparent 34%),
            rgba(0,0,0,.26);
          padding: 14px;
        }

        .club-owner-profile-gallery-heading {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: end;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255,255,255,.1);
        }

        .club-owner-profile-gallery-heading strong {
          font-size: 16px;
          font-weight: 1000;
                  }

        .club-owner-profile-trophy-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 12px;
          padding-top: 12px;
        }

        .club-owner-profile-trophy {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 14px;
          align-items: center;
          min-height: 132px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 14px;
          background:
            radial-gradient(circle at 18% 28%, rgba(181,255,75,.12), transparent 38%),
            rgba(0,0,0,.28);
          padding: 14px;
        }

        .club-owner-profile-trophy img {
          width: clamp(92px, 10vw, 120px);
          height: clamp(92px, 10vw, 120px);
          object-fit: contain;
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.5));
        }

        .club-owner-profile-trophy strong,
        .club-owner-profile-squad strong {
          display: block;
          margin-top: 4px;
          font-size: 20px;
          font-weight: 1000;
        }

        .club-owner-profile-trophy small {
          display: block;
          margin-top: 6px;
          color: rgba(255,255,255,.68);
          font-size: 11px;
          font-weight: 900;                  }

        .club-owner-profile-control-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
          padding-top: 12px;
        }

        .club-owner-profile-control-grid article {
          min-width: 0;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 13px;
          background: rgba(0,0,0,.25);
          padding: 11px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }

        .club-owner-profile-control-grid strong {
          display: block;
          margin-top: 8px;
          font-size: clamp(18px, 2vw, 28px);
          font-weight: 1000;
          line-height: 1;
        }

        .club-owner-profile-control-grid small {
          display: block;
          margin-top: 8px;
          color: rgba(255,255,255,.52);
          font-size: 9px;
          font-weight: 900;
          line-height: 1.28;
                  }

        .club-owner-profile-matchday {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 12px;
        }

        .club-owner-profile-matchday-nav {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 9px;
          margin-top: 14px;
        }

        .club-owner-profile-matchday-nav a {
          position: relative;
          display: flex;
          min-width: 0;
          min-height: 52px;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          overflow: hidden;
          border: 1px solid rgba(202,155,73,.36);
          border-radius: 13px;
          background:
            linear-gradient(120deg, rgba(186,135,53,.08), transparent 48%),
            rgba(4,4,3,.78);
          padding: 10px 13px;
          color: #fff4d5;
          text-decoration: none;
          box-shadow: 0 8px 20px rgba(0,0,0,.14), inset 0 0 0 1px rgba(255,255,255,.018);
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
        }

        .club-owner-profile-matchday-nav a::before {
          position: absolute;
          inset: 0 auto 0 0;
          width: 2px;
          background: linear-gradient(180deg, #f0cc7b, #b9812f);
          box-shadow: 0 0 7px 1px rgba(240,204,123,.26);
          content: "";
        }

        .club-owner-profile-matchday-nav a:hover,
        .club-owner-profile-matchday-nav a:focus-visible {
          border-color: rgba(231,194,121,.6);
          background:
            linear-gradient(120deg, rgba(190,140,59,.12), rgba(244,207,120,.018) 58%),
            rgba(8,6,3,.9);
          box-shadow: 0 10px 24px rgba(0,0,0,.25), inset 0 0 16px rgba(255,213,126,.03);
          outline: none;
          transform: translateY(-2px);
        }

        .club-owner-profile-matchday-nav span {
          overflow: hidden;
          color: #dfbd78;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-shadow: 0 0 6px rgba(240,204,123,.16);
        }

        .club-owner-profile-matchday-nav strong {
          flex: none;
          color: white;
          font-size: 16px;
          font-weight: 1000;
        }

        .club-owner-profile-matchday > div {
          min-width: 0;
          overflow: visible;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 14px;
          background: rgba(0,0,0,.22);
          padding: 11px;
          scroll-margin-top: 16px;
        }

        .club-owner-profile-card-shelf {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        .club-owner-profile-card-shelf.is-xi {
          grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
        }

        .club-owner-profile-shelf-card {
          position: relative;
          display: grid;
          min-width: 0;
          justify-items: center;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 12px;
          background:
            radial-gradient(circle at 50% 0%, rgba(181,255,75,.1), transparent 34%),
            rgba(0,0,0,.22);
          padding: 9px 7px 8px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }

        .club-owner-profile-shelf-rendered-card {
          width: min(96px, 100%) !important;
          height: auto !important;
          min-width: 0 !important;
        }

        .club-owner-profile-shelf-card strong {
          display: grid;
          justify-items: center;
          gap: 4px;
          width: 100%;
          margin-top: 7px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: white;
          font-size: 11px;
          font-weight: 1000;
          line-height: 1;
                  }

        .club-owner-profile-shelf-card strong small {
          border-radius: 999px;
          background: rgba(181,255,75,.14);
          padding: 5px 7px;
          color: #dfff95;
          font-size: 8px;
          font-weight: 1000;
        }

        .club-owner-profile-squad {
          margin-top: 14px;
          border-radius: 18px;
          background:
            radial-gradient(circle at 20% 10%, rgba(181,255,75,.12), transparent 30%),
            linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
            rgba(0,0,0,.28);
        }

        .club-owner-profile-squad-heading {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: end;
          border-bottom: 1px solid rgba(255,255,255,.1);
          padding-bottom: 12px;
        }

        .club-owner-profile-squad-heading strong {
          display: block;
          margin-top: 5px;
          color: white;
          font-size: 24px;
          font-weight: 1000;
          line-height: 1;
                  }

        .club-owner-profile-squad-heading small {
          max-width: 330px;
          color: rgba(255,255,255,.58);
          font-size: 10px;
          font-weight: 900;          line-height: 1.35;
          text-align: right;
                  }

        .club-owner-profile-squad-actions {
          display: grid;
          justify-items: end;
          gap: 8px;
        }

        .club-owner-profile-squad-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border: 1px solid rgba(181,255,75,.34);
          border-radius: 999px;
          background: rgba(181,255,75,.12);
          color: #efff9b;
          padding: 0 12px;
          text-decoration: none;
                    white-space: nowrap;
          font-size: 9px;
          font-weight: 1000;        }

        .club-owner-profile-featured-cards {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 10px;
          padding-top: 14px;
        }

        .club-owner-profile-featured-card {
          position: relative;
          min-width: 0;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 0%, rgba(181,255,75,.11), transparent 34%),
            rgba(0,0,0,.24);
          padding: 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
        }

        .club-owner-profile-card-rank {
          position: absolute;
          z-index: 2;
          top: 8px;
          left: 8px;
          border-radius: 999px;
          background: rgba(0,0,0,.64);
          padding: 5px 7px;
          color: #b5ff4b;
          font-size: 9px;
          font-weight: 1000;        }

        .club-owner-profile-card-preview {
          display: grid;
          min-height: 176px;
          place-items: center;
          overflow: visible;
        }

        .club-owner-profile-rendered-card {
          width: min(118px, 100%) !important;
          height: auto !important;
          min-width: 0 !important;
        }

        .club-owner-profile-card-meta {
          display: grid;
          gap: 4px;
          margin-top: 8px;
          min-width: 0;
        }

        .club-owner-profile-card-meta a {
          display: flex;
          min-height: 44px;
          align-items: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #fff;
          font-size: 14px;
          font-weight: 1000;
          line-height: 1;
          text-decoration: none;
                  }

        .club-owner-profile-card-meta a:hover {
          color: #b5ff4b;
        }

        .club-owner-profile-card-meta span,
        .club-owner-profile-card-meta small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.58);
          font-size: 9px;
          font-weight: 900;                  }

        .club-owner-profile-card-meta small {
          color: #b5ff4b;
        }

        .club-owner-profile-squad-table {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          max-height: 310px;
          overflow: auto;
          padding-right: 4px;
          scrollbar-color: rgba(181,255,75,.44) rgba(255,255,255,.08);
        }

        .club-owner-profile-collection-details {
          margin-top: 16px;
          border: 1px solid rgba(163,255,18,.2);
          border-radius: 16px;
          background: rgba(3,11,10,.72);
        }

        .club-owner-profile-collection-details > summary {
          display: flex;
          min-height: 52px;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 18px;
          color: rgba(255,255,255,.72);
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          cursor: pointer;
          list-style: none;
        }

        .club-owner-profile-collection-details > summary::-webkit-details-marker { display: none; }
        .club-owner-profile-collection-details > summary strong { color: #a3ff12; font-size: 10px; }
        .club-owner-profile-collection-details[open] > summary { border-bottom: 1px solid rgba(255,255,255,.08); }
        .club-owner-profile-collection-details .club-owner-profile-squad-table { margin: 12px; }

        .club-owner-profile-player-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 42px minmax(86px, .8fr) auto;
          gap: 8px;
          align-items: center;
          min-height: 48px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 12px;
          background: rgba(0,0,0,.24);
          padding: 8px 10px;
          color: white;
          text-decoration: none;
        }

        .club-owner-profile-player-row span {
          color: rgba(181,255,75,.8);        }

        .club-owner-profile-player-row strong,
        .club-owner-profile-player-row small {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .club-owner-profile-player-row strong {
          font-size: 13px;
          font-weight: 1000;
                  }

        .club-owner-profile-player-row em,
        .club-owner-profile-player-row b {
          font-size: 10px;
          font-style: normal;
          font-weight: 1000;
                  }

        .club-owner-profile-player-row small {
          color: rgba(255,255,255,.56);
          font-size: 10px;
          font-weight: 900;
        }

        .club-owner-profile-player-row b {
          justify-self: end;
          color: #b5ff4b;
        }

        @media (max-width: 1100px) {
          .club-owner-rank-deck {
            grid-template-columns: 1fr;
          }

          .club-owner-rank-title {
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,.08);
          }

          .club-owner-control-nav {
            grid-template-columns: repeat(3,minmax(0,1fr));
          }

          .club-owner-board-grid {
            grid-template-columns: 1fr;
          }

          .club-owner-finance {
            grid-row: auto;
          }

          .club-owner-profile-command-grid {
            grid-template-columns: 1fr;
          }

          .club-owner-profile-command-grid > a {
            min-height: 58px;
          }

          .club-owner-squad-pitch { min-height: 460px; }
          .club-owner-squad-pitch-card { width: 72px; }
        }

        @media (max-width: 760px) {
          .club-owner-profile-shell {
            grid-template-columns: 1fr;
            justify-items: center;
            width: min(100% - 22px, 1640px);
          }

          .club-owner-profile-info {
            width: 100%;
          }

          .club-owner-best-player-card {
            width: min(217px, 70vw);
          }

          .club-owner-rank-title,
          .club-owner-private-heading {
            padding: 22px 18px;
          }

          .club-owner-rank-metrics {
            grid-template-columns: repeat(2,minmax(0,1fr));
          }

          .club-owner-rank-metrics > a {
            min-height: 62px;
          }

          .club-owner-private-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .club-owner-private-security {
            width: 100%;
          }

          .club-owner-control-nav {
            grid-template-columns: 1fr 1fr;
          }

          .club-owner-control-nav > a {
            min-height: 70px;
          }

          .club-owner-board-grid {
            padding: 12px;
          }

          .club-owner-squad-command { margin: 0 12px 12px; border-radius: 17px; }
          .club-owner-squad-command > header { align-items: stretch; flex-direction: column; padding: 17px; }
          .club-owner-squad-command > header > a { justify-content: center; }
          .club-owner-squad-pitch { width: calc(100% - 20px); min-height: 360px; margin: 10px; border-radius: 14px; }
          .club-owner-squad-pitch-card { width: 52px; }
          .club-owner-squad-pitch-card strong { font-size: 5.5px; }
          .club-owner-squad-card-row { grid-template-columns: repeat(9,64px); gap: 6px; padding-inline: 10px; }
          .club-owner-bench-position > header { padding-inline: 10px; }

          .club-owner-finance,
          .club-owner-training,
          .club-owner-contracts {
            padding: 16px;
          }

          .club-owner-board-card-head {
            flex-direction: column;
          }

          .club-owner-add-funds {
            width: 100%;
          }

          .club-owner-add-funds summary {
            justify-content: center;
          }

          .club-owner-finance-hero {
            align-items: flex-start;
          }

          .club-owner-budget-ring {
            width: 82px;
            height: 82px;
          }

          .club-owner-budget-ring::before {
            width: 64px;
            height: 64px;
          }

          .club-owner-budget-ring strong {
            font-size: 16px;
          }

          .club-owner-ledger {
            grid-template-columns: repeat(2,minmax(0,1fr));
          }

          .club-owner-finance footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .club-owner-profile-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .club-owner-profile-featured-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .club-owner-profile-squad-heading {
            align-items: start;
            flex-direction: column;
          }

          .club-owner-profile-squad-heading small {
            text-align: left;
          }

          .club-owner-profile-squad-actions {
            justify-items: start;
          }

          .club-owner-profile-squad-table {
            grid-template-columns: 1fr;
          }

          .club-owner-profile-control-grid,
          .club-owner-profile-matchday,
          .club-owner-profile-matchday-nav {
            grid-template-columns: 1fr;
          }

          .club-owner-profile-command-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element */

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  findTouchLineClub,
  squadCardToExactPlayer,
} from "@/lib/touchlineArena/demo-data";
import { createClient } from "@/lib/supabase/server";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineRankedCardCatalog } from "@/lib/touchlineArena/ranked-card-catalog-server";
import { compareTouchLineRankedCards } from "@/lib/touchlineArena/ranked-card-catalog";
import { normalizeTouchLineLocale, touchLineT } from "@/lib/touchlineArena/i18n";
import { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import { touchlineArenaContractHref, touchlineArenaPanelHref } from "@/lib/touchlineArena/arena-navigation";
import {
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "@/lib/touchlineArena/card-rules";
import { formatTouchlineEditorialCardPrice } from "@/lib/touchlineArena/editorial-card-profile";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";

export const metadata = {
  title: "TouchLine Player Cards Ranking",
};

// Ranking publication happens independently of application deployments. Keep
// this public read model live so a newly published V3 snapshot is never
// hidden behind a build-time preseason render.
export const dynamic = "force-dynamic";

export default async function TouchLinePlayerCardRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const activeRanking = await loadTouchLineActiveRanking();
  // This is the league-wide published-card ranking, never the signed-in
  // customer's private roster. Every surface receives the same V3 snapshot.
  const rosterCards = await loadTouchLineRankedCardCatalog(activeRanking);
  const rankedCards = rosterCards.sort(compareTouchLineRankedCards);
  const topCards = rankedCards.slice(0, 3);
  const topTwentyCards = rankedCards.slice(0, 20);
  const locale = normalizeTouchLineLocale((await searchParams).lang);
  const canEditCardEngine = Boolean(user && isOwnerEmail(user.email));
  const totalRatings = rankedCards.reduce((sum, card) => sum + (card.seasonTotalRating ?? 0), 0);
  const copy = getTouchLineRankingsCopy(locale);
  const localeQuery = `lang=${encodeURIComponent(locale)}`;
  const marketTransferHref = (clubSlug?: string) => {
    const marketHref = touchlineArenaPanelHref("market", locale);
    return clubSlug ? `${marketHref}&club=${encodeURIComponent(clubSlug)}` : marketHref;
  };
  const rankingModeLabel = activeRanking.phase === "ranked"
    ? (locale === "pt-BR" ? "Ordem por Nota TouchLine" : "TouchLine rating order")
    : copy.demoOrder;
  const editorialCopy = locale === "pt-BR"
    ? {
      rankingDescription: "O ranking reúne apenas cards TouchLine publicados e é ordenado pela soma das notas TouchLine verificadas. Tier e preço são definidos pelo processo de publicação do card.",
    }
    : {
      rankingDescription: "The ranking includes published TouchLine cards only and is ordered by the sum of verified TouchLine ratings. Tier and card price come from the card-publication process.",
    };
  const cardLabels = {
    nationality: touchLineT(locale, "nationalityShort"),
    totalRating: locale === "pt-BR" ? "Nota total" : "Total rating",
    cardPrice: locale === "pt-BR" ? "Preço do card" : "Card price",
  };
  const editorialPresentation = (card: (typeof rankedCards)[number]) => {
    const tierKey = card.editorialCard?.tierKey ?? null;
    const displayPrice = card.editorialCard
      ? formatTouchlineEditorialCardPrice(card.editorialCard.cardPrice, locale)
      : null;

    return {
      tierKey,
      displayPrice,
      activeContractCard: null,
    };
  };
  const zoomPresentation = (card: (typeof rankedCards)[number]) => {
    const presentation = editorialPresentation(card);
    const profileHref = touchlinePlayerProfileHref(squadCardToExactPlayer(card), locale);
    return {
      tierAccent: presentation.tierKey
        ? touchlineCardTierPalette(presentation.tierKey).accent
        : TOUCHLINE_NEUTRAL_CARD_ACCENT,
      tierLabel: presentation.tierKey ? touchlineCardTierName(presentation.tierKey, locale) : undefined,
      details: buildTouchlinePlayerCardZoomDetails({
        locale,
        name: card.name,
        clubName: card.clubName,
        position: card.position,
        nationality: card.countryCode3,
        editorialCard: card.editorialCard,
        cardReview: card.cardReview,
        activeContractCard: null,
        extraFields: [
          {
            label: locale === "pt-BR" ? "Nota total" : "Total rating",
            value: card.seasonTotalRating === null || card.seasonTotalRating === undefined
              ? "—"
              : String(card.seasonTotalRating),
            accent: true,
          },
          {
            label: locale === "pt-BR" ? "Nota da última partida" : "Last match rating",
            value: card.matchRating == null ? "—" : String(card.matchRating),
            accent: true,
            kind: "rating-last",
          },
          ...buildTouchlineVerifiedMatchFactFields({
            statistics: card.matchStats,
            position: card.position || card.role,
          }, locale),
        ],
        profileHref,
        cardEngineHref: canEditCardEngine
          ? touchlineCardEnginePlayerHref(card.canonicalPlayerId, locale)
          : null,
      }),
      activeContractPrice: undefined,
      displayPrice: presentation.displayPrice,
    };
  };

  return (
    <main className="tl-card-rankings">
      <TouchlineGlobalNavigation
        locale={locale}
        currentRoute="rankings"
        surface={resolveTouchlineGlobalNavigationSurface({
          isAuthenticated: Boolean(user),
          isAdmin: Boolean(user && isOwnerEmail(user.email)),
        })}
        className="tl-card-rankings-global-navigation"
      />

      <section className="tl-card-rankings-shell">
        <header className="tl-card-rankings-hero">
          <div>
            <span>TouchLine England</span>
            <h1>{copy.rankingTitle}</h1>
            <p>{editorialCopy.rankingDescription}</p>
          </div>
          <div className="tl-card-rankings-metrics" aria-label="TouchLine Player Cards Ranking summary">
            <article>
              <span>{copy.cards}</span>
              <strong>{rankedCards.length}</strong>
            </article>
            <article>
              <span>{locale === "pt-BR" ? "Soma das notas" : "Rating sum"}</span>
              <strong>{totalRatings.toFixed(2)}</strong>
            </article>
            <article className="is-mode">
              <span>{copy.mode}</span>
              <strong>{rankingModeLabel}</strong>
            </article>
          </div>
        </header>

        <section className="tl-card-rankings-featured" aria-label="Top ranked TouchLine player cards">
          {topCards.map((card, index) => {
            const club = findTouchLineClub(card.clubName);
            const exactPlayer = squadCardToExactPlayer(card);
            const zoom = zoomPresentation(card);
            const featuredSummary = [
              card.position,
              zoom.displayPrice,
              card.seasonTotalRating === null || card.seasonTotalRating === undefined
                ? null
                : `${locale === "pt-BR" ? "Nota total" : "Total rating"} ${card.seasonTotalRating}`,
            ].filter(Boolean).join(" / ");
            return (
              <article key={card.id} id={card.id}>
                <span className="tl-card-rankings-rank">#{index + 1}</span>
                <div className="tl-card-rankings-card">
                  <TouchlineCardZoom
                    ariaLabel={`${locale === "pt-BR" ? "Ampliar card de" : "Open card for"} ${card.name}`}
                    contractHref={zoom.activeContractPrice
                      ? touchlineArenaContractHref({
                        locale,
                        playerId: card.id,
                        playerName: card.name,
                        clubId: club?.teamId,
                      })
                      : undefined}
                    contractLabel={locale === "pt-BR" ? "Contratar" : "Contract player"}
                    contractValue={zoom.activeContractPrice}
                    contractTermLabel={zoom.activeContractPrice ? (locale === "pt-BR" ? "Contrato · 1 temporada" : "Contract · 1 season") : undefined}
                    tierAccent={zoom.tierAccent}
                    tierLabel={zoom.tierLabel}
                    details={zoom.details}
                    expandedContent={(
                      <TouchlineEliteExactCard
                        player={exactPlayer}
                        labels={cardLabels}
                        layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                        imageLoading="eager"
                        showCardActions
                        showProfileAction
                        forceNeonActive
                      />
                    )}
                  >
                    <TouchlineEliteExactCard
                      player={exactPlayer}
                      labels={cardLabels}
                      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                      imageLoading="lazy"
                      showProfileAction={false}
                      showSocialMetrics={false}
                    />
                  </TouchlineCardZoom>
                </div>
                <div className="tl-card-rankings-featured-copy">
                  <span>{club?.shortCode ?? card.clubName}</span>
                  <strong>{card.name}</strong>
                  <small>{featuredSummary}</small>
                  <div>
                    <a href={marketTransferHref(club?.slug)}>{copy.marketTransfer}</a>
                    {club ? <a href={`/touchline-clubs/${club.slug}?${localeQuery}`}>{copy.clubHub}</a> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="tl-card-rankings-board" aria-label="Full TouchLine player card ranking">
          <div className="tl-card-rankings-board-head">
            <div>
              <span>{copy.completeRanking}</span>
              <strong>{locale === "pt-BR" ? "Top 20 · cards oficiais" : "Top 20 · official cards"}</strong>
            </div>
            <small>{copy.connectedDescription}</small>
          </div>

          <div className="tl-card-rankings-list">
            {topTwentyCards.map((card, index) => {
              const club = findTouchLineClub(card.clubName);
              const exactPlayer = squadCardToExactPlayer(card);
              const zoom = zoomPresentation(card);
              return (
                <article key={card.id} id={`row-${card.id}`} className="tl-card-rankings-row">
                  <span className="tl-card-rankings-row-rank" aria-label={`${locale === "pt-BR" ? "Posição" : "Rank"} ${index + 1}`}>#{index + 1}</span>
                  <div className="tl-card-rankings-row-card">
                    <TouchlineCardZoom
                      ariaLabel={`${locale === "pt-BR" ? "Ampliar card de" : "Open card for"} ${card.name}`}
                      contractHref={zoom.activeContractPrice
                        ? touchlineArenaContractHref({
                          locale,
                          playerId: card.id,
                          playerName: card.name,
                          clubId: club?.teamId,
                        })
                        : undefined}
                      contractLabel={locale === "pt-BR" ? "Contratar" : "Contract player"}
                      contractValue={zoom.activeContractPrice}
                      contractTermLabel={zoom.activeContractPrice ? (locale === "pt-BR" ? "Contrato · 1 temporada" : "Contract · 1 season") : undefined}
                      tierAccent={zoom.tierAccent}
                      tierLabel={zoom.tierLabel}
                      details={zoom.details}
                      expandedContent={(
                        <TouchlineEliteExactCard
                          player={exactPlayer}
                          labels={cardLabels}
                          layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                          imageLoading="eager"
                          showCardActions
                          showProfileAction
                          forceNeonActive
                        />
                      )}
                    >
                      <TouchlineEliteExactCard
                        player={exactPlayer}
                        labels={cardLabels}
                        layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                        imageLoading="lazy"
                        showProfileAction={false}
                        showSocialMetrics={false}
                      />
                    </TouchlineCardZoom>
                  </div>
                  <div className="tl-card-rankings-row-main">
                    <strong>{card.name}</strong>
                    <small>{card.position} / #{card.shirtNumber} / {card.countryCode3}</small>
                  </div>
                  <div className="tl-card-rankings-club">
                    {club?.logoUrl ? <img src={club.logoUrl} alt="" draggable={false} /> : null}
                    <span>{club?.shortCode ?? card.clubName}</span>
                  </div>
                  <b aria-label={`${locale === "pt-BR" ? "Nota total" : "Total rating"} ${card.seasonTotalRating ?? "—"}`}>{card.seasonTotalRating ?? "—"}</b>
                  {zoom.displayPrice ? <em>{zoom.displayPrice}</em> : null}
                  <div className="tl-card-rankings-actions">
                    <a href={marketTransferHref(club?.slug)}>{copy.marketTransfer}</a>
                    {club ? <a href={`/touchline-clubs/${club.slug}?${localeQuery}`}>{copy.club}</a> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <style>{`
        .tl-card-rankings {
          min-height: 100dvh;
          color: #f8fff5;
          background:
            radial-gradient(circle at 18% 14%, rgba(122,231,255,.16), transparent 28%),
            radial-gradient(circle at 82% 10%, rgba(181,255,75,.14), transparent 24%),
            linear-gradient(135deg, #020707 0%, #06120d 48%, #020403 100%);
          padding: 42px 5vw 68px;
        }

        .tl-card-rankings-back,
        .tl-card-rankings a {
          text-decoration: none;
        }

        .tl-card-rankings-global-navigation {
          width: min(1540px, 100%);
        }

        .tl-card-rankings-back {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          border: 1px solid rgba(181,255,75,.42);
          border-radius: 999px;
          padding: 0 22px;
          color: #dfff9b;
                    font-size: 11px;
          font-weight: 950;          background: rgba(8,15,12,.68);
        }

        .tl-card-rankings-shell {
          width: min(1540px, 100%);
          margin: 38px auto 0;
          display: grid;
          gap: 18px;
        }

        .tl-card-rankings-hero,
        .tl-card-rankings-featured article,
        .tl-card-rankings-board {
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(4,12,9,.76), rgba(12,28,18,.58));
          box-shadow: 0 30px 90px rgba(0,0,0,.38);
          backdrop-filter: blur(18px);
        }

        .tl-card-rankings-hero {
          min-height: 320px;
          padding: clamp(24px, 4vw, 52px);
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(360px, .72fr);
          gap: 28px;
          align-items: end;
          overflow: hidden;
          position: relative;
        }

        .tl-card-rankings-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(181,255,75,.16), transparent 44%);
          pointer-events: none;
        }

        .tl-card-rankings-hero > * {
          position: relative;
          z-index: 1;
        }

        .tl-card-rankings span,
        .tl-card-rankings-board-head small {
          color: #b6ff4d;
                    font-size: 11px;
          font-weight: 950;        }

        .tl-card-rankings h1 {
          max-width: 880px;
          margin: 14px 0;
          font-size: 62px;
          line-height: 1;
        }

        .tl-card-rankings p {
          max-width: 720px;
          margin: 0;
          color: rgba(255,255,255,.68);
          font-size: 15px;
          line-height: 1.7;
          font-weight: 800;
        }

        .tl-card-rankings-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
        }

        .tl-card-rankings-metrics article {
          min-height: 112px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: rgba(0,0,0,.22);
          padding: 18px;
        }

        .tl-card-rankings-metrics strong {
          display: block;
          margin-top: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: clamp(26px, 3vw, 46px);
          line-height: 1;
        }

        .tl-card-rankings-metrics .is-mode strong {
          overflow: visible;
          font-size: clamp(20px, 2.2vw, 34px);
          line-height: 1.08;
          white-space: normal;
        }

        .tl-card-rankings-featured {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .tl-card-rankings-featured article {
          position: relative;
          min-height: 520px;
          padding: 20px;
          display: grid;
          grid-template-rows: minmax(320px, 1fr) auto;
          justify-items: center;
          overflow: hidden;
        }

        .tl-card-rankings-rank {
          position: absolute;
          left: 18px;
          top: 18px;
          z-index: 2;
          border: 1px solid rgba(181,255,75,.28);
          border-radius: 999px;
          background: rgba(0,0,0,.48);
          padding: 8px 11px;
        }

        .tl-card-rankings-card {
          width: min(280px, 82%);
          align-self: center;
        }

        .tl-card-rankings-card > div,
        .tl-card-rankings-row-card > div {
          width: 100% !important;
          height: auto !important;
          transform: none !important;
        }

        .tl-card-rankings-featured-copy {
          width: 100%;
          display: grid;
          gap: 8px;
        }

        .tl-card-rankings-featured-copy strong,
        .tl-card-rankings-board-head strong {
          color: white;
          font-size: 26px;
          line-height: .95;
          font-weight: 1000;
                  }

        .tl-card-rankings-featured-copy small,
        .tl-card-rankings-row-main small {
          color: rgba(255,255,255,.58);
          font-size: 11px;
          font-weight: 850;
                  }

        .tl-card-rankings-featured-copy div,
        .tl-card-rankings-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tl-card-rankings-featured-copy a,
        .tl-card-rankings-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border: 1px solid rgba(181,255,75,.32);
          border-radius: 999px;
          background: rgba(181,255,75,.12);
          color: #efff9b;
          padding: 0 12px;
                    font-size: 9px;
          font-weight: 1000;        }

        .tl-card-rankings-board {
          padding: 22px;
        }

        .tl-card-rankings-board-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid rgba(255,255,255,.12);
          padding-bottom: 18px;
        }

        .tl-card-rankings-board-head > div > span {
          display: block;
          margin-bottom: 6px;
        }

        .tl-card-rankings-list {
          display: grid;
          gap: 10px;
          margin-top: 18px;
        }

        .tl-card-rankings-row {
          display: grid;
          grid-template-columns: 64px 86px minmax(0, 1fr) 126px auto auto auto;
          gap: 14px;
          align-items: center;
          min-height: 120px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: rgba(0,0,0,.18);
          padding: 12px 14px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.03);
        }

        .tl-card-rankings-row-rank {
          color: rgba(122,231,255,.82);
        }

        .tl-card-rankings-row-card {
          width: 74px;
        }

        .tl-card-rankings-row-main {
          min-width: 0;
        }

        .tl-card-rankings-row-main strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: white;
          font-size: 22px;
          line-height: 1;
          font-weight: 1000;
                  }

        .tl-card-rankings-club {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .tl-card-rankings-club img {
          width: 34px;
          height: 34px;
          object-fit: contain;
          filter: drop-shadow(0 4px 8px rgba(0,0,0,.42));
        }

        .tl-card-rankings-club span {
          color: rgba(255,255,255,.78);
        }

        .tl-card-rankings-row b,
        .tl-card-rankings-row em {
          border-radius: 999px;
          background: rgba(0,0,0,.24);
          padding: 9px 11px;
          color: #efff9b;
          font-size: 12px;
          font-style: normal;
          font-weight: 1000;
                    white-space: nowrap;
        }

        .tl-card-rankings-row em {
          color: white;
        }

        @media (max-width: 1100px) {
          .tl-card-rankings h1 {
            font-size: 52px;
          }
        }

        @media (max-width: 980px) {
          .tl-card-rankings {
            padding: 26px 16px 42px;
          }

          .tl-card-rankings-hero,
          .tl-card-rankings-featured,
          .tl-card-rankings-row {
            grid-template-columns: 1fr;
          }

          .tl-card-rankings-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tl-card-rankings-featured article {
            min-height: 460px;
          }

          .tl-card-rankings-board-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .tl-card-rankings-row {
            gap: 10px;
          }
        }

        @media (max-width: 760px) {
          .tl-card-rankings h1 {
            font-size: 44px;
          }
        }

        @media (max-height: 500px) and (orientation: landscape) {
          .tl-card-rankings h1 {
            font-size: 40px;
          }
        }
      `}</style>
    </main>
  );
}

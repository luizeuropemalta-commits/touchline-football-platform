/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import { TOUCHLINE_COACH_TIER_GALLERY } from "@/lib/touchlineArena/coach-tier-gallery";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import {
  selectTouchlineCoachTierRepresentatives,
  selectTouchlinePlayerTierRepresentatives,
} from "@/lib/touchlineArena/clubhub-tier-showcase";
import {
  TOUCHLINE_ENGLAND_CLUBS,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import { formatTouchlineMarketValueEur } from "@/lib/touchlineArena/editorial-card-profile";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import {
  touchlineCardTierName,
  touchlineCardTierPalette,
  type TouchlineCardTierKey,
} from "@/lib/touchlineArena/card-rules";

import styles from "./TouchlineCoachCategoryShowcase.module.css";

type Props = Readonly<{
  locale: string;
  playerCards: readonly ClubOwnerSquadCard[];
}>;

const copy = {
  "en-GB": {
    playerEyebrow: "TouchLine player borders",
    playerTitle: "Seven official player-card borders",
    playerDescription: "Ordered from the highest-value border to the entry border. Each card is a real published representative with the highest verified market value in its tier; Erling Haaland leads Diamond Gold.",
    coachEyebrow: "TouchLine coach borders",
    coachTitle: "Seven official coach-card borders",
    coachDescription: "Seven coach representatives are ordered by the approved previous-season finish and distributed from the highest-value border to the entry border. Coach name is the final tiebreak when records are equal.",
    verifiedValue: "Verified market value",
    previousFinish: "Previous-season finish",
    promotedChampion: "Promoted champion",
    promotedPlayoff: "Promoted through play-offs",
    approvedFallback: "Approved promotion fallback",
    representativePending: "Representative pending",
    representativePendingDescription: "No current coach has approved evidence for this border. TouchLine will not borrow another coach’s position.",
    playerPending: "Published representative pending",
    playerPendingDescription: "No published card currently owns this border.",
    openPlayer: "Open player profile",
    openCoach: "Open coach profile",
    sourceNote: "Only published player cards and immutable coach classifications appear here. Missing evidence remains explicit.",
  },
  "pt-BR": {
    playerEyebrow: "Bordas de jogadores TouchLine",
    playerTitle: "As sete bordas oficiais dos cards de jogadores",
    playerDescription: "Ordem da borda de maior valor até a borda de entrada. Cada card é um representante real publicado com o maior valor de mercado verificado do seu tier; Erling Haaland lidera o Diamante Dourado.",
    coachEyebrow: "Bordas de treinadores TouchLine",
    coachTitle: "As sete bordas oficiais dos cards de treinadores",
    coachDescription: "Sete representantes são ordenados pela posição aprovada da temporada anterior e distribuídos da borda de maior valor até a borda de entrada. O nome do treinador é o último desempate quando os resultados são iguais.",
    verifiedValue: "Valor de mercado verificado",
    previousFinish: "Posição na temporada anterior",
    promotedChampion: "Campeão promovido",
    promotedPlayoff: "Promovido pelos play-offs",
    approvedFallback: "Fallback de promoção aprovado",
    representativePending: "Representante pendente",
    representativePendingDescription: "Nenhum treinador atual possui evidência aprovada para esta borda. A TouchLine não empresta a posição de outro treinador.",
    playerPending: "Representante publicado pendente",
    playerPendingDescription: "Nenhum card publicado ocupa esta borda no momento.",
    openPlayer: "Abrir perfil do jogador",
    openCoach: "Abrir perfil do treinador",
    sourceNote: "Somente cards de jogadores publicados e classificações imutáveis de treinadores aparecem aqui. Evidência ausente permanece explícita.",
  },
} as const;

function tierStyle(tierKey: TouchlineCardTierKey) {
  const palette = touchlineCardTierPalette(tierKey);
  return {
    "--tier-accent": palette.accent,
    "--tier-secondary": palette.secondary,
  } as CSSProperties;
}

type ShowcaseDictionary = (typeof copy)[keyof typeof copy];
type CoachRepresentative = ReturnType<typeof selectTouchlineCoachTierRepresentatives>[number];

function coachEvidenceLabel(
  classification: NonNullable<CoachRepresentative["classification"]>,
  dictionary: ShowcaseDictionary,
) {
  if (classification.finalPosition) return `${dictionary.previousFinish}: ${classification.finalPosition}`;
  if (classification.promotionType === "champions") return `${dictionary.promotedChampion} · ${dictionary.approvedFallback}`;
  if (classification.promotionType === "playoff-winners") return `${dictionary.promotedPlayoff} · ${dictionary.approvedFallback}`;
  return dictionary.approvedFallback;
}

export default function TouchlineCoachCategoryShowcase({ locale, playerCards }: Props) {
  const effectiveLocale = locale === "pt-BR" ? "pt-BR" : "en-GB";
  const dictionary = copy[effectiveLocale];
  const playerRepresentatives = selectTouchlinePlayerTierRepresentatives(playerCards);
  const coachRepresentatives = selectTouchlineCoachTierRepresentatives();
  const galleryByTier = new Map(TOUCHLINE_COACH_TIER_GALLERY.map((item) => [item.tierKey, item]));

  return (
    <div className={styles.showcases}>
      <section className={styles.surface} aria-labelledby="touchline-player-border-title">
        <header className={styles.header}>
          <span className={styles.eyebrow}>{dictionary.playerEyebrow}</span>
          <h2 id="touchline-player-border-title">{dictionary.playerTitle}</h2>
          <p>{dictionary.playerDescription}</p>
        </header>

        <ul className={styles.grid} data-touchline-tier-order="highest-to-entry">
          {playerRepresentatives.map(({ tierKey, card }) => {
            const exactPlayer = card ? squadCardToExactPlayer(card) : null;
            const tierLabel = touchlineCardTierName(tierKey, effectiveLocale);
            const profileHref = exactPlayer ? touchlinePlayerProfileHref(exactPlayer, effectiveLocale) : null;
            return (
              <li key={tierKey} className={styles.card} style={tierStyle(tierKey)} data-tier={tierKey}>
                {exactPlayer && profileHref ? (
                  <Link className={styles.cardLink} href={profileHref} aria-label={`${dictionary.openPlayer}: ${card?.name}`}>
                    <span className={styles.playerCardVisual}>
                      <TouchlineEliteExactCard
                        player={exactPlayer}
                        imageLoading="lazy"
                        initialRenderScale={0.34}
                        optimizeForLiveCompact
                        runtimeLocaleOverride={effectiveLocale}
                        subscribeToRanking={false}
                        enableInteractiveNeon={false}
                        showCardActions={false}
                        showProfileAction={false}
                        showSocialMetrics={false}
                        rankingMode="live"
                      />
                    </span>
                    <span className={styles.identity}>
                      <small>{tierLabel}</small>
                      <strong>{card?.name}</strong>
                      <span>{card?.clubName}</span>
                      <em>{dictionary.verifiedValue}: {formatTouchlineMarketValueEur(card?.editorialCard?.marketValueEur ?? 0, effectiveLocale)}</em>
                    </span>
                  </Link>
                ) : (
                  <div className={styles.pendingCard}>
                    <img src={`/touchlineArena/frames/market-tiers/${tierKey}.png`} alt="" aria-hidden="true" />
                    <span className={styles.identity}>
                      <small>{tierLabel}</small>
                      <strong>{dictionary.playerPending}</strong>
                      <span>{dictionary.playerPendingDescription}</span>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.surface} aria-labelledby="touchline-coach-border-title">
        <header className={styles.header}>
          <span className={styles.eyebrow}>{dictionary.coachEyebrow}</span>
          <h2 id="touchline-coach-border-title">{dictionary.coachTitle}</h2>
          <p>{dictionary.coachDescription}</p>
        </header>

        <ul className={styles.grid} data-touchline-tier-order="highest-to-entry">
          {coachRepresentatives.map(({ tierKey, snapshot, classification }) => {
            const tierLabel = touchlineCardTierName(tierKey, effectiveLocale);
            const club = snapshot
              ? TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.teamId === snapshot.coach.teamId)
              : null;
            const gallery = galleryByTier.get(tierKey);
            const coachHref = snapshot
              ? `/touchline-coaches/${encodeURIComponent(snapshot.coach.providerId)}?lang=${encodeURIComponent(effectiveLocale)}`
              : null;
            const cardSlot = snapshot
              ? createTouchlineArenaCoachSlot(snapshot.coach, classification?.finalPosition ?? null, tierKey)
              : null;

            return (
              <li key={tierKey} className={styles.card} style={tierStyle(tierKey)} data-tier={tierKey}>
                {snapshot && classification && coachHref && cardSlot ? (
                  <Link className={styles.cardLink} href={coachHref} aria-label={`${dictionary.openCoach}: ${snapshot.coach.displayName}`}>
                    <span className={styles.coachCardVisual}>
                      <TouchlineCoachCard
                        coach={snapshot.coach}
                        slot={cardSlot}
                        clubName={club?.name ?? classification.sourceClub ?? "TouchLine England"}
                        clubLogoUrl={club?.logoUrl}
                        clubAccent={club?.accent}
                        countryCode3={snapshot.countryCode3}
                        locale={effectiveLocale}
                        displayMode="compact"
                        optimizeForLiveCompact
                        enableInteractiveNeon={false}
                        assetLoading="lazy"
                        frameLoading="lazy"
                      />
                    </span>
                    <span className={styles.identity}>
                      <small>{tierLabel}</small>
                      <strong>{snapshot.coach.displayName}</strong>
                      <span>{club?.name ?? classification.sourceClub ?? "TouchLine England"}</span>
                      <em>{coachEvidenceLabel(classification, dictionary)}</em>
                    </span>
                  </Link>
                ) : (
                  <div className={styles.pendingCard}>
                    {gallery ? <img src={gallery.compactArtUrl} alt="" aria-hidden="true" /> : null}
                    <span className={styles.identity}>
                      <small>{tierLabel}</small>
                      <strong>{dictionary.representativePending}</strong>
                      <span>{dictionary.representativePendingDescription}</span>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className={styles.note}>{dictionary.sourceNote}</p>
      </section>
    </div>
  );
}

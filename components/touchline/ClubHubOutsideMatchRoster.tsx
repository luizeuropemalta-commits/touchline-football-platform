import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { getTouchlineClubHubRosterCopy } from "@/lib/touchlineArena/club-hub-roster-i18n";
import { getTouchlinePublicErrorCopy } from "@/lib/touchlineArena/public-error-i18n";
import Link from "next/link";
import ClubHubSquadGrid from "@/components/touchline/ClubHubSquadGrid";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";

import styles from "./ClubHubOutsideMatchRoster.module.css";

type ClubHubOutsideMatchRosterProps = {
  clubName: string;
  cards: readonly ClubOwnerSquadCard[];
  locale: string;
  draftLocalesEnabled?: boolean;
  labels: { nationality: string; points: string; totalPoints: string; cardPrice: string; currentClub: string };
  squadUnavailable?: boolean;
  retryHref?: string;
  selectionState?: "unconfirmed" | "not_listed";
  /** Public ClubHub pages suppress values without changing ClubOwner or QA defaults. */
  hideMarketValuePanel?: boolean;
};

/**
 * Premium compact roster for players outside the displayed matchday group.
 * The canonical player cards remain linked and are rendered once, in this
 * surface, rather than duplicated in a second roster below.
 */
export default function ClubHubOutsideMatchRoster({
  clubName,
  cards,
  locale,
  draftLocalesEnabled = false,
  labels,
  squadUnavailable = false,
  retryHref,
  selectionState = "unconfirmed",
  hideMarketValuePanel = false,
}: ClubHubOutsideMatchRosterProps) {
  const copy = getTouchlineClubHubRosterCopy(locale, draftLocalesEnabled);
  const retryLabel = getTouchlinePublicErrorCopy(locale, draftLocalesEnabled).error.retry;
  const confirmed = selectionState === "not_listed";
  const title = confirmed
    ? copy.outsideNotListedTitle
    : copy.outsideOtherTitle;
  const description = confirmed
    ? copy.outsideNotListedDescription
    : copy.outsidePreviewDescription;
  const emptyTitle = squadUnavailable
    ? copy.squadUnavailableTitle
    : copy.outsideEmptyTitle;
  const emptyDescription = squadUnavailable
    ? copy.squadUnavailableDescription
    : copy.outsideEmptyDescription;

  return (
    <section id="club-squad" className={styles.shell} data-selection-state={selectionState} aria-label={`${clubName} ${title}`}>
      <TouchlineClubPerimeterTrace accent="#a3ff12" className={styles.perimeterTrace} />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{copy.squadEyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={styles.count} aria-label={copy.squadCount.replace("{count}", () => String(cards.length))}>
          {cards.length}
        </span>
      </header>

      {cards.length ? (
        <div className={styles.cards}>
          <ClubHubSquadGrid draftLocalesEnabled={draftLocalesEnabled}
            cards={[...cards]}
            locale={locale as TouchLineLocale}
            labels={labels}
            openProfileLabel={copy.openPlayerCard}
            initialCardCount={12}
            cardRenderScale={124 / 430}
            hideMarketValuePanel={hideMarketValuePanel}
            className={styles.cardGrid}
          />
        </div>
      ) : (
        <div className={styles.empty} role="status">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
          {squadUnavailable && retryHref ? <Link href={retryHref}>{retryLabel}</Link> : null}
        </div>
      )}
    </section>
  );
}

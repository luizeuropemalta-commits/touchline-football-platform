"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import { inspectClubAcquisition, type ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import { quoteClubReturn } from "@/lib/touchlineFantasy/club-market-rules";
import { getCoachReleaseReviewCopy } from "@/lib/touchlineFantasy/coach-release-review-i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import layout from "./ClubOwnerCollectionSlots.module.css";
import styles from "./ClubOwnerReleaseDialog.module.css";

type Props = Readonly<{
  /** Confirmed owned collection, supplied by the authenticated parent. */
  state: ClubAcquisitionState;
  coachName: string;
  locale: string;
  onClose: () => void;
}>;

/** Presentation only: no command, request, wallet update or confirmation callback. */
export function ClubOwnerCoachReleaseDialog(props: Props) {
  try {
    inspectClubAcquisition(props.state);
    if (props.state.plan === "beta" || !props.state.coach || !props.coachName.trim()) return null;
  } catch {
    return null;
  }
  return <CoachReleaseReview {...props} />;
}

function CoachReleaseReview({ state, coachName, locale, onClose }: Props) {
  const [review] = useState(() => {
    // The outer component rejects vacancy and malformed contracts before mounting.
    const coach = state.coach!;
    const quote = quoteClubReturn(coach.valueEur, state.plan, "ordinary");
    const projectedBalance = state.balanceEur + quote.refund;
    return { ...quote, coachId: coach.id, coachTier: coach.tier, coachName,
      paid: coach.valueEur, balance: state.balanceEur, revision: state.revision,
      seasonId: state.seasonId, plan: state.plan,
      projectedBalance: Number.isSafeInteger(projectedBalance) ? projectedBalance : null };
  });
  const copy = getCoachReleaseReviewCopy(locale);
  const resolvedLocale = resolveTouchlineCatalogueLocale(locale, true);
  const heading = useRef<HTMLHeadingElement>(null);
  const changed = state.revision !== review.revision || state.seasonId !== review.seasonId
    || state.plan !== review.plan || state.balanceEur !== review.balance
    || state.coach?.id !== review.coachId || state.coach?.tier !== review.coachTier
    || state.coach?.valueEur !== review.paid;
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true,
    label: `${copy.releaseLabel} · ${review.coachName}`, initialFocusRef: heading, onDismiss: onClose });
  useTouchlineDialogScrollLock(true);
  const credits = (value: number) => `${value.toLocaleString(resolvedLocale)} TC`;

  return createPortal(<div className={layout.overlay}>
    <div {...dialogProps} className={`${layout.dialog} ${styles.dialog}`}
      lang={resolvedLocale} dir={resolvedLocale === "ar-SA" ? "rtl" : "ltr"}>
      <h2 ref={heading} tabIndex={-1}>{copy.releaseLabel} · {review.coachName}</h2>
      <div className={styles.safety}><p role="status">{copy.unavailable}</p></div>
      {changed ? <p role="alert">{copy.changed}</p> : <div className={styles.review} data-has-card="false">
        <div className={styles.details}>
          <section className={styles.section} aria-label={copy.contract}>
            <h3>{copy.contract}</h3>
            <dl className={styles.amounts}>
              <dt>{copy.paid}</dt><dd>{credits(review.paid)}</dd>
              <dt>{copy.fee} · {review.rate}%</dt><dd>{credits(review.fee)}</dd>
              <dt>{copy.refund} · {100 - review.rate}%</dt><dd>{credits(review.refund)}</dd>
            </dl>
            <p className={styles.note}>{copy.squadNote}</p>
          </section>
          <section className={styles.section} aria-label={copy.balance}>
            <h3>{copy.balance}</h3>
            <dl className={styles.amounts}>
              <dt>{copy.confirmedBalance}</dt><dd>{credits(review.balance)}</dd>
              <dt>{copy.projectedBalance}</dt><dd>{review.projectedBalance === null ? "—" : credits(review.projectedBalance)}</dd>
            </dl>
            <p className={styles.note}>{copy.projectionNote}</p>
          </section>
        </div>
      </div>}
      <div className={layout.pickerModes}>
        <button type="button" className={controls.link} onClick={onClose}>{copy.keep}</button>
        <button type="button" className={controls.link} disabled>{copy.confirm}</button>
      </div>
    </div>
  </div>, document.body);
}

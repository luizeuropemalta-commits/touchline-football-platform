"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Crown, Diamond, LockKeyhole, Shield, X } from "lucide-react";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import { CLUB_OWNER_PLAN_PREVIEWS, getClubOwnerPlanShowcaseCopy, type ClubOwnerPlanPreview } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { TouchlineCoinMark } from "./market/TouchlineMarketMarks";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPlanShowcase.module.css";

const tierIcons = { standard: Shield, pro: Crown, master: Diamond, vip: LockKeyhole };

export function ClubOwnerPlanCard({ tier, name, locale, draftLocalesEnabled = false }: Readonly<{
  tier: ClubOwnerPlanPreview; name?: string; locale: string; draftLocalesEnabled?: boolean;
}>) {
  const plan = CLUB_OWNER_PLAN_PREVIEWS.find(item => item.id === tier)!;
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const title = tier === "standard" ? copy.planStandard : tier === "pro" ? "Pro" : tier === "master" ? "Master" : "VIP";
  const TierIcon = tierIcons[tier];
  const budgetLabel = `${labels.planBudget}: ${plan.budget === null ? labels.unlimited : `${plan.budget.toLocaleString(locale)} TouchLine Credits`}`;
  return <div dir="ltr" className={styles.memberCard} data-plan-offer={tier}>
    <svg className={styles.cardPattern} viewBox="0 0 360 240" aria-hidden="true" focusable="false">
      <rect x="12" y="12" width="336" height="216" rx="2" />
      <path d="M180 12v216M12 60h54v120H12M348 60h-54v120h54M12 93h20v54H12M348 93h-20v54h20" />
      <circle cx="180" cy="120" r="34" /><circle cx="180" cy="120" r="2" />
    </svg>
    <div className={styles.cardTop}><span className={styles.cardBrand}>TouchLine<small>CLUBOWNER</small></span><span className={styles.cardEdition}>{labels.previewShort}</span></div>
    <div className={styles.cardIdentity}>
      <div><span className={styles.cardKicker}>{labels.fantasyFootball}</span><h3 data-plan-tier={tier}>{title}</h3></div>
      <span className={styles.tierSeal}><TierIcon size={29} aria-hidden="true" /></span>
    </div>
    <div className={styles.cardBottom}>
      {name ? <span className={styles.cardOwner}><small>ClubOwner</small><strong>{name}</strong></span> : null}
      <span className={styles.cardPower}><small>{labels.planBudget}</small><span className={styles.marketPowerValue} data-plan-budget={tier} role="img" aria-label={budgetLabel}>
        <span className={styles.coin} aria-hidden="true"><TouchlineCoinMark size={19} /></span><strong>{plan.amount ?? "∞"}</strong><small>{plan.amount ? "TC" : labels.unlimited}</small>
      </span></span>
    </div>
  </div>;
}

export default function ClubOwnerPlanShowcase({ initialPlan, name, locale, remainingMarketPower, draftLocalesEnabled = false }: Readonly<{
  initialPlan: ClubOwnerPlanPreview; name: string; locale: string; remainingMarketPower: string | null; draftLocalesEnabled?: boolean;
}>) {
  const [index, setIndex] = useState(() => Math.max(0, CLUB_OWNER_PLAN_PREVIEWS.findIndex(plan => plan.id === initialPlan)));
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTrigger = useRef<HTMLButtonElement>(null);
  const comparison = useRef<HTMLDetailsElement>(null);
  const plan = CLUB_OWNER_PLAN_PREVIEWS[index];
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const titleFor = (tier: ClubOwnerPlanPreview) => tier === "standard" ? copy.planStandard : tier === "pro" ? "Pro" : tier === "master" ? "Master" : "VIP";
  const priceFor = (tier: ClubOwnerPlanPreview) => tier === "standard" ? copy.planStandardPrice : tier === "pro" ? copy.planProPrice : tier === "master" ? labels.pricePending : labels.invitation;
  const benefitFor = (tier: ClubOwnerPlanPreview) => tier === "standard" ? copy.planStandardBenefit : tier === "pro" ? copy.planProBenefit : tier === "master" ? labels.benefitPending : labels.vipBenefit;
  const title = titleFor(plan.id);
  const move = (delta: number) => setIndex(value => (value + delta + CLUB_OWNER_PLAN_PREVIEWS.length) % CLUB_OWNER_PLAN_PREVIEWS.length);
  const select = (next: number, focus = false) => {
    setIndex(next);
    if (focus) tabs.current[next]?.focus();
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const rtl = event.currentTarget.closest('[dir="rtl"]') !== null;
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = CLUB_OWNER_PLAN_PREVIEWS.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const direction = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
      next = (current + direction + CLUB_OWNER_PLAN_PREVIEWS.length) % CLUB_OWNER_PLAN_PREVIEWS.length;
    } else return;
    event.preventDefault();
    select(next, true);
  };
  const closeDialog = () => {
    dialog.current?.close();
    dialogTrigger.current?.focus();
  };

  return <section className={styles.planShowcase} data-plan-preview={plan.id} data-plan-state="inactive" aria-labelledby={`${id}-heading`}>
    <div className={styles.showcaseHeading}>
      <div><span className={styles.eyebrow}>TouchLine / {labels.membership}</span><h2 id={`${id}-heading`}>{copy.plan}</h2></div>
      <button ref={dialogTrigger} type="button" className={`${controls.link} ${styles.planAction}`} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
        {plan.id === "vip" ? <LockKeyhole size={13} aria-hidden="true" /> : null}{plan.id === "vip" ? labels.invitation : labels.details}<ChevronRight size={13} aria-hidden="true" />
      </button>
    </div>
    <div role="tablist" aria-label={labels.browse} className={styles.planTabs}>
      {CLUB_OWNER_PLAN_PREVIEWS.map((item, position) => <button key={item.id} type="button" role="tab" id={`${id}-tab-${item.id}`}
        aria-controls={`${id}-panel`} aria-selected={position === index} tabIndex={position === index ? 0 : -1}
        ref={element => { tabs.current[position] = element; }} onClick={() => select(position)} onKeyDown={event => onTabKey(event, position)}
        className={`${controls.link} ${styles.tierTab}`} data-tier={item.id}>
        {titleFor(item.id)}<small>{item.amount ?? "∞"}</small>
      </button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${plan.id}`} tabIndex={0} className={styles.planPanel}>
      <ClubOwnerPlanCard tier={plan.id} name={name} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
      <div className={styles.offerSummary}><div><small>{plan.id === "vip" ? labels.membership : labels.annualPrice}</small><strong data-plan-price={plan.id}>{priceFor(plan.id)}</strong></div><p>{benefitFor(plan.id)}</p></div>
    </div>
    <div className={styles.planBrowse} role="group" aria-label={labels.browse}>
      <button type="button" className={`${controls.link} ${styles.planArrow}`} onClick={() => move(-1)} aria-label={labels.previous} aria-controls={`${id}-panel`}><ChevronLeft size={16} aria-hidden="true" /></button>
      <span aria-live="polite" aria-atomic="true">{title}<small>0{index + 1} / 04</small></span>
      <button type="button" className={`${controls.link} ${styles.planArrow}`} onClick={() => move(1)} aria-label={labels.next} aria-controls={`${id}-panel`}><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    <details className={styles.comparison} ref={comparison}>
      <summary>{labels.comparePlans}<ChevronDown size={15} aria-hidden="true" /></summary>
      <div className={styles.compareTable}><table><caption>{labels.comparePlans}</caption><thead><tr><th scope="col">{labels.plan}</th><th scope="col">TC</th><th scope="col">{labels.annualPrice}</th></tr></thead><tbody>
        {CLUB_OWNER_PLAN_PREVIEWS.map((item, position) => <tr key={item.id} data-selected={position === index}>
          <th scope="row"><button type="button" className={`${controls.link} ${styles.compareChoice}`} aria-label={`${labels.viewPlan}: ${titleFor(item.id)}`} onClick={() => { select(position, true); if (comparison.current) comparison.current.open = false; }}>{titleFor(item.id)}</button></th>
          <td>{item.amount ?? labels.unlimited}</td><td>{priceFor(item.id)}</td>
        </tr>)}
      </tbody></table></div>
    </details>
    <p className={styles.previewNote}>{labels.preview}</p>
    <dialog ref={dialog} className={styles.planDialog} aria-labelledby={`${id}-dialog-heading`} onCancel={event => { event.preventDefault(); closeDialog(); }}>
      <div className={styles.dialogHeading}><span>{labels.details}</span><button type="button" className={`${controls.link} ${styles.planArrow}`} aria-label={labels.close} onClick={closeDialog}><X size={18} aria-hidden="true" /></button></div>
      <h2 id={`${id}-dialog-heading`}>{title}</h2><strong className={styles.dialogPrice}>{priceFor(plan.id)}</strong><p>{benefitFor(plan.id)}</p>
      <dl><div><dt>{labels.planBudget}</dt><dd>{plan.amount ?? labels.unlimited} {plan.amount ? "TC" : ""}</dd></div><div><dt>{labels.currentBudget}</dt><dd data-current-xi-budget="true">{remainingMarketPower ?? "—"} TC</dd></div></dl>
      <p className={styles.availability}>{plan.id === "vip" ? labels.vipBenefit : copy.planActionUnavailable}</p><p className={styles.previewNote}>{labels.preview} {copy.virtualBudgetSeparate}</p>
      <button type="button" className={`${controls.arena} ${styles.dialogClose}`} onClick={closeDialog}>{labels.close}</button>
    </dialog>
  </section>;
}

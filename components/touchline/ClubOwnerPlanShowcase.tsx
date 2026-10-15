"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Crown, Diamond, LockKeyhole, Shield, X } from "lucide-react";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import { CLUB_OWNER_PLAN_PREVIEWS, getClubOwnerPlanShowcaseCopy, getClubOwnerVipPlanName, type ClubOwnerPlanPreview } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { TouchlineCoinMark } from "./market/TouchlineMarketMarks";
import TouchlineClubPerimeterTrace from "./TouchlineClubPerimeterTrace";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPlanShowcase.module.css";

const tierIcons = { beta: Shield, standard: Shield, pro: Crown, master: Diamond, vip: LockKeyhole };

export function ClubOwnerPlanCard({ tier, name, locale, active = false, activePlanBudget, draftLocalesEnabled = false, compact = false }: Readonly<{
  tier: ClubOwnerPlanPreview; name?: string; locale: string; active?: boolean; activePlanBudget?: number | null; draftLocalesEnabled?: boolean; compact?: boolean;
}>) {
  const plan = CLUB_OWNER_PLAN_PREVIEWS.find(item => item.id === tier)!;
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const title = tier === "beta" ? "Beta" : tier === "standard" ? copy.planStandard : tier === "pro" ? "Pro" : tier === "master" ? "Master" : getClubOwnerVipPlanName(locale, draftLocalesEnabled);
  const TierIcon = tierIcons[tier];
  const budget = active && activePlanBudget !== undefined ? activePlanBudget : plan.budget;
  const amount = active && activePlanBudget !== undefined && typeof budget === "number"
    ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(budget) : plan.amount;
  const budgetLabel = `${labels.planBudget}: ${budget === null ? labels.unlimited : `${budget.toLocaleString(locale)} TouchLine Credits`}`;
  return <div dir="ltr" className={styles.memberCard} data-compact={compact || undefined} data-plan-offer={tier} data-current-plan={active || undefined}>
    <TouchlineClubPerimeterTrace accent="var(--plan-accent)" className={styles.memberNeon} />
    <svg className={styles.cardPattern} viewBox="0 0 360 240" aria-hidden="true" focusable="false">
      <path d="M145 -30C40 50 24 156 82 270" />
      <path d="M213 -30C108 50 92 156 150 270" />
      <path d="M281 -30C176 50 160 156 218 270" />
    </svg>
    <div className={styles.cardTop}>{!compact ? <span className={styles.cardBrand}>TouchLine<small>CLUBOWNER</small></span> : null}<span className={styles.cardEdition}>{active ? copy.planActive : labels.previewShort}</span></div>
    <div className={styles.cardIdentity}>
      <div>{!compact ? <span className={styles.cardKicker}>{labels.membership}</span> : null}<h3 data-plan-tier={tier}>{title}</h3></div>
      <span className={styles.tierSeal}><TierIcon size={29} aria-hidden="true" /></span>
    </div>
    <div className={styles.cardBottom}>
      {name && !compact ? <span className={styles.cardOwner}><small>ClubOwner</small><strong>{name}</strong></span> : null}
      <span className={styles.cardPower}><small>{labels.planBudget}</small><span className={styles.marketPowerValue} data-plan-budget={tier} role="img" aria-label={budgetLabel}>
        <span className={styles.coin} aria-hidden="true"><TouchlineCoinMark size={19} /></span><strong>{amount ?? "∞"}</strong><small>{amount ? "TC" : labels.unlimited}</small>
      </span></span>
    </div>
  </div>;
}

export default function ClubOwnerPlanShowcase({ initialPlan, activePlanKey = null, activePlanBudget, name, locale, remainingMarketPower, draftLocalesEnabled = false, showAllPlans = false, canChoose = false, embedded = false, onPreviewChange }: Readonly<{
  initialPlan: ClubOwnerPlanPreview; activePlanKey?: ClubOwnerPlanPreview | null; activePlanBudget?: number | null; name: string; locale: string; remainingMarketPower: string | null; draftLocalesEnabled?: boolean; showAllPlans?: boolean; canChoose?: boolean; embedded?: boolean; onPreviewChange?: (tier: ClubOwnerPlanPreview) => void;
}>) {
  const [index, setIndex] = useState(() => Math.max(0, CLUB_OWNER_PLAN_PREVIEWS.findIndex(plan => plan.id === initialPlan)));
  const [zoomOpen, setZoomOpen] = useState(() => false);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const choices = useRef<(HTMLButtonElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTrigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const comparison = useRef<HTMLDetailsElement>(null);
  const plan = CLUB_OWNER_PLAN_PREVIEWS[index];
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const titleFor = (tier: ClubOwnerPlanPreview) => tier === "beta" ? "Beta" : tier === "standard" ? copy.planStandard : tier === "pro" ? "Pro" : tier === "master" ? "Master" : getClubOwnerVipPlanName(locale, draftLocalesEnabled);
  const priceFor = (tier: ClubOwnerPlanPreview) => tier === "beta" ? labels.betaPrice : tier === "standard" ? copy.planStandardPrice : tier === "pro" ? copy.planProPrice : tier === "master" ? labels.masterPrice : labels.pricePending;
  const benefitFor = (tier: ClubOwnerPlanPreview) => tier === "beta" ? labels.betaBenefit : tier === "pro" ? copy.planProBenefit : copy.planStandardBenefit;
  const title = titleFor(plan.id);
  const move = (delta: number) => {
    const next = (index + delta + CLUB_OWNER_PLAN_PREVIEWS.length) % CLUB_OWNER_PLAN_PREVIEWS.length;
    setIndex(next);
    onPreviewChange?.(CLUB_OWNER_PLAN_PREVIEWS[next].id);
  };
  const select = (next: number, focus = false) => {
    setIndex(next);
    onPreviewChange?.(CLUB_OWNER_PLAN_PREVIEWS[next].id);
    if (focus) (showAllPlans ? choices.current[next] : tabs.current[next])?.focus();
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const rtl = event.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl";
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
    setZoomOpen(false);
    (returnFocus.current ?? dialogTrigger.current)?.focus();
  };
  const openDialog = (trigger: HTMLButtonElement) => { returnFocus.current = trigger; setZoomOpen(true); dialog.current?.showModal(); };
  return <section dir="ltr" className={styles.planShowcase} data-embedded={embedded || undefined} data-plan-preview={plan.id} data-active-plan={activePlanKey ?? undefined} data-plan-state={activePlanKey ? "active" : "inactive"} aria-labelledby={`${id}-heading`}>
    <div className={styles.showcaseHeading}>
      <div>{embedded ? <span className={styles.eyebrow} id={`${id}-heading`}>{labels.browse}</span> : <><span className={styles.eyebrow}>TouchLine / {labels.membership}</span><h2 id={`${id}-heading`}>{copy.plan}</h2></>}</div>
      <button ref={dialogTrigger} type="button" className={`${controls.link} ${styles.planAction}`} onClick={event => openDialog(event.currentTarget)} aria-haspopup="dialog">
        {embedded ? labels.viewPlan : labels.details}<ChevronRight size={13} aria-hidden="true" />
      </button>
    </div>
    {showAllPlans ? <div className={styles.allPlans} aria-label={labels.browse}>
      {CLUB_OWNER_PLAN_PREVIEWS.map((item, position) => <button key={item.id} type="button" ref={element => { choices.current[position] = element; }} className={`${controls.link} ${styles.planChoice}`} data-plan-choice={item.id} data-selected={position === index} aria-label={`${labels.viewPlan}: ${titleFor(item.id)}`} aria-pressed={position === index} onClick={() => { select(position); dialog.current?.showModal(); }}>
        <ClubOwnerPlanCard tier={item.id} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
      </button>)}
    </div> : null}
    {!showAllPlans ? <div role="tablist" aria-label={labels.browse} className={styles.planTabs}>
      {CLUB_OWNER_PLAN_PREVIEWS.map((item, position) => <button key={item.id} type="button" role="tab" id={`${id}-tab-${item.id}`}
        aria-controls={`${id}-panel`} aria-selected={position === index} tabIndex={position === index ? 0 : -1}
        ref={element => { tabs.current[position] = element; }} onClick={() => select(position)} onKeyDown={event => onTabKey(event, position)}
        className={`${controls.link} ${styles.tierTab}`} data-tier={item.id}>
        {titleFor(item.id)}{!embedded ? <small>{item.amount ?? "∞"}</small> : null}
      </button>)}
    </div> : null}
    {!showAllPlans ? <div role={embedded ? "group" : "tabpanel"} id={`${id}-panel`} aria-label={embedded ? `${labels.previewShort}: ${title}` : undefined} aria-labelledby={embedded ? undefined : `${id}-tab-${plan.id}`} tabIndex={0} className={styles.planPanel}>
      {embedded ? <ClubOwnerPlanCard compact tier={plan.id} name={name} locale={locale} active={activePlanKey === plan.id} activePlanBudget={activePlanKey === plan.id ? activePlanBudget : undefined} draftLocalesEnabled={draftLocalesEnabled} /> : <button type="button" className={`${controls.link} ${styles.panelCardButton}`} aria-label={`${labels.viewPlan}: ${title}`} onClick={event => openDialog(event.currentTarget)} aria-haspopup="dialog">
        <ClubOwnerPlanCard compact={embedded} tier={plan.id} name={name} locale={locale} active={activePlanKey === plan.id} activePlanBudget={activePlanKey === plan.id ? activePlanBudget : undefined} draftLocalesEnabled={draftLocalesEnabled} />
      </button>}
      <div className={styles.offerSummary}><div><small>{labels.seasonalPrice}</small><strong data-plan-price={plan.id}>{priceFor(plan.id)}</strong></div><p>{benefitFor(plan.id)}</p></div>
      {canChoose && activePlanKey !== plan.id ? <a className={`${controls.arena} ${styles.choosePlan}`} href="#clubowner-plan-interest" onClick={() => dialog.current?.close()}>{labels.choosePlan}</a> : null}
    </div> : null}
    {!showAllPlans ? <div className={styles.planBrowse} role="group" aria-label={labels.browse}>
      <button type="button" className={`${controls.link} ${styles.planArrow}`} onClick={() => move(-1)} aria-label={labels.previous} aria-controls={`${id}-panel`}><ChevronLeft size={16} aria-hidden="true" /></button>
      <span aria-live="polite" aria-atomic="true"><span className={embedded ? styles.visuallyHidden : undefined}>{title}</span><small>{String(index + 1).padStart(2, "0")} / {String(CLUB_OWNER_PLAN_PREVIEWS.length).padStart(2, "0")}</small></span>
      <button type="button" className={`${controls.link} ${styles.planArrow}`} onClick={() => move(1)} aria-label={labels.next} aria-controls={`${id}-panel`}><ChevronRight size={16} aria-hidden="true" /></button>
    </div> : null}
    <details className={styles.comparison} ref={comparison}>
      <summary>{labels.comparePlans}<ChevronDown size={15} aria-hidden="true" /></summary>
      <div className={styles.compareTable}><table><caption>{labels.comparePlans}</caption><thead><tr><th scope="col">{labels.plan}</th><th scope="col">TC</th><th scope="col">{labels.priceLabel}</th></tr></thead><tbody>
        {CLUB_OWNER_PLAN_PREVIEWS.map((item, position) => <tr key={item.id} data-selected={position === index}>
          <th scope="row"><button type="button" className={`${controls.link} ${styles.compareChoice}`} aria-label={`${labels.viewPlan}: ${titleFor(item.id)}`} onClick={() => { select(position, true); if (comparison.current) comparison.current.open = false; }}>{titleFor(item.id)}</button></th>
          <td>{item.amount ?? labels.unlimited}</td><td>{priceFor(item.id)}</td>
        </tr>)}
      </tbody></table></div>
    </details>
    <p className={styles.previewNote}>{labels.preview}</p>
    <dialog ref={dialog} className={styles.planDialog} aria-labelledby={`${id}-dialog-heading`} onClose={() => setZoomOpen(false)} onCancel={event => { event.preventDefault(); closeDialog(); }}>
      <div className={styles.dialogHeading}><span>{labels.details}</span><button type="button" className={`${controls.link} ${styles.planArrow}`} aria-label={labels.close} onClick={closeDialog}><X size={18} aria-hidden="true" /></button></div>
      <div className={embedded ? styles.zoomLayout : undefined}>
        {embedded && zoomOpen ? <div className={styles.zoomCard} aria-hidden="true"><ClubOwnerPlanCard tier={plan.id} locale={locale} draftLocalesEnabled={draftLocalesEnabled} active={activePlanKey === plan.id} activePlanBudget={activePlanKey === plan.id ? activePlanBudget : undefined} /></div> : null}
        <div className={styles.dialogDetails}>
      <h2 className={embedded ? styles.visuallyHidden : undefined} id={`${id}-dialog-heading`}>{title}</h2><strong className={styles.dialogPrice}>{priceFor(plan.id)}</strong><p>{benefitFor(plan.id)}</p>
      <dl><div className={embedded ? styles.visuallyHidden : undefined}><dt>{labels.planBudget}</dt><dd>{plan.amount} TC</dd></div><div><dt>{labels.currentBudget}</dt><dd data-current-xi-budget="true" aria-label={remainingMarketPower === null ? copy.marketPowerUnavailable : undefined}>{`${remainingMarketPower ?? "—"} TC`}</dd></div></dl>
      <p className={styles.availability}>{copy.planActionUnavailable}</p><p className={styles.previewNote}>{labels.preview} {copy.virtualBudgetSeparate}</p>
      {embedded ? <details className={styles.comparison}>
        <summary>{labels.comparePlans}<ChevronDown size={15} aria-hidden="true" /></summary>
        <div className={styles.compareTable}><table><caption>{labels.comparePlans}</caption>
          <thead><tr><th scope="col">{labels.plan}</th><th scope="col">TC</th><th scope="col">{labels.priceLabel}</th></tr></thead>
          <tbody>{CLUB_OWNER_PLAN_PREVIEWS.map(item => <tr key={item.id}><th scope="row">{titleFor(item.id)}</th><td>{item.amount}</td><td>{priceFor(item.id)}</td></tr>)}</tbody>
        </table></div>
      </details> : null}
      {canChoose && activePlanKey !== plan.id ? <a className={`${controls.arena} ${styles.choosePlan}`} href="#clubowner-plan-interest" onClick={() => dialog.current?.close()}>{labels.choosePlan}</a> : null}
      <button type="button" className={`${controls.arena} ${styles.dialogClose}`} onClick={closeDialog}>{labels.close}</button>
        </div>
      </div>
    </dialog>
  </section>;
}

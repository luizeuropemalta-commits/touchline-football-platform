"use client";

import Image from "next/image";
import { useState } from "react";
import { CalendarDays, Camera } from "lucide-react";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import { getClubOwnerPlanShowcaseCopy, type ClubOwnerPlanPreview } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { formatClubOwnerRankingPosition, getClubOwnerProfileMetricsCopy } from "@/lib/touchlineArena/club-owner-profile-metrics";
import ClubOwnerAvatarControl, { type ClubOwnerAvatarUiContext } from "./ClubOwnerAvatarControl";
import ClubOwnerPlanShowcase from "./ClubOwnerPlanShowcase";
import { TouchlineCoinMark } from "./market/TouchlineMarketMarks";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerMarketHeader.module.css";

type Owner = Readonly<{ name: string; avatarUrl: string; city: string; nationality: string; since: string }>;

export default function ClubOwnerMarketHeader({ owner, locale, accountId, avatarContext, rankingPosition = null, remainingMarketPower = null, plan = null, activePlanKey = null, activePlanBudget, planPreview = null, draftLocalesEnabled = false, avatarSelectionEnabled = false, retentionReady = false }: Readonly<{
  owner: Owner | null; locale: string; accountId?: string; avatarContext?: ClubOwnerAvatarUiContext | null;
  plan?: Readonly<{ active: boolean; expiresAt: string | null }> | null;
  /** Validated server entitlement only; never derived from a preview or URL. */
  activePlanKey?: ClubOwnerPlanPreview | null;
  activePlanBudget?: number | null;
  planPreview?: "standard" | "pro" | null;
  draftLocalesEnabled?: boolean;
  avatarSelectionEnabled?: boolean; retentionReady?: boolean;
  rankingPosition?: number | null;
  remainingMarketPower?: number | null;
}>) {
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const metricsCopy = getClubOwnerProfileMetricsCopy(locale, draftLocalesEnabled);
  const name = owner?.name || copy.nameUnavailable;
  const rank = owner && typeof rankingPosition === "number" && Number.isSafeInteger(rankingPosition) && rankingPosition > 0
    ? formatClubOwnerRankingPosition(rankingPosition, locale, draftLocalesEnabled) : null;
  const marketPower = typeof remainingMarketPower === "number" && Number.isFinite(remainingMarketPower)
    ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Math.max(0, remainingMarketPower))
    : null;
  const tier = planPreview;
  // The tier samples are development-only product copy. They intentionally
  // render the acquisition state without changing the viewer's entitlement.
  const planActive = tier ? false : plan?.active === true;
  const currentTier = planActive ? activePlanKey : null;
  // Choosing a card is deliberately visual-only: it changes the ClubOwner
  // cover treatment, never the profile photo, entitlement, or XI budget.
  const [visualTier, setVisualTier] = useState<ClubOwnerPlanPreview>(() => tier ?? currentTier ?? "beta");
  const displayedTier = visualTier;
  const expiry = plan?.expiresAt ? new Date(plan.expiresAt) : null;
  const validity = currentTier !== "vip" && planActive && expiry && Number.isFinite(expiry.getTime())
    ? copy.planUntil.replace("{date}", new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(expiry)) : null;
  return <header className={styles.header} data-clubowner-header="true" data-plan-preview={displayedTier} tabIndex={-1}>
    <section className={styles.profile} data-cover-preview="true" data-active-plan={currentTier ?? undefined} aria-labelledby="clubowner-heading">
      {displayedTier ? <svg className={styles.coverPattern} viewBox="0 0 600 340" aria-hidden="true" focusable="false">
        <rect x="20" y="20" width="560" height="300" rx="2" />
        <path d="M300 20v300M20 95h78v150H20M580 95h-78v150h78M20 133h30v74H20M580 133h-30v74h30" />
        <circle cx="300" cy="170" r="53" /><circle cx="300" cy="170" r="2" />
      </svg> : null}
      <div className={styles.title}><h1>ClubOwner</h1></div>
      <div className={styles.identity}>
        <div className={styles.portrait}>
          {owner && accountId && avatarContext?.accountId === accountId && avatarContext.uploadAllowed === true
            && avatarContext.canUpload === false && avatarContext.readyForSelection === false ?
            <ClubOwnerAvatarControl accountId={accountId} context={avatarContext} locale={locale} draftLocalesEnabled={draftLocalesEnabled} avatarSelectionEnabled={avatarSelectionEnabled} retentionReady={retentionReady}>
              <Image src={owner.avatarUrl || "/icons/touchline-512.png"} alt={name} width={112} height={112} unoptimized />
              <span className={styles.camera}><Camera size={16} aria-hidden="true" /></span>
            </ClubOwnerAvatarControl> : <>
          <button type="button" className={`${controls.link} ${styles.photoButton}`} disabled aria-describedby="clubowner-photo-status" aria-label={copy.photoAria}>
            <Image src={owner?.avatarUrl || "/icons/touchline-512.png"} alt={name} width={112} height={112} unoptimized />
            <span className={styles.camera}><Camera size={16} aria-hidden="true" /></span>
          </button>
          <small className={styles.photoStatus} id="clubowner-photo-status" role="status">{copy.photoUnavailable}</small>
          </>}
        </div>
        <div className={styles.details}>
          <span className={styles.eyebrow}>{copy.yourProfile}</span>
          <h2 id="clubowner-heading">{name}</h2>
          <dl className={styles.facts}>
            <div><dt>{metricsCopy.ranking}</dt><dd aria-label={rank === null ? metricsCopy.unavailable : undefined}>{rank ?? "—"}</dd></div>
            <div><dt>{metricsCopy.followers}</dt><dd aria-label={metricsCopy.unavailable}>—</dd></div>
          </dl>
        </div>
      </div>
    </section>
    <section className={styles.bank} data-plan-state={planActive ? "active" : "inactive"} data-active-plan={currentTier ?? undefined} aria-labelledby="clubowner-plan-heading">
      <div className={styles.bankHeading}><CalendarDays size={25} aria-hidden="true" /><h2 id="clubowner-plan-heading">{copy.plan}</h2></div>
      <ClubOwnerPlanShowcase embedded initialPlan={tier ?? currentTier ?? "beta"} activePlanKey={currentTier} activePlanBudget={currentTier ? activePlanBudget : undefined} name={name} locale={locale} remainingMarketPower={marketPower} draftLocalesEnabled={draftLocalesEnabled} canChoose={tier === null} onPreviewChange={setVisualTier} />
      <dl className={styles.currentBudget} aria-label={copy.plan}>
        <div><dt>{labels.currentBudget}</dt><dd data-account-market-power="true" aria-label={marketPower === null ? copy.marketPowerUnavailable : `${copy.marketPower} ${marketPower} TouchLine Credits`}>
          <span className={styles.marketPowerValue}><TouchlineCoinMark size={19} /><strong>{marketPower ?? "—"}</strong><small>TC</small></span>
        </dd></div>
      </dl>
      {validity ? <p className={styles.validity} data-plan-validity="true">{validity}</p> : null}
      <p id="clubowner-plan-interest" className={styles.planInterest} tabIndex={-1} role="status">{labels.working}</p>
    </section>
  </header>;
}

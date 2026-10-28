"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useConfirmedClubCollection } from "./fantasy/ClubCollectionContext";
import { CLUB_ACQUISITION_BUDGETS } from "@/lib/touchlineFantasy/club-acquisition";
import { getClubCollectionBudgetCopy } from "@/lib/touchlineFantasy/market-budget-i18n";
import { CalendarDays, Camera, ChevronRight } from "lucide-react";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import { getClubOwnerPlanShowcaseCopy, type ClubOwnerPlanPreview } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { formatClubOwnerRankingPosition, getClubOwnerProfileMetricsCopy } from "@/lib/touchlineArena/club-owner-profile-metrics";
import ClubOwnerAvatarControl, { type ClubOwnerAvatarUiContext } from "./ClubOwnerAvatarControl";
import { ClubOwnerPlanCard } from "./ClubOwnerPlanShowcase";
import ClubOwnerPlanOnboarding from "./ClubOwnerPlanOnboarding";
import { TouchlineCoinMark } from "./market/TouchlineMarketMarks";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerMarketHeader.module.css";
import planStyles from "./ClubOwnerPlanShowcase.module.css";

type Owner = Readonly<{ name: string; avatarUrl: string; city: string; nationality: string; since: string }>;

export default function ClubOwnerMarketHeader({ owner, locale, accountId, avatarContext, rankingPosition = null, followerCount = null, publicDiscoveryEnabled = false, remainingMarketPower = null, plan = null, activePlanKey = null, activePlanBudget, draftLocalesEnabled = false, avatarSelectionEnabled = false, retentionReady = false, identityOnly = false, collectionEnabled = false }: Readonly<{
  owner: Owner | null; locale: string; accountId?: string; avatarContext?: ClubOwnerAvatarUiContext | null;
  plan?: Readonly<{ active: boolean; expiresAt: string | null }> | null;
  /** Validated server entitlement only; never derived from a preview or URL. */
  activePlanKey?: ClubOwnerPlanPreview | null;
  activePlanBudget?: number | null;
  planPreview?: "standard" | "pro" | null;
  draftLocalesEnabled?: boolean;
  avatarSelectionEnabled?: boolean; retentionReady?: boolean;
  rankingPosition?: number | null;
  /** Confirmed, self-scoped public-profile read; unavailable is never zero. */
  followerCount?: number | null;
  publicDiscoveryEnabled?: boolean;
  remainingMarketPower?: number | null;
  /** Reuse the canonical cover in a composition that owns its plan summary. */
  identityOnly?: boolean;
  collectionEnabled?: boolean;
}>) {
  const { state: confirmedCollection, initialBudget, verificationStatus = "pending" } = useConfirmedClubCollection();
  const confirmedBalance = collectionEnabled ? confirmedCollection?.balanceEur ?? initialBudget?.balanceEur ?? null : remainingMarketPower;
  const confirmedBudget = collectionEnabled
    ? confirmedCollection ? CLUB_ACQUISITION_BUDGETS[confirmedCollection.plan] : initialBudget?.balanceEur ?? activePlanBudget
    : activePlanBudget;
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const viewPlansLabel = {
    "en-GB": "View plans", "pt-BR": "Ver planos", "es-ES": "Ver planes",
    "it-IT": "Vedi piani", "fr-FR": "Voir les offres", "ar-SA": "عرض الخطط",
    "tr-TR": "Planları gör", "de-DE": "Pläne ansehen",
  }[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  const metricsCopy = getClubOwnerProfileMetricsCopy(locale, draftLocalesEnabled);
  const name = owner?.name || copy.nameUnavailable;
  const followers = publicDiscoveryEnabled && owner && typeof followerCount === "number" && Number.isSafeInteger(followerCount) && followerCount >= 0
    ? new Intl.NumberFormat(locale).format(followerCount) : null;
  const rank = owner && typeof rankingPosition === "number" && Number.isSafeInteger(rankingPosition) && rankingPosition > 0
    ? formatClubOwnerRankingPosition(rankingPosition, locale, draftLocalesEnabled) : null;
  const marketPower = typeof confirmedBalance === "number" && Number.isFinite(confirmedBalance)
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(0, confirmedBalance))
    : null;
  const collectionBudgetCopy = getClubCollectionBudgetCopy(locale, draftLocalesEnabled);
  const balanceLabel = collectionEnabled ? (verificationStatus !== "confirmed" && marketPower !== null
    ? collectionBudgetCopy.lastConfirmedBalance : collectionBudgetCopy.signingBudget) : labels.currentBudget;
  const balanceStatus = collectionEnabled && verificationStatus !== "confirmed"
    ? collectionBudgetCopy[verificationStatus === "unavailable" ? "unavailable" : "pending"] : null;
  // Only the current server entitlement controls the account cover.
  // Exploring offers (or a development URL) must never recolour this account.
  const planActive = plan?.active === true;
  const currentTier = planActive ? activePlanKey : null;
  const [plansOpen, setPlansOpen] = useState(false);
  const displayedTier = currentTier ?? undefined;
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
            <div><dt>{metricsCopy.followers}</dt><dd aria-label={followers === null ? metricsCopy.unavailable : undefined}>{followers ?? "—"}</dd></div>
          </dl>
          {publicDiscoveryEnabled ? <Link href={`/clubowners?lang=${locale === "pt-BR" ? "pt-BR" : "en-GB"}`} className={controls.link}>
            {locale === "pt-BR" ? "Encontrar ClubOwners" : "Find ClubOwners"}
          </Link> : null}
        </div>
      </div>
    </section>
    {!identityOnly ? <section className={styles.bank} data-plan-state={planActive ? "active" : "inactive"} data-active-plan={currentTier ?? undefined} aria-labelledby="clubowner-plan-heading">
      <div className={styles.bankHeading}><CalendarDays size={25} aria-hidden="true" /><h2 id="clubowner-plan-heading">{copy.plan}</h2>
        <button type="button" className={`${controls.link} ${styles.viewPlans}`} onClick={() => setPlansOpen(true)} aria-haspopup="dialog">{viewPlansLabel}<ChevronRight size={13} aria-hidden="true" /></button>
      </div>
      {currentTier ? <div className={planStyles.planShowcase} data-embedded="true" data-plan-preview={currentTier} data-account-plan-card="true">
        <ClubOwnerPlanCard compact tier={currentTier} active activePlanBudget={confirmedBudget} name={name} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
      </div> : <p className={styles.validity} role="status">{copy.planActionUnavailable}</p>}
      <ClubOwnerPlanOnboarding open={plansOpen} locale={locale} activePlanKey={currentTier} draftLocalesEnabled={draftLocalesEnabled} onDismiss={() => setPlansOpen(false)} />
      <dl className={styles.currentBudget} aria-label={copy.plan}>
        <div><dt>{balanceLabel}</dt><dd data-account-market-power="true" aria-describedby={balanceStatus ? "clubowner-balance-status" : undefined} aria-label={marketPower === null ? copy.marketPowerUnavailable : `${collectionEnabled ? balanceLabel : copy.marketPower} ${marketPower} TouchLine Credits`}>
          <span className={styles.marketPowerValue}><TouchlineCoinMark size={19} /><strong>{marketPower ?? "—"}</strong><small>TC</small></span>
        </dd></div>
      </dl>
      {balanceStatus ? <p id="clubowner-balance-status" className={styles.validity} role="status" data-balance-verification={verificationStatus}>{balanceStatus}</p> : null}
      {validity ? <p className={styles.validity} data-plan-validity="true">{validity}</p> : null}
      <p id="clubowner-plan-interest" className={styles.planInterest} tabIndex={-1} role="status">{labels.working}</p>
    </section> : null}
  </header>;
}

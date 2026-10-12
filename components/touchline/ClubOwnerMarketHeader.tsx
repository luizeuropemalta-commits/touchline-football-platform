import Image from "next/image";
import { CalendarDays, Camera, Crown, Diamond, LockKeyhole, Shield } from "lucide-react";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import { getClubOwnerPlanShowcaseCopy, getClubOwnerVipPlanName, type ClubOwnerPlanPreview } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { formatClubOwnerRankingPosition, getClubOwnerProfileMetricsCopy } from "@/lib/touchlineArena/club-owner-profile-metrics";
import { TouchlineCoinMark } from "./market/TouchlineMarketMarks";
import ClubOwnerAvatarControl, { type ClubOwnerAvatarUiContext } from "./ClubOwnerAvatarControl";
import ClubOwnerPlanShowcase from "./ClubOwnerPlanShowcase";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerMarketHeader.module.css";

type Owner = Readonly<{ name: string; avatarUrl: string; city: string; nationality: string; since: string }>;

export default function ClubOwnerMarketHeader({ owner, locale, accountId, avatarContext, rankingPoints = null, rankingPosition = null, remainingMarketPower = null, realUnlimited = false, plan = null, activePlanKey = null, activePlanBudget, planPreview = null, draftLocalesEnabled = false, avatarSelectionEnabled = false, retentionReady = false }: Readonly<{
  owner: Owner | null; locale: string; accountId?: string; avatarContext?: ClubOwnerAvatarUiContext | null;
  plan?: Readonly<{ active: boolean; expiresAt: string | null }> | null;
  /** Validated server entitlement only; never derived from a preview or URL. */
  activePlanKey?: ClubOwnerPlanPreview | null;
  activePlanBudget?: number | null;
  planPreview?: "standard" | "pro" | null;
  draftLocalesEnabled?: boolean;
  avatarSelectionEnabled?: boolean; retentionReady?: boolean;
  rankingPoints?: number | null;
  rankingPosition?: number | null;
  remainingMarketPower?: number | null;
  /** Explicit server-derived capability; a null amount or preview never grants it. */
  realUnlimited?: boolean;
}>) {
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const metricsCopy = getClubOwnerProfileMetricsCopy(locale, draftLocalesEnabled);
  const points = owner && typeof rankingPoints === "number" && Number.isFinite(rankingPoints)
    ? rankingPoints.toLocaleString(metricsCopy.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  const name = owner?.name || copy.nameUnavailable;
  const rank = owner && typeof rankingPosition === "number" && Number.isSafeInteger(rankingPosition) && rankingPosition > 0
    ? formatClubOwnerRankingPosition(rankingPosition, locale, draftLocalesEnabled) : null;
  const marketPower = typeof remainingMarketPower === "number" && Number.isFinite(remainingMarketPower)
    ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Math.max(0, remainingMarketPower))
    : null;
  const unlimited = realUnlimited === true && plan?.active === true;
  const tier = planPreview;
  // The tier samples are development-only product copy. They intentionally
  // render the acquisition state without changing the viewer's entitlement.
  const planActive = tier ? false : plan?.active === true;
  const currentTier = planActive ? activePlanKey : null;
  const currentTierName = currentTier === "beta" ? "Beta" : currentTier === "standard" ? copy.planStandard
    : currentTier === "pro" ? copy.planPro : currentTier === "master" ? "Master"
    : currentTier === "vip" ? getClubOwnerVipPlanName(locale, draftLocalesEnabled) : null;
  const planDate = planActive && typeof plan?.expiresAt === "string" && Number.isFinite(Date.parse(plan.expiresAt))
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(plan.expiresAt)) : null;
  return <header className={styles.header} data-clubowner-header="true">
    <section className={styles.profile} data-cover-preview={tier ? "true" : undefined} data-active-plan={currentTier ?? undefined} aria-labelledby="clubowner-heading">
      {tier ? <svg className={styles.coverPattern} viewBox="0 0 600 340" aria-hidden="true" focusable="false">
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
          <h2 id="clubowner-heading">{name}{tier ? <>
            <span className={`${styles.proBadge} ${styles.betaBadge}`} data-profile-tier="beta"><Shield size={14} aria-hidden="true" />Beta</span>
            <span className={`${styles.proBadge} ${styles.standardBadge}`} data-profile-tier="standard"><Shield size={14} aria-hidden="true" />{copy.planStandard}</span>
            <span className={styles.proBadge} data-profile-tier="pro"><Crown size={14} aria-hidden="true" />{copy.planPro}</span>
            <span className={`${styles.proBadge} ${styles.masterBadge}`} data-profile-tier="master"><Diamond size={14} aria-hidden="true" />Master</span>
            <span className={`${styles.proBadge} ${styles.vipBadge}`} data-profile-tier="vip"><LockKeyhole size={14} aria-hidden="true" />VIP</span>
          </> : currentTierName ? <span className={`${styles.proBadge} ${currentTier === "beta" ? styles.betaBadge : currentTier === "standard" ? styles.standardBadge : currentTier === "master" ? styles.masterBadge : currentTier === "vip" ? styles.vipBadge : ""}`} data-profile-active-plan={currentTier}>
            {currentTier === "vip" ? <LockKeyhole size={14} aria-hidden="true" /> : currentTier === "master" ? <Diamond size={14} aria-hidden="true" /> : currentTier === "pro" ? <Crown size={14} aria-hidden="true" /> : <Shield size={14} aria-hidden="true" />}{currentTierName}
          </span> : null}</h2>
          <dl className={styles.facts}>
            <div><dt>{metricsCopy.points}</dt><dd aria-label={points === null ? metricsCopy.unavailable : undefined}>{points ?? "—"}</dd></div>
            <div><dt>{metricsCopy.ranking}</dt><dd aria-label={rank === null ? metricsCopy.unavailable : undefined}>{rank ?? "—"}</dd></div>
            <div><dt>{metricsCopy.followers}</dt><dd aria-label={metricsCopy.unavailable}>—</dd></div>
          </dl>
        </div>
      </div>
    </section>
    {tier ? <ClubOwnerPlanShowcase key={tier} initialPlan={tier} name={name} locale={locale} remainingMarketPower={marketPower} realUnlimited={unlimited} draftLocalesEnabled={draftLocalesEnabled} /> : <section className={styles.bank} data-plan-state={planActive ? "active" : "inactive"} data-active-plan={currentTier ?? undefined} aria-labelledby="clubowner-plan-heading">
      <div className={styles.bankHeading}><CalendarDays size={25} aria-hidden="true" /><h2 id="clubowner-plan-heading">{copy.plan}{currentTierName ? <span className={styles.currentPlanName}>{currentTierName}</span> : null}</h2>
        <button type="button" className={`${controls.arena} ${styles.planAction}`} disabled aria-describedby="clubowner-plan-status" title={copy.planActionUnavailable}>
          {planActive ? copy.renewPlan : copy.activatePlan}
        </button>
      </div>
      <details className={styles.bankDetails} data-bank-details="true">
        <summary className={styles.bankSummary}>
          <span className={styles.marketPowerLabel}>{copy.marketPower}</span>
          <span className={styles.marketPowerValue} data-market-power-unlimited={unlimited || undefined} aria-label={unlimited ? `${copy.marketPower}: ${labels.unlimited}` : marketPower === null ? copy.marketPowerUnavailable : `${copy.marketPower} ${marketPower} TouchLine Credits`}>
            <TouchlineCoinMark size={22} />
            <strong>{unlimited ? "∞" : marketPower ?? "—"}</strong>
            <small>{unlimited ? labels.unlimited : "TC"}</small>
          </span>
        </summary>
        <div className={styles.bankBody}>
          <p id="clubowner-plan-status">{planActive ? (planDate ? copy.planUntil.replace("{date}", planDate) : copy.planActiveNoEnd) : copy.planInactiveDetail}</p>
          <small>{copy.virtualBudgetSeparate}</small>
        </div>
      </details>
    </section>}
    {!tier ? <div className={styles.planCatalogue}>
      <ClubOwnerPlanShowcase initialPlan={currentTier ?? "beta"} activePlanKey={currentTier} activePlanBudget={currentTier ? activePlanBudget : undefined} name={owner?.name ?? ""} locale={locale} remainingMarketPower={marketPower} realUnlimited={unlimited} draftLocalesEnabled={draftLocalesEnabled} />
    </div> : null}
  </header>;
}

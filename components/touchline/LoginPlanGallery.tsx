import { ChevronDown } from "lucide-react";
import { CLUB_OWNER_PLAN_PREVIEWS, getClubOwnerPlanShowcaseCopy } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import { ClubOwnerPlanCard } from "./ClubOwnerPlanShowcase";
import cardStyles from "./ClubOwnerPlanShowcase.module.css";
import styles from "./LoginPlanGallery.module.css";

/** Presentation only: no subscription selection, payment or account mutation. */
export default function LoginPlanGallery({ locale, draftLocalesEnabled = false }: Readonly<{ locale: string; draftLocalesEnabled?: boolean }>) {
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  return <section dir="ltr" className={styles.gallery} aria-labelledby="login-plans-heading" data-login-plans="true">
    <div className={styles.heading}><div><span>TouchLine / {labels.fantasyFootball}</span><h2 id="login-plans-heading">{labels.browse}</h2></div><p>{labels.preview}</p></div>
    <div className={styles.grid}>
      {CLUB_OWNER_PLAN_PREVIEWS.map(plan => <article key={plan.id} className={`${cardStyles.planShowcase} ${styles.offer}`} data-plan-preview={plan.id}>
        <ClubOwnerPlanCard tier={plan.id} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
        <div className={styles.price}><small>{labels.seasonalPrice}</small><strong>{plan.id === "beta" ? labels.betaPrice : plan.id === "standard" ? copy.planStandardPrice : plan.id === "vip" ? labels.vipPrice : labels.masterPrice}</strong></div>
        <details className={styles.details}>
          <summary>{labels.details}<ChevronDown size={15} aria-hidden="true" /></summary>
          <p>{plan.id === "beta" ? labels.betaBenefit : copy.planStandardBenefit}</p>
        </details>
      </article>)}
    </div>
  </section>;
}

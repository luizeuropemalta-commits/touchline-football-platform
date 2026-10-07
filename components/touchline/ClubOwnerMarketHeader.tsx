import Image from "next/image";
import Link from "next/link";
import { Camera, Landmark } from "lucide-react";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import ClubOwnerAvatarControl, { type ClubOwnerAvatarUiContext } from "./ClubOwnerAvatarControl";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerMarketHeader.module.css";

type Owner = Readonly<{ name: string; avatarUrl: string; city: string; nationality: string; since: string }>;

export default function ClubOwnerMarketHeader({ owner, locale, accountId, avatarContext, draftLocalesEnabled = false }: Readonly<{
  owner: Owner | null; locale: string; accountId?: string; avatarContext?: ClubOwnerAvatarUiContext | null;
  draftLocalesEnabled?: boolean;
}>) {
  const copy = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const name = owner?.name || copy.nameUnavailable;
  return <header className={styles.header} data-clubowner-header="true">
    <section className={styles.profile} aria-labelledby="clubowner-heading">
      <div className={styles.title}><span>TOUCHLINE</span><h1>ClubOwner</h1></div>
      <div className={styles.identity}>
        <div className={styles.portrait}>
          {owner && accountId && avatarContext?.accountId === accountId && avatarContext.uploadAllowed === true
            && avatarContext.canUpload === false && avatarContext.readyForSelection === false ?
            <ClubOwnerAvatarControl accountId={accountId} context={avatarContext} locale={locale} draftLocalesEnabled={draftLocalesEnabled}>
              <Image src={owner.avatarUrl || "/icons/touchline-512.png"} alt={name} width={112} height={112} unoptimized />
              <span className={styles.camera}><Camera size={16} aria-hidden="true" /></span>
            </ClubOwnerAvatarControl> : <>
          <button type="button" className={`${controls.link} ${styles.photoButton}`} disabled aria-describedby="clubowner-photo-status" aria-label={copy.photoAria}>
            <Image src={owner?.avatarUrl || "/icons/touchline-512.png"} alt={name} width={112} height={112} unoptimized />
            <span className={styles.camera}><Camera size={16} aria-hidden="true" /></span>
          </button>
          <small id="clubowner-photo-status">{copy.photoUnavailable}</small>
          </>}
        </div>
        <div className={styles.details}>
          <span className={styles.eyebrow}>{copy.yourProfile}</span>
          <h2 id="clubowner-heading">{name}</h2>
          <dl className={styles.facts}>
            <div><dt>{copy.location}</dt><dd>{owner?.city || "—"}</dd></div>
            <div><dt>{copy.nationality}</dt><dd>{owner?.nationality || "—"}</dd></div>
            <div><dt>{copy.memberSince}</dt><dd>{owner?.since || "—"}</dd></div>
          </dl>
          <Link className={controls.link} href={`/intro?lang=${encodeURIComponent(locale)}&intro=first`}>{copy.watchIntro}</Link>
        </div>
      </div>
    </section>
    <section className={styles.bank} data-bank-state="inactive" aria-labelledby="clubowner-bank-heading">
      <div className={styles.bankHeading}><Landmark size={25} aria-hidden="true" /><h2 id="clubowner-bank-heading">{copy.bank}</h2><span>{copy.inactive}</span></div>
      <strong>{copy.credits}</strong>
      <p id="clubowner-bank-status">{copy.purchasesUnavailable}</p>
      <button type="button" className={controls.link} disabled aria-describedby="clubowner-bank-status">{copy.buyCredits}</button>
      <small>{copy.notCreditBalance}</small>
    </section>
  </header>;
}

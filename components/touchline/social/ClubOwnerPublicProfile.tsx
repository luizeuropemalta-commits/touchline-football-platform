"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { parsePublicOwnerProfile, peopleCopy, publicOwnerHref, type PeopleLocale, type PublicOwnerProfile } from "@/lib/touchlineArena/clubowner-public-contract";
import { PublicOwnersRequestError, usePublicOwnersRequest } from "./usePublicOwnersRequest";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPublic.module.css";
import ClubOwnerPublicAvatar from "./ClubOwnerPublicAvatar";
import ClubOwnerPublicMarket from "./ClubOwnerPublicMarket";

export default function ClubOwnerPublicProfile({ locale, publicId, enabled, initial }: { locale: PeopleLocale; publicId: string; enabled: boolean; initial: { status: number; profile: PublicOwnerProfile | null } }) {
  const copy = peopleCopy(locale), io = usePublicOwnersRequest();
  const [profile, setProfile] = useState(initial.profile), [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const endpoint = `/api/touchline/clubowners/${encodeURIComponent(publicId)}`;
  async function update(write: boolean) {
    if (lock.current || (write && (!profile || uncertain))) return;
    lock.current = true; setBusy(true);
    try {
      const next = parsePublicOwnerProfile((await io.request(write ? `${endpoint}/follow` : `${endpoint}?include=standing`, write ? { active: !profile!.following } : undefined)).profile);
      if (!next || next.publicId.toLowerCase() !== publicId.toLowerCase()
        || (write && (next.following !== !profile!.following || next.viewer !== "member"))) throw new Error("PROFILE_RECEIPT_UNCONFIRMED");
      if (io.alive()) { setProfile(next); setStatus(200); setUncertain(false); }
    } catch (error) {
      if (io.alive()) {
        if (write) setUncertain(true);
        else { setStatus(error instanceof PublicOwnersRequestError ? error.status : 503); setProfile(null); }
      }
    } finally { lock.current = false; if (io.alive()) setBusy(false); }
  }
  if (!enabled) return <p role="status">{copy.unavailable}</p>;
  if (!profile) return <section className={styles.panel}>
    <p role="status">{status === 404 ? copy.notFound : copy.error}</p>
    {status !== 404 ? <button className={controls.link} onClick={() => update(false)} disabled={busy}>{copy.retry}</button> : null}
  </section>;
  return <section className={`${styles.panel} ${styles.ownerProfile}`} data-plan={profile.planKey ?? "unconfirmed"} aria-labelledby="public-owner-name" aria-busy={busy}>
    <header className={styles.profileCover}><div className={styles.profileIdentity}>
    <ClubOwnerPublicAvatar publicId={profile.publicId} avatarUrl={profile.avatarUrl} displayName={profile.displayName} locale={locale} planKey={profile.planKey} />
    <div><span className={styles.profileEyebrow}>CLUBOWNER</span><h1 id="public-owner-name">{profile.displayName}</h1>
    {profile.planKey ? <span className={styles.profilePlan}>{profile.planKey.toUpperCase()}</span> : null}</div></div>
    <dl className={styles.metrics}><div><dt>{copy.rank}</dt><dd>{profile.standing ? new Intl.NumberFormat(locale).format(profile.standing.rank) : "—"}</dd></div><div><dt>{locale === "pt-BR" ? "Pontos confirmados" : "Confirmed points"}</dt><dd>{profile.standing ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(profile.standing.points) : "—"}</dd></div><div><dt>{copy.followers}</dt><dd>{new Intl.NumberFormat(locale).format(profile.followerCount)}</dd></div></dl>
    <div className={styles.actions}>{profile.viewer === "self" ? <p>{copy.self}</p> : profile.viewer === "guest" ?
      <Link href={touchLineAuthEntryHref("login", locale, publicOwnerHref(publicId, locale))} className={controls.link} data-action="follow">{copy.login}</Link> :
      <button className={controls.link} type="button" data-action="follow" aria-pressed={profile.following} aria-label={busy ? copy.saving : profile.following ? `${copy.following}: ${copy.unfollow}` : copy.follow} disabled={busy || uncertain} onClick={() => update(true)}>{!busy && profile.following ? <Check size={14} aria-hidden="true" /> : null}{busy ? copy.saving : profile.following ? copy.following : copy.follow}</button>}
    <button className={controls.link} type="button" disabled={busy} onClick={() => update(false)}>{copy.retry}</button>
    </div>
    </header>
    {uncertain ? <p role="alert">{copy.writeError}</p> : null}
    {profile.viewer === "member" ? <ClubOwnerPublicMarket key={profile.publicId} publicId={profile.publicId} locale={locale} /> : null}
  </section>;
}

"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { parsePublicOwnerProfile, peopleCopy, publicOwnerHref, type PeopleLocale, type PublicOwnerProfile } from "@/lib/touchlineArena/clubowner-public-contract";
import { PublicOwnersRequestError, usePublicOwnersRequest } from "./usePublicOwnersRequest";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPublic.module.css";
import ClubOwnerPublicAvatar from "./ClubOwnerPublicAvatar";

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
      const next = parsePublicOwnerProfile((await io.request(write ? `${endpoint}/follow` : endpoint, write ? { active: !profile!.following } : undefined)).profile);
      if (!next) throw new Error("MISSING_PROFILE");
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
  return <section className={styles.panel} aria-labelledby="public-owner-name" aria-busy={busy}>
    <ClubOwnerPublicAvatar publicId={profile.publicId} avatarUrl={profile.avatarUrl} displayName={profile.displayName} locale={locale} />
    <h1 id="public-owner-name">{profile.displayName}</h1>
    <p>{copy.id}: <span className={styles.id}>{profile.publicId}</span></p>
    <dl className={styles.metrics}><div><dt>{copy.followers}</dt><dd>{new Intl.NumberFormat(locale).format(profile.followerCount)}</dd></div></dl>
    <div className={styles.actions}>{profile.viewer === "self" ? <p>{copy.self}</p> : profile.viewer === "guest" ?
      <Link href={touchLineAuthEntryHref("login", locale, publicOwnerHref(publicId, locale))} className={controls.link}>{copy.login}</Link> :
      <button className={controls.link} type="button" aria-pressed={profile.following} disabled={busy || uncertain} onClick={() => update(true)}>{busy ? copy.saving : profile.following ? copy.unfollow : copy.follow}</button>}
    <button className={controls.link} type="button" disabled={busy} onClick={() => update(false)}>{copy.retry}</button>
    </div>
    {uncertain ? <p role="alert">{copy.writeError}</p> : null}
  </section>;
}

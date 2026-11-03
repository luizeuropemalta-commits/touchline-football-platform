"use client";
import { clubOwnerAvatarInvalidation } from "@/lib/touchlineArena/clubowner-avatar-invalidation";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { parseOwnPublicOwner, peopleCopy, publicOwnerHref, publicOwnerSettingsHref, publicOwnerName, type OwnPublicOwner, type PeopleLocale } from "@/lib/touchlineArena/clubowner-public-contract";
import { PublicOwnersRequestError, usePublicOwnersRequest } from "./usePublicOwnersRequest";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPublic.module.css";
import ClubOwnerSearch from "./ClubOwnerSearch";

export default function ClubOwnerPublicDirectory({ locale, enabled, initialOwn, searchOnly = false, settingsOnly = false, photoSharingEnabled = false }: { locale: PeopleLocale; enabled: boolean; searchOnly?: boolean; settingsOnly?: boolean; photoSharingEnabled?: boolean; initialOwn: { status: number; profile: OwnPublicOwner | null } }) {
  const copy = peopleCopy(locale), io = usePublicOwnersRequest();
  const [profile, setProfile] = useState(initialOwn.profile);
  const [ownStatus, setOwnStatus] = useState(initialOwn.status);
  const [searchRevision, setSearchRevision] = useState(0);
  const [name, setName] = useState(initialOwn.profile?.displayName ?? "");
  const [published, setPublished] = useState(initialOwn.profile?.published ?? false);
  const [photoPublished, setPhotoPublished] = useState(initialOwn.profile?.photoPublished ?? false);
  const [canSharePhoto, setCanSharePhoto] = useState(photoSharingEnabled);
  const [ownBusy, setOwnBusy] = useState(false), ownLock = useRef(false);
  const [notice, setNotice] = useState<"saved" | "invalid" | "writeError" | "error" | null>(null);
  const login = touchLineAuthEntryHref("login", locale, `/clubowners?lang=${locale}`);

  async function readOwn() {
    if (ownLock.current) return;
    ownLock.current = true; setOwnBusy(true);
    try {
      const response = await io.request("/api/account/public-profile"), data = parseOwnPublicOwner(response.profile);
      if (io.alive()) { setProfile(data); setName(data?.displayName ?? ""); setPublished(data?.published ?? false); setPhotoPublished(data?.photoPublished ?? false);
        setCanSharePhoto(response.photoSharingAllowed === true); setOwnStatus(200); setNotice(null); setSearchRevision(n => n + 1); }
    } catch (error) {
      if (io.alive()) { setOwnStatus(error instanceof PublicOwnersRequestError ? error.status : 503); setNotice("error"); }
    } finally { ownLock.current = false; if (io.alive()) setOwnBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (ownLock.current || notice === "writeError") return;
    const displayName = name.trim();
    if (!publicOwnerName(displayName)) { setNotice("invalid"); return; }
    ownLock.current = true; setOwnBusy(true); setNotice(null);
    try {
      const saved = parseOwnPublicOwner((await io.request("/api/account/public-profile", { displayName, published,
        ...(canSharePhoto ? { photoPublished: published && photoPublished } : {}) })).profile);
      if (!saved) throw new Error("MISSING_SAVED_PROFILE");
      clubOwnerAvatarInvalidation.publish();
      if (io.alive()) { setProfile(saved); setName(saved.displayName); setPublished(saved.published); setPhotoPublished(saved.photoPublished ?? false); setNotice("saved"); setSearchRevision(n => n + 1); }
    } catch {
      if (io.alive()) setNotice("writeError");
    } finally { ownLock.current = false; if (io.alive()) setOwnBusy(false); }
  }
  if (!enabled) return <p role="status">{copy.unavailable}</p>;
  return <div className={searchOnly || settingsOnly ? undefined : styles.sections} lang={locale}>
    {!settingsOnly ? <section aria-labelledby="people-search-heading" className={styles.panel}>
      <h2 id="people-search-heading">{copy.title}</h2>
      <ClubOwnerSearch key={searchRevision} locale={locale} enabled />
      {searchOnly ? <div className={styles.identity}>
        <Link className={controls.link} href={publicOwnerSettingsHref(locale)}>{copy.manageProfile}</Link>
        <small>{copy.discoverableHelp}</small>
      </div> : null}
    </section> : null}
    {!searchOnly ? <section id="public-profile" aria-labelledby="people-own-heading" className={styles.panel}>
      <h2 id="people-own-heading">{copy.own}</h2><p>{canSharePhoto ? copy.photoPrivacy : copy.privacy}</p>
      {ownStatus === 401 ? <Link className={controls.link} href={login}>{copy.login}</Link> : ownStatus === 403 ? <p role="status">{copy.forbidden}</p> : ownStatus !== 200 ? <>
        <p role="alert">{ownStatus === 503 ? copy.unavailable : copy.error}</p><button className={controls.link} type="button" onClick={readOwn} disabled={ownBusy}>{copy.retry}</button>
      </> : <>
        <form onSubmit={save} className={styles.form}>
          <label htmlFor="people-name">{copy.name}</label>
          <input id="people-name" value={name} minLength={2} maxLength={60} required autoComplete="off" disabled={ownBusy} onChange={event => setName(event.target.value)} aria-describedby="people-name-help" />
          <small id="people-name-help">{copy.nameHelp}</small>
          <label className={styles.consent}><input type="checkbox" checked={published} disabled={ownBusy} onChange={event => setPublished(event.target.checked)} />{copy.consent}</label>
          {canSharePhoto ? <label className={styles.consent}><input type="checkbox" checked={published && photoPublished} disabled={ownBusy || !published} onChange={event => setPhotoPublished(event.target.checked)} />{copy.photoConsent}</label> : null}
          <button className={controls.link} disabled={ownBusy || notice === "writeError"} type="submit">{ownBusy ? copy.saving : copy.save}</button>
        </form>
        {notice ? <p role={notice === "saved" ? "status" : "alert"}>{copy[notice]}</p> : null}
        {notice === "writeError" ? <button className={controls.link} type="button" onClick={readOwn} disabled={ownBusy}>{copy.retry}</button> : null}
        {profile ? <div className={styles.identity}><p>{profile.published ? copy.published : copy.hidden}</p>
          <p>{copy.id}: <span className={styles.id}>{profile.publicId}</span></p><small>{copy.permanent}</small>
          {profile.published ? <Link className={controls.link} href={publicOwnerHref(profile.publicId, locale)}>{copy.view}</Link> : null}
        </div> : null}
      </>}
    </section> : null}
  </div>;
}

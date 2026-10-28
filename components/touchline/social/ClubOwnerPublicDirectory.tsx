"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { parseOwnPublicOwner, parsePublicOwners, peopleCopy, publicOwnerHref, publicOwnerName, publicOwnerQuery, type OwnPublicOwner, type PeopleLocale, type PublicOwner } from "@/lib/touchlineArena/clubowner-public-contract";
import { PublicOwnersRequestError, usePublicOwnersRequest } from "./usePublicOwnersRequest";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPublic.module.css";

export default function ClubOwnerPublicDirectory({ locale, enabled, initialOwn }: { locale: PeopleLocale; enabled: boolean; initialOwn: { status: number; profile: OwnPublicOwner | null } }) {
  const copy = peopleCopy(locale), io = usePublicOwnersRequest();
  const [profile, setProfile] = useState(initialOwn.profile);
  const [ownStatus, setOwnStatus] = useState(initialOwn.status);
  const [name, setName] = useState(initialOwn.profile?.displayName ?? "");
  const [published, setPublished] = useState(initialOwn.profile?.published ?? false);
  const [ownBusy, setOwnBusy] = useState(false), ownLock = useRef(false);
  const [notice, setNotice] = useState<"saved" | "invalid" | "writeError" | "error" | null>(null);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [results, setResults] = useState<PublicOwner[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false), searchLock = useRef(false);
  const [searchError, setSearchError] = useState<"invalid" | "error" | null>(null);
  const login = touchLineAuthEntryHref("login", locale, `/clubowners?lang=${locale}`);

  async function readOwn() {
    if (ownLock.current) return;
    ownLock.current = true; setOwnBusy(true);
    try {
      const data = parseOwnPublicOwner((await io.request("/api/account/public-profile")).profile);
      if (io.alive()) { setProfile(data); setName(data?.displayName ?? ""); setPublished(data?.published ?? false); setOwnStatus(200); setNotice(null); }
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
      const saved = parseOwnPublicOwner((await io.request("/api/account/public-profile", { displayName, published })).profile);
      if (!saved) throw new Error("MISSING_SAVED_PROFILE");
      if (io.alive()) { setProfile(saved); setName(saved.displayName); setPublished(saved.published); setNotice("saved"); setResults(null); }
    } catch {
      if (io.alive()) setNotice("writeError");
    } finally { ownLock.current = false; if (io.alive()) setOwnBusy(false); }
  }
  async function search(event: FormEvent) {
    event.preventDefault(); if (searchLock.current) return;
    const value = query.trim();
    if (!publicOwnerQuery(value)) { setSearchError("invalid"); return; }
    searchLock.current = true; setSearchBusy(true); setSearchError(null);
    try {
      const found = parsePublicOwners((await io.request(`/api/touchline/clubowners?q=${encodeURIComponent(value)}`)).profiles);
      if (io.alive()) { setResults(found); setSearched(value); }
    } catch { if (io.alive()) { setSearchError("error"); setResults(null); } }
    finally { searchLock.current = false; if (io.alive()) setSearchBusy(false); }
  }
  if (!enabled) return <p role="status">{copy.unavailable}</p>;
  return <div className={styles.sections}>
    <section aria-labelledby="people-search-heading" className={styles.panel}>
      <h2 id="people-search-heading">{copy.title}</h2><p>{copy.introduction}</p>
      <form onSubmit={search} className={styles.form}>
        <label htmlFor="people-query">{copy.query}</label>
        <input id="people-query" type="search" value={query} minLength={2} maxLength={80} required autoComplete="off" onChange={event => setQuery(event.target.value)} aria-describedby="people-query-help" />
        <small id="people-query-help">{copy.queryHelp}</small>
        <button className={controls.link} disabled={searchBusy} type="submit">{searchBusy ? copy.loading : copy.search}</button>
      </form>
      {searchError ? <p role="alert">{copy[searchError]}</p> : null}
      {results ? <div aria-live="polite" aria-busy={searchBusy}>
        <p>{searched}</p>
        {results.length === 0 ? <p>{copy.empty}</p> : <ul className={styles.results}>{results.map(result => <li key={result.publicId}>
          <Link href={publicOwnerHref(result.publicId, locale)} className={controls.link}>{result.displayName}</Link>
          <small>{copy.id}: <span className={styles.id}>{result.publicId}</span></small>
        </li>)}</ul>}
        {results.length === 20 ? <small>{copy.limit}</small> : null}
      </div> : null}
    </section>
    <section aria-labelledby="people-own-heading" className={styles.panel}>
      <h2 id="people-own-heading">{copy.own}</h2><p>{copy.privacy}</p>
      {ownStatus === 401 ? <Link className={controls.link} href={login}>{copy.login}</Link> : ownStatus === 403 ? <p role="status">{copy.forbidden}</p> : ownStatus !== 200 ? <>
        <p role="alert">{copy.error}</p><button className={controls.link} type="button" onClick={readOwn} disabled={ownBusy}>{copy.retry}</button>
      </> : <>
        <form onSubmit={save} className={styles.form}>
          <label htmlFor="people-name">{copy.name}</label>
          <input id="people-name" value={name} minLength={2} maxLength={60} required autoComplete="off" disabled={ownBusy} onChange={event => setName(event.target.value)} aria-describedby="people-name-help" />
          <small id="people-name-help">{copy.nameHelp}</small>
          <label className={styles.consent}><input type="checkbox" checked={published} disabled={ownBusy} onChange={event => setPublished(event.target.checked)} />{copy.consent}</label>
          <button className={controls.link} disabled={ownBusy || notice === "writeError"} type="submit">{ownBusy ? copy.saving : copy.save}</button>
        </form>
        {notice ? <p role={notice === "saved" ? "status" : "alert"}>{copy[notice]}</p> : null}
        {notice === "writeError" ? <button className={controls.link} type="button" onClick={readOwn} disabled={ownBusy}>{copy.retry}</button> : null}
        {profile ? <div className={styles.identity}><p>{profile.published ? copy.published : copy.hidden}</p>
          <p>{copy.id}: <span className={styles.id}>{profile.publicId}</span></p><small>{copy.permanent}</small>
          {profile.published ? <Link className={controls.link} href={publicOwnerHref(profile.publicId, locale)}>{copy.view}</Link> : null}
        </div> : null}
      </>}
    </section>
  </div>;
}

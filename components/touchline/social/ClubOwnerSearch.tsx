"use client";

import Link from "next/link";
import { Check, Search, Trophy, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { parsePublicOwnerProfile, parsePublicOwnerSearchPage, peopleCopy, publicOwnerHref, publicOwnerQuery, type PeopleLocale, type PublicOwnerSearchResult } from "@/lib/touchlineArena/clubowner-public-contract";
import ClubOwnerPublicAvatar from "./ClubOwnerPublicAvatar";
import { usePublicOwnersRequest } from "./usePublicOwnersRequest";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerSearch.module.css";

type Props = { locale: PeopleLocale; enabled: boolean; inputRef?: RefObject<HTMLInputElement | null> };
/** Public discovery only. Ranking and relationship data are confirmed by the server. */
export default function ClubOwnerSearch({ locale, enabled, inputRef }: Props) {
  const copy = peopleCopy(locale), id = useId();
  const ownInput = useRef<HTMLInputElement>(null), field = inputRef ?? ownInput;
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<{ rows: PublicOwnerSearchResult[]; nextCursor: string | null; query: string } | null>(null);
  const [outcome, setOutcome] = useState<{ query: string; cursor: string | null; attempt: number; status: "ready" | "error" } | null>(null);
  const value = query.trim();
  const invalid = Boolean(value && !publicOwnerQuery(value));
  const status = invalid ? "invalid" : outcome?.query === value && outcome.cursor === cursor && outcome.attempt === attempt ? outcome.status : "loading";
  useEffect(() => {
    if (!enabled || invalid) return;
    const controller = new AbortController();
    let cancelled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      deadline = setTimeout(() => controller.abort(), 15_000);
      const params = new URLSearchParams({ q: value });
      if (cursor) params.set("cursor", cursor);
      void fetch(`/api/touchline/clubowners?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error("DISCOVERY_UNAVAILABLE");
          return parsePublicOwnerSearchPage(await response.json());
        }).then(next => {
          if (cancelled) return;
          setPage(previous => {
            const rows = cursor && previous?.query === value ? previous.rows : [];
            const found = new Map(rows.map(row => [row.publicId, row]));
            for (const row of next.profiles) found.set(row.publicId, row);
            return { rows: [...found.values()], nextCursor: next.nextCursor, query: value };
          });
          setOutcome({ query: value, cursor, attempt, status: "ready" });
        }).catch(() => { if (!cancelled) setOutcome({ query: value, cursor, attempt, status: "error" }); })
        .finally(() => { if (deadline) clearTimeout(deadline); });
    }, value && !cursor ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); if (deadline) clearTimeout(deadline); controller.abort(); };
  }, [enabled, invalid, value, cursor, attempt]);
  if (!enabled) return <p role="status">{copy.unavailable}</p>;
  const changeQuery = (next: string) => { setQuery(next); setCursor(null); setAttempt(n => n + 1); };
  const refresh = () => { setCursor(null); setAttempt(n => n + 1); };
  const updateProfile = (profile: NonNullable<ReturnType<typeof parsePublicOwnerProfile>>) => {
    setPage(previous => previous ? { ...previous, rows: previous.rows.map(row => row.publicId === profile.publicId ? { ...row, ...profile } : row) } : previous);
    refresh();
  };
  return <section className={styles.search} aria-label={copy.title}>
    <form className={styles.searchForm} role="search" onSubmit={event => { event.preventDefault(); refresh(); }}>
      <label htmlFor={id} className="sr-only">{copy.query}</label>
      <div className={styles.inputShell}><Search size={22} aria-hidden="true" />
        <input ref={field} id={id} value={query} type="search" autoComplete="off" maxLength={80} placeholder={copy.query} onChange={event => changeQuery(event.target.value)} />
        {query ? <button className={controls.link} type="button" aria-label={copy.clearSearch} onClick={() => { changeQuery(""); field.current?.focus(); }}><X size={17} aria-hidden="true" /></button> : null}
      </div>
    </form>
    <div className={styles.listHeading}><h3>{value ? copy.search : copy.rankedTitle}</h3></div>
    <div aria-live="polite" aria-busy={status === "loading"}>
      {status === "loading" ? <p className={styles.state} role="status">{copy.loading}</p> : null}
      {status === "invalid" ? <p className={styles.state}>{copy.queryHelp}</p> : null}
      {status === "error" ? <div className={styles.state} role="alert"><p>{copy.error}</p></div> : null}
      {page?.query === value && page.rows.length ? <ol className={styles.results}>{page.rows.map(person => <ClubOwnerSearchRow key={`${value}:${person.publicId}`} person={person} locale={locale} onProfileChange={updateProfile} />)}</ol> : status === "ready" ? <p className={styles.state}>{value ? copy.empty : copy.browseEmpty}</p> : null}
    </div>
    {status === "ready" && page?.nextCursor ? <button className={`${controls.link} ${styles.more}`} type="button" onClick={() => setCursor(page.nextCursor)}>{copy.moreResults}</button> : null}
  </section>;
}

function ClubOwnerSearchRow({ person, locale, onProfileChange }: { person: PublicOwnerSearchResult; locale: PeopleLocale; onProfileChange: (profile: NonNullable<ReturnType<typeof parsePublicOwnerProfile>>) => void }) {
  const copy = peopleCopy(locale), io = usePublicOwnersRequest();
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const lock = useRef(false), current = person;
  const endpoint = `/api/touchline/clubowners/${encodeURIComponent(person.publicId)}`;
  async function follow(refresh = false) {
    if (lock.current || (!refresh && uncertain)) return;
    lock.current = true; setBusy(true);
    try {
      const profile = parsePublicOwnerProfile((await io.request(refresh ? endpoint : `${endpoint}/follow`, refresh ? undefined : { active: !current.following })).profile);
      if (!profile || profile.publicId.toLowerCase() !== person.publicId.toLowerCase()
        || (!refresh && (profile.following !== !current.following || profile.viewer !== "member"))) throw new Error("PROFILE_RECEIPT_UNCONFIRMED");
      if (io.alive()) { onProfileChange(profile); setUncertain(false); }
    } catch { if (io.alive()) setUncertain(true); }
    finally { lock.current = false; if (io.alive()) setBusy(false); }
  }
  return <li className={styles.result}>
    <Link href={publicOwnerHref(person.publicId, locale)} className={styles.portrait} aria-label={current.displayName}><ClubOwnerPublicAvatar retryEnabled={false} publicId={person.publicId} avatarUrl={current.avatarUrl ?? null} displayName={current.displayName} locale={locale} planKey={current.planKey} /></Link>
    <div className={styles.resultIdentity}><Link className={styles.profileLink} href={publicOwnerHref(person.publicId, locale)}>{current.displayName}</Link>
      <span className={styles.resultMeta}>{new Intl.NumberFormat(locale).format(current.followerCount)} {copy.followers.toLocaleLowerCase(locale)}</span>
    </div>
    <div className={styles.resultAside}><span className={styles.rank} aria-label={person.rank === null ? copy.rankPending : `${copy.rank} ${person.rank}`}><Trophy size={18} aria-hidden="true" /><span><small>{copy.rank}</small><strong>{person.rank === null ? "—" : `#${new Intl.NumberFormat(locale).format(person.rank)}`}</strong></span></span><div className={styles.followAction}>{current.viewer === "self" ? <span className={styles.self}>{copy.self}</span> : current.viewer === "guest" ? <Link className={controls.link} data-action="follow" href={touchLineAuthEntryHref("login", locale, publicOwnerHref(person.publicId, locale))}>{copy.follow}</Link>
      : <button type="button" className={controls.link} data-action="follow" disabled={busy || uncertain} aria-pressed={current.following} aria-label={busy ? copy.saving : current.following ? `${copy.following}: ${copy.unfollow}` : copy.follow} onClick={() => void follow()}>{!busy && current.following ? <Check size={14} aria-hidden="true" /> : null}{busy ? copy.saving : current.following ? copy.following : copy.follow}</button>}</div>
    </div>
    {uncertain ? <div className={styles.rowNotice} role="alert"><p>{copy.writeError}</p><button type="button" className={controls.link} disabled={busy} onClick={() => void follow(true)}>{copy.retry}</button></div> : null}
  </li>;
}

"use client";
/* eslint-disable @next/next/no-img-element -- Bounded disposable blob URLs must bypass the image optimizer and its cache. */
import { useEffect, useRef, useState } from "react";
import { loadPublicOwnerAvatar } from "@/lib/touchlineArena/clubowner-public-avatar-client";
import { peopleCopy, type PeopleLocale } from "@/lib/touchlineArena/clubowner-public-contract";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPublic.module.css";

type Props = {
  publicId: string; avatarUrl?: string | null; displayName: string; locale: PeopleLocale;
};
export default function ClubOwnerPublicAvatar(props: Props) {
  if (props.avatarUrl === undefined) return null;
  // Reset disposable state even when a URL returns after a null/OFF interval.
  return <PublicAvatarView key={`${props.publicId}:${props.avatarUrl ?? "none"}`} {...props} />;
}

function PublicAvatarView({ publicId, avatarUrl, displayName, locale }: Props) {
  const copy = peopleCopy(locale), element = useRef<HTMLSpanElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ publicId: string; source: string; attempt: number; status: "ready" | "not-found" | "unavailable"; blobUrl?: string } | null>(null);
  useEffect(() => {
    if (!avatarUrl) return;
    const source = avatarUrl, controller = new AbortController(); let started = false, blobUrl: string | undefined;
    const start = () => {
      if (started || controller.signal.aborted) return; started = true;
      void loadPublicOwnerAvatar(source, publicId, controller.signal).then(value => {
        if (controller.signal.aborted) return;
        if (value.status === "ready") blobUrl = URL.createObjectURL(value.blob);
        setResult({ publicId, source, attempt, status: value.status, blobUrl });
      }).catch(() => { if (!controller.signal.aborted) setResult({ publicId, source, attempt, status: "unavailable" }); });
    };
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); start(); }
    }) : null;
    if (observer && element.current) observer.observe(element.current); else start();
    return () => { observer?.disconnect(); controller.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [avatarUrl, publicId, attempt]);
  if (avatarUrl === undefined) return null;
  const current = result?.publicId === publicId && result.source === avatarUrl && result.attempt === attempt ? result : null;
  const status = !avatarUrl ? "not-found" : current?.status ?? "loading";
  return <span ref={element} className={styles.avatar} aria-busy={status === "loading"}>
    {status === "ready" && current?.blobUrl ? <img src={current.blobUrl} width={56} height={56} alt={`${copy.photoAlt}: ${displayName}`} />
      : <span className={styles.avatarFallback} role="img" aria-label={status === "not-found" ? copy.photoMissing : status === "loading" ? copy.photoLoading : copy.photoUnavailable}>
        {([...displayName.trim()][0] ?? "").toLocaleUpperCase(locale)}
      </span>}
    {status === "unavailable" ? <button type="button" className={controls.link} onClick={() => setAttempt(value => value + 1)}>{copy.photoRetry}</button> : null}
  </span>;
}

"use client";
/* eslint-disable @next/next/no-img-element -- Bounded disposable blob URLs must bypass the image optimizer and its cache. */
import { useEffect, useRef, useState } from "react";
import { clubOwnerAvatarInvalidation } from "@/lib/touchlineArena/clubowner-avatar-invalidation";
import { createVisibleOwnerAvatarRefresh, refreshPublicOwnerAvatar } from "@/lib/touchlineArena/clubowner-avatar-refresh";
import { loadPublicOwnerAvatar } from "@/lib/touchlineArena/clubowner-public-avatar-client";
import { peopleCopy, type PeopleLocale, type PublicOwnerPlanKey } from "@/lib/touchlineArena/clubowner-public-contract";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPublic.module.css";

type Props = {
  retryEnabled?: boolean; publicId: string; avatarUrl?: string | null; displayName: string; locale: PeopleLocale; planKey?: PublicOwnerPlanKey | null;
};
export default function ClubOwnerPublicAvatar(props: Props) {
  // Reset disposable state even when a URL returns after a null/OFF interval.
  return <PublicAvatarView key={`${props.publicId}:${props.avatarUrl ?? "none"}`} {...props} />;
}

function PublicAvatarView({ publicId, avatarUrl, displayName, locale, planKey, retryEnabled = true }: Props) {
  const copy = peopleCopy(locale), element = useRef<HTMLSpanElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [metadataFailed, setMetadataFailed] = useState(false);
  const [liveUrl, setLiveUrl] = useState(avatarUrl);
  useEffect(() => {
    if (avatarUrl === undefined) return;
    let visible = false;
    const lifecycle = createVisibleOwnerAvatarRefresh(
      () => visible && document.visibilityState === "visible",
      signal => refreshPublicOwnerAvatar(publicId, signal),
      url => { setLiveUrl(url); setMetadataFailed(false); },
      () => { setLiveUrl(null); setMetadataFailed(true); },
    );
    const refresh = lifecycle.refresh;
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting); refresh();
    }) : null;
    if (observer && element.current) observer.observe(element.current); else { visible = true; refresh(); }
    const unsubscribe = clubOwnerAvatarInvalidation.subscribe(refresh);
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { lifecycle.dispose(); observer?.disconnect(); unsubscribe(); clearInterval(timer);
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [publicId, avatarUrl, attempt]);
  const [result, setResult] = useState<{ publicId: string; source: string; attempt: number; status: "ready" | "not-found" | "unavailable"; blobUrl?: string } | null>(null);
  useEffect(() => {
    if (!liveUrl) return;
    const source = liveUrl, controller = new AbortController(); let started = false, blobUrl: string | undefined;
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
  }, [liveUrl, publicId, attempt]);
  if (avatarUrl === undefined) return null;
  const current = result?.publicId === publicId && result.source === liveUrl && result.attempt === attempt ? result : null;
  const status = metadataFailed ? "unavailable" : !liveUrl ? "not-found" : current?.status ?? "loading";
  return <span ref={element} className={styles.avatar} data-plan={planKey ?? "unconfirmed"} aria-busy={status === "loading"}>
    <span className={styles.avatarPortrait} data-touchline-decoration-motion="true">
    {status === "ready" && current?.blobUrl ? <img src={current.blobUrl} width={56} height={56} alt={`${copy.photoAlt}: ${displayName}`} />
      : <span className={styles.avatarFallback} role="img" aria-label={status === "not-found" ? copy.photoMissing : status === "loading" ? copy.photoLoading : copy.photoUnavailable}>
        {([...displayName.trim()][0] ?? "").toLocaleUpperCase(locale)}
      </span>}
    </span>
    {status === "unavailable" && retryEnabled ? <button type="button" className={controls.link} onClick={() => setAttempt(value => value + 1)}>{copy.photoRetry}</button> : null}
  </span>;
}

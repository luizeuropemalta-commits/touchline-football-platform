"use client";

import { useEffect, useRef, useState } from "react";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchlineMatchCentreCopy } from "@/lib/touchlineArena/match-centre-i18n";
import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { getClubHubStripCopy } from "@/lib/touchlineArena/club-hub-fixture-strip-i18n";
import { clubHubStripScore, clubHubStripState, parseClubHubStripSnapshot, type ClubHubStripSnapshot } from "@/lib/touchlineArena/club-hub-fixture-strip";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubHubFixtureStrip.module.css";

export default function ClubHubFixtureStrip({ locale, draftLocalesEnabled = false }: { locale: TouchLineLocale; draftLocalesEnabled?: boolean }) {
  const [snapshot, setSnapshot] = useState<ClubHubStripSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [zone, setZone] = useState("UTC");
  const [observedAt, setObservedAt] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const copy = getTouchlineMatchCentreCopy(locale, draftLocalesEnabled);
  const motion = getClubHubStripCopy(locale, draftLocalesEnabled);

  useEffect(() => {
    const updateClock = () => { if (!document.hidden) setObservedAt(Date.now()); };
    const timer = window.setInterval(updateClock, 15_000);
    document.addEventListener("visibilitychange", updateClock);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", updateClock); };
  }, []);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (disposed || document.hidden || controller) return;
      const request = new AbortController();
      controller = request;
      const deadline = window.setTimeout(() => request.abort(), 12_000);
      try {
        const response = await fetch("/api/football-data/fantasy/livescores", { cache: "no-store", signal: request.signal });
        const next = response.ok ? parseClubHubStripSnapshot(await response.json()) : null;
        if (!next) throw new Error("Unavailable persisted snapshot");
        if (!disposed && !request.signal.aborted) {
          setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
          setObservedAt(Date.now()); setSnapshot(next); setFailed(false);
        }
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        window.clearTimeout(deadline);
        controller = null;
        if (!disposed && !document.hidden) timer = setTimeout(refresh, 45_000);
      }
    }
    function visibility() {
      clearTimeout(timer);
      if (document.hidden) controller?.abort();
      else void refresh();
    }
    void refresh();
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    const node = viewport.current;
    if (!node || paused || held) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let direction = 1;
    let position = node.scrollLeft;
    let maximum = 0;
    let visible = false;
    let disposed = false;
    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    }
    function reconcile() {
      if (disposed || !visible || document.hidden || reduced.matches || maximum <= 0) {
        stop();
      } else if (!frame) {
        position = node!.scrollLeft;
        frame = requestAnimationFrame(step);
      }
    }
    // Measure only when geometry changes, never after scroll writes on every frame.
    function measure() {
      maximum = node!.scrollWidth - node!.clientWidth;
      position = Math.max(0, Math.min(maximum, position));
      reconcile();
    }
    function step(time: number) {
      frame = 0;
      if (!node || disposed || !visible || document.hidden || reduced.matches || maximum <= 0) return;
      const distance = Math.min(time - (previous || time), 40) * .018;
      position = Math.max(0, Math.min(maximum, position + direction * distance));
      node.scrollLeft = position;
      if (position >= maximum) direction = -1;
      if (position <= 0) direction = 1;
      previous = time;
      frame = requestAnimationFrame(step);
    }
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      reconcile();
    });
    const resize = new ResizeObserver(measure);
    intersection.observe(node);
    resize.observe(node);
    if (node.firstElementChild) resize.observe(node.firstElementChild);
    reduced.addEventListener("change", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    measure();
    return () => {
      disposed = true;
      stop();
      intersection.disconnect();
      resize.disconnect();
      reduced.removeEventListener("change", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [paused, held, snapshot?.fixtures.length]);

  const metadata = failed ? null : snapshot?.metadata ?? null;
  const caution = failed || snapshot?.metadata.degraded;
  const cautionText = snapshot?.metadata.state === "partial-persisted-schedule" ? copy.partialScheduleCopy : copy.liveDataUpdatingCopy;
  return <section className={styles.strip} aria-label={copy.currentFixtures} dir={locale === "ar-SA" ? "rtl" : "ltr"}>
    <button type="button" className={`${controls.link} ${styles.motion}`} aria-label={paused ? motion.play : motion.pause}
      title={paused ? motion.play : motion.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        {paused ? <path d="M4 2L13 8L4 14Z" /> : <path d="M3 2H6V14H3ZM10 2H13V14H10Z" />}
      </svg>
    </button>
    {caution ? <p className={styles.srOnly}>{cautionText}</p> : null}
    <div ref={viewport} className={styles.viewport} tabIndex={0} aria-label={copy.select} dir="ltr"
      onMouseEnter={() => setHeld(true)} onMouseLeave={(event) => setHeld(event.currentTarget.matches(":focus-within"))}
      onFocusCapture={() => setHeld(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHeld(event.currentTarget.matches(":hover")); }}
      onPointerDown={() => setPaused(true)} onWheel={() => setPaused(true)}>
      <div className={styles.track}>
        {snapshot?.fixtures.map((fixture) => {
          const state = clubHubStripState(fixture, metadata, observedAt);
          const kickoff = fixture.startsAt ? formatTouchlineLocalKickoff(fixture.startsAt, zone, locale, draftLocalesEnabled) : null;
          const value = state === "upcoming" ? kickoff?.time ?? "—" : clubHubStripScore(fixture);
          const label = state === "live" ? `${copy.liveNow}${fixture.liveMinute !== undefined ? ` · ${fixture.liveMinute}′` : ""}`
            : state === "finished" ? copy.completed : state === "awaiting-update" ? copy.awaitingOfficialUpdate
            : state === "upcoming" ? kickoff ? `${kickoff.date} · ${kickoff.zoneName}` : copy.next : copy.liveDataUpdating;
          const teams = [fixture.homeTeam, fixture.awayTeam];
          const description = `${fixture.homeTeam?.name} ${copy.versus} ${fixture.awayTeam?.name}: ${value}. ${label}${caution ? `. ${cautionText}` : ""}`;
          return <a key={fixture.providerId} className={styles.fixture} data-state={state}
            href={`/live?fixture=${encodeURIComponent(fixture.providerId)}&lang=${encodeURIComponent(locale)}`}
            aria-label={description} title={description}>
            <span className={styles.crest}>{teams[0]?.logoUrl ? <img src={teams[0].logoUrl} alt="" width={28} height={32} /> : <span>{teams[0]?.shortCode ?? "—"}</span>}</span>
            <b>{value}</b>
            <span className={styles.crest}>{teams[1]?.logoUrl ? <img src={teams[1].logoUrl} alt="" width={28} height={32} /> : <span>{teams[1]?.shortCode ?? "—"}</span>}</span>
          </a>;
        })}
        {!snapshot?.fixtures.length ? <p className={styles.empty}>{failed || !snapshot ? copy.liveDataUpdating : copy.noFixtures}</p> : null}
      </div>
    </div>
  </section>;
}

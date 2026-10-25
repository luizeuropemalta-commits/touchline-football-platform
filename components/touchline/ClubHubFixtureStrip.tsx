"use client";

import { useEffect, useRef, useState } from "react";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import type { TouchlineLiveReadMetadata } from "@/lib/touchlineArena/match-centre";
import { useTouchlinePublishedLive } from "@/lib/touchlineArena/sports-publication-client";
import { getTouchlineMatchCentreCopy } from "@/lib/touchlineArena/match-centre-i18n";
import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { getClubHubStripCopy } from "@/lib/touchlineArena/club-hub-fixture-strip-i18n";
import { clubHubStripScore, clubHubStripState, clubHubStripSeedNeedsRecovery, parseClubHubStripSnapshot, type ClubHubStripSnapshot } from "@/lib/touchlineArena/club-hub-fixture-strip";
import { fixtureStripFrameDistance, wrapFixtureStripOffset, normalizeFixtureStripScrollOffset } from "@/lib/touchlineArena/fixture-strip-motion";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubHubFixtureStrip.module.css";

const EMPTY_FIXTURES: TouchlinePublicFixture[] = [];

export default function ClubHubFixtureStrip({ locale, draftLocalesEnabled = false, initialFixtures, initialMetadata = null, initialNow = 0, initialTimeZone = "UTC" }: {
  locale: TouchLineLocale; draftLocalesEnabled?: boolean; initialFixtures?: TouchlinePublicFixture[] | null;
  initialMetadata?: TouchlineLiveReadMetadata | null; initialNow?: number; initialTimeZone?: string;
}) {
  const [snapshot, setSnapshot] = useState<ClubHubStripSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [zone, setZone] = useState(initialTimeZone);
  const [observedAt, setObservedAt] = useState(initialNow);
  const [canLoop, setCanLoop] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const originalRun = useRef<HTMLDivElement>(null);
  const cycleWidth = useRef(0);
  const interaction = useRef({ hovered: false, touching: false, resumeAfter: 0 });
  const synchronizeMotion = useRef<(() => void) | null>(null);
  const copy = getTouchlineMatchCentreCopy(locale, draftLocalesEnabled);
  const motion = getClubHubStripCopy(locale, draftLocalesEnabled);
  const needsInitialRead = clubHubStripSeedNeedsRecovery(initialFixtures);
  const { fixtures, metadata } = useTouchlinePublishedLive(initialFixtures ?? snapshot?.fixtures ?? EMPTY_FIXTURES,
    !needsInitialRead ? initialMetadata : snapshot?.metadata ?? null, observedAt);

  useEffect(() => {
    const updateClock = () => {
      if (!document.hidden) {
        setObservedAt(Date.now());
        setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || initialTimeZone);
      }
    };
    const frame = requestAnimationFrame(updateClock);
    const timer = window.setInterval(updateClock, 15_000);
    document.addEventListener("visibilitychange", updateClock);
    return () => { cancelAnimationFrame(frame); window.clearInterval(timer); document.removeEventListener("visibilitychange", updateClock); };
  }, [initialTimeZone]);

  // Read the ClubHub schedule once. All later score updates use the same
  // publication transport as cards and Live, without a second polling loop.
  useEffect(() => {
    if (!needsInitialRead) return;
    let active = true;
    const controller = new AbortController();
    const deadline = window.setTimeout(() => {
      if (active) setFailed(true);
      controller.abort();
    }, 12_000);
    void (async () => {
      try {
        const response = await fetch("/api/football-data/fantasy/livescores", { cache: "no-store", signal: controller.signal });
        const next = response.ok ? parseClubHubStripSnapshot(await response.json()) : null;
        if (!next) throw new Error("Unavailable persisted snapshot");
        if (active && !controller.signal.aborted) { setSnapshot(next); setFailed(false); }
      } catch {
        if (active && !controller.signal.aborted) setFailed(true);
      } finally { window.clearTimeout(deadline); }
    })();
    return () => { active = false; controller.abort(); window.clearTimeout(deadline); };
  }, [needsInitialRead]);

  useEffect(() => {
    const node = viewport.current;
    const run = originalRun.current;
    if (!node || !run) return;
    const measure = () => {
      const width = run.getBoundingClientRect().width;
      const overflow = width > node.clientWidth + 1;
      setCanLoop(overflow);
      if (overflow && canLoop && width !== cycleWidth.current) {
        const progress = cycleWidth.current ? (node.scrollLeft - cycleWidth.current) / cycleWidth.current : 0;
        node.scrollLeft = wrapFixtureStripOffset(width * (1 + progress), width);
      }
      cycleWidth.current = canLoop && overflow ? width : 0;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(run);
    measure();
    return () => { observer.disconnect(); };
  }, [canLoop, fixtures.length]);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    let frame = 0;
    let active = true;
    const cancelReveal = () => { cancelAnimationFrame(frame); frame = 0; };
    const revealFocusedFixture = (event: FocusEvent) => {
      cancelReveal();
      const target = event.target;
      if (!(target instanceof HTMLElement) || !originalRun.current?.contains(target)) return;
      // Native Tab scrolling can leave a focused link partially clipped. Wait
      // for that scroll, then reveal only this rail, never the document.
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!active || !target.isConnected || document.activeElement !== target || !node.contains(target)) return;
        const bounds = node.getBoundingClientRect();
        const item = target.getBoundingClientRect();
        const left = bounds.left + node.clientLeft;
        const right = left + node.clientWidth;
        // The focus outline is inset; no external focus-ring gutter is needed.
        const delta = item.left < left ? item.left - left : item.right > right ? item.right - right : 0;
        if (delta) node.scrollBy({ left: delta, behavior: "instant" });
      });
    };
    node.addEventListener("focusin", revealFocusedFixture);
    node.addEventListener("focusout", cancelReveal);
    return () => {
      active = false;
      cancelReveal();
      node.removeEventListener("focusin", revealFocusedFixture);
      node.removeEventListener("focusout", cancelReveal);
    };
  }, []);

  // Observe interaction even before an asynchronous seed creates overflow.
  // Recreating only the animation must not lose an already-held pointer/hover.
  useEffect(() => {
    const node = viewport.current;
    const strip = node?.parentElement;
    if (!node || !strip) return;
    let active = true;
    const notify = () => { if (active) synchronizeMotion.current?.(); };
    const enter = (event: PointerEvent) => {
      if (active && event.pointerType === "mouse") { interaction.current.hovered = true; notify(); }
    };
    const leave = () => { if (active) { interaction.current.hovered = false; notify(); } };
    const down = () => { if (active) { interaction.current.touching = true; notify(); } };
    const up = () => {
      if (active && interaction.current.touching) {
        interaction.current.touching = false;
        interaction.current.resumeAfter = performance.now() + 2500;
        notify();
      }
    };
    const wheel = () => {
      if (active) { interaction.current.resumeAfter = performance.now() + 2500; notify(); }
    };
    strip.addEventListener("pointerenter", enter);
    strip.addEventListener("pointerleave", leave);
    strip.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    node.addEventListener("wheel", wheel, { passive: true });
    return () => {
      active = false;
      strip.removeEventListener("pointerenter", enter);
      strip.removeEventListener("pointerleave", leave);
      strip.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      node.removeEventListener("wheel", wheel);
    };
  }, []);

  useEffect(() => {
    const node = viewport.current;
    const strip = node?.parentElement;
    if (!node || !strip || !canLoop) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previousTime = 0;
    let remainder = 0;
    const canObserveVisibility = typeof IntersectionObserver !== "undefined";
    // Wait for actual visibility where supported. Older hosts still retain
    // document visibility, reduced-motion and interaction pause safeguards.
    let visible = !canObserveVisibility;
    let resumeTimer = 0;
    let active = true;
    const interactionPaused = () => reducedMotion.matches || document.hidden || !visible || interaction.current.hovered || interaction.current.touching || strip.contains(document.activeElement);
    const synchronize = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      window.clearTimeout(resumeTimer);
      previousTime = 0;
      remainder = 0;
      if (interactionPaused()) return;
      const delay = interaction.current.resumeAfter - performance.now();
      if (delay > 0) resumeTimer = window.setTimeout(synchronize, delay);
      else frame = requestAnimationFrame(animate);
    };
    const animate = (time: number) => {
      if (!active) return;
      if (interactionPaused()) { synchronize(); return; }
      remainder += previousTime ? fixtureStripFrameDistance(time - previousTime) : 0;
      const pixels = Math.floor(remainder);
      if (pixels && cycleWidth.current) {
        node.scrollLeft = wrapFixtureStripOffset(node.scrollLeft + pixels, cycleWidth.current);
        remainder -= pixels;
      }
      previousTime = time;
      frame = requestAnimationFrame(animate);
    };
    const focusOut = () => {
      // Native engines can still expose the old activeElement during focusout.
      // Re-check after the focus transition, without reviving a cleaned-up loop.
      queueMicrotask(() => { if (active) synchronize(); });
    };
    const normalize = () => {
      // Do not scroll a keyboard user's focused original link out of view.
      if (originalRun.current?.contains(document.activeElement) || !cycleWidth.current) return;
      const next = normalizeFixtureStripScrollOffset(node.scrollLeft, cycleWidth.current);
      if (Math.abs(next - node.scrollLeft) > 1) node.scrollLeft = next;
    };
    synchronizeMotion.current = synchronize;
    strip.addEventListener("focusin", synchronize);
    strip.addEventListener("focusout", focusOut);
    document.addEventListener("visibilitychange", synchronize);
    reducedMotion.addEventListener("change", synchronize);
    node.addEventListener("scroll", normalize, { passive: true });
    const visibility = canObserveVisibility ? new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; synchronize(); }) : null;
    visibility?.observe(strip);
    synchronize();
    return () => {
      active = false;
      if (synchronizeMotion.current === synchronize) synchronizeMotion.current = null;
      cancelAnimationFrame(frame);
      window.clearTimeout(resumeTimer);
      visibility?.disconnect();
      strip.removeEventListener("focusin", synchronize);
      strip.removeEventListener("focusout", focusOut);
      document.removeEventListener("visibilitychange", synchronize);
      reducedMotion.removeEventListener("change", synchronize);
      node.removeEventListener("scroll", normalize);
    };
  }, [canLoop]);

  const move = (direction: -1 | 1) => {
    const node = viewport.current;
    if (!node) return;
    node.scrollTo({ left: wrapFixtureStripOffset(node.scrollLeft + direction * Math.max(160, node.clientWidth * .8), cycleWidth.current), behavior: "auto" });
  };
  const caution = failed || metadata?.degraded;
  const cautionText = failed ? motion.unavailable : metadata?.state === "partial-persisted-schedule" ? copy.partialScheduleCopy : copy.liveDataUpdatingCopy;
  return <section className={styles.strip} aria-label={copy.currentFixtures} dir="ltr" data-fixture-carousel="continuous">
    <button type="button" className={`${controls.link} ${styles.motion}`} aria-label={motion.previous} title={motion.previous} disabled={!canLoop} onClick={() => move(-1)}>‹</button>
    {caution ? <p className={styles.srOnly} role="status">{cautionText}</p> : null}
    <div ref={viewport} className={styles.viewport} tabIndex={0} aria-label={copy.select}>
      <div className={styles.track}>
        {(canLoop ? ["before", "original", "after"] : ["original"]).map(run => <div key={run} ref={run === "original" ? originalRun : undefined} className={styles.run} data-fixture-run={run} aria-hidden={run !== "original" ? true : undefined}>
        {fixtures.map((fixture) => {
          const state = clubHubStripState(fixture, metadata, observedAt);
          const kickoff = fixture.startsAt ? formatTouchlineLocalKickoff(fixture.startsAt, zone, locale, draftLocalesEnabled) : null;
          const value = state === "upcoming" ? kickoff?.time ?? "—" : clubHubStripScore(fixture);
          const label = state === "live" ? `${copy.liveNow}${fixture.liveMinute !== undefined ? ` · ${fixture.liveMinute}′` : ""}`
            : state === "finished" ? copy.completed : state === "awaiting-update" ? copy.awaitingOfficialUpdate
            : state === "upcoming" ? kickoff ? `${kickoff.date} · ${kickoff.zoneName}` : copy.next : copy.liveDataUpdating;
          const teams = [fixture.homeTeam, fixture.awayTeam];
          const description = `${fixture.homeTeam?.name ?? copy.homeFallback} ${copy.versus} ${fixture.awayTeam?.name ?? copy.awayFallback}: ${value}. ${label}${caution ? `. ${cautionText}` : ""}`;
          return <a key={fixture.providerId} className={styles.fixture} data-state={state}
            tabIndex={run === "original" ? undefined : -1}
            onMouseDown={run === "original" ? undefined : event => event.preventDefault()}
            href={`/live?fixture=${encodeURIComponent(fixture.providerId)}&lang=${encodeURIComponent(locale)}`} aria-label={description} title={description}>
            <span className={styles.crest}>{teams[0]?.logoUrl ? <img src={teams[0].logoUrl} alt="" width={28} height={32} /> : <span>{teams[0]?.shortCode ?? "—"}</span>}</span>
            <span className={styles.fixtureCopy}><b>{value}</b><small dir={locale === "ar-SA" ? "rtl" : "ltr"}>{label}</small></span>
            <span className={styles.crest}>{teams[1]?.logoUrl ? <img src={teams[1].logoUrl} alt="" width={28} height={32} /> : <span>{teams[1]?.shortCode ?? "—"}</span>}</span>
          </a>;
        })}
        </div>)}
        {!fixtures.length ? <p className={styles.empty} dir={locale === "ar-SA" ? "rtl" : "ltr"}>{failed ? motion.unavailable : !snapshot && needsInitialRead ? copy.liveDataUpdating : copy.noFixtures}</p> : null}
      </div>
    </div>
    <button type="button" className={`${controls.link} ${styles.motion}`} aria-label={motion.next} title={motion.next} disabled={!canLoop} onClick={() => move(1)}>›</button>
  </section>;
}

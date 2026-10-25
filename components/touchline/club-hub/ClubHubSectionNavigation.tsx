"use client";

import { ArrowUp, CalendarDays, TableProperties, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getTouchlineClubHubSectionNavigationCopy } from "@/lib/touchlineArena/club-hub-section-navigation-i18n";

import globalNavigationStyles from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubHubSectionNavigation.module.css";

type Props = Readonly<{
  locale: string;
  draftLocalesEnabled?: boolean;
}>;

const SECTION_TARGETS = ["club-table", "touchline-club-lineup", "club-squad"] as const;

export default function ClubHubSectionNavigation({ locale, draftLocalesEnabled = false }: Props) {
  const copy = getTouchlineClubHubSectionNavigationCopy(locale, draftLocalesEnabled);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const navigationRef = useRef<HTMLElement>(null);

  const items = [
    { target: "club-table", label: copy.table, icon: TableProperties },
    { target: "touchline-club-lineup", label: copy.matchday, icon: CalendarDays },
    { target: "club-squad", label: copy.squad, icon: UsersRound },
  ] as const;

  useEffect(() => {
    const hero = document.querySelector(".club-hub-hero");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowBackToTop(!entry.isIntersecting),
      { rootMargin: "-74px 0px 0px", threshold: 0.05 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame: number | null = null;
    let pendingTarget: string | null = null;
    let lastHash = window.location.hash;
    const requestMissingTarget = (hash: string) => {
      const target = SECTION_TARGETS.find(id => hash === `#${id}`);
      pendingTarget = target && !document.getElementById(target) ? target : null;
    };
    const cancelPendingTarget = () => { pendingTarget = null; };
    requestMissingTarget(lastHash);
    const syncActiveTarget = () => {
      frame = null;
      if (pendingTarget) {
        if (window.location.hash !== `#${pendingTarget}`) {
          cancelPendingTarget();
        } else {
          const target = document.getElementById(pendingTarget);
          if (target) {
            // Native fragment navigation cannot find a section still suspended.
            // Consume this intent once; subsequent mutations must not steal scroll.
            cancelPendingTarget();
            target.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
          }
        }
      }
      // Suspense streams each chapter independently. Resolve current elements
      // on every geometry read rather than retaining the initial partial DOM.
      const targets = SECTION_TARGETS
        .map((target) => document.getElementById(target))
        .filter((target): target is HTMLElement => Boolean(target));
      const reachedPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (reachedPageEnd) {
        setActiveTarget(targets.at(-1)?.id ?? null);
        return;
      }
      // Keep section highlighting aligned with the reading area without pinning
      // the internal navigation over ClubHub content.
      const anchor = Math.max(140, window.innerHeight * 0.35);
      const active = targets.filter((target) => target.getBoundingClientRect().top <= anchor).at(-1);
      setActiveTarget(active?.id ?? null);
    };
    const scheduleSync = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(syncActiveTarget);
    };
    const syncHash = () => {
      // A queued event for an already observed hash must not rearm an intent
      // cancelled by user input. An explicit same-hash click can rearm below.
      if (lastHash === window.location.hash) return;
      lastHash = window.location.hash;
      requestMissingTarget(lastHash);
      scheduleSync();
    };
    const requestClickedTarget = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || !navigationRef.current?.contains(link)) return;
      const hash = link.getAttribute("href") ?? "";
      // Remember the click before its native hashchange event is delivered,
      // so intervening user input can cancel it without the event rearming it.
      lastHash = hash;
      requestMissingTarget(hash);
    };
    const cancelOnScrollKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        cancelPendingTarget();
      }
    };

    syncActiveTarget();
    const navigation = navigationRef.current;
    const scope = document.querySelector(".club-hub-shell");
    const observer = new MutationObserver(scheduleSync);
    if (scope) observer.observe(scope, { childList: true, subtree: true });
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("wheel", cancelPendingTarget, { passive: true });
    window.addEventListener("touchstart", cancelPendingTarget, { passive: true });
    window.addEventListener("keydown", cancelOnScrollKey);
    navigation?.addEventListener("click", requestClickedTarget);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("wheel", cancelPendingTarget);
      window.removeEventListener("touchstart", cancelPendingTarget);
      window.removeEventListener("keydown", cancelOnScrollKey);
      navigation?.removeEventListener("click", requestClickedTarget);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const sharedLinkClassName = globalNavigationStyles.link;

  return (
    <nav ref={navigationRef} className={styles.navigation} aria-label={copy.sectionsAria}>
      {items.map(({ target, label, icon: Icon }) => (
        <a
          aria-current={activeTarget === target ? "location" : undefined}
          className={sharedLinkClassName}
          href={`#${target}`}
          key={target}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </a>
      ))}
      <a
        aria-hidden={!showBackToTop}
        aria-label={copy.backToTop}
        className={`${globalNavigationStyles.link} ${styles.backToTop}`}
        data-visible={showBackToTop}
        href="#club-hub-top"
        tabIndex={showBackToTop ? 0 : -1}
        onClick={(event) => {
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          event.preventDefault();
          window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
        }}
      >
        <ArrowUp aria-hidden="true" />
        <span className={styles.backLabel}>{copy.top}</span>
      </a>
    </nav>
  );
}

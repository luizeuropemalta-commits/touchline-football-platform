"use client";

import { ArrowUp, CalendarDays, Newspaper, Trophy, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import globalNavigationStyles from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubHubSectionNavigation.module.css";

type Props = Readonly<{
  locale: string;
}>;

const SECTION_TARGETS = ["club-feed", "club-table", "touchline-club-lineup", "club-squad"] as const;

export default function ClubHubSectionNavigation({ locale }: Props) {
  const portuguese = locale === "pt-BR";
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);

  const items = [
    { target: "club-table", label: portuguese ? "Classificação" : "Rankings", icon: Trophy },
    { target: "club-feed", label: "Feed", icon: Newspaper },
    { target: "touchline-club-lineup", label: portuguese ? "Dia de jogo" : "Matchday", icon: CalendarDays },
    { target: "club-squad", label: portuguese ? "Elenco" : "Squad", icon: UsersRound },
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
    const targets = SECTION_TARGETS
      .map((target) => document.getElementById(target))
      .filter((target): target is HTMLElement => Boolean(target));
    if (!targets.length) return;

    let frame: number | null = null;
    const syncActiveTarget = () => {
      frame = null;
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

    syncActiveTarget();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    return () => {
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const sharedLinkClassName = globalNavigationStyles.link;

  return (
    <nav className={styles.navigation} aria-label={portuguese ? "Seções do ClubHub" : "ClubHub sections"}>
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
        aria-label={portuguese ? "Voltar ao topo" : "Back to top"}
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
        <span className={styles.backLabel}>{portuguese ? "Topo" : "Top"}</span>
      </a>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Goal,
  Handshake,
  History,
  Repeat2,
  Shield,
} from "lucide-react";
import { touchLineT, type TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { touchlineArenaHref, touchlineClubHubHref } from "@/lib/touchlineArena/arena-navigation";
import {
  touchlineClubOwnerHistoryHref,
  touchlineClubOwnerProfileHref,
  touchlineClubOwnerRenewalsHref,
  touchlineClubOwnerSubstitutionHref,
  touchlineIsClubOwnerHistoryPath,
  touchlineIsClubOwnerRenewalsPath,
  touchlineIsClubOwnerSubstitutionPath,
} from "@/lib/touchlineArena/club-owner-routes";
import styles from "./TouchlineProfileQuickNav.module.css";

export default function TouchlineProfileQuickNav({
  locale,
  className,
  clubOwnerSlug,
}: {
  locale: TouchLineLocale;
  className?: string;
  clubOwnerSlug?: string | null;
}) {
  const t = (key: Parameters<typeof touchLineT>[1]) => touchLineT(locale, key);
  const lang = `lang=${encodeURIComponent(locale)}`;
  const arenaBase = touchlineArenaHref(locale);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const shortcuts: Array<{ key: string; href: string; label: string; icon: ReactNode }> = [
    ...(clubOwnerSlug ? [
      { key: "profile", href: touchlineClubOwnerProfileHref(locale, clubOwnerSlug), label: t("clubOwner"), icon: <Shield aria-hidden="true" /> },
      { key: "history", href: touchlineClubOwnerHistoryHref(locale, clubOwnerSlug), label: t("leagueHistory"), icon: <History aria-hidden="true" /> },
      { key: "renewals", href: touchlineClubOwnerRenewalsHref(locale, clubOwnerSlug), label: locale === "pt-BR" ? "Renovações" : "Renewals", icon: <CalendarClock aria-hidden="true" /> },
    ] : []),
    { key: "clubHub", href: touchlineClubHubHref(locale), label: t("clubHub"), icon: <Shield aria-hidden="true" /> },
    { key: "substitution", href: touchlineClubOwnerSubstitutionHref(locale), label: t("quickSubstitution"), icon: <Repeat2 aria-hidden="true" /> },
    { key: "live", href: `/live?${lang}`, label: t("live"), icon: <Activity aria-hidden="true" /> },
    { key: "market", href: `/market-transfer?${lang}`, label: t("marketTransfer"), icon: <Handshake aria-hidden="true" /> },
    { key: "rankings", href: `/touchline-tables?${lang}`, label: t("rankings"), icon: <BarChart3 aria-hidden="true" /> },
  ];

  useEffect(() => {
    function syncActiveLink() {
      const { pathname } = window.location;
      if (clubOwnerSlug && pathname === `/club-owner/${clubOwnerSlug}`) return setActiveKey("profile");
      if (clubOwnerSlug && touchlineIsClubOwnerHistoryPath(pathname)) return setActiveKey("history");
      if (clubOwnerSlug && touchlineIsClubOwnerRenewalsPath(pathname)) return setActiveKey("renewals");
      if (pathname.startsWith("/touchline-clubs/")) return setActiveKey("clubHub");
      if (touchlineIsClubOwnerSubstitutionPath(pathname)) return setActiveKey("substitution");
      if (pathname === "/live") return setActiveKey("live");
      if (pathname === "/market-transfer") return setActiveKey("market");
      if (pathname === "/touchline-player-card-rankings" || pathname === "/touchline-tables") return setActiveKey("rankings");
      setActiveKey(null);
    }

    syncActiveLink();
    window.addEventListener("hashchange", syncActiveLink);
    window.addEventListener("popstate", syncActiveLink);
    return () => {
      window.removeEventListener("hashchange", syncActiveLink);
      window.removeEventListener("popstate", syncActiveLink);
    };
  }, [clubOwnerSlug]);

  return (
    <div className={`${styles.bar} ${className ?? ""}`}>
      <Link className={styles.back} href={arenaBase}>
        <Goal aria-hidden="true" />
        {t("enterArena")}
      </Link>
      <nav className={styles.shortcuts} aria-label={t("touchlineQuickLinks")}>
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.key}
            className={`${styles.shortcut} ${activeKey === shortcut.key ? styles.isActive : ""}`}
            href={shortcut.href}
            aria-current={activeKey === shortcut.key ? "page" : undefined}
            onClick={() => setActiveKey(shortcut.key)}
          >
            {shortcut.icon}
            {shortcut.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

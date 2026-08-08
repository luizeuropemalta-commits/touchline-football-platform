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
  touchlineClubOwnerSelfHref,
  touchlineIsClubOwnerHistoryPath,
  touchlineIsClubOwnerRenewalsPath,
  touchlineIsClubOwnerSubstitutionPath,
} from "@/lib/touchlineArena/club-owner-routes";
import styles from "./TouchlineProfileQuickNav.module.css";

export default function TouchlineProfileQuickNav({
  locale,
  className,
  clubOwnerSlug,
  canAccessPrivateClubOwnerAreas = false,
}: {
  locale: TouchLineLocale;
  className?: string;
  clubOwnerSlug?: string | null;
  /**
   * Private ClubOwner shortcuts are only meaningful for the authenticated
   * owner. A public profile must never offer links to another owner's history,
   * renewal centre, or squad controls.
   */
  canAccessPrivateClubOwnerAreas?: boolean;
}) {
  const t = (key: Parameters<typeof touchLineT>[1]) => touchLineT(locale, key);
  const lang = `lang=${encodeURIComponent(locale)}`;
  const arenaBase = touchlineArenaHref(locale);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const hasPrivateClubOwnerContext = Boolean(clubOwnerSlug && canAccessPrivateClubOwnerAreas);
  const shortcuts: Array<{ key: string; href: string; label: string; icon: ReactNode }> = [
    ...(hasPrivateClubOwnerContext ? [
      { key: "profile", href: touchlineClubOwnerSelfHref(locale), label: t("clubOwner"), icon: <Shield aria-hidden="true" /> },
      { key: "history", href: touchlineClubOwnerSelfHref(locale, "history"), label: t("leagueHistory"), icon: <History aria-hidden="true" /> },
      { key: "renewals", href: touchlineClubOwnerSelfHref(locale, "renewals"), label: locale === "pt-BR" ? "Renovações" : "Renewals", icon: <CalendarClock aria-hidden="true" /> },
    ] : []),
    { key: "clubHub", href: touchlineClubHubHref(locale), label: t("clubHub"), icon: <Shield aria-hidden="true" /> },
    // This is the visitor's own action even when the surrounding screen is a
    // public profile. The /me boundary resolves it server-side after login.
    { key: "substitution", href: touchlineClubOwnerSelfHref(locale, "substitution"), label: t("quickSubstitution"), icon: <Repeat2 aria-hidden="true" /> },
    { key: "live", href: `/live?${lang}`, label: t("live"), icon: <Activity aria-hidden="true" /> },
    { key: "market", href: `/market-transfer?${lang}`, label: t("marketTransfer"), icon: <Handshake aria-hidden="true" /> },
    { key: "rankings", href: `/touchline-tables?${lang}`, label: t("rankings"), icon: <BarChart3 aria-hidden="true" /> },
  ];

  useEffect(() => {
    function syncActiveLink() {
      const { pathname } = window.location;
      if (hasPrivateClubOwnerContext && (pathname === `/club-owner/${clubOwnerSlug}` || pathname === "/club-owner/me")) return setActiveKey("profile");
      if (hasPrivateClubOwnerContext && touchlineIsClubOwnerHistoryPath(pathname)) return setActiveKey("history");
      if (hasPrivateClubOwnerContext && touchlineIsClubOwnerRenewalsPath(pathname)) return setActiveKey("renewals");
      if (pathname === "/touchline-clubs" || pathname.startsWith("/touchline-clubs/")) return setActiveKey("clubHub");
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
  }, [clubOwnerSlug, hasPrivateClubOwnerContext]);

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

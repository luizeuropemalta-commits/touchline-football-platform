"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, Inbox, LogOut, Search, Trophy } from "lucide-react";
import { getTouchlineArenaShellCopy } from "@/lib/touchlineArena/arena-shell-i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import TouchlineBrandHeader from "./TouchlineBrandHeader";
import TouchlineGlobalNavigation from "./TouchlineGlobalNavigation";
import TouchlineNavigationRail from "./TouchlineNavigationRail";
import { useSiteLocaleRelease } from "./SiteLocaleReleaseContext";
import navigationStyles from "./TouchlineGlobalNavigation.module.css";
import styles from "./TouchlineCustomerUtilityShell.module.css";

type CustomerUtilityRoute = "notifications" | "inbox" | "footballSearch";

/** Exact presentation allowlist, never an authorization decision. */
export function customerUtilityRoute(pathname: string): CustomerUtilityRoute | null {
  if (pathname === "/notifications") return "notifications";
  if (pathname === "/inbox") return "inbox";
  if (pathname === "/football-search") return "footballSearch";
  return null;
}

export default function TouchlineCustomerUtilityShell({
  children, accountId, currentRoute, pathname, locale: requestedLocale,
  draftLocalesEnabled = false, profileName, profileEmail, signingOut,
  signOutError, onSignOut, switchAccountHref,
}: {
  children: ReactNode;
  accountId: string;
  currentRoute: CustomerUtilityRoute;
  pathname: string;
  locale: string | null;
  draftLocalesEnabled?: boolean;
  profileName: string;
  profileEmail: string;
  signingOut: boolean;
  signOutError: string;
  onSignOut: () => Promise<void>;
  switchAccountHref: string;
}) {
  const siteLocalesEnabled = useSiteLocaleRelease();
  const expandedLocales = draftLocalesEnabled || siteLocalesEnabled;
  const locale = resolveTouchlineCatalogueLocale(requestedLocale, expandedLocales);
  const copy = getTouchlineArenaShellCopy(locale, expandedLocales);
  // Inbox already owns its main landmark; the other pages have neutral roots.
  const Content = currentRoute === "inbox" ? "div" : "main";
  const links = [
    { href: "/intro", label: "TouchLine", icon: Trophy },
    { href: "/notifications", label: copy.notificationsLabel, icon: Bell },
    { href: "/inbox", label: copy.inboxLabel, icon: Inbox },
    { href: "/football-search", label: copy.searchLabel, icon: Search },
  ];

  return <div className={styles.shell} data-touchline-customer-utility={currentRoute} dir="ltr">
    <TouchlineBrandHeader
      href={touchLineAuthHref("/clubowner", locale, expandedLocales)}
      locale={locale}
      accountLocaleContext={{ mode: "account", accountId }}
      draftLocalesEnabled={expandedLocales}
      navigation={<TouchlineGlobalNavigation locale={locale} currentRoute={currentRoute} surface="authenticated" draftLocalesEnabled={expandedLocales} showAudioControl={false} />}
      navigationAccessory={<div>
        <button type="button" className={`${navigationStyles.link} ${navigationStyles.compactAction}`} onClick={onSignOut} disabled={signingOut} aria-busy={signingOut}>
          <LogOut size={14} aria-hidden="true" />
          {signingOut ? copy.signingOut : copy.signOut}
        </button>
        {signOutError ? <p role="alert" className={styles.error}>{signOutError}</p> : null}
      </div>}
    />
    <div className={styles.context} dir={locale === "ar-SA" ? "rtl" : "ltr"}>
      <p className={styles.identity}><span>{profileName}</span><span>{profileEmail || copy.clubOwnerIdentity}</span></p>
      <TouchlineNavigationRail className={styles.utilitiesRail}>
        <nav className={styles.utilities} aria-label={copy.arenaOperations}>
          {links.map(({ href, label, icon: Icon }) => <Link key={href} className={navigationStyles.link} href={touchLineAuthHref(href, locale, expandedLocales)} aria-current={pathname === href ? "page" : undefined}>
            <Icon size={14} aria-hidden="true" />{label}
          </Link>)}
          <Link className={navigationStyles.link} href={switchAccountHref}>{copy.switchAccount}</Link>
        </nav>
      </TouchlineNavigationRail>
    </div>
    <Content className={styles.content}>{children}</Content>
  </div>;
}

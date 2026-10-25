"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Instagram } from "lucide-react";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { normalizeTouchLineAuthReturnTo, normalizeTouchLineLoginLocale } from "@/lib/touchlineArena/auth-i18n";
import { resolveTouchLinePresentationLocale } from "@/lib/touchlineArena/root-locale";
import { useSiteLocaleRelease } from "./SiteLocaleReleaseContext";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./TouchlineSiteFooter.module.css";

const rights = {
  "en-GB": "All rights reserved.", "pt-BR": "Todos os direitos reservados.",
  "es-ES": "Todos los derechos reservados.", "it-IT": "Tutti i diritti riservati.",
  "fr-FR": "Tous droits réservés.", "ar-SA": "جميع الحقوق محفوظة.",
  "tr-TR": "Tüm hakları saklıdır.", "de-DE": "Alle Rechte vorbehalten.",
};

const instagramLabels = {
  "en-GB": "TouchLine on Instagram (opens in a new tab)",
  "pt-BR": "TouchLine no Instagram (abre em uma nova aba)",
  "es-ES": "TouchLine en Instagram (se abre en una pestaña nueva)",
  "it-IT": "TouchLine su Instagram (si apre in una nuova scheda)",
  "fr-FR": "TouchLine sur Instagram (s’ouvre dans un nouvel onglet)",
  "ar-SA": "TouchLine على Instagram (يفتح في علامة تبويب جديدة)",
  "tr-TR": "Instagram’da TouchLine (yeni sekmede açılır)",
  "de-DE": "TouchLine auf Instagram (öffnet in einem neuen Tab)",
};

const reservedInstagramPaths = new Set(["accounts", "about", "api", "developer", "developers", "direct", "directory", "emails", "explore", "legal", "oauth", "p", "privacy", "reel", "reels", "stories", "terms", "web"]);

type Props = {
  locale: string; draftLocalesEnabled?: boolean; instagramUrl?: string;
};

export default function TouchlineSiteFooter(props: Props) {
  return <Suspense fallback={<FooterContent {...props} />}><RuntimeFooter {...props} /></Suspense>;
}

function RuntimeFooter(props: Props) {
  // Reuse Next navigation + existing release context/resolvers, as the document
  // locale synchronizer does. No browser locale store or preference mutation.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const releaseEnabled = useSiteLocaleRelease();
  if (!pathname || !searchParams) return <FooterContent {...props} />;
  const returnPath = normalizeTouchLineAuthReturnTo(searchParams.get("returnTo"))?.split(/[?#]/)[0] ?? "";
  const protectedPath = ["/admin", "/visual-qa"].some(path => pathname === path || pathname.startsWith(`${path}/`));
  const protectedReturn = ["/login", "/register", "/forgot-password"].includes(pathname)
    && ["/admin", "/visual-qa"].some(path => returnPath === path || returnPath.startsWith(`${path}/`));
  const loginDraft = pathname === "/login" && !protectedReturn;
  const allowDraft = loginDraft || (releaseEnabled && !protectedPath && !protectedReturn);
  const requested = searchParams.get("lang") ?? props.locale;
  const locale = loginDraft ? normalizeTouchLineLoginLocale(requested) : resolveTouchLinePresentationLocale(requested, allowDraft);
  return <FooterContent {...props} locale={locale} draftLocalesEnabled={allowDraft} />;
}

function FooterContent({ locale, draftLocalesEnabled = false, instagramUrl }: Props) {
  let instagram: string | null = null;
  try {
    const url = new URL(instagramUrl ?? "");
    const profile = /^\/([a-zA-Z0-9._]{1,30})\/?$/.exec(url.pathname)?.[1];
    if (url.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(url.hostname)
      && !url.port && !url.username && !url.password && profile
      && !reservedInstagramPaths.has(profile.toLowerCase())) instagram = url.href;
  } catch { /* A missing official profile never becomes a guessed social link. */ }
  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return <footer className={styles.footer} lang={language} dir={language === "ar-SA" ? "rtl" : "ltr"}>
    <small>© {new Date().getFullYear()} TouchLine. {rights[language]}</small>
    {instagram ? <a className={`${controls.link} ${styles.social}`} href={instagram} aria-label={instagramLabels[language]} target="_blank" rel="noopener noreferrer"><Instagram aria-hidden="true" focusable="false" /></a> : null}
  </footer>;
}

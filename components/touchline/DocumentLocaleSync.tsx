"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  resolveTouchLinePresentationLocale,
  touchlineDocumentDirection,
} from "@/lib/touchlineArena/root-locale";
import { normalizeTouchLineLoginLocale, normalizeTouchLineAuthReturnTo } from "@/lib/touchlineArena/auth-i18n";

type DocumentLocaleSyncProps = {
  initialLocale: string;
  draftLocalesEnabled?: boolean;
};

export default function DocumentLocaleSync({ initialLocale, draftLocalesEnabled = false }: DocumentLocaleSyncProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const requestedLocale = searchParams.get("lang");
    // Login may render its six route-local drafts; every other route still
    // resolves through the complete-catalogue gate. Without a query, retain
    // the server locale so hydration cannot change the initial document.
    const returnPath = normalizeTouchLineAuthReturnTo(searchParams.get("returnTo"))?.split(/[?#]/)[0] ?? "";
    const protectedReturn = ["/login", "/register", "/forgot-password"].includes(pathname ?? "")
      && ["/admin", "/visual-qa"].some(path => returnPath === path || returnPath.startsWith(`${path}/`));
    const loginRoute = pathname === "/login" && !protectedReturn;
    const publicLocalesEnabled = draftLocalesEnabled && !protectedReturn && !["/admin", "/visual-qa"].some(path => pathname === path || pathname?.startsWith(`${path}/`));
    const locale = loginRoute
      ? normalizeTouchLineLoginLocale(requestedLocale === null ? initialLocale : requestedLocale)
      : resolveTouchLinePresentationLocale(requestedLocale === null ? initialLocale : requestedLocale, publicLocalesEnabled);

    document.documentElement.lang = locale;
    document.documentElement.dir = publicLocalesEnabled ? "ltr" : touchlineDocumentDirection(locale);

    // A URL may come from an old link, not a deliberate language selection.
    // Only explicit selectors persist the browser preference.
  }, [initialLocale, pathname, searchParams, draftLocalesEnabled]);

  useEffect(() => {
    const fallback = document.querySelector<HTMLElement>("[data-touchline-main-content-fallback]");
    if (!fallback) return;

    const main = fallback.querySelector<HTMLElement>("main");
    const previousManagedTarget = document.querySelector<HTMLElement>(
      '[data-touchline-main-target-managed="true"]',
    );

    if (!main) {
      // Error/loading boundaries may not have a semantic main of their own.
      // Keep a stable focus destination until the route renders one.
      fallback.id = "touchline-main-content";
      fallback.tabIndex = -1;
      return;
    }

    if (previousManagedTarget && previousManagedTarget !== main) {
      previousManagedTarget.removeAttribute("id");
      previousManagedTarget.removeAttribute("tabindex");
      previousManagedTarget.removeAttribute("data-touchline-main-target-managed");
    }

    // The SSR wrapper is a short-lived fallback so the skip link also works
    // before hydration. Once interactive, the target is the real semantic
    // main landmark rather than a nested or duplicate landmark.
    fallback.removeAttribute("id");
    fallback.removeAttribute("tabindex");
    main.id = "touchline-main-content";
    main.tabIndex = -1;
    main.dataset.touchlineMainTargetManaged = "true";
  }, [pathname, searchParams]);

  return null;
}

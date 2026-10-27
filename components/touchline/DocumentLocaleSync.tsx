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

  // Keep the SSR skip-link target on TouchlineLandscapeBoundary. Moving its
  // attributes onto a streamed route's <main> can run before that subtree
  // hydrates, creating server/client mismatches on reload and navigation.

  return null;
}

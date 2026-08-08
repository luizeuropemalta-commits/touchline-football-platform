"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  TOUCHLINE_LOCALE_STORAGE_KEY,
} from "@/lib/touchlineArena/i18n";
import {
  resolveTouchLinePresentationLocale,
  touchlineDocumentDirection,
  type TouchLinePresentationLocale,
} from "@/lib/touchlineArena/root-locale";
import { writeBrowserStorage } from "@/lib/touchlineArena/browser-storage";

type DocumentLocaleSyncProps = {
  initialLocale: TouchLinePresentationLocale;
};

export default function DocumentLocaleSync({ initialLocale }: DocumentLocaleSyncProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const requestedLocale = searchParams.get("lang");
    // A query parameter is an explicit navigation choice, even when invalid.
    // Without one, retain the locale which the server already used for the
    // document. A stale browser preference must never flip SSR English into
    // Portuguese (or vice versa) after hydration.
    const locale = resolveTouchLinePresentationLocale(
      requestedLocale === null ? initialLocale : requestedLocale,
    );

    document.documentElement.lang = locale;
    document.documentElement.dir = touchlineDocumentDirection(locale);

    if (requestedLocale !== null) {
      writeBrowserStorage("localStorage", TOUCHLINE_LOCALE_STORAGE_KEY, locale);
    }
  }, [initialLocale, searchParams]);

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

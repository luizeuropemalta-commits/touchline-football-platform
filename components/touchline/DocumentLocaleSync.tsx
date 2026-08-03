"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import {
  normalizeTouchLineLocale,
  TOUCHLINE_LOCALE_STORAGE_KEY,
} from "@/lib/touchlineArena/i18n";
import {
  readBrowserStorage,
  writeBrowserStorage,
} from "@/lib/touchlineArena/browser-storage";

export default function DocumentLocaleSync() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const requestedLocale = searchParams.get("lang");
    const savedLocale = readBrowserStorage("localStorage", TOUCHLINE_LOCALE_STORAGE_KEY);
    const locale = normalizeTouchLineLocale(requestedLocale || savedLocale);

    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar-SA" ? "rtl" : "ltr";

    if (requestedLocale) {
      writeBrowserStorage("localStorage", TOUCHLINE_LOCALE_STORAGE_KEY, locale);
    }
  }, [searchParams]);

  return null;
}

"use client";

import { ChevronDown, Languages } from "lucide-react";
import type { TouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
import { TOUCHLINE_LOCALE_STORAGE_KEY } from "@/lib/touchlineArena/i18n";

const AUTH_LANGUAGES: Array<{
  code: TouchLineAuthLocale;
  flag: string;
  label: string;
}> = [
  { code: "pt-BR", flag: "🇧🇷", label: "Português" },
  { code: "en-GB", flag: "🇬🇧", label: "English" },
];

export function AuthLanguageSwitcher({ locale }: { locale: TouchLineAuthLocale }) {
  function selectLanguage(nextLocale: TouchLineAuthLocale) {
    try {
      window.localStorage.setItem(TOUCHLINE_LOCALE_STORAGE_KEY, nextLocale);
    } catch {
      // The URL and cookie still preserve the selection when storage is unavailable.
    }

    document.cookie = `${TOUCHLINE_LOCALE_STORAGE_KEY}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;
    const destination = new URL(window.location.href);
    destination.searchParams.set("lang", nextLocale);
    window.location.assign(destination.toString());
  }

  return (
    <label className="auth-language-switcher">
      <Languages size={15} aria-hidden="true" />
      <span className="sr-only">{locale === "pt-BR" ? "Selecionar idioma" : "Select language"}</span>
      <select
        aria-label={locale === "pt-BR" ? "Selecionar idioma" : "Select language"}
        value={locale}
        onChange={(event) => selectLanguage(event.target.value as TouchLineAuthLocale)}
      >
        {AUTH_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.flag} {language.label}
          </option>
        ))}
      </select>
      <ChevronDown className="auth-language-chevron" size={14} aria-hidden="true" />
    </label>
  );
}

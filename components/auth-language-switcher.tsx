"use client";

import { ChevronDown, Languages } from "lucide-react";
import type { TouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import AccountLocaleMenu from "@/components/touchline/AccountLocaleMenu";
import { TOUCHLINE_APPROVED_LOCALES, TOUCHLINE_LOCALE_STORAGE_KEY, type TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { writeBrowserStorage } from "@/lib/touchlineArena/browser-storage";
import { rememberTouchlinePresentationLocaleIntent } from "@/lib/touchlineArena/presentation-locale-intent";

export function AuthLanguageSwitcher({
  locale,
  context,
  draftLocalesEnabled = false,
  siteLocalesEnabled = false,
}: {
  locale: string;
  context?: AccountLocaleContext;
  draftLocalesEnabled?: boolean;
  siteLocalesEnabled?: boolean;
}) {
  if ((draftLocalesEnabled || siteLocalesEnabled) && !(siteLocalesEnabled && context?.mode === "account")) {
    const languageLabel = locale === "pt-BR" ? "Selecionar idioma"
      : locale === "es-ES" ? "Seleccionar idioma"
      : locale === "it-IT" ? "Seleziona la lingua"
      : locale === "fr-FR" ? "Choisir la langue"
      : locale === "ar-SA" ? "اختيار اللغة"
      : locale === "tr-TR" ? "Dil seçin"
      : locale === "de-DE" ? "Sprache auswählen"
      : "Select language";
    return (
      <label className="auth-language-switcher">
        <Languages size={15} aria-hidden="true" />
        <span className="sr-only">{languageLabel}</span>
        <select
          aria-label={languageLabel}
          value={locale}
          onChange={(event) => {
            const nextLocale = event.target.value as TouchLineLocale;
            if (!TOUCHLINE_APPROVED_LOCALES.some(({ code }) => code === nextLocale)) return;
            const destination = new URL(window.location.href);
            destination.searchParams.set("lang", nextLocale);
            rememberTouchlinePresentationLocaleIntent(nextLocale, draftLocalesEnabled || siteLocalesEnabled);
            if (siteLocalesEnabled || nextLocale === "en-GB" || nextLocale === "pt-BR") {
              document.cookie = `${TOUCHLINE_LOCALE_STORAGE_KEY}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;
              writeBrowserStorage("localStorage", TOUCHLINE_LOCALE_STORAGE_KEY, nextLocale);
            }
            window.location.assign(destination.toString());
          }}
        >
          {TOUCHLINE_APPROVED_LOCALES.map(({ code, flag, label }) => (
            <option key={code} value={code}>{flag} {label}</option>
          ))}
        </select>
        <ChevronDown className="auth-language-chevron" size={14} aria-hidden="true" />
      </label>
    );
  }

  if (!context) return null;
  return (
    <AccountLocaleMenu
      context={context}
      locale={locale as TouchLineAuthLocale}
      variant="select"
      menuClassName="auth-language-switcher"
      panelClassName=""
      draftLocalesEnabled={siteLocalesEnabled}
    />
  );
}

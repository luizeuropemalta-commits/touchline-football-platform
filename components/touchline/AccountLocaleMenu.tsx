"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Languages } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { startAccountLocaleBrowser } from "@/lib/touchlineArena/account-locale-browser";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { TOUCHLINE_LOCALE_STORAGE_KEY, TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleApproved, type TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchlineAccountLocaleMenuCopy } from "@/lib/touchlineArena/account-locale-menu-i18n";
import { readTouchlinePresentationLocaleIntent, rememberTouchlinePresentationLocaleIntent } from "@/lib/touchlineArena/presentation-locale-intent";

type Locale = TouchLineLocale;
type State = "loading" | "ready" | "saving" | "blocked";
type Props = { context: AccountLocaleContext; locale: string; menuClassName: string; panelClassName: string; variant?: "menu" | "select"; draftLocalesEnabled?: boolean };

export default function AccountLocaleMenu({ context, locale, menuClassName, panelClassName, variant = "menu", draftLocalesEnabled = false }: Props) {
  const router = useRouter();
  const mode = context.mode;
  const accountId = context.mode === "account" ? context.accountId : "";
  const identityKey = `${mode}:${accountId}`;
  const [snapshot, setSnapshot] = useState<{ key: string; state: State }>({ key: identityKey, state: "loading" });
  const current = useRef<{ key: string; host: ReturnType<typeof startAccountLocaleBrowser> } | null>(null);
  const state = snapshot.key === identityKey ? snapshot.state : "loading";
  const portuguese = locale === "pt-BR";
  const copy = getTouchlineAccountLocaleMenuCopy(locale, draftLocalesEnabled);
  const choices: ReadonlyArray<readonly [Locale, string]> = draftLocalesEnabled
    ? TOUCHLINE_APPROVED_LOCALES.map(({ code, flag, label }) => [code, `${flag} ${label}`] as const)
    : [["en-GB", "🇬🇧 English"], ["pt-BR", "🇧🇷 Português"]];
  const selectChoices = draftLocalesEnabled ? choices : [...choices].reverse();

  // Invalidate the previous identity during commit, before passive effects or
  // late request continuations can apply its locale to the new context.
  useLayoutEffect(() => {
    let active = true;
    const publish = (next: State) => { if (active) setSnapshot({ key: identityKey, state: next }); };
    const applyPreference = (nextLocale: Locale) => {
      if (!active) return;
      const destination = new URL(window.location.href);
      destination.searchParams.set("lang", nextLocale);
      try { window.localStorage.setItem(TOUCHLINE_LOCALE_STORAGE_KEY, nextLocale); } catch { /* URL still works. */ }
      document.cookie = `${TOUCHLINE_LOCALE_STORAGE_KEY}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;
      // Restoring the same account on refresh must not trigger another refresh.
      if (destination.toString() !== window.location.href) window.location.assign(destination.toString());
    };
    const host = startAccountLocaleBrowser({
      draftLocalesEnabled,
      context: mode === "account" ? { mode, accountId } : { mode },
      request: (input, init) => fetch(input, init),
      onChange: publish,
      observeIdentity(callback) {
        const client = createClient();
        if (!client) throw new Error("Account session unavailable");
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          callback(session?.user?.id ?? null);
        });
        return () => data.subscription.unsubscribe();
      },
      onIdentityChange() {
        // Never call auth methods or refresh inside the auth notification lock.
        queueMicrotask(() => { if (active) router.refresh(); });
      },
      // A validated account read may supply a default, but must not undo an
      // explicit presentation choice made in this tab. Never PUT that choice
      // into an account merely because the visitor has signed in.
      restore: savedLocale => applyPreference(readTouchlinePresentationLocaleIntent(draftLocalesEnabled) ?? savedLocale),
      apply: selectedLocale => {
        if (!active) return;
        rememberTouchlinePresentationLocaleIntent(selectedLocale, draftLocalesEnabled);
        applyPreference(selectedLocale);
      },
    });
    current.current = { key: identityKey, host };
    publish(host.getState());
    return () => {
      active = false;
      host.cleanup();
      if (current.current?.host === host) current.current = null;
    };
  }, [mode, accountId, identityKey, router, draftLocalesEnabled]);

  function select(nextLocale: string) {
    if (!isTouchLineLocaleApproved(nextLocale)
      || (!draftLocalesEnabled && nextLocale !== "en-GB" && nextLocale !== "pt-BR")) return;
    const mounted = current.current;
    if (state !== "ready" || mounted?.key !== identityKey) return;
    void mounted.host.select(nextLocale);
  }
  function choose(event: MouseEvent<HTMLAnchorElement>, nextLocale: Locale) {
    const destination = new URL(window.location.href);
    destination.searchParams.set("lang", nextLocale);
    event.currentTarget.href = destination.toString();
    // Modified/middle clicks remain presentation-only links, not preference writes.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    select(nextLocale);
  }
  const message = state === "loading" ? copy.loading : state === "saving" ? copy.saving : state === "blocked" ? copy.blocked : "";
  if (variant === "select") {
    return (
      <div aria-busy={state === "loading" || state === "saving"}>
        <label className={menuClassName}>
          <Languages size={15} aria-hidden="true" />
          <span className="sr-only">{copy.select}</span>
          <select className={panelClassName} aria-label={copy.select}
            value={locale} disabled={state !== "ready"} onChange={event => select(event.target.value)}>
            {selectChoices.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <ChevronDown className="auth-language-chevron" size={14} aria-hidden="true" />
        </label>
        {message ? <p role="status" aria-live="polite">{message}</p> : null}
      </div>
    );
  }
  return (
    <details className={menuClassName}>
      <summary aria-label={copy.language}>
        <Languages aria-hidden="true" />
        <span>{copy.language}</span>
        <b>{draftLocalesEnabled ? TOUCHLINE_APPROVED_LOCALES.find(entry => entry.code === locale)?.shortLabel ?? "EN" : portuguese ? "PT" : "EN"}</b>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className={panelClassName} aria-busy={state === "loading" || state === "saving"}>
        {choices.map(([code, label]) => (
          <a key={code} href={`/touchline-clubs?lang=${code}`} aria-current={locale === code ? "page" : undefined}
            aria-disabled={state !== "ready"} onClick={event => choose(event, code)} onAuxClick={event => choose(event, code)}>
            <span>{label}</span>{locale === code ? <Check aria-hidden="true" /> : null}
          </a>
        ))}
        {message ? <p role="status" aria-live="polite">{message}</p> : null}
      </div>
    </details>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { AuthAmbientAudio } from "@/components/auth-ambient-audio";
import { AuthLanguageSwitcher } from "@/components/auth-language-switcher";
import { normalizeTouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { useSiteLocaleRelease } from "./SiteLocaleReleaseContext";
import styles from "./TouchlinePageControls.module.css";

type Props = Readonly<{
  locale: string;
  accountLocaleContext: AccountLocaleContext;
  draftLocalesEnabled?: boolean;
  siteLocalesEnabled?: boolean;
}>;

/** Presentation only. The caller owns placement and the trusted account context;
 * existing controls retain audio ownership and locale persistence policies. */
export default function TouchlinePageControls({ locale, accountLocaleContext, draftLocalesEnabled = false, siteLocalesEnabled }: Props) {
  const contextEnabled = useSiteLocaleRelease();
  const pathname = usePathname();
  const protectedPath = ["/admin", "/visual-qa"].some(path => pathname === path || pathname?.startsWith(`${path}/`));
  // Explicit false preserves closed auth returns even under the public provider.
  const publicRelease = !protectedPath && (siteLocalesEnabled ?? contextEnabled);
  const presentationDraft = !protectedPath && draftLocalesEnabled;
  const displayLocale = protectedPath ? normalizeTouchLineAuthLocale(locale) : locale;
  return <div className={styles.controls} dir="ltr">
    <AuthAmbientAudio locale={displayLocale} allowDraftLocale={presentationDraft || publicRelease} />
    <AuthLanguageSwitcher locale={displayLocale} context={accountLocaleContext} draftLocalesEnabled={presentationDraft} siteLocalesEnabled={publicRelease} />
  </div>;
}

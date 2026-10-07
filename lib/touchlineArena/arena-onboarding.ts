import {
  normalizeTouchLineAuthReturnTo,
  touchLineAuthHref,
  touchLinePostAuthHref,
} from "./auth-i18n.ts";

export function touchlineRegistrationEntryHref(returnTo: string | null | undefined, locale: string, siteLocalesEnabled = false) {
  const normalizedReturnTo = normalizeTouchLineAuthReturnTo(returnTo, siteLocalesEnabled);
  const pathname = normalizedReturnTo?.split(/[?#]/, 1)[0];
  // Administrative/QA entry keeps its established destination. Password
  // recovery uses its own callback and never calls this registration helper.
  if (pathname && ["/admin", "/visual-qa"].some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return touchLinePostAuthHref(normalizedReturnTo, locale);
  }
  return touchLineAuthHref("/intro?intro=first&onboarding=market", locale, siteLocalesEnabled);
}

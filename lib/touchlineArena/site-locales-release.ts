/** Server-owned presentation policy. Never import this module into client code. */
export function isTouchLineSiteLocalesEnabled(pathname?: string): boolean {
  if (process.env.TOUCHLINE_SITE_LOCALES_ENABLED !== "true") return false;
  return !["/admin", "/visual-qa"].some((route) => pathname === route || pathname?.startsWith(`${route}/`));
}

import { normalizeTouchLineAuthLocale, normalizeTouchLineAuthReturnTo } from "../touchlineArena/auth-i18n.ts";

export function resolveTouchLineAuthCallbackDestination(
  requestedNext: string | null | undefined,
  requestOrigin: string,
  draftLocalesEnabled = false,
) {
  const trustedOrigin = new URL(requestOrigin).origin;
  const fallback = new URL("/clubowner", trustedOrigin);
  if (!requestedNext || requestedNext.includes("\\") || requestedNext.startsWith("//")) return fallback;
  if ([...requestedNext].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;

  try {
    const candidate = new URL(requestedNext, trustedOrigin);
    if (candidate.origin !== trustedOrigin) return fallback;
    // Recovery remains separate from ordinary post-auth navigation.
    if (candidate.pathname === "/reset-password") return candidate;
    const publicLocalesEnabled = draftLocalesEnabled && !["/admin", "/visual-qa"].some(
      (path) => candidate.pathname === path || candidate.pathname.startsWith(`${path}/`),
    );
    const locale = candidate.searchParams.get("lang");
    if (locale) candidate.searchParams.set("lang", normalizeTouchLineAuthLocale(locale, publicLocalesEnabled));
    const normalized = normalizeTouchLineAuthReturnTo(`${candidate.pathname}${candidate.search}${candidate.hash}`, publicLocalesEnabled);
    return normalized ? new URL(normalized, trustedOrigin) : fallback;
  } catch {
    return fallback;
  }
}

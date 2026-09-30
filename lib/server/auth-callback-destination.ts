import { normalizeTouchLineAuthReturnTo } from "../touchlineArena/auth-i18n.ts";

export function resolveTouchLineAuthCallbackDestination(
  requestedNext: string | null | undefined,
  requestOrigin: string,
) {
  const trustedOrigin = new URL(requestOrigin).origin;
  const fallback = new URL("/market-transfer", trustedOrigin);
  if (!requestedNext || requestedNext.includes("\\") || requestedNext.startsWith("//")) return fallback;
  if ([...requestedNext].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;

  try {
    const candidate = new URL(requestedNext, trustedOrigin);
    if (candidate.origin !== trustedOrigin) return fallback;
    // Recovery remains separate from ordinary post-auth navigation.
    if (candidate.pathname === "/reset-password") return candidate;
    const normalized = normalizeTouchLineAuthReturnTo(`${candidate.pathname}${candidate.search}${candidate.hash}`);
    return normalized ? new URL(normalized, trustedOrigin) : fallback;
  } catch {
    return fallback;
  }
}

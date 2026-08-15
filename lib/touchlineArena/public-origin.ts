/**
 * One public-URL policy for TouchLine.  The public Brazilian domain owns
 * marketing, SEO and all production authentication callbacks.  The Vercel
 * hostname remains a deliberately narrow technical diagnostic endpoint.
 *
 * Arbitrary Preview hostnames are intentionally never returned here: a preview
 * must not become the destination embedded in a production confirmation or
 * reset email. The single QA branch alias is a separate, explicit environment
 * with its own Supabase project and may be used only when it is also the exact
 * configured auth origin.
 */
export const TOUCHLINE_PUBLIC_ORIGIN = "https://touchline.com.br";
export const TOUCHLINE_TECHNICAL_ORIGIN = "https://touchline-arena-official.vercel.app";
export const TOUCHLINE_QA_ORIGIN = "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";

export const TOUCHLINE_PUBLIC_HOSTNAME = "touchline.com.br";
export const TOUCHLINE_PUBLIC_WWW_HOSTNAME = "www.touchline.com.br";
export const TOUCHLINE_TECHNICAL_HOSTNAME = "touchline-arena-official.vercel.app";
export const TOUCHLINE_QA_HOSTNAME = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";

const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
const approvedProductionOrigins = new Set([
  TOUCHLINE_PUBLIC_ORIGIN,
  TOUCHLINE_TECHNICAL_ORIGIN,
]);

function normalizeOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isTouchLinePublicHostname(hostname: string) {
  return hostname.toLowerCase() === TOUCHLINE_PUBLIC_HOSTNAME;
}

export function isTouchLinePublicWwwHostname(hostname: string) {
  return hostname.toLowerCase() === TOUCHLINE_PUBLIC_WWW_HOSTNAME;
}

export function isTouchLineTechnicalHostname(hostname: string) {
  return hostname.toLowerCase() === TOUCHLINE_TECHNICAL_HOSTNAME;
}

export function isTouchLineQaHostname(hostname: string) {
  return hostname.toLowerCase() === TOUCHLINE_QA_HOSTNAME;
}

/** Only exact, approved production origins may override the default. */
export function resolveTouchLineConfiguredAuthOrigin(value: string | undefined) {
  const normalized = normalizeOrigin(value);
  return normalized && approvedProductionOrigins.has(normalized)
    ? normalized
    : TOUCHLINE_PUBLIC_ORIGIN;
}

/**
 * Determines an auth callback origin without ever trusting an arbitrary
 * deployed hostname. Local development keeps its own origin; production uses
 * the public domain, except for the explicit technical diagnostic hostname.
 */
export function resolveTouchLineAuthOrigin({
  currentOrigin,
  hostname,
  configuredOrigin,
}: {
  currentOrigin: string;
  hostname: string;
  configuredOrigin?: string;
}) {
  const normalizedHostname = hostname.toLowerCase();
  if (localHostnames.has(normalizedHostname)) return currentOrigin.replace(/\/+$/, "");
  if (isTouchLineTechnicalHostname(normalizedHostname)) return TOUCHLINE_TECHNICAL_ORIGIN;
  if (isTouchLineQaHostname(normalizedHostname)) {
    return normalizeOrigin(configuredOrigin) === TOUCHLINE_QA_ORIGIN
      ? TOUCHLINE_QA_ORIGIN
      : TOUCHLINE_PUBLIC_ORIGIN;
  }
  if (isTouchLinePublicHostname(normalizedHostname) || isTouchLinePublicWwwHostname(normalizedHostname)) {
    return TOUCHLINE_PUBLIC_ORIGIN;
  }

  return resolveTouchLineConfiguredAuthOrigin(configuredOrigin);
}

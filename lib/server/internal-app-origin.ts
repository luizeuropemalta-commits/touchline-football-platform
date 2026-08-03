/**
 * Resolves the origin used only by server-to-server calls inside TouchLine.
 *
 * Never derive this value from request headers. `host` and forwarded headers
 * are controlled by the incoming request in common proxy configurations and
 * must not become a server-side fetch destination.
 */
function normaliseHttpOrigin(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) origin.`);
  }

  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
    throw new Error(`${label} must be an HTTP(S) origin without credentials.`);
  }

  return parsed.origin;
}

/**
 * Trusted deployment configuration only. In production Vercel injects
 * `VERCEL_URL`; local development uses the process port. Neither branch reads
 * request headers, forwarded headers, or a client supplied origin.
 */
type InternalOriginEnvironment = {
  TOUCHLINE_INTERNAL_APP_ORIGIN?: string;
  VERCEL_URL?: string;
  NODE_ENV?: string;
  PORT?: string;
};

export function resolveTouchlineInternalAppOrigin(environment: InternalOriginEnvironment = process.env) {
  const explicitlyConfigured = environment.TOUCHLINE_INTERNAL_APP_ORIGIN?.trim();
  if (explicitlyConfigured) return normaliseHttpOrigin(explicitlyConfigured, "TOUCHLINE_INTERNAL_APP_ORIGIN");

  const vercelHostname = environment.VERCEL_URL?.trim();
  if (vercelHostname) return normaliseHttpOrigin(`https://${vercelHostname}`, "VERCEL_URL");

  if (environment.NODE_ENV !== "production") {
    const port = environment.PORT?.trim();
    // Next.js uses port 3000 by default. Verification launchers that use a
    // different port provide PORT explicitly, so ClubHub always calls the
    // same local app the visitor opened instead of an unrelated fixed port.
    // This is development-only; production never falls back to a
    // request-derived destination.
    const localPort = port && /^\d{2,5}$/.test(port) ? port : "3000";
    return `http://127.0.0.1:${localPort}`;
  }

  throw new Error("No trusted TouchLine internal application origin is configured.");
}

export function touchlineInternalUrl(pathname: string) {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    throw new Error("TouchLine internal request paths must be absolute paths.");
  }

  return new URL(pathname, resolveTouchlineInternalAppOrigin());
}

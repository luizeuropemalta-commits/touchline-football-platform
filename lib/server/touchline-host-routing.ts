import {
  isTouchLinePublicHostname,
  isTouchLinePublicWwwHostname,
  isTouchLineTechnicalHostname,
} from "../touchlineArena/public-origin.ts";

function withoutPort(value: string) {
  const firstHost = value.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  if (firstHost.startsWith("[")) {
    const closingBracket = firstHost.indexOf("]");
    return closingBracket > 0 ? firstHost.slice(1, closingBracket) : firstHost;
  }
  return firstHost.replace(/:\d+$/, "");
}

export function resolveTouchLineRequestHostname(
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
  fallbackHostname: string,
) {
  return withoutPort(forwardedHost || host || fallbackHostname);
}

export function isTouchLinePublicHost(hostname: string) {
  return isTouchLinePublicHostname(withoutPort(hostname));
}

export function isTouchLinePublicWwwHost(hostname: string) {
  return isTouchLinePublicWwwHostname(withoutPort(hostname));
}

export function isTouchLineVercelHost(hostname: string) {
  const normalizedHostname = withoutPort(hostname);
  return isTouchLineTechnicalHostname(normalizedHostname) || normalizedHostname.endsWith(".vercel.app");
}

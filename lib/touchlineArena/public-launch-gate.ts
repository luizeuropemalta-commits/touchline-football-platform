import type { TouchLinePresentationLocale } from "./root-locale.ts";

export const TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY = "launchPreview" as const;

export type TouchlinePublicLaunchGateMode = "off" | "global" | "qa-opt-in";

type TouchlineLaunchGateEnvironment = Readonly<Record<string, string | undefined>>;

export type TouchlinePublicLaunchGateState =
  | Readonly<{ active: false; mode: "off" }>
  | Readonly<{ active: true; mode: Exclude<TouchlinePublicLaunchGateMode, "off"> }>;

const productRoutePrefixes = [
  "/arena",
  "/market-transfer",
  "/fantasy",
  "/touchline-clubs",
  "/touchline-players",
  "/touchline-coaches",
  "/touchline-player-card-rankings",
  "/touchline-tables",
  "/live",
  "/club-owner",
  "/notifications",
  "/inbox",
  "/football-search",
] as const;

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * Server-owned launch gate. The global switch is deliberately exact and off
 * by default. Its temporary visual QA mode is query-scoped, non-persistent and
 * can run only inside the functional QA Preview contract. Production can never
 * be opted in through the URL.
 */
export function resolveTouchlinePublicLaunchGate({
  environment = process.env,
  previewOptIn,
  requestHostname,
}: {
  environment?: TouchlineLaunchGateEnvironment;
  previewOptIn?: string | null;
  requestHostname?: string | null;
} = {}): TouchlinePublicLaunchGateState {
  if (environment.TOUCHLINE_PUBLIC_LAUNCH_GATE === "true") {
    return { active: true, mode: "global" };
  }

  const isFunctionalQaPreview = environment.VERCEL_ENV === "preview"
    && environment.TOUCHLINE_DEPLOYMENT_MODE === "qa-preview"
    && environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === "qa-preview"
    && typeof environment.VERCEL_URL === "string"
    && requestHostname?.trim().toLowerCase() === environment.VERCEL_URL.trim().toLowerCase();

  if (isFunctionalQaPreview && previewOptIn === "1") {
    return { active: true, mode: "qa-opt-in" };
  }

  return { active: false, mode: "off" };
}

export function isTouchlineLaunchGateProductRoute(pathname: string) {
  return productRoutePrefixes.some((route) => matchesRoute(pathname, route));
}

export function touchlineLaunchGateReturnTo(
  locale: TouchLinePresentationLocale,
  mode: Exclude<TouchlinePublicLaunchGateMode, "off">,
) {
  const search = new URLSearchParams();
  if (mode === "qa-opt-in") search.set(TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY, "1");
  search.set("lang", locale);
  return `/arena?${search.toString()}`;
}

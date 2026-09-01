import type { TouchLinePresentationLocale } from "./root-locale.ts";

export const TOUCHLINE_PUBLIC_LAUNCH_GATE_QUERY = "launchPreview" as const;

export type TouchlinePublicLaunchGateMode = "off" | "global" | "qa-branch" | "qa-opt-in";

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
 * Server-owned launch gate. The Git-native `qa` branch is deliberately gated
 * whenever it runs inside the functional QA Preview contract. Feature Preview
 * deployments keep a non-persistent visual opt-in, while Production can never
 * enter either QA mode through a URL or branch name alone.
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
    && environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === "qa-preview";

  if (isFunctionalQaPreview && environment.VERCEL_GIT_COMMIT_REF === "qa") {
    return { active: true, mode: "qa-branch" };
  }

  const isExactFunctionalQaPreviewHost = isFunctionalQaPreview
    && typeof environment.VERCEL_URL === "string"
    && requestHostname?.trim().toLowerCase() === environment.VERCEL_URL.trim().toLowerCase();

  if (isExactFunctionalQaPreviewHost && previewOptIn === "1") {
    return { active: true, mode: "qa-opt-in" };
  }

  return { active: false, mode: "off" };
}

export function isTouchlineLaunchGateProductRoute(pathname: string) {
  return productRoutePrefixes.some((route) => matchesRoute(pathname, route));
}

export function shouldTouchlineRedirectAuthenticatedAuthEntry({
  hasArenaAccess,
  isAuthEntry,
  isAuthenticated,
  launchGateActive,
}: Readonly<{
  hasArenaAccess: boolean;
  isAuthEntry: boolean;
  isAuthenticated: boolean;
  launchGateActive: boolean;
}>) {
  return isAuthenticated && hasArenaAccess && isAuthEntry && !launchGateActive;
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

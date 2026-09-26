export type AmbientAudioRoute = "entry" | "arena" | "public" | "silent";

/** Fail closed: administrative, preview and unknown routes never inherit sound. */
export function touchlineAmbientAudioRoute(pathname: string | null): AmbientAudioRoute {
  if (!pathname) return "silent";
  if (["/login", "/register", "/forgot-password", "/reset-password"].includes(pathname)) return "entry";
  if (pathname === "/arena" || pathname.startsWith("/arena/")) return "arena";
  const publicRoots = ["/touchline-clubs", "/touchline-coaches", "/touchline-players", "/touchline-tables", "/touchline-player-card-rankings", "/live", "/market-transfer", "/my-club"];
  return publicRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`)) ? "public" : "silent";
}

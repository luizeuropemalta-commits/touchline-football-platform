export type AmbientAudioRoute = "entry" | "silent";

/** Only explicit authentication entry routes may opt in; all other routes are silent. */
export function touchlineAmbientAudioRoute(pathname: string | null): AmbientAudioRoute {
  if (!pathname) return "silent";
  if (["/login", "/register", "/forgot-password", "/reset-password"].includes(pathname)) return "entry";
  return "silent";
}

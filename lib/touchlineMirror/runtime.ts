export const TOUCHLINE_QA_READ_HOST =
  "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app" as const;

export type TouchlineMirrorEnvironment = Readonly<Record<string, string | undefined>>;
export type TouchlineDataSource = "direct" | "qa-mirror" | "invalid";

export function resolveTouchlineQaReadOrigin(value: string | null | undefined) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== TOUCHLINE_QA_READ_HOST || url.port
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

/**
 * Global runtime boundary for explicit QA mirror mode. A malformed request is
 * not direct mode: callers must fail closed instead of silently enabling local
 * credentials, analytics or another data source.
 */
export function resolveTouchlineDataSource(
  environment: TouchlineMirrorEnvironment = process.env,
): TouchlineDataSource {
  const configured = environment.TOUCHLINE_DATA_SOURCE?.trim();
  if (!configured) return "direct";
  if (configured !== "qa-mirror") return "invalid";
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV) return "invalid";
  return resolveTouchlineQaReadOrigin(environment.TOUCHLINE_QA_READ_ORIGIN) ? "qa-mirror" : "invalid";
}

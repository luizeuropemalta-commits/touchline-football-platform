import type { FootballDataProviderName } from "@/lib/football-data/types";

export type FootballDataTimeoutProfile = "live" | "interactive" | "background";

const DEFAULT_TIMEOUT_MS: Record<FootballDataTimeoutProfile, number> = {
  live: 2_000,
  interactive: 3_000,
  background: 15_000,
};

/**
 * One timeout policy for every provider adapter. Live and user-facing reads
 * must fail fast so callers can keep serving their last verified snapshot.
 */
export function footballDataTimeoutMs(profile: FootballDataTimeoutProfile) {
  const envName = `FOOTBALL_DATA_${profile.toUpperCase()}_TIMEOUT_MS`;
  const configured = Number(process.env[envName]);
  return Number.isFinite(configured) && configured >= 100 && configured <= 60_000
    ? configured
    : DEFAULT_TIMEOUT_MS[profile];
}

export type FootballDataHttpResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  headers: Headers;
  fetchedAt: string;
};

export function footballDataHttpResponseCanBeCached(
  response: Pick<FootballDataHttpResponse<unknown>, "ok" | "status">,
) {
  return response.ok && response.status >= 200 && response.status < 300;
}

export async function footballDataFetchJson<T>(
  url: URL,
  init: RequestInit & { timeoutMs?: number; provider: FootballDataProviderName },
): Promise<FootballDataHttpResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`${init.provider} request timed out`)),
    init.timeoutMs ?? footballDataTimeoutMs("background"),
  );

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      next: { revalidate: 0 },
    });

    let data: T | undefined;
    let error: string | undefined;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      data = (await response.json()) as T;
    } else {
      const text = await response.text();
      error = text.slice(0, 500);
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error,
      headers: response.headers,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : `${init.provider} request failed`,
      headers: new Headers(),
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function providerId(provider: FootballDataProviderName, id: string | number | undefined | null) {
  return `${provider}:${String(id ?? "unknown")}`;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function footballDataErrorHttpStatus(status: number | undefined, fallback = 502): number {
  if (Number.isInteger(status) && status !== undefined && status >= 400 && status <= 599) {
    return status;
  }
  return fallback;
}

export function resultOk<T>(
  provider: FootballDataProviderName,
  data: T,
  raw?: unknown,
  cached = false,
  fetchedAt = new Date().toISOString(),
) {
  return {
    ok: true as const,
    data,
    provider,
    cached,
    fetchedAt,
    raw,
  };
}

export function resultError(
  provider: FootballDataProviderName,
  code: "not_configured" | "unsupported" | "provider_error" | "not_found" | "invalid_request" | "rate_limited",
  message: string,
  status?: number,
  details: {
    retryAfterSeconds?: number;
    remaining?: number;
    requestedEntity?: string;
  } = {},
) {
  return {
    ok: false as const,
    provider,
    fetchedAt: new Date().toISOString(),
    error: { provider, code, message, status, ...details },
  };
}

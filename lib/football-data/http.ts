import type { FootballDataProviderName } from "@/lib/football-data/types";

export type FootballDataHttpResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  headers: Headers;
};

export async function footballDataFetchJson<T>(
  url: URL,
  init: RequestInit & { timeoutMs?: number; provider: FootballDataProviderName },
): Promise<FootballDataHttpResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 12_000);

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
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : `${init.provider} request failed`,
      headers: new Headers(),
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

export function resultOk<T>(
  provider: FootballDataProviderName,
  data: T,
  raw?: unknown,
  cached = false,
) {
  return {
    ok: true as const,
    data,
    provider,
    cached,
    fetchedAt: new Date().toISOString(),
    raw,
  };
}

export function resultError(
  provider: FootballDataProviderName,
  code: "not_configured" | "unsupported" | "provider_error" | "not_found" | "invalid_request" | "rate_limited",
  message: string,
  status?: number,
) {
  return {
    ok: false as const,
    provider,
    fetchedAt: new Date().toISOString(),
    error: { provider, code, message, status },
  };
}

import { touchlineInternalUrl } from "./internal-app-origin.ts";

export const TOUCHLINE_INTERNAL_FETCH_TIMEOUT_MS = 6_000;

export type TouchlineInternalJsonResult<T> =
  | { state: "ready"; data: T; status: number }
  | { state: "unavailable"; reason: "timeout" | "network" | "http" | "empty" | "invalid-json" };

type FetchImplementation = (input: URL, init?: RequestInit) => Promise<Response>;

/**
 * Bounded, server-only reads for the rare cases where a server component must
 * call an internal Route Handler. The target is built from trusted server
 * configuration, never from incoming request headers.
 */
export async function fetchTouchlineInternalJson<T>(
  pathname: string,
  options: { fetchImplementation?: FetchImplementation; timeoutMs?: number } = {},
): Promise<TouchlineInternalJsonResult<T>> {
  const timeoutMs = options.timeoutMs ?? TOUCHLINE_INTERNAL_FETCH_TIMEOUT_MS;
  const fetchImplementation = options.fetchImplementation ?? fetch;

  try {
    const response = await fetchImplementation(touchlineInternalUrl(pathname), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return { state: "unavailable", reason: "http" };

    const text = await response.text();
    if (!text.trim()) return { state: "unavailable", reason: "empty" };

    try {
      return { state: "ready", data: JSON.parse(text) as T, status: response.status };
    } catch {
      return { state: "unavailable", reason: "invalid-json" };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { state: "unavailable", reason: "timeout" };
    }
    return { state: "unavailable", reason: "network" };
  }
}

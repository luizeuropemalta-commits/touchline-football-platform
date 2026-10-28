"use client";
import { useEffect, useRef } from "react";

export class PublicOwnersRequestError extends Error {
  constructor(readonly status: number) { super("PUBLIC_OWNERS_REQUEST_FAILED"); }
}
/** No automatic write retries. An unknown write outcome requires a fresh read. */
export function usePublicOwnersRequest() {
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  useEffect(() => {
    mounted.current = true;
    const active = requests.current;
    return () => { mounted.current = false; for (const controller of active) controller.abort(); active.clear(); };
  }, []);
  return {
    alive: () => mounted.current,
    request: async (url: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const controller = new AbortController(); requests.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(url, { method: body ? "PUT" : "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
          ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
        if (!response.ok) throw new PublicOwnersRequestError(response.status);
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("INVALID_RESPONSE");
        return data as Record<string, unknown>;
      } finally { clearTimeout(timeout); requests.current.delete(controller); }
    },
  };
}

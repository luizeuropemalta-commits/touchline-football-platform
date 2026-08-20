import { touchlineActivityArea } from "./activity-analytics.ts";

export const TOUCHLINE_ANALYTICS_AREAS = [
  "arena",
  "club-owner",
  "club",
  "player",
  "market",
  "training",
  "ranking",
  "admin",
  "other",
] as const;

export const TOUCHLINE_ANALYTICS_DEVICES = ["mobile", "tablet", "desktop", "unknown"] as const;

export type TouchlineAnalyticsArea = (typeof TOUCHLINE_ANALYTICS_AREAS)[number];
export type TouchlineAnalyticsDevice = (typeof TOUCHLINE_ANALYTICS_DEVICES)[number];

export type TouchlineAnalyticsPayload = {
  sessionId: string;
};

const PAYLOAD_KEYS = new Set(["sessionId"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TOUCHLINE_ANALYTICS_MAX_BODY_BYTES = 1_024;

export function isTouchlineAnalyticsSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isSameOriginAnalyticsRequest(requestUrl: string, origin: string | null) {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export function touchlineAnalyticsAreaFromReferrer(requestUrl: string, referrer: string | null) {
  if (!referrer) return null;
  try {
    const requestOrigin = new URL(requestUrl).origin;
    const referrerUrl = new URL(referrer);
    if (referrerUrl.origin !== requestOrigin) return null;
    return touchlineActivityArea(referrerUrl.pathname, referrerUrl.searchParams.get("panel"));
  } catch {
    return null;
  }
}

export function touchlineAnalyticsDeviceFromHeaders(headers: Headers): TouchlineAnalyticsDevice {
  const mobileHint = headers.get("sec-ch-ua-mobile")?.trim();
  if (mobileHint === "?1") return "mobile";

  const userAgent = headers.get("user-agent")?.toLowerCase() ?? "";
  if (/ipad|tablet|kindle|silk/.test(userAgent)) return "tablet";
  if (/iphone|ipod|mobile|android/.test(userAgent)) return "mobile";
  if (/mozilla|chrome|chromium|safari|firefox|edg\//.test(userAgent)) return "desktop";
  return "unknown";
}

export async function readBoundedTouchlineAnalyticsJson(
  request: Request,
  maxBytes = TOUCHLINE_ANALYTICS_MAX_BODY_BYTES,
) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return null;

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return null;
  }
}

export function parseTouchlineAnalyticsPayload(payload: unknown): TouchlineAnalyticsPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const candidate = payload as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== PAYLOAD_KEYS.size || keys.some((key) => !PAYLOAD_KEYS.has(key))) return null;
  if (!isTouchlineAnalyticsSessionId(candidate.sessionId)) return null;

  return {
    sessionId: candidate.sessionId,
  };
}

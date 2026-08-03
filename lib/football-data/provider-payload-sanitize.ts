const BLOCKED_PROVIDER_PAYLOAD_KEYS = new Set([
  "authorization",
  "imagepath",
  "imageurl",
  "logopath",
  "logourl",
  "photopath",
  "photourl",
  "raw",
  "rawdata",
  "secret",
  "sourcefaceurl",
  "token",
]);

function normalizedKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isBlockedProviderPayloadKey(key: string) {
  const normalized = normalizedKey(key);
  return BLOCKED_PROVIDER_PAYLOAD_KEYS.has(normalized)
    || normalized.includes("apitoken")
    || normalized.includes("accesstoken")
    || normalized.includes("apikey")
    || normalized.endsWith("secret");
}

function isBlockedProviderPayloadString(value: string) {
  const normalized = value.toLowerCase();
  const configuredToken = process.env.SPORTMONKS_API_TOKEN;

  return normalized.includes("api_token=")
    || normalized.includes("image_path")
    || normalized.includes("raw_data")
    || normalized.includes("sportmonks.com")
    || Boolean(configuredToken && value.includes(configuredToken));
}

/**
 * Produces JSON-safe provider data for server-side persistence without
 * retaining licensed raw payloads, provider media paths, or credentials.
 */
export function sanitizeProviderPayloadForPersistence<T>(value: T): T {
  function sanitize(nestedValue: unknown): unknown {
    if (typeof nestedValue === "string") {
      return isBlockedProviderPayloadString(nestedValue) ? undefined : nestedValue;
    }

    if (Array.isArray(nestedValue)) {
      return nestedValue
        .map(sanitize)
        .filter((item) => item !== undefined);
    }

    if (!nestedValue || typeof nestedValue !== "object") return nestedValue;

    const sanitized: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(nestedValue)) {
      if (isBlockedProviderPayloadKey(key)) continue;
      const safeValue = sanitize(childValue);
      if (safeValue !== undefined) sanitized[key] = safeValue;
    }

    return sanitized;
  }

  return sanitize(value) as T;
}

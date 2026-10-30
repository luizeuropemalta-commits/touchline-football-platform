import { Buffer } from "node:buffer";

export type AvatarRetentionConfigurationFailure =
  | "QA_RETENTION_ORIGIN_INCOMPATIBLE"
  | "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE"
  | "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE";

/** Preserve the server's exact existing origin/JWT binding. These fixed codes
 * describe local configuration, never authenticate a caller or expose claims.
 * In particular an opaque key or a JWT without the QA ref remains inadmissible.
 */
export function avatarRetentionConfigurationFailure(origin: unknown, key: unknown): AvatarRetentionConfigurationFailure | null {
  if (origin !== "https://xgxbwqxjssxxuihuwmgy.supabase.co") return "QA_RETENTION_ORIGIN_INCOMPATIBLE";
  if (typeof key !== "string" || key.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    return "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE";
  }
  try {
    const claims: unknown = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    if (claims && typeof claims === "object" && !Array.isArray(claims)) {
      const values = claims as Record<string, unknown>;
      if (values.ref === "xgxbwqxjssxxuihuwmgy" && values.role === "service_role") return null;
    }
  } catch { /* Malformed claims produce only the fixed failure code below. */ }
  return "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE";
}

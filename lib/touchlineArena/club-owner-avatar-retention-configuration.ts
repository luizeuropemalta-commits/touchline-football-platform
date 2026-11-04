import { Buffer } from "node:buffer";
import { avatarRetentionTarget, matchesAvatarRetentionTarget, type AvatarRetentionTarget } from "./club-owner-avatar-retention-target.ts";

export type AvatarRetentionConfigurationFailure =
  | "AVATAR_RETENTION_TARGET_INCOMPATIBLE"
  | "QA_RETENTION_ORIGIN_INCOMPATIBLE"
  | "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE"
  | "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE";

/** Preserve the server's origin/JWT binding; omitted target is existing QA. These fixed codes
 * describe local configuration, never authenticate a caller or expose claims.
 * Opaque keys and JWTs without the selected target ref remain inadmissible.
 */
export function avatarRetentionConfigurationFailure(origin: unknown, key: unknown, input?: AvatarRetentionTarget): AvatarRetentionConfigurationFailure | null {
  if (input !== undefined && !matchesAvatarRetentionTarget(input, origin, key)) return "AVATAR_RETENTION_TARGET_INCOMPATIBLE";
  const target = avatarRetentionTarget(input);
  if (origin !== target.supabaseOrigin) return "QA_RETENTION_ORIGIN_INCOMPATIBLE";
  if (typeof key !== "string" || key.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    return "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE";
  }
  try {
    const claims: unknown = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    if (claims && typeof claims === "object" && !Array.isArray(claims)) {
      const values = claims as Record<string, unknown>;
      if (values.ref === target.projectRef && values.role === "service_role") return null;
    }
  } catch { /* Malformed claims produce only the fixed failure code below. */ }
  return "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE";
}

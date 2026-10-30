import { isAvatarAccountId } from "./club-owner-avatar-upload-contract.ts";

export type ClubOwnerAvatarAudience = Readonly<{ mode: "account"; accountId: string } | { mode: "customers" }>;

/** Private rollout policy only. Absent mode preserves the single-account
 * contract. Customer authentication, QA environment and feature/readiness
 * gates remain mandatory at each caller; a header is never identity authority.
 * Removing the mode restores the configured account without changing state.
 */
export function parseClubOwnerAvatarAudience(config: Readonly<{ audience?: unknown; accountId?: unknown }>): ClubOwnerAvatarAudience | null {
  if (config.audience === undefined) {
    return isAvatarAccountId(config.accountId)
      ? Object.freeze({ mode: "account", accountId: config.accountId.toLowerCase() }) : null;
  }
  if (config.audience !== "customers"
    || (config.accountId !== undefined && !isAvatarAccountId(config.accountId))) return null;
  return Object.freeze({ mode: "customers" });
}

export function allowsClubOwnerAvatarAudience(policy: ClubOwnerAvatarAudience | null, actorId: unknown): actorId is string {
  return isAvatarAccountId(actorId) && (policy?.mode === "customers"
    || (policy?.mode === "account" && policy.accountId === actorId.toLowerCase()));
}

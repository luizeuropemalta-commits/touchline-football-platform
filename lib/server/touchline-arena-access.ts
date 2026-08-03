import type { User } from "@supabase/supabase-js";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureArenaUserProfile } from "@/lib/server/arena-user";
import {
  hasTouchLineArenaAccess,
  TOUCHLINE_ARENA_ACCESS_METADATA_KEY,
} from "@/lib/touchlineArena/auth-access";

type ArenaAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type TouchlineArenaAccessResult = {
  accessReady?: boolean;
  arenaAccessGranted?: boolean;
  eligible?: boolean;
  reason?: "owner_admin";
  amountTc: 0;
};

type TouchlineOwnerRegistrationResult = {
  owner: true;
  eligible: false;
  grantRevoked: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOwnerRegistrationResult(value: unknown): value is TouchlineOwnerRegistrationResult {
  return isRecord(value)
    && value.owner === true
    && value.eligible === false
    && typeof value.grantRevoked === "boolean";
}

async function markTouchLineArenaAccess(user: User, admin: ArenaAdminClient) {
  const appMetadata = isRecord(user.app_metadata) ? user.app_metadata : {};
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...appMetadata,
      [TOUCHLINE_ARENA_ACCESS_METADATA_KEY]: true,
    },
  });
  if (error) throw new Error("TouchLine Arena access could not be finalized.");
}

/**
 * Grants application access only.
 *
 * New accounts start with 0 automatic TC.
 * Historical ledgers remain untouched in the database.
 */
export async function ensureTouchlineArenaAccess(
  user: User,
  providedAdmin?: ArenaAdminClient,
): Promise<TouchlineArenaAccessResult> {
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) throw new Error("TouchLine Arena access is not configured.");
  if (hasTouchLineArenaAccess(user)) return { accessReady: true, amountTc: 0 };

  // The platform owner stays administration-only. This preserves the existing
  // owner boundary without granting a ClubOwner gameplay wallet.
  if (isOwnerEmail(user.email)) {
    const { data, error } = await admin.rpc("register_touchline_platform_owner", {
      requested_user_id: user.id,
      requested_email: user.email,
    });
    if (error || !isOwnerRegistrationResult(data)) {
      throw new Error("TouchLine owner boundary is unavailable.");
    }
    await markTouchLineArenaAccess(user, admin);
    return {
      eligible: false,
      reason: "owner_admin",
      arenaAccessGranted: true,
      amountTc: 0,
    };
  }

  await ensureArenaUserProfile(user, admin);
  await markTouchLineArenaAccess(user, admin);
  return { arenaAccessGranted: true, amountTc: 0 };
}

import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

type ArenaAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function cleanProfileName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

export function arenaUserDisplayName(user: User) {
  return (
    cleanProfileName(user.user_metadata?.full_name) ||
    cleanProfileName(user.user_metadata?.name) ||
    cleanProfileName(user.email?.split("@")[0]) ||
    "TouchLine ClubOwner"
  );
}

export async function ensureArenaUserProfile(
  user: User,
  providedAdmin?: ArenaAdminClient,
) {
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) throw new Error("Supabase admin client is not configured.");

  const profile = {
    id: user.id,
    full_name: arenaUserDisplayName(user),
  };

  // Auth registration normally creates this row through the database trigger.
  // The idempotent insert also covers installations where that trigger is late
  // or unavailable, without provisioning any retired product workspace.
  const { error } = await admin.from("users").upsert(profile, {
    onConflict: "id",
    ignoreDuplicates: true,
  });

  if (error) throw new Error(error.message);
  return profile;
}

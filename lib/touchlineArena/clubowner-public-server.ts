import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "./auth-access";
import type { PeopleDependencies } from "./clubowner-public-handler";
import { resolveServerReadWithin } from "./server-read-deadline";
import { isOwnerEmail } from "@/lib/admin/owner";
import { readPublicOwnerSearchPage, readPublicOwnerStanding } from "./clubowner-public-search-server";
import { publicOwnerId } from "./clubowner-public-contract";
import { publicOwnerAvatarService } from "./clubowner-public-avatar-server";

export const publicOwnersEnabled = () => process.env.TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED === "true";
export function publicOwnerDependencies(): PeopleDependencies {
  const photo = publicOwnerAvatarService();
  let client: ReturnType<typeof createClient> | undefined;
  const getClient = () => client ??= createClient();
  const readUser = async () => {
      const supabase = await getClient();
      if (!supabase) throw new Error("AUTH_UNAVAILABLE");
      const result = await resolveServerReadWithin(supabase.auth.getUser(), null, 8_000);
      if (!result) throw new Error("AUTH_UNAVAILABLE");
      const { data, error } = result;
      if (error) {
        if (error.name === "AuthSessionMissingError" && !data.user) return null;
        throw new Error("AUTH_UNAVAILABLE");
      }
      return data.user;
  };
  return {
    enabled: publicOwnersEnabled(),
    profileStanding: readPublicOwnerStanding,
    photoEnabled: photo.enabled,
    photoOriginAllowed: photo.allowsOrigin,
    photoUrls: photo.urls,
    searchDirectory: async (query, cursor) => {
      const user = await readUser();
      const allowed = !!user && !user.is_anonymous && hasTouchLineArenaAccess(user);
      if (allowed && !publicOwnerId(user.id)) throw new Error("AUTH_UNAVAILABLE");
      return readPublicOwnerSearchPage(query, cursor, allowed ? user.id : null);
    },
    currentActor: async () => {
      const user = await readUser();
      if (photo.enabled) photo.assertCurrent();
      return user ? { allowed: !user.is_anonymous && hasTouchLineArenaAccess(user),
        ...(photo.enabled ? { photoAllowed: !user.is_anonymous && hasTouchLineArenaAccess(user)
          && typeof user.email === "string" && !!user.email.trim() && !isOwnerEmail(user.email) } : {}) } : null;
    },
    rpc: async (name, args = {}) => {
      if (name === "touchline_people_save_profile_v2") { if (!photo.enabled) throw new Error("PHOTO_UNAVAILABLE"); photo.assertCurrent(); }
      const supabase = await getClient();
      if (!supabase) throw new Error("DATA_UNAVAILABLE");
      // Uses the user's request JWT, never service-role impersonation.
      const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(10_000));
      if (name === "touchline_people_save_profile_v2") photo.assertCurrent();
      if (error) throw error;
      return data;
    },
  };
}

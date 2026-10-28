import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "./auth-access";
import type { PeopleDependencies } from "./clubowner-public-handler";
import { resolveServerReadWithin } from "./server-read-deadline";

export const publicOwnersEnabled = () => process.env.TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED === "true";
export function publicOwnerDependencies(): PeopleDependencies {
  let client: ReturnType<typeof createClient> | undefined;
  const getClient = () => client ??= createClient();
  return {
    enabled: publicOwnersEnabled(),
    currentActor: async () => {
      const supabase = await getClient();
      if (!supabase) throw new Error("AUTH_UNAVAILABLE");
      const result = await resolveServerReadWithin(supabase.auth.getUser(), null, 8_000);
      if (!result) throw new Error("AUTH_UNAVAILABLE");
      const { data, error } = result;
      if (error) {
        if (error.name === "AuthSessionMissingError" && !data.user) return null;
        throw new Error("AUTH_UNAVAILABLE");
      }
      return data.user ? { allowed: !data.user.is_anonymous && hasTouchLineArenaAccess(data.user) } : null;
    },
    rpc: async (name, args = {}) => {
      const supabase = await getClient();
      if (!supabase) throw new Error("DATA_UNAVAILABLE");
      // Uses the user's request JWT, never service-role impersonation.
      const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(10_000));
      if (error) throw error;
      return data;
    },
  };
}

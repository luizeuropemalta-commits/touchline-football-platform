import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { hasTouchLineArenaAccess } from "./auth-access";
import { coachEditorialEnabled } from "./coach-catalogue-server";
import { resolveServerReadWithin } from "./server-read-deadline";
import type { CoachEditorialDependencies } from "./coach-editorial-handler";

export function coachEditorialDependencies(): CoachEditorialDependencies {
  return { enabled: coachEditorialEnabled(), actor: async () => {
    const session = await createClient(); if (!session) throw new Error("AUTH_UNAVAILABLE");
    const result = await resolveServerReadWithin(session.auth.getUser(), null, 8_000);
    if (!result || result.error) throw new Error("AUTH_UNAVAILABLE");
    const user = result.data.user;
    return user ? { id: user.id, owner: isOwnerEmail(user.email), allowed: !user.is_anonymous && hasTouchLineArenaAccess(user) } : null;
  }, rpc: async (name, args) => {
    const admin = createAdminClient(); if (!admin) throw new Error("DATA_UNAVAILABLE");
    const { data, error } = await admin.rpc(name, args).abortSignal(AbortSignal.timeout(12_000));
    if (error) throw error; return data;
  } };
}

import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { handlePushDeviceRegistration } from "@/lib/touchlineArena/push-device-handler";

export async function PUT(request: NextRequest) {
  let supabase: Awaited<ReturnType<typeof createClient>> = null;
  return handlePushDeviceRegistration(request, {
    actor: async () => {
      supabase = await createClient();
      if (!supabase) throw new Error("device-storage-unavailable");
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;
      return { id: user.id, allowed: hasTouchLineArenaAccess(user) };
    },
    save: async ({ userId, registration, userAgent }) => {
      if (!supabase) throw new Error("device-storage-unavailable");
      const { error } = await supabase.from("notification_devices").upsert({
        user_id: userId,
        installation_id: registration.installationId,
        permission: registration.permission,
        push_subscription: registration.subscription,
        user_agent: userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id,installation_id" });
      if (error) throw new Error("device-storage-unavailable");
    },
  });
}

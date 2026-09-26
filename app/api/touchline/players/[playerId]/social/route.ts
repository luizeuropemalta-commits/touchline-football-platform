import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { handlePlayerSocial } from "@/lib/touchlineArena/player-social-handler";

export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await context.params;
  const enabled = process.env.TOUCHLINE_PLAYER_SOCIAL_ENABLED === "true";
  // Remains off until the additive schema, auth and persistence gates are approved.
  const admin = enabled ? createAdminClient() : null;
  return handlePlayerSocial(request, playerId, {
    enabled: enabled && Boolean(admin),
    currentActor: async () => {
      const client = await createClient();
      if (!client) return null;
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id, allowed: hasTouchLineArenaAccess(data.user) && !data.user.is_anonymous };
    },
    resolvePlayer: async (providerId) => {
      const { data, error } = await admin!.from("football_players")
        .select("id").eq("provider", "sportmonks").eq("provider_player_id", providerId).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    read: async (id, userId) => {
      const { data, error } = await admin!.rpc("touchline_player_social_summary", { p_player_id: id, p_user_id: userId });
      if (error) throw error;
      return data;
    },
    write: async (id, userId, kind, active) => {
      const { data, error } = await admin!.rpc("touchline_set_player_social_reaction", {
        p_player_id: id, p_user_id: userId, p_kind: kind, p_active: active,
      });
      if (error) throw error;
      return data;
    },
  });
}

export const GET = handle;
export const PUT = handle;

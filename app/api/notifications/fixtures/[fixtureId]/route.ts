import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { handleFixtureAlert } from "@/lib/touchlineArena/fixture-alert-handler";

export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await context.params;
  const enabled = process.env.TOUCHLINE_FIXTURE_ALERTS_ENABLED === "true";
  const admin = enabled ? createAdminClient() : null;
  return handleFixtureAlert(request, fixtureId, {
    enabled: enabled && Boolean(admin),
    actor: async () => {
      const client = await createClient();
      if (!client) return null;
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id, allowed: !data.user.is_anonymous && hasTouchLineArenaAccess(data.user) };
    },
    resolveFixture: async (providerId) => {
      const { data, error } = await admin!.from("football_fixtures").select("id")
        .eq("provider", "sportmonks").eq("provider_fixture_id", providerId).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    read: async (id, userId) => {
      const { data, error } = await admin!.rpc("touchline_fixture_alert_status", { p_fixture_id: id, p_user_id: userId });
      if (error) throw error;
      return data;
    },
    write: async (id, userId, active) => {
      const { data, error } = await admin!.rpc("touchline_set_fixture_alert_subscription", { p_fixture_id: id, p_user_id: userId, p_active: active });
      if (error) throw error;
      return data;
    },
  });
}

export const GET = handle;
export const PUT = handle;

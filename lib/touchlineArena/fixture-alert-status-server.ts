import "server-only";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasTouchLineArenaAccess } from "./auth-access";
import { parseTouchlineDeviceRegistration } from "./push-device-contract";
import { touchlinePushSubscriptionFingerprint } from "./push-subscription-fingerprint";
import { parseMatchPushVapidConfig } from "./match-push-vapid-config";
import { normalizeMatchPushSourceAgePolicy } from "./match-push-source-freshness";
import type { FixtureAlertStatusDependencies } from "./fixture-alert-status";

function configured(): boolean {
  try {
    const secret = process.env.TOUCHLINE_MATCH_PUSH_WORKER_SECRET;
    const rawPolicy = process.env.TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY;
    return process.env.TOUCHLINE_MATCH_PUSH_WORKER_ENABLED === "true" && typeof secret === "string"
      && secret.length >= 32 && secret.length <= 512 && typeof rawPolicy === "string" && Buffer.byteLength(rawPolicy) <= 1024
      && Boolean(normalizeMatchPushSourceAgePolicy(JSON.parse(rawPolicy)))
      && Boolean(parseMatchPushVapidConfig({ subject: process.env.TOUCHLINE_WEB_PUSH_SUBJECT,
        publicKey: process.env.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY, privateKey: process.env.TOUCHLINE_WEB_PUSH_PRIVATE_KEY }));
  } catch { return false; }
}

export function createFixtureAlertStatusDependencies(): FixtureAlertStatusDependencies {
  let client: Awaited<ReturnType<typeof createClient>> = null;
  let admin: ReturnType<typeof createAdminClient> = null;
  let verifiedAccount: string | null = null;
  return {
    enabled: process.env.TOUCHLINE_FIXTURE_ALERTS_ENABLED === "true",
    actor: async signal => {
      signal.throwIfAborted();
      client = await createClient();
      signal.throwIfAborted();
      if (!client) throw new Error("storage-unavailable");
      const receipt = await client.auth.getUser();
      signal.throwIfAborted();
      if (receipt?.error instanceof AuthSessionMissingError) return null;
      if (!receipt || receipt.error !== null || !receipt.data || receipt.data.user === undefined) {
        throw new Error("authentication-unavailable");
      }
      const { data } = receipt;
      if (data.user === null) return null;
      verifiedAccount = data.user.id;
      return { id: data.user.id, allowed: !data.user.is_anonymous && hasTouchLineArenaAccess(data.user) };
    },
    resolveFixture: async (providerId, signal) => {
      signal.throwIfAborted();
      if (!verifiedAccount) throw new Error("authentication-required");
      admin = createAdminClient();
      if (!admin) throw new Error("storage-unavailable");
      const { data, error } = await admin.from("football_fixtures").select("id")
        .eq("provider", "sportmonks").eq("provider_fixture_id", providerId).abortSignal(signal).maybeSingle();
      if (error) throw new Error("fixture-unconfirmed");
      return data?.id ?? null;
    },
    observe: async (accountId, fixtureId, installationId, signal) => {
      signal.throwIfAborted();
      if (!client || !admin || verifiedAccount !== accountId) throw new Error("context-changed");
      // Service-only fixture status is an existing read-only RPC. Private
      // preferences/devices use the authenticated client with RLS + owner filter.
      const [interest, preferences, device] = await Promise.all([
        admin.rpc("touchline_fixture_alert_status", { p_fixture_id: fixtureId, p_user_id: accountId }).abortSignal(signal),
        client.from("notification_preferences").select("user_id,settings,channels,frequency,explicit_consent_at,quiet_hours")
          .eq("user_id", accountId).abortSignal(signal).maybeSingle(),
        installationId === null ? Promise.resolve({ data: null, error: null })
          : client.from("notification_devices").select("user_id,installation_id,permission,push_subscription")
            .eq("user_id", accountId).eq("installation_id", installationId).abortSignal(signal).maybeSingle(),
      ]);
      signal.throwIfAborted();
      if (interest.error || preferences.error || device.error
        || !interest.data || typeof interest.data.subscribed !== "boolean"
        || (preferences.data && preferences.data.user_id !== accountId)
        || (device.data && (device.data.user_id !== accountId || device.data.installation_id !== installationId))) throw new Error("observation-unconfirmed");
      const registration = device.data ? parseTouchlineDeviceRegistration({ installationId: device.data.installation_id,
        permission: device.data.permission, subscription: device.data.push_subscription }) : null;
      // Compute only from the exact server-owned registration. Never accept a
      // caller fingerprint and never return endpoint, keys or fingerprint.
      const registered = registration?.permission === "granted" && Boolean(touchlinePushSubscriptionFingerprint(registration));
      return { subscribed: interest.data.subscribed, configured: configured(),
        device: installationId === null ? "not-requested" : !device.data ? "missing" : registered ? "registered" : "invalid",
        preferences: preferences.data };
    },
  };
}

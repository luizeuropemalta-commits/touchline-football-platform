import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { parseTouchlineDeviceRegistration } from "@/lib/touchlineArena/push-device-contract";
import { hasTouchlineServerPushConfiguration, resolveTouchlinePushPreference } from "@/lib/touchlineArena/push-preference-contract";

const DEFAULT_NOTIFICATION_SETTINGS = {
  playerRumours: true,
  availability: true,
  confirmedLineup: true,
  goalsAndEvents: true,
  selectedLiveMatches: false,
  leagueLeadership: true,
  transfersAndOffers: true,
  creditsPromotionsRewards: true,
  accountSecurity: true,
  generalComms: false,
  scopes: {
    clubs: [] as string[],
    players: [] as string[],
    competitions: ["TouchLine England"],
    fixtures: [] as string[],
  },
};

const DEFAULT_CHANNELS = { in_app: true, push: false, email: false };
const DEFAULT_QUIET_HOURS = { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" };
const FREQUENCIES = new Set(["realtime", "hourly_digest", "daily_digest", "paused"]);

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 50);
}

function normalizeSettings(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const scopes = input.scopes && typeof input.scopes === "object" ? input.scopes as Record<string, unknown> : {};
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...Object.fromEntries(
      Object.keys(DEFAULT_NOTIFICATION_SETTINGS)
        .filter((key) => key !== "scopes")
        .map((key) => [key, typeof input[key] === "boolean" ? input[key] : DEFAULT_NOTIFICATION_SETTINGS[key as keyof typeof DEFAULT_NOTIFICATION_SETTINGS]]),
    ),
    scopes: {
      clubs: cleanStringList(scopes.clubs),
      players: cleanStringList(scopes.players),
      competitions: cleanStringList(scopes.competitions).length ? cleanStringList(scopes.competitions) : ["TouchLine England"],
      fixtures: cleanStringList(scopes.fixtures),
    },
  };
}

function normalizeChannels(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    in_app: typeof input.in_app === "boolean" ? input.in_app : DEFAULT_CHANNELS.in_app,
    push: typeof input.push === "boolean" ? input.push : DEFAULT_CHANNELS.push,
    email: typeof input.email === "boolean" ? input.email : DEFAULT_CHANNELS.email,
  };
}

function normalizeQuietHours(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_QUIET_HOURS.enabled,
    start: typeof input.start === "string" && /^\d{2}:\d{2}$/.test(input.start) ? input.start : DEFAULT_QUIET_HOURS.start,
    end: typeof input.end === "string" && /^\d{2}:\d{2}$/.test(input.end) ? input.end : DEFAULT_QUIET_HOURS.end,
    timezone: typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim().slice(0, 64) : DEFAULT_QUIET_HOURS.timezone,
  };
}

async function currentUser() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user: hasTouchLineArenaAccess(user) ? user : null };
}

async function userHasRegisteredPushDevice(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, userId: string) {
  const { data, error } = await supabase
    .from("notification_devices")
    .select("installation_id, permission, push_subscription")
    .eq("user_id", userId)
    .eq("permission", "granted")
    .not("push_subscription", "is", null)
    .limit(1);

  if (error) return false;
  return Boolean(data?.some((device) => parseTouchlineDeviceRegistration({
    installationId: device.installation_id,
    permission: device.permission,
    subscription: device.push_subscription,
  })));
}

export async function GET() {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("settings, channels, frequency, quiet_hours, explicit_consent_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    data: {
      settings: normalizeSettings(data?.settings),
      channels: normalizeChannels(data?.channels),
      frequency: FREQUENCIES.has(data?.frequency) ? data?.frequency : "realtime",
      quietHours: normalizeQuietHours(data?.quiet_hours),
      explicitConsentAt: data?.explicit_consent_at ?? null,
      updatedAt: data?.updated_at ?? null,
    },
  });
}

export async function PUT(request: NextRequest) {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const payload = await request.json().catch(() => ({}));
  const settings = normalizeSettings(payload.settings);
  const channels = normalizeChannels(payload.channels);
  const quietHours = normalizeQuietHours(payload.quietHours);
  const frequency = FREQUENCIES.has(payload.frequency) ? payload.frequency : "realtime";
  const hasConsent = Boolean(payload.explicitConsent);

  // Preferences are user-controlled, but remote delivery capability is
  // server-owned. Do not allow a direct authenticated PUT to claim that push
  // is active unless VAPID is complete and a real device registration exists.
  const pushRequested = channels.push;
  const hasRegisteredDevice = pushRequested
    ? await userHasRegisteredPushDevice(supabase, user.id)
    : false;
  channels.push = resolveTouchlinePushPreference({
    requested: pushRequested,
    serverConfigured: hasTouchlineServerPushConfiguration(),
    hasRegisteredDevice,
  });

  if (!channels.in_app && !channels.push && !channels.email) {
    return NextResponse.json({ ok: false, error: "At least one notification channel must stay enabled." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({
      user_id: user.id,
      settings,
      channels,
      frequency,
      quiet_hours: quietHours,
      explicit_consent_at: hasConsent ? new Date().toISOString() : null,
    }, { onConflict: "user_id" })
    .select("settings, channels, frequency, quiet_hours, explicit_consent_at, updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    data: {
      settings: normalizeSettings(data.settings),
      channels: normalizeChannels(data.channels),
      frequency: data.frequency,
      quietHours: normalizeQuietHours(data.quiet_hours),
      explicitConsentAt: data.explicit_consent_at,
      updatedAt: data.updated_at,
    },
  });
}

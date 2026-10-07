import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { parseTouchlineDeviceRegistration } from "@/lib/touchlineArena/push-device-contract";
import { parseNotificationQuietHours } from "@/lib/touchlineArena/notification-quiet-hours";
import { hasTouchlineServerPushConfiguration, resolveTouchlinePushPreference } from "@/lib/touchlineArena/push-preference-contract";

const DEFAULT_NOTIFICATION_SETTINGS = {
  silentPush: false,
  playerRumours: true,
  availability: true,
  confirmedLineup: true,
  // New category is opt-in; existing consent must not silently enable it.
  lineupReminders: false,
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
// Storage vocabulary is independent of public translation release gates.
const GAME_LOCALES = new Set(["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]);

function isGameLocaleRevision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (value.length < 19 || value <= "9223372036854775807");
}

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
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" };
  try {
    const { supabase, user } = await currentUser();
    if (!supabase || !user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401, headers });

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("settings, channels, frequency, quiet_hours, explicit_consent_at, updated_at, game_locale, game_locale_revision::text")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || (data !== null && (!data || typeof data !== "object" || Array.isArray(data)
    || !Object.hasOwn(data, "game_locale_revision") || !isGameLocaleRevision(data.game_locale_revision)))) {
    return NextResponse.json({ ok: false, error: "Preferences unavailable." }, { status: 503, headers });
  }

  return NextResponse.json({
    ok: true,
    data: {
      accountId: user.id,
      settings: normalizeSettings(data?.settings),
      channels: normalizeChannels(data?.channels),
      frequency: FREQUENCIES.has(data?.frequency) ? data?.frequency : "realtime",
      quietHours: normalizeQuietHours(data?.quiet_hours),
      explicitConsentAt: data?.explicit_consent_at ?? null,
      updatedAt: data?.updated_at ?? null,
      gameLocale: typeof data?.game_locale === "string" && GAME_LOCALES.has(data.game_locale) ? data.game_locale : null,
      gameLocaleRevision: data === null ? "0" : data.game_locale_revision,
    },
  }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Preferences unavailable." }, { status: 503, headers });
  }
}

export async function PUT(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }

  const { supabase, user } = await currentUser();
  if (!supabase || !user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid preferences." }, { status: 400 });
  }
  if (payload.action !== undefined) {
    if (payload.action === "set_game_locale") {
      const expectedAccount = request.headers.get("X-Touchline-Expected-Account");
      if (!expectedAccount || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedAccount)) {
        return NextResponse.json({ ok: false, error: "Invalid account context." }, { status: 400 });
      }
      // A condition, never an owner selector: SQL still derives auth.uid().
      if (expectedAccount !== user.id) {
        return NextResponse.json({ ok: false, error: "Account changed. Reload before trying again." }, { status: 409 });
      }
      const keys = Object.keys(payload);
      let inheritedField = false;
      for (const key in payload) if (!Object.hasOwn(payload, key)) inheritedField = true;
      if (inheritedField || !Object.hasOwn(payload, "action") || !Object.hasOwn(payload, "locale")
        || !Object.hasOwn(payload, "expectedRevision") || keys.length !== 3
        || typeof payload.locale !== "string" || !GAME_LOCALES.has(payload.locale)
        || !isGameLocaleRevision(payload.expectedRevision) || payload.expectedRevision === "9223372036854775807") {
        return NextResponse.json({ ok: false, error: "Invalid game language." }, { status: 400 });
      }
      // The invoker RPC derives auth.uid() and changes only locale and its revision.
      // It never renews consent, subscribes a device or enables a channel.
      try {
        const saved = await supabase.rpc("touchline_set_game_locale", {
          p_locale: payload.locale, p_expected_revision: payload.expectedRevision,
        }).select("game_locale,game_locale_revision::text,updated_at").maybeSingle();
        const data = saved.data as { game_locale?: unknown; game_locale_revision?: unknown; updated_at?: unknown } | null;
        if (!saved.error && data === null) {
          return NextResponse.json({ ok: false, error: "Preferences changed. Reload before trying again." }, { status: 409 });
        }
        if (saved.error || !data || typeof data !== "object" || Array.isArray(data)
          || !Object.hasOwn(data, "game_locale") || !Object.hasOwn(data, "updated_at")
          || !Object.hasOwn(data, "game_locale_revision")
          || data.game_locale_revision !== (BigInt(payload.expectedRevision) + BigInt(1)).toString()
          || data.game_locale !== payload.locale || typeof data.updated_at !== "string"
          || !Number.isFinite(Date.parse(data.updated_at))) {
          return NextResponse.json({ ok: false, error: "Game language could not be confirmed." }, { status: 503 });
        }
        return NextResponse.json({ ok: true, data: {
          gameLocale: data.game_locale, gameLocaleRevision: data.game_locale_revision, updatedAt: data.updated_at,
        } });
      } catch {
        return NextResponse.json({ ok: false, error: "Game language could not be confirmed." }, { status: 503 });
      }
    }
    if (payload.action !== "set_push_sound" || typeof payload.silentPush !== "boolean"
      || Object.keys(payload).some(key => key !== "action" && key !== "silentPush")) {
      return NextResponse.json({ ok: false, error: "Invalid sound preference." }, { status: 400 });
    }
    const previous = await supabase.from("notification_preferences")
      .select("settings,updated_at").eq("user_id", user.id).maybeSingle();
    if (previous.error) return NextResponse.json({ ok: false, error: "Preferences unavailable." }, { status: 503 });
    if (!previous.data) return NextResponse.json({ ok: false, error: "Save notification preferences first." }, { status: 409 });
    if (!previous.data.settings || typeof previous.data.settings !== "object" || Array.isArray(previous.data.settings)
      || typeof previous.data.updated_at !== "string") {
      return NextResponse.json({ ok: false, error: "Preferences unavailable." }, { status: 503 });
    }
    // Compare-and-set prevents a concurrent consent/category edit being lost.
    // Sound is presentation only: never renew consent or inspect registration.
    const saved = await supabase.from("notification_preferences")
      .update({ settings: { ...previous.data.settings, silentPush: payload.silentPush } })
      .eq("user_id", user.id).eq("updated_at", previous.data.updated_at)
      .select("settings,channels,frequency,quiet_hours,explicit_consent_at,updated_at").maybeSingle();
    if (saved.error) return NextResponse.json({ ok: false, error: "Sound preference could not be confirmed." }, { status: 503 });
    if (!saved.data) return NextResponse.json({ ok: false, error: "Preferences changed. Reload before trying again." }, { status: 409 });
    return NextResponse.json({ ok: true, data: {
      settings: normalizeSettings(saved.data.settings), channels: saved.data.channels,
      frequency: saved.data.frequency, quietHours: saved.data.quiet_hours,
      explicitConsentAt: saved.data.explicit_consent_at, updatedAt: saved.data.updated_at,
    } });
  }
  const settings = normalizeSettings(payload.settings);
  const channels = normalizeChannels(payload.channels);
  const quietHours = parseNotificationQuietHours(payload.quietHours);
  if (!quietHours) {
    return NextResponse.json({ ok: false, error: "Invalid quiet hours. Use HH:mm and a valid time zone." }, { status: 400 });
  }
  const frequency = FREQUENCIES.has(payload.frequency) ? payload.frequency : "realtime";
  const hasConsent = payload.explicitConsent === true;

  // Preferences are user-controlled, but remote delivery capability is
  // server-owned. Do not allow a direct authenticated PUT to claim that push
  // is active unless VAPID is complete and a real device registration exists.
  const pushRequested = channels.push;
  const hasRegisteredDevice = pushRequested && hasConsent
    ? await userHasRegisteredPushDevice(supabase, user.id)
    : false;
  channels.push = resolveTouchlinePushPreference({
    explicitConsent: hasConsent,
    requested: pushRequested,
    serverConfigured: hasTouchlineServerPushConfiguration(),
    hasRegisteredDevice,
  });

  if (frequency !== "paused" && !channels.in_app && !channels.push && !channels.email) {
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

export type MarketNotificationPreferences = {
  settings: Record<string, unknown>;
  channels: { in_app: boolean; push: boolean; email: boolean };
  frequency: string;
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };
  explicitConsentAt: string | null;
};

export const GAME_NOTIFICATION_KEYS = ["availability", "confirmedLineup", "lineupReminders", "goalsAndEvents", "selectedLiveMatches", "leagueLeadership"] as const;

export function gameNotificationSelection(current: MarketNotificationPreferences) {
  const settings = { ...current.settings };
  if (!current.explicitConsentAt) {
    for (const key of Object.keys(settings)) if (key !== "silentPush" && typeof settings[key] === "boolean") settings[key] = false;
  }
  for (const key of GAME_NOTIFICATION_KEYS) settings[key] = true;
  return settings;
}

type Dependencies = {
  configured: () => boolean;
  permission: () => "granted" | "denied" | "default" | "unsupported";
  requestPermission: () => Promise<string>;
  register: () => Promise<string>;
  save: (value: MarketNotificationPreferences & { explicitConsent: boolean }) => Promise<MarketNotificationPreferences>;
};
export type MarketConsentResult = { state: "busy" | "unavailable" | "denied" | "failed" | "partial" | "saved"; preferences?: MarketNotificationPreferences };

function hasConsentTimestamp(value: unknown): boolean {
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  // Check wall-clock calendar fields separately, preserving PostgREST offsets
  // and microseconds but rejecting normalized impossible dates (e.g. Feb 30).
  const wallClock = Date.parse(`${value.slice(0, 19)}Z`);
  return Number.isFinite(wallClock) && new Date(wallClock).toISOString().slice(0, 19) === value.slice(0, 19);
}

/** A single mounted controller owns the gesture. Opening/reading is not consent. */
export function createMarketNotificationConsent(deps: Dependencies) {
  let running = false;
  return async (current: MarketNotificationPreferences, action: "enable" | "pause"): Promise<MarketConsentResult> => {
    if (running) return { state: "busy" };
    running = true;
    let registered = false;
    try {
      if (action === "enable") {
        const permission = deps.permission();
        if (!deps.configured() || permission === "unsupported") return { state: "unavailable" };
        if (permission === "denied" || (permission === "default" && await deps.requestPermission() !== "granted")) return { state: "denied" };
        if (await deps.register() !== "registered") return { state: "unavailable" };
        registered = true;
      }
      const requested = { ...current,
        settings: action === "enable" ? gameNotificationSelection(current) : current.settings,
        channels: action === "pause" ? { in_app: false, push: false, email: false } : { ...current.channels, in_app: true, push: true, email: current.explicitConsentAt ? current.channels.email : false },
        frequency: action === "enable" && current.frequency === "paused" ? "realtime" : action === "pause" ? "paused" : current.frequency,
        explicitConsent: action === "enable",
      };
      const preferences = await deps.save(requested);
      const confirmed = action === "pause"
        ? preferences.frequency === "paused" && !preferences.channels.in_app && !preferences.channels.push
          && !preferences.channels.email && preferences.explicitConsentAt === null
        : preferences.channels.push === true && preferences.channels.in_app === true
          && preferences.channels.email === requested.channels.email
          && preferences.frequency === requested.frequency
          && hasConsentTimestamp(preferences.explicitConsentAt)
          && Object.entries(requested.settings).every(([key, value]) =>
            typeof value !== "boolean" || preferences.settings[key] === value);
      return { state: confirmed ? "saved" : "partial", preferences };
    } catch {
      return { state: registered ? "partial" : "failed" };
    } finally { running = false; }
  };
}

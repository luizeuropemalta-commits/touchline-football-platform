"use client";

import {
  Bell,
  CheckCircle2,
  Clock3,
  Mail,
  Radio,
  Save,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type NotificationSettings = {
  playerRumours: boolean;
  availability: boolean;
  confirmedLineup: boolean;
  goalsAndEvents: boolean;
  selectedLiveMatches: boolean;
  leagueLeadership: boolean;
  transfersAndOffers: boolean;
  creditsPromotionsRewards: boolean;
  accountSecurity: boolean;
  generalComms: boolean;
  scopes: {
    clubs: string[];
    players: string[];
    competitions: string[];
    fixtures: string[];
  };
};

type NotificationChannels = {
  in_app: boolean;
  push: boolean;
  email: boolean;
};

type QuietHours = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
};

type PreferencesPayload = {
  settings: NotificationSettings;
  channels: NotificationChannels;
  frequency: "realtime" | "hourly_digest" | "daily_digest" | "paused";
  quietHours: QuietHours;
  explicitConsentAt: string | null;
  updatedAt: string | null;
};

type CategoryKey = keyof Omit<NotificationSettings, "scopes">;

const DEFAULT_PREFERENCES: PreferencesPayload = {
  settings: {
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
      clubs: [],
      players: [],
      competitions: ["TouchLine England"],
      fixtures: [],
    },
  },
  channels: { in_app: true, push: false, email: false },
  frequency: "realtime",
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
    timezone: "UTC",
  },
  explicitConsentAt: null,
  updatedAt: null,
};

const CATEGORIES: Array<{ key: CategoryKey; title: string; body: string }> = [
  {
    key: "playerRumours",
    title: "Player rumours",
    body: "Rumours and availability signals involving players from your cards.",
  },
  {
    key: "availability",
    title: "Absence, injury or suspension",
    body: "Probable absence, injury, suspension and status changes.",
  },
  {
    key: "confirmedLineup",
    title: "Confirmed lineup",
    body: "Lineup confirmation when a match squad is available.",
  },
  {
    key: "goalsAndEvents",
    title: "Goals and match events",
    body: "Goals, assists and relevant live events from your cards.",
  },
  {
    key: "selectedLiveMatches",
    title: "Selected live matches",
    body: "Kick-off and live events for matches you choose to follow.",
  },
  {
    key: "leagueLeadership",
    title: "TouchLine England leadership",
    body: "Important table, position and competition changes.",
  },
  {
    key: "transfersAndOffers",
    title: "TouchLine Market Transfer",
    body: "Offers, proposals and negotiations awaiting action.",
  },
  {
    key: "creditsPromotionsRewards",
    title: "Campaigns and rewards",
    body: "Promotions, rewards and campaign eligibility.",
  },
  {
    key: "accountSecurity",
    title: "Account and security",
    body: "Login, account, privacy and security alerts.",
  },
  {
    key: "generalComms",
    title: "General updates",
    body: "Product notes and broad TouchLine England communications.",
  },
];

const CHANNELS: Array<{
  key: keyof NotificationChannels;
  title: string;
  body: string;
  icon: LucideIcon;
}> = [
  {
    key: "in_app",
    title: "In app",
    body: "Notification center and in-product alerts.",
    icon: Bell,
  },
  {
    key: "push",
    title: "Phone push",
    body: "Phone or installed web-app delivery after explicit permission.",
    icon: Smartphone,
  },
  {
    key: "email",
    title: "Email",
    body: "Delivery to the authenticated account email.",
    icon: Mail,
  },
];

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[24px] border border-white/[.09] bg-[#071115]/90 shadow-[0_24px_80px_rgba(0,0,0,.25)] backdrop-blur-xl ${className}`}
    >
      {children}
    </section>
  );
}

function PanelHeading({
  kicker,
  title,
  icon: Icon,
}: {
  kicker: string;
  title: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[.07] px-5 py-4">
      <div>
        <p className="text-[8px] font-black uppercase tracking-[.18em] text-[#a3ff12]">{kicker}</p>
        <h2 className="mt-1 text-lg font-black text-white">{title}</h2>
      </div>
      <span className="grid size-9 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.055] text-cyan-200">
        <Icon size={16} aria-hidden="true" />
      </span>
    </div>
  );
}

function joinScope(values: string[]) {
  return values.join(", ");
}

function splitScope(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function preferenceDate(value: string | null) {
  if (!value) return "Not saved yet";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotificationsPage() {
  const [preferences, setPreferences] = useState<PreferencesPayload>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading preferences");

  const selectedCategories = useMemo(
    () => CATEGORIES.filter((category) => preferences.settings[category.key]).length,
    [preferences.settings],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadPreferences() {
      try {
        const response = await fetch("/api/notifications/preferences", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as
          | { ok: true; data: PreferencesPayload }
          | { ok: false; error?: string };

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.ok === false ? payload.error ?? "Preferences unavailable" : "Preferences unavailable");
        }

        setPreferences(payload.data);
        setMessage(
          payload.data.updatedAt
            ? `Last saved ${preferenceDate(payload.data.updatedAt)}`
            : "Defaults ready",
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : "Preferences unavailable");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadPreferences();
    return () => controller.abort();
  }, []);

  function updateCategory(key: CategoryKey, checked: boolean) {
    setPreferences((current) => ({
      ...current,
      settings: { ...current.settings, [key]: checked },
    }));
  }

  function updateChannel(key: keyof NotificationChannels, checked: boolean) {
    setPreferences((current) => ({
      ...current,
      channels: { ...current.channels, [key]: checked },
    }));
  }

  function updateScope(key: keyof NotificationSettings["scopes"], value: string) {
    setPreferences((current) => ({
      ...current,
      settings: {
        ...current.settings,
        scopes: {
          ...current.settings.scopes,
          [key]: splitScope(value),
        },
      },
    }));
  }

  async function savePreferences() {
    setSaving(true);
    setMessage("Saving preferences");

    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...preferences, explicitConsent: true }),
      });
      const payload = await response.json() as
        | { ok: true; data: PreferencesPayload }
        | { ok: false; error?: string };

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.ok === false ? payload.error ?? "Save failed" : "Save failed");
      }

      setPreferences(payload.data);
      setMessage(`Saved ${preferenceDate(payload.data.updatedAt)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#caff72]">
            ClubOwner preferences
          </span>
          <span className="text-[8px] font-bold uppercase tracking-[.14em] text-slate-600">
            Consent first
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-black italic text-white sm:text-[42px]">
          Notification Center
        </h1>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
          Choose what TouchLine England can send, where it can send it and when it should stay quiet.
        </p>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
          <Bell size={16} className="text-cyan-200" />
          <p className="mt-3 text-[8px] font-black uppercase tracking-[.15em] text-slate-600">Categories</p>
          <p className="mt-1 text-2xl font-black text-white">{CATEGORIES.length}</p>
        </div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
          <ShieldCheck size={16} className="text-[#a3ff12]" />
          <p className="mt-3 text-[8px] font-black uppercase tracking-[.15em] text-slate-600">Consent</p>
          <p className="mt-1 text-2xl font-black text-white">Opt-in</p>
        </div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
          <CheckCircle2 size={16} className="text-amber-200" />
          <p className="mt-3 text-[8px] font-black uppercase tracking-[.15em] text-slate-600">Status</p>
          <p className="mt-1 truncate text-sm font-black text-white" aria-live="polite">
            {loading ? "Loading" : message}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Panel>
          <PanelHeading kicker="Consent center" title="Notification Categories" icon={Bell} />
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {CATEGORIES.map((category) => (
              <label
                key={category.key}
                className="flex min-h-[116px] cursor-pointer items-start gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.04]"
              >
                <input
                  type="checkbox"
                  checked={preferences.settings[category.key]}
                  onChange={(event) => updateCategory(category.key, event.target.checked)}
                  className="mt-1 size-4 accent-[#a3ff12]"
                />
                <span>
                  <span className="block text-[10px] font-black text-white">{category.title}</span>
                  <span className="mt-1 block text-[9px] leading-5 text-slate-500">{category.body}</span>
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel>
            <PanelHeading kicker="Channels" title="Delivery Controls" icon={Radio} />
            <div className="grid gap-3 p-5">
              {CHANNELS.map(({ key, title, body, icon: Icon }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4"
                >
                  <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black text-white">{title}</span>
                    <span className="mt-1 block text-[9px] leading-5 text-slate-500">{body}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.channels[key]}
                    onChange={(event) => updateChannel(key, event.target.checked)}
                    className="size-4 accent-[#a3ff12]"
                  />
                </label>
              ))}
              <p className="rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-3 text-[10px] leading-5 text-amber-100/80">
                Push permission is requested only after the ClubOwner enables that channel.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeading kicker="Frequency" title="Quiet Time" icon={Clock3} />
            <div className="grid gap-3 p-5">
              <label className="grid gap-2 text-[8px] font-black uppercase tracking-[.12em] text-slate-500">
                Delivery frequency
                <select
                  value={preferences.frequency}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    frequency: event.target.value as PreferencesPayload["frequency"],
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold normal-case tracking-normal text-white"
                >
                  <option value="realtime">Realtime</option>
                  <option value="hourly_digest">Hourly digest</option>
                  <option value="daily_digest">Daily digest</option>
                  <option value="paused">Paused</option>
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4 text-[10px] font-black text-white">
                <input
                  type="checkbox"
                  checked={preferences.quietHours.enabled}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, enabled: event.target.checked },
                  }))}
                  className="size-4 accent-[#a3ff12]"
                />
                Quiet hours enabled
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  aria-label="Quiet hours start"
                  type="time"
                  value={preferences.quietHours.start}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, start: event.target.value },
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white"
                />
                <input
                  aria-label="Quiet hours end"
                  type="time"
                  value={preferences.quietHours.end}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, end: event.target.value },
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white"
                />
                <input
                  aria-label="Quiet hours timezone"
                  value={preferences.quietHours.timezone}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, timezone: event.target.value },
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white"
                />
              </div>
            </div>
          </Panel>
        </div>

        <Panel className="xl:col-span-2">
          <PanelHeading kicker="Personal scope" title="Club, Card and Match Filters" icon={ShieldCheck} />
          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input
                aria-label="Clubs"
                value={joinScope(preferences.settings.scopes.clubs)}
                onChange={(event) => updateScope("clubs", event.target.value)}
                placeholder="Clubs, comma separated"
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
              <input
                aria-label="Players and cards"
                value={joinScope(preferences.settings.scopes.players)}
                onChange={(event) => updateScope("players", event.target.value)}
                placeholder="Players/cards"
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
              <input
                aria-label="Competitions"
                value={joinScope(preferences.settings.scopes.competitions)}
                onChange={(event) => updateScope("competitions", event.target.value)}
                placeholder="Competitions"
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
              <input
                aria-label="Selected fixtures"
                value={joinScope(preferences.settings.scopes.fixtures)}
                onChange={(event) => updateScope("fixtures", event.target.value)}
                placeholder="Selected games"
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black text-white">{selectedCategories} categories active</p>
                <p className="mt-1 text-[9px] leading-5 text-slate-500" aria-live="polite">
                  {loading ? "Loading preferences" : message}
                </p>
              </div>
              <button
                type="button"
                onClick={savePreferences}
                disabled={saving || loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007] transition hover:bg-[#b5ff41] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {preferences.explicitConsentAt ? <CheckCircle2 size={14} /> : <Save size={14} />}
                {saving ? "Saving" : "Save Preferences"}
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
